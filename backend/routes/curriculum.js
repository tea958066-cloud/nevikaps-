const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');

const router = express.Router();

// GET /api/curriculum/lookup?classLevel=&subject=&term=&month=
// Any logged-in teacher or admin can read from the active curriculum — this
// only ever returns matching entries, never lets a caller pick a teacher_id
// or write anything, so no further scoping is needed beyond requireAuth.
router.get('/lookup', async (req, res) => {
    try {
        const { classLevel, subject, term, month } = req.query;
        if (!classLevel || !subject) {
            return res.status(400).json({ error: 'classLevel and subject are required.' });
        }

        const { data: activeCurriculum, error: curriculumError } = await supabaseAdmin
            .from('curriculum')
            .select('id')
            .eq('is_active', true)
            .maybeSingle();

        if (curriculumError) throw curriculumError;
        if (!activeCurriculum) {
            return res.json({ found: false });
        }

        let query = supabaseAdmin
            .from('curriculum_entries')
            .select('*')
            .eq('curriculum_id', activeCurriculum.id)
            .ilike('class_level', classLevel)
            .ilike('subject', subject);

        if (term) query = query.ilike('term', term);
        if (month) query = query.ilike('month', month);

        const { data, error } = await query.limit(1).maybeSingle();
        if (error) throw error;

        if (!data) {
            return res.json({ found: false });
        }

        res.json({
            found: true,
            entry: {
                theme: data.theme || '',
                topics: data.topics || []
            }
        });
    } catch (error) {
        console.error('Curriculum lookup error:', error);
        res.status(500).json({ error: 'Failed to look up curriculum.' });
    }
});

module.exports = router;
