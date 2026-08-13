/**
 * One-time admin account creation. Never exposed as an HTTP route on purpose —
 * run this locally (or in a one-off shell on your host) with server-side
 * access to the Supabase service role key.
 *
 * Usage:
 *   node scripts/seed-admin.js <username> <password>
 *
 * If a username/password are not passed as args, ADMIN_USERNAME and
 * ADMIN_PASSWORD are read from the environment (backend/.env) instead.
 */
require('dotenv').config();
const { supabaseAdmin } = require('../lib/supabase');
const { encryptSecret } = require('../lib/crypto');
const { isLoginIdTaken } = require('../lib/identity');

async function main() {
    const username = process.argv[2] || process.env.ADMIN_USERNAME;
    const password = process.argv[3] || process.env.ADMIN_PASSWORD;

    if (!username || !password) {
        console.error('Usage: node scripts/seed-admin.js <username> <password>');
        console.error('(or set ADMIN_USERNAME / ADMIN_PASSWORD in backend/.env)');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error('Password must be at least 8 characters.');
        process.exit(1);
    }

    try {
        const taken = await isLoginIdTaken(username);
        if (taken) {
            console.error(`"${username}" is already in use as either an admin username or a Teacher ID. Choose a different one.`);
            process.exit(1);
        }

        const passwordEncrypted = encryptSecret(password);
        const { error: insertError } = await supabaseAdmin
            .from('admins')
            .insert({ username, password_encrypted: passwordEncrypted });

        if (insertError) throw insertError;

        console.log(`Admin account "${username}" created. You can now log in at / with this username and password.`);
    } catch (error) {
        console.error('Failed to seed admin account:', error.message || error);
        process.exit(1);
    }
}

main();
