const { supabaseAdmin } = require('./supabase');

// Teacher IDs and admin usernames share one login "id" namespace (the login
// endpoint checks both tables by the same value). A collision between them
// silently shadows one account behind the other and can lock an admin out —
// exactly what happened before this check existed. Call this before
// inserting a new admin or teacher, excluding the row being edited if any.
async function isLoginIdTaken(id, { excludeTeacherRowId, excludeAdminRowId } = {}) {
    const trimmed = (id || '').trim();
    if (!trimmed) return false;

    let teacherQuery = supabaseAdmin.from('teachers').select('id').eq('teacher_id', trimmed);
    if (excludeTeacherRowId) teacherQuery = teacherQuery.neq('id', excludeTeacherRowId);
    const { data: teacherMatch, error: teacherError } = await teacherQuery.maybeSingle();
    if (teacherError) throw teacherError;
    if (teacherMatch) return true;

    let adminQuery = supabaseAdmin.from('admins').select('id').eq('username', trimmed);
    if (excludeAdminRowId) adminQuery = adminQuery.neq('id', excludeAdminRowId);
    const { data: adminMatch, error: adminError } = await adminQuery.maybeSingle();
    if (adminError) throw adminError;
    if (adminMatch) return true;

    return false;
}

module.exports = { isLoginIdTaken };
