const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();
router.use(requireAdmin);

function toPublicSubject(row) {
    return { id: row.id, name: row.name, level: row.level, isCustom: row.is_custom, createdAt: row.created_at };
}

// GET /api/admin/subjects — every subject, built-in and custom.
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('subjects')
            .select('*')
            .order('level', { ascending: true })
            .order('name', { ascending: true });
        if (error) throw error;

        res.json({ data: (data || []).map(toPublicSubject) });
    } catch (error) {
        console.error('List subjects error:', error);
        res.status(500).json({ error: 'Failed to load subjects.' });
    }
});

// POST /api/admin/subjects  { name, level }
router.post('/', async (req, res) => {
    try {
        const { name, level } = req.body || {};
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Subject name is required.' });
        }
        if (!level || !level.trim()) {
            return res.status(400).json({ error: 'Level is required (a class level, or "General").' });
        }

        const { data, error } = await supabaseAdmin
            .from('subjects')
            .insert({ name: name.trim(), level: level.trim(), is_custom: true, created_by: req.user.sub })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'That subject already exists at that level.' });
            }
            throw error;
        }

        res.status(201).json(toPublicSubject(data));
    } catch (error) {
        console.error('Create subject error:', error);
        res.status(500).json({ error: 'Failed to create subject.' });
    }
});

// DELETE /api/admin/subjects/:id — only custom subjects can be removed.
router.delete('/:id', async (req, res) => {
    try {
        const { data: subject, error: lookupError } = await supabaseAdmin
            .from('subjects')
            .select('is_custom')
            .eq('id', req.params.id)
            .maybeSingle();
        if (lookupError) throw lookupError;
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });
        if (!subject.is_custom) {
            return res.status(400).json({ error: 'Built-in subjects cannot be deleted.' });
        }

        const { error } = await supabaseAdmin.from('subjects').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete subject error:', error);
        res.status(500).json({ error: 'Failed to delete subject.' });
    }
});

module.exports = router;
