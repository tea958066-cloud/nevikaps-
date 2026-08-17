const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { supabaseAdmin } = require('../lib/supabase');
const { uploadSubmissionFile, deleteSubmissionFile } = require('../lib/storage');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = express.Router();

const ALLOWED_EXTENSIONS = new Set(['.doc', '.docx', '.pdf']);

function toPublicSubmission(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        subject: row.subject,
        classLevel: row.class_level,
        studentName: row.student_name,
        content: row.content,
        fileName: row.file_name,
        fileMime: row.file_mime,
        status: row.status,
        adminFeedback: row.admin_feedback,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at
    };
}

// POST /api/submissions (multipart/form-data)
//   type: 'exam'|'comment', title, subject?, classLevel?, studentName?, content?
//   file: the document being submitted — required for both types. Teachers
//   write both exams and student comments in Word, so each submission is the
//   actual .doc/.docx/.pdf they hand in, not pasted/retyped text. `content`
//   is only ever an optional note attached to that file.
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(403).json({ error: 'Only teacher accounts can submit work.' });
        }

        const { type, title, subject, classLevel, studentName, content } = req.body || {};

        if (type !== 'exam' && type !== 'comment') {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ error: 'Type must be "exam" or "comment".' });
        }
        if (!title || !title.trim()) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ error: 'A title is required.' });
        }
        if (!req.file) {
            return res.status(400).json({
                error: type === 'exam'
                    ? 'Please attach the exam document (.doc, .docx, or .pdf).'
                    : 'Please attach the student comments document (.doc, .docx, or .pdf).'
            });
        }
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            fs.unlink(req.file.path, () => {});
            return res.status(400).json({ error: 'File must be a .doc, .docx, or .pdf document.' });
        }

        const filePath = await uploadSubmissionFile(req.file.path, req.file.originalname, req.user.sub, req.file.mimetype);
        const fileName = req.file.originalname;
        const fileMime = req.file.mimetype;
        fs.unlink(req.file.path, () => {});

        const { data, error } = await supabaseAdmin
            .from('submissions')
            .insert({
                teacher_id: req.user.sub,
                type,
                title: title.trim(),
                subject: subject || null,
                class_level: classLevel || null,
                student_name: (type === 'comment' && studentName && studentName.trim()) ? studentName.trim() : null,
                content: (content && content.trim()) ? content.trim() : null,
                file_path: filePath,
                file_name: fileName,
                file_mime: fileMime
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(toPublicSubmission(data));
    } catch (error) {
        if (req.file) fs.unlink(req.file.path, () => {});
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
            .select('id, status, file_path')
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

        if (existing.file_path) {
            try {
                await deleteSubmissionFile(existing.file_path);
            } catch (storageError) {
                console.error('Failed to delete submission file from storage:', storageError);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Withdraw submission error:', error);
        res.status(500).json({ error: 'Failed to withdraw submission.' });
    }
});

module.exports = router;
