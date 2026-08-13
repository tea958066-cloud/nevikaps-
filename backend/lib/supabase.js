// Node < 22 has no global WebSocket, which @supabase/supabase-js's realtime
// module requires at construction time even though we never use realtime
// features here (accounts are plain request/response CRUD).
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = require('ws');
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Account features (login, admin panel) will fail until these are set in backend/.env.');
}

// Service-role client — server side only, never expose this key to the browser.
// Falls back to a placeholder so the server can still boot (and non-account
// features keep working) before Supabase env vars are configured; any
// actual account query will simply fail until real values are set.
const supabaseAdmin = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    serviceRoleKey || 'placeholder-service-role-key',
    { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabaseAdmin };
