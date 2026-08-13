const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');

const router = express.Router();

function toPublicContent(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        subject: row.subject,
        classLevel: row.class_level,
        content: row.content,
        createdAt: row.created_at
    };
}

// GET /api/content — the logged-in teacher's own saved generations, newest first.
// Always scoped to req.user.sub server-side — a teacher can never pass a
// different id and see someone else's work.
router.get('/', async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teacher accounts have a personal history.' });
        }

        const { data, error } = await supabaseAdmin
            .from('generated_content')
            .select('*')
            .eq('teacher_id', req.user.sub)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        res.json({ data: (data || []).map(toPublicContent) });
    } catch (error) {
        console.error('List own content error:', error);
        res.status(500).json({ error: 'Failed to load your saved history.' });
    }
});

// GET /api/content/:id — a single item, only if it belongs to this teacher.
router.get('/:id', async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teacher accounts have a personal history.' });
        }

        const { data, error } = await supabaseAdmin
            .from('generated_content')
            .select('*')
            .eq('id', req.params.id)
            .eq('teacher_id', req.user.sub)
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Item not found.' });

        res.json(toPublicContent(data));
    } catch (error) {
        console.error('Get own content item error:', error);
        res.status(500).json({ error: 'Failed to load this item.' });
    }
});

// DELETE /api/content — clears the logged-in teacher's own history.
router.delete('/', async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teacher accounts have a personal history.' });
        }

        const { error } = await supabaseAdmin
            .from('generated_content')
            .delete()
            .eq('teacher_id', req.user.sub);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Clear own content error:', error);
        res.status(500).json({ error: 'Failed to clear history.' });
    }
});

module.exports = router;
