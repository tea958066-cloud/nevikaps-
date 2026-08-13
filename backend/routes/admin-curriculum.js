const express = require('express');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');
const { extractJsonFromPdf } = require('../lib/ai');
const { uploadCurriculumPdf, getCurriculumPdfSignedUrl, deleteCurriculumPdf } = require('../lib/storage');

const upload = multer({ dest: os.tmpdir() });
const router = express.Router();

router.use(requireAdmin);

const CURRICULUM_PROMPT = `Analyze this school curriculum / syllabus PDF for a Cameroon Competency Based Approach (CBA) school and extract every entry into a flat JSON array.

Each element of the array must be an object with exactly these fields:
- "classLevel": the class or grade (e.g., "Primary 4")
- "subject": the subject name (e.g., "Mathematics")
- "term": the school term this belongs to, if stated (e.g., "First Term"), otherwise null
- "month": the month this is taught in, if stated (e.g., "October"), otherwise null
- "theme": the learning theme or strand for that class/subject/month
- "topics": an array of topic strings covered under that theme

Cover every class, subject, term, and month present in the document — do not summarize or skip entries.

Return ONLY a raw JSON array, no markdown fences, no explanation, no wrapper object.`;

function toPublicCurriculum(row, entryCount) {
    return {
        id: row.id,
        schoolYear: row.school_year,
        title: row.title,
        isActive: row.is_active,
        entryCount: entryCount ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toPublicEntry(row) {
    return {
        id: row.id,
        curriculumId: row.curriculum_id,
        classLevel: row.class_level,
        subject: row.subject,
        term: row.term,
        month: row.month,
        theme: row.theme,
        topics: row.topics || []
    };
}

// GET /api/admin/curriculum — list every uploaded curriculum with entry counts.
router.get('/', async (req, res) => {
    try {
        const { data: curricula, error } = await supabaseAdmin
            .from('curriculum')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        const withCounts = await Promise.all((curricula || []).map(async (c) => {
            const { count, error: countError } = await supabaseAdmin
                .from('curriculum_entries')
                .select('*', { count: 'exact', head: true })
                .eq('curriculum_id', c.id);
            if (countError) throw countError;
            return toPublicCurriculum(c, count || 0);
        }));

        res.json({ data: withCounts });
    } catch (error) {
        console.error('List curriculum error:', error);
        res.status(500).json({ error: 'Failed to load curriculum list.' });
    }
});

// GET /api/admin/curriculum/:id — one curriculum, its entries, and a signed PDF link.
router.get('/:id', async (req, res) => {
    try {
        const { data: curriculum, error } = await supabaseAdmin
            .from('curriculum')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!curriculum) return res.status(404).json({ error: 'Curriculum not found.' });

        const { data: entries, error: entriesError } = await supabaseAdmin
            .from('curriculum_entries')
            .select('*')
            .eq('curriculum_id', curriculum.id)
            .order('class_level', { ascending: true });
        if (entriesError) throw entriesError;

        let sourceFileUrl = null;
        if (curriculum.source_file_url) {
            try {
                sourceFileUrl = await getCurriculumPdfSignedUrl(curriculum.source_file_url);
            } catch (signError) {
                console.error('Failed to sign curriculum PDF URL:', signError);
            }
        }

        res.json({
            ...toPublicCurriculum(curriculum, (entries || []).length),
            sourceFileUrl,
            entries: (entries || []).map(toPublicEntry)
        });
    } catch (error) {
        console.error('Get curriculum error:', error);
        res.status(500).json({ error: 'Failed to load curriculum.' });
    }
});

// POST /api/admin/curriculum — upload a PDF, parse it, store it as a new curriculum.
router.post('/', upload.single('curriculumFile'), async (req, res) => {
    try {
        const { schoolYear, title } = req.body || {};
        if (!schoolYear || !title) {
            return res.status(400).json({ error: 'schoolYear and title are required.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded.' });
        }

        const fileBuffer = fs.readFileSync(req.file.path);
        const base64Data = fileBuffer.toString('base64');

        let parsedEntries;
        try {
            parsedEntries = await extractJsonFromPdf(base64Data, CURRICULUM_PROMPT, 8192);
            if (!Array.isArray(parsedEntries)) throw new Error('Expected a JSON array from the AI.');
        } catch (parseError) {
            console.error('Curriculum PDF parse error:', parseError);
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: 'Could not parse the curriculum PDF. Please check the file and try again.' });
        }

        const storagePath = await uploadCurriculumPdf(req.file.path, req.file.originalname, schoolYear);
        fs.unlinkSync(req.file.path);

        // Only one curriculum is ever "active" — teachers always work from
        // whichever one that is, so a fresh upload becomes the new active one.
        const { error: deactivateError } = await supabaseAdmin
            .from('curriculum')
            .update({ is_active: false })
            .eq('is_active', true);
        if (deactivateError) throw deactivateError;

        const { data: curriculum, error: insertError } = await supabaseAdmin
            .from('curriculum')
            .insert({
                school_year: schoolYear,
                title,
                source_file_url: storagePath,
                is_active: true,
                created_by: req.user.sub
            })
            .select()
            .single();
        if (insertError) throw insertError;

        const entryRows = parsedEntries
            .filter(e => e && e.classLevel && e.subject)
            .map(e => ({
                curriculum_id: curriculum.id,
                class_level: e.classLevel,
                subject: e.subject,
                term: e.term || null,
                month: e.month || null,
                theme: e.theme || null,
                topics: Array.isArray(e.topics) ? e.topics : []
            }));

        if (entryRows.length > 0) {
            const { error: entriesError } = await supabaseAdmin.from('curriculum_entries').insert(entryRows);
            if (entriesError) throw entriesError;
        }

        res.status(201).json(toPublicCurriculum(curriculum, entryRows.length));
    } catch (error) {
        console.error('Create curriculum error:', error);
        res.status(500).json({ error: 'Failed to upload and parse curriculum.' });
    }
});

