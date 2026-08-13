const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();
router.use(requireAdmin);

function toPublicSubmission(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        subject: row.subject,
        classLevel: row.class_level,
        studentName: row.student_name,
        content: row.content,
        status: row.status,
        adminFeedback: row.admin_feedback,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
        teacher: row.teachers ? {
            id: row.teacher_id,
            fullName: row.teachers.full_name,
            teacherId: row.teachers.teacher_id
        } : null
    };
}

// GET /api/admin/submissions?teacherId=&type=&status=&page=&pageSize=
router.get('/', async (req, res) => {
    try {
        const { teacherId, type, status } = req.query;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabaseAdmin
            .from('submissions')
            .select('*, teachers(full_name, teacher_id)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (teacherId) query = query.eq('teacher_id', teacherId);
        if (type) query = query.eq('type', type);
        if (status) query = query.eq('status', status);

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({ data: (data || []).map(toPublicSubmission), total: count || 0, page, pageSize });
    } catch (error) {
        console.error('Admin list submissions error:', error);
        res.status(500).json({ error: 'Failed to load submissions.' });
    }
});

// GET /api/admin/submissions/:id
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('submissions')
            .select('*, teachers(full_name, teacher_id)')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Submission not found.' });

        res.json(toPublicSubmission(data));
    } catch (error) {
        console.error('Admin get submission error:', error);
        res.status(500).json({ error: 'Failed to load this submission.' });
    }
});

// GET /api/admin/submissions/:id/download — plain-text file so the admin can
// save the exam (or comment) locally to verify it offline.
router.get('/:id/download', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('submissions')
            .select('*, teachers(full_name, teacher_id)')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Submission not found.' });

        const teacherLabel = data.teachers ? `${data.teachers.full_name} (${data.teachers.teacher_id})` : 'Unknown teacher';
        const header = [
            `Title: ${data.title}`,
            `Type: ${data.type === 'exam' ? 'Exam' : 'Student Comment'}`,
            `Teacher: ${teacherLabel}`,
            data.subject ? `Subject: ${data.subject}` : null,
            data.class_level ? `Class: ${data.class_level}` : null,
            data.student_name ? `Student: ${data.student_name}` : null,
            `Submitted: ${new Date(data.created_at).toLocaleString()}`,
            '',
            '---',
            ''
        ].filter(line => line !== null).join('\n');

        const safeName = (data.title || 'submission').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="NEVIKAPS_${data.type}_${safeName}.txt"`);
        res.send(header + data.content);
    } catch (error) {
        console.error('Download submission error:', error);
        res.status(500).json({ error: 'Failed to download this submission.' });
    }
});

// PATCH /api/admin/submissions/:id  { status: 'approved'|'rejected', adminFeedback? }
router.patch('/:id', async (req, res) => {
    try {
        const { status, adminFeedback } = req.body || {};
        if (status !== 'approved' && status !== 'rejected') {
            return res.status(400).json({ error: 'Status must be "approved" or "rejected".' });
        }

        const { data, error } = await supabaseAdmin
            .from('submissions')
            .update({
                status,
                admin_feedback: adminFeedback || null,
                reviewed_by: req.user.sub,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select('*, teachers(full_name, teacher_id)')
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Submission not found.' });

        res.json(toPublicSubmission(data));
    } catch (error) {
        console.error('Review submission error:', error);
        res.status(500).json({ error: 'Failed to update this submission.' });
    }
});

module.exports = router;
