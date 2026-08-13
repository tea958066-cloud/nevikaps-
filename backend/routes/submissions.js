const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');

const router = express.Router();

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
        createdAt: row.created_at
    };
}

// POST /api/submissions  { type: 'exam'|'comment', title, subject?, classLevel?, studentName?, content }
// A teacher submitting work for the admin to review — never editable once
// created, only withdrawable while still pending (see DELETE below).
router.post('/', async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teacher accounts can submit work.' });
        }

        const { type, title, subject, classLevel, studentName, content } = req.body || {};

        if (type !== 'exam' && type !== 'comment') {
            return res.status(400).json({ error: 'Type must be "exam" or "comment".' });
        }
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'A title is required.' });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content is required.' });
        }
        if (type === 'comment' && (!studentName || !studentName.trim())) {
            return res.status(400).json({ error: 'Student name is required for a comment submission.' });
        }

        const { data, error } = await supabaseAdmin
            .from('submissions')
            .insert({
                teacher_id: req.user.sub,
                type,
                title: title.trim(),
                subject: subject || null,
                class_level: classLevel || null,
                student_name: type === 'comment' ? studentName.trim() : null,
                content: content.trim()
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(toPublicSubmission(data));
    } catch (error) {
        console.error('Create submission error:', error);
        res.status(500).json({ error: 'Failed to submit. Please try again.' });
    }
});

// GET /api/submissions — the logged-in teacher's own submissions, newest first.
router.get('/', async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teacher accounts have submissions.' });
        }

        const { data, error } = await supabaseAdmin
            .from('submissions')
            .select('*')
            .eq('teacher_id', req.user.sub)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        res.json({ data: (data || []).map(toPublicSubmission) });
    } catch (error) {
        console.error('List own submissions error:', error);
        res.status(500).json({ error: 'Failed to load your submissions.' });
    }
});

// DELETE /api/submissions/:id — withdraw a submission, only while still pending.
router.delete('/:id', async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teacher accounts have submissions.' });
        }

        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('submissions')
            .select('id, status')
            .eq('id', req.params.id)
            .eq('teacher_id', req.user.sub)
            .maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) return res.status(404).json({ error: 'Submission not found.' });
        if (existing.status !== 'pending') {
            return res.status(409).json({ error: 'Only pending submissions can be withdrawn.' });
        }

        const { error } = await supabaseAdmin.from('submissions').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Withdraw submission error:', error);
        res.status(500).json({ error: 'Failed to withdraw submission.' });
    }
});

module.exports = router;
