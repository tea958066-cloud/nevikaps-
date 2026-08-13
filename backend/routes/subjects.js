const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');

const router = express.Router();

// GET /api/subjects — the full subject list (built-in + custom), plus, for a
// logged-in teacher, which of those subjects they're assigned to. Used to
// populate every subject dropdown in the generators.
router.get('/', async (req, res) => {
    try {
        const { data: subjects, error } = await supabaseAdmin
            .from('subjects')
            .select('*')
            .order('level', { ascending: true })
            .order('name', { ascending: true });
        if (error) throw error;

        let assignedSubjectIds = [];
        if (req.user.role === 'teacher') {
            const { data: links, error: linkError } = await supabaseAdmin
                .from('teacher_subjects')
                .select('subject_id')
                .eq('teacher_id', req.user.sub);
            if (linkError) throw linkError;
            assignedSubjectIds = (links || []).map(l => l.subject_id);
        }

        res.json({
            data: (subjects || []).map(s => ({ id: s.id, name: s.name, level: s.level, isCustom: s.is_custom })),
            assignedSubjectIds
        });
    } catch (error) {
        console.error('List subjects error:', error);
        res.status(500).json({ error: 'Failed to load subjects.' });
    }
});

module.exports = router;
