const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const {
    verifyPasswordLegacy,
    signSession,
    setSessionCookie,
    clearSessionCookie,
    requireAuth,
    requireAdmin
} = require('../lib/auth');
const { encryptSecret, verifySecret } = require('../lib/crypto');
const { touchLastSeen } = require('../lib/content');

const router = express.Router();

// Verifies a candidate password against a row that may still be on the old
// bcrypt scheme. On a successful legacy match, transparently re-encrypts the
// password with AES-256-GCM — this is the only way to "migrate" a one-way
// hash, since it can't be reversed without the plaintext the user just typed
// correctly. The old password_hash column is left as-is (it has a NOT NULL
// constraint from the original schema, and once password_encrypted is set,
// verifyAndMigrate never looks at password_hash again anyway).
async function verifyAndMigrate(candidatePassword, row, table) {
    if (row.password_encrypted) {
        return verifySecret(candidatePassword, row.password_encrypted);
    }
    if (row.password_hash) {
        const legacyMatch = await verifyPasswordLegacy(candidatePassword, row.password_hash);
        if (legacyMatch) {
            const encrypted = encryptSecret(candidatePassword);
            const { error } = await supabaseAdmin
                .from(table)
                .update({ password_encrypted: encrypted })
                .eq('id', row.id);
            if (error) console.error(`Failed to migrate ${table} row ${row.id} to encrypted credentials:`, error);
        }
        return legacyMatch;
    }
    return false;
}

// POST /api/auth/login  { id, password }
// `id` is either a Teacher ID or an Admin username. Teacher IDs and admin
// usernames share one namespace enforced at creation time (see routes/admin.js
// and routes/admin-admins.js), so at most one of these two lookups can ever
// match a given id.
router.post('/login', async (req, res) => {
    try {
        const { id, password } = req.body || {};
        if (!id || !password) {
            return res.status(400).json({ error: 'ID and password are required.' });
        }

        const { data: teacher, error: teacherError } = await supabaseAdmin
            .from('teachers')
            .select('*')
            .eq('teacher_id', id.trim())
            .maybeSingle();

        if (teacherError) throw teacherError;

        if (teacher) {
            const validPassword = await verifyAndMigrate(password, teacher, 'teachers');
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid Teacher ID or password.' });
            }
            if (!teacher.is_active) {
                return res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' });
            }

            const token = signSession({ sub: teacher.id, role: 'teacher', teacherId: teacher.teacher_id });
            setSessionCookie(res, token);
            touchLastSeen(teacher.id);
            return res.json({
                role: 'teacher',
                id: teacher.teacher_id,
                fullName: teacher.full_name
            });
        }

        const { data: admin, error: adminError } = await supabaseAdmin
            .from('admins')
            .select('*')
            .eq('username', id.trim())
            .maybeSingle();

        if (adminError) throw adminError;

        if (admin) {
            const validPassword = await verifyAndMigrate(password, admin, 'admins');
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }

            const token = signSession({ sub: admin.id, role: 'admin', username: admin.username });
            setSessionCookie(res, token);
            return res.json({
                role: 'admin',
                id: admin.username,
                fullName: admin.username
            });
        }

        return res.status(401).json({ error: 'Invalid ID or password.' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({
        role: req.user.role,
        id: req.user.role === 'admin' ? req.user.username : req.user.teacherId
    });
});

// POST /api/auth/change-password  { newPassword }
// Admin-only now — teachers can never change their own credentials; only an
// admin can, via the Teachers roster (routes/admin.js). This endpoint is
// what an admin uses to change their own password from Settings.
router.post('/change-password', requireAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body || {};
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }

        const encrypted = encryptSecret(newPassword);
        const { error } = await supabaseAdmin
            .from('admins')
            .update({ password_encrypted: encrypted })
            .eq('id', req.user.sub);
        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to update password. Please try again.' });
    }
});

module.exports = router;
