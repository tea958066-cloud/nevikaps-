const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');
const { encryptSecret } = require('../lib/crypto');
const { isLoginIdTaken } = require('../lib/identity');

const router = express.Router();
router.use(requireAdmin);

// GET /api/admin/admins — list every admin (no credentials returned).
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('admins')
            .select('id, username, created_at')
            .order('created_at', { ascending: true });
        if (error) throw error;

        res.json({ data: (data || []).map(a => ({ id: a.id, username: a.username, createdAt: a.created_at })) });
    } catch (error) {
        console.error('List admins error:', error);
        res.status(500).json({ error: 'Failed to load admin accounts.' });
    }
});

// POST /api/admin/admins  { username, password } — any logged-in admin can
// create another admin. Enforced server-side by requireAdmin above; there is
// no other way to create an admin account except this and the one-time
// seed-admin.js script.
router.post('/', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !username.trim()) {
            return res.status(400).json({ error: 'Username is required.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const trimmedUsername = username.trim();
        const taken = await isLoginIdTaken(trimmedUsername);
        if (taken) {
            return res.status(409).json({ error: 'That username is already in use as either an admin username or a Teacher ID.' });
        }

        const passwordEncrypted = encryptSecret(password);
        const { data, error } = await supabaseAdmin
            .from('admins')
            .insert({ username: trimmedUsername, password_encrypted: passwordEncrypted })
            .select('id, username, created_at')
            .single();
        if (error) throw error;

        res.status(201).json({ id: data.id, username: data.username, createdAt: data.created_at });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ error: 'Failed to create admin account.' });
    }
});

module.exports = router;
