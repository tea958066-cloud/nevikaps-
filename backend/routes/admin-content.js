const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();
router.use(requireAdmin);

function toPublicContent(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        subject: row.subject,
        classLevel: row.class_level,
        content: row.content,
        createdAt: row.created_at,
        teacher: row.teachers ? {
            id: row.teacher_id,
            fullName: row.teachers.full_name,
            teacherId: row.teachers.teacher_id
        } : null
    };
}

// GET /api/admin/content?teacherId=&type=&page=&pageSize= — read-only, across all teachers.
router.get('/', async (req, res) => {
    try {
        const { teacherId, type } = req.query;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabaseAdmin
            .from('generated_content')
            .select('*, teachers(full_name, teacher_id)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (teacherId) query = query.eq('teacher_id', teacherId);
        if (type) query = query.eq('type', type);

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({ data: (data || []).map(toPublicContent), total: count || 0, page, pageSize });
    } catch (error) {
        console.error('Admin list content error:', error);
        res.status(500).json({ error: 'Failed to load teacher content.' });
    }
});

// GET /api/admin/content/:id — open any single item, read only.
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('generated_content')
            .select('*, teachers(full_name, teacher_id)')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Item not found.' });

        res.json(toPublicContent(data));
    } catch (error) {
        console.error('Admin get content item error:', error);
        res.status(500).json({ error: 'Failed to load this item.' });
    }
});

module.exports = router;