// PATCH /api/admin/curriculum/:id — rename, or switch which curriculum is active.
router.patch('/:id', async (req, res) => {
    try {
        const { title, isActive } = req.body || {};
        const updates = { updated_at: new Date().toISOString() };
        if (typeof title === 'string' && title.trim()) updates.title = title.trim();

        if (isActive === true) {
            const { error: deactivateError } = await supabaseAdmin
                .from('curriculum')
                .update({ is_active: false })
                .eq('is_active', true);
            if (deactivateError) throw deactivateError;
            updates.is_active = true;
        } else if (isActive === false) {
            updates.is_active = false;
        }

        const { data, error } = await supabaseAdmin
            .from('curriculum')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Curriculum not found.' });

        res.json(toPublicCurriculum(data));
    } catch (error) {
        console.error('Update curriculum error:', error);
        res.status(500).json({ error: 'Failed to update curriculum.' });
    }
});

// DELETE /api/admin/curriculum/:id
router.delete('/:id', async (req, res) => {
    try {
        const { data: curriculum, error: fetchError } = await supabaseAdmin
            .from('curriculum')
            .select('source_file_url')
            .eq('id', req.params.id)
            .maybeSingle();
        if (fetchError) throw fetchError;

        const { error } = await supabaseAdmin.from('curriculum').delete().eq('id', req.params.id);
        if (error) throw error;

        if (curriculum && curriculum.source_file_url) {
            try {
                await deleteCurriculumPdf(curriculum.source_file_url);
            } catch (storageError) {
                console.error('Failed to delete curriculum PDF from storage:', storageError);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete curriculum error:', error);
        res.status(500).json({ error: 'Failed to delete curriculum.' });
    }
});

// POST /api/admin/curriculum/:id/entries — add one entry by hand.
router.post('/:id/entries', async (req, res) => {
    try {
        const { classLevel, subject, term, month, theme, topics } = req.body || {};
        if (!classLevel || !subject) {
            return res.status(400).json({ error: 'classLevel and subject are required.' });
        }

        const { data, error } = await supabaseAdmin
            .from('curriculum_entries')
            .insert({
                curriculum_id: req.params.id,
                class_level: classLevel,
                subject,
                term: term || null,
                month: month || null,
                theme: theme || null,
                topics: Array.isArray(topics) ? topics : []
            })
            .select()
            .single();
        if (error) throw error;

        res.status(201).json(toPublicEntry(data));
    } catch (error) {
        console.error('Add curriculum entry error:', error);
        res.status(500).json({ error: 'Failed to add curriculum entry.' });
    }
});

// PATCH /api/admin/curriculum/entries/:entryId — edit one entry (e.g. update a single month).
router.patch('/entries/:entryId', async (req, res) => {
    try {
        const { classLevel, subject, term, month, theme, topics } = req.body || {};
        const updates = {};
        if (classLevel !== undefined) updates.class_level = classLevel;
        if (subject !== undefined) updates.subject = subject;
        if (term !== undefined) updates.term = term;
        if (month !== undefined) updates.month = month;
        if (theme !== undefined) updates.theme = theme;
        if (topics !== undefined) updates.topics = Array.isArray(topics) ? topics : [];

        const { data, error } = await supabaseAdmin
            .from('curriculum_entries')
            .update(updates)
            .eq('id', req.params.entryId)
            .select()
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Entry not found.' });

        res.json(toPublicEntry(data));
    } catch (error) {
        console.error('Update curriculum entry error:', error);
        res.status(500).json({ error: 'Failed to update curriculum entry.' });
    }
});

// DELETE /api/admin/curriculum/entries/:entryId
router.delete('/entries/:entryId', async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from('curriculum_entries').delete().eq('id', req.params.entryId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete curriculum entry error:', error);
        res.status(500).json({ error: 'Failed to delete curriculum entry.' });
    }
});

module.exports = router;
