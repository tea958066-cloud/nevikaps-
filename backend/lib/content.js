const { supabaseAdmin } = require('./supabase');

// Persists one generated item for a teacher. Called after a generation
// endpoint has already succeeded — failures here are logged but never
// thrown, so a persistence hiccup never breaks the response the teacher
// is waiting on.
async function saveGeneratedContent({ teacherId, type, title, subject, classLevel, content }) {
    try {
        const { error } = await supabaseAdmin.from('generated_content').insert({
            teacher_id: teacherId,
            type,
            title: title || type,
            subject: subject || null,
            class_level: classLevel || null,
            content
        });
        if (error) throw error;
    } catch (error) {
        console.error('Failed to save generated content:', error);
    }
}

// Updates a teacher's last_seen_at. Called on login and on every generation.
async function touchLastSeen(teacherId) {
    try {
        const { error } = await supabaseAdmin
            .from('teachers')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', teacherId);
        if (error) throw error;
    } catch (error) {
        console.error('Failed to update last_seen_at:', error);
    }
}

module.exports = { saveGeneratedContent, touchLastSeen };
