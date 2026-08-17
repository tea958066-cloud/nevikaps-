const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');
const { encryptSecret, decryptSecret } = require('../lib/crypto');
const { isLoginIdTaken } = require('../lib/identity');

const router = express.Router();

// All routes below require an authenticated admin.
router.use(requireAdmin);

function generateTeacherId() {
    const digits = crypto.randomInt(10000, 99999);
    return `TCH-${digits}`;
}

function toPublicTeacher(row) {
    return {
        id: row.id,
        fullName: row.full_name,
        teacherId: row.teacher_id,
        isActive: row.is_active,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at
    };
}

async function replaceTeacherSubjects(teacherId, subjectIds) {
    const { error: deleteError } = await supabaseAdmin.from('teacher_subjects').delete().eq('teacher_id', teacherId);
    if (deleteError) throw deleteError;

    if (Array.isArray(subjectIds) && subjectIds.length > 0) {
        const rows = subjectIds.map(subjectId => ({ teacher_id: teacherId, subject_id: subjectId }));
        const { error: insertError } = await supabaseAdmin.from('teacher_subjects').insert(rows);
        if (insertError) throw insertError;
    }
}

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [{ count: total, error: totalError }, { count: active, error: activeError },
            { count: inactive, error: inactiveError }, { count: newThisMonth, error: newError }] = await Promise.all([
            supabaseAdmin.from('teachers').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('teachers').select('*', { count: 'exact', head: true }).eq('is_active', true),
            supabaseAdmin.from('teachers').select('*', { count: 'exact', head: true }).eq('is_active', false),
            supabaseAdmin.from('teachers').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString())
        ]);

        if (totalError || activeError || inactiveError || newError) {
            throw totalError || activeError || inactiveError || newError;
        }

        res.json({ total: total || 0, active: active || 0, inactive: inactive || 0, newThisMonth: newThisMonth || 0 });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Failed to load dashboard stats.' });
    }
});

// GET /api/admin/teachers?search=&page=1&pageSize=10
router.get('/teachers', async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabaseAdmin
            .from('teachers')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (search) {
            query = query.or(`full_name.ilike.%${search}%,teacher_id.ilike.%${search}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({
            data: (data || []).map(toPublicTeacher),
            total: count || 0,
            page,
            pageSize
        });
    } catch (error) {
        console.error('List teachers error:', error);
        res.status(500).json({ error: 'Failed to load teachers.' });
    }
});

// GET /api/admin/teachers/:id/credentials — decrypted Teacher ID + password,
// plus assigned subject ids, for the admin's Edit Teacher view.
router.get('/teachers/:id/credentials', async (req, res) => {
    try {
        const { data: teacher, error } = await supabaseAdmin
            .from('teachers')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

        let password = null;
        if (teacher.password_encrypted) {
            try {
                password = decryptSecret(teacher.password_encrypted);
            } catch (decryptError) {
                console.error(`Failed to decrypt password for teacher ${teacher.id}:`, decryptError);
            }
        }

        const { data: subjectLinks, error: subjectError } = await supabaseAdmin
            .from('teacher_subjects')
            .select('subject_id')
            .eq('teacher_id', teacher.id);
        if (subjectError) throw subjectError;

        res.json({
            fullName: teacher.full_name,
            teacherId: teacher.teacher_id,
            password,
            passwordRecoverable: !!teacher.password_encrypted,
            subjectIds: (subjectLinks || []).map(l => l.subject_id)
        });
    } catch (error) {
        console.error('Get teacher credentials error:', error);
        res.status(500).json({ error: 'Failed to load teacher credentials.' });
    }
});

// POST /api/admin/teachers  { fullName, password, teacherId?, subjectIds? }
router.post('/teachers', async (req, res) => {
    try {
        const { fullName, password, teacherId, subjectIds } = req.body || {};
        if (!fullName || !fullName.trim()) {
            return res.status(400).json({ error: 'Full name is required.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        if (teacherId && await isLoginIdTaken(teacherId)) {
            return res.status(409).json({ error: 'That Teacher ID is already taken.' });
        }

        const passwordEncrypted = encryptSecret(password);
        let attempts = teacherId ? 1 : 5;
        let lastError = null;
        let created = null;

        for (let i = 0; i < attempts; i++) {
            const idToUse = teacherId ? teacherId.trim() : generateTeacherId();
            const { data, error } = await supabaseAdmin
                .from('teachers')
                .insert({
                    full_name: fullName.trim(),
                    teacher_id: idToUse,
                    password_encrypted: passwordEncrypted,
                    is_active: true,
                    must_change_password: false,
                    created_by: req.user.sub
                })
                .select()
                .single();

            if (!error) {
                created = data;
                break;
            }

            lastError = error;
            // Postgres unique_violation — only worth retrying for auto-generated IDs.
            if (error.code !== '23505' || teacherId) break;
        }

        if (!created) {
            if (lastError && lastError.code === '23505') {
                return res.status(409).json({ error: 'That Teacher ID is already taken.' });
            }
            throw lastError;
        }

        if (Array.isArray(subjectIds) && subjectIds.length > 0) {
            await replaceTeacherSubjects(created.id, subjectIds);
        }

        res.status(201).json(toPublicTeacher(created));
    } catch (error) {
        console.error('Create teacher error:', error);
        res.status(500).json({ error: 'Failed to create teacher account.' });
    }
});

// PATCH /api/admin/teachers/:id  { isActive?, fullName?, teacherId?, password?, subjectIds? }
// The only way any of a teacher's credentials or subject assignments change —
// teachers have no self-service path for any of this.
router.patch('/teachers/:id', async (req, res) => {
    try {
        const { isActive, fullName, teacherId, password, subjectIds } = req.body || {};
        const updates = {};

        if (typeof isActive === 'boolean') updates.is_active = isActive;
        if (typeof fullName === 'string' && fullName.trim()) updates.full_name = fullName.trim();

        if (typeof teacherId === 'string' && teacherId.trim()) {
            const trimmed = teacherId.trim();
            if (await isLoginIdTaken(trimmed, { excludeTeacherRowId: req.params.id })) {
                return res.status(409).json({ error: 'That Teacher ID is already taken.' });
            }
            updates.teacher_id = trimmed;
        }

        if (typeof password === 'string' && password) {
            if (password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters.' });
            }
            updates.password_encrypted = encryptSecret(password);
        }

        if (Object.keys(updates).length === 0 && subjectIds === undefined) {
            return res.status(400).json({ error: 'No changes provided.' });
        }

        let data = null;
        if (Object.keys(updates).length > 0) {
            const result = await supabaseAdmin
                .from('teachers')
                .update(updates)
                .eq('id', req.params.id)
                .select()
                .single();
            if (result.error) throw result.error;
            data = result.data;
        } else {
            const result = await supabaseAdmin.from('teachers').select('*').eq('id', req.params.id).maybeSingle();
            if (result.error) throw result.error;
            data = result.data;
        }

        if (!data) return res.status(404).json({ error: 'Teacher not found.' });

        if (subjectIds !== undefined) {
            await replaceTeacherSubjects(req.params.id, subjectIds);
        }

        res.json(toPublicTeacher(data));
    } catch (error) {
        console.error('Update teacher error:', error);
        res.status(500).json({ error: 'Failed to update teacher.' });
    }
});

// DELETE /api/admin/teachers/:id
router.delete('/teachers/:id', async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('teachers')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete teacher error:', error);
        res.status(500).json({ error: 'Failed to delete teacher.' });
    }
});

module.exports = router;
