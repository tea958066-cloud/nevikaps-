const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'nevikaps_session';
const TOKEN_TTL = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

if (!JWT_SECRET) {
    console.error('Missing JWT_SECRET in backend/.env. Set it before relying on login/admin features.');
}

// Legacy one-way bcrypt helpers — kept only so an account created before
// the AES-256-GCM credential model can still log in once, at which point
// its password is opportunistically re-encrypted (see routes/auth.js).
// No new writes should ever use these; new/updated credentials always go
// through lib/crypto.js's encryptSecret so the admin panel can read them back.
async function hashPasswordLegacy(plainPassword) {
    return bcrypt.hash(plainPassword, 12);
}

async function verifyPasswordLegacy(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
}

function signSession(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifySession(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

function setSessionCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_MS
    });
}

function clearSessionCookie(res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });
}

function getSessionFromRequest(req) {
    const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!token) return null;
    return verifySession(token);
}

// Express middleware: requires any authenticated user (teacher or admin).
function requireAuth(req, res, next) {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }
    req.user = session;
    next();
}

// Express middleware: requires an authenticated admin.
function requireAdmin(req, res, next) {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }
    if (session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    req.user = session;
    next();
}

module.exports = {
    COOKIE_NAME,
    hashPasswordLegacy,
    verifyPasswordLegacy,
    signSession,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
    getSessionFromRequest,
    requireAuth,
    requireAdmin
};
