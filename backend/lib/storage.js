const fs = require('fs');
const { supabaseAdmin } = require('./supabase');

const CURRICULUM_BUCKET = 'curriculum-pdfs';
const SUBMISSIONS_BUCKET = 'teacher-submissions';

// Uploads a curriculum PDF (already saved to a temp path by multer) into
// private Supabase Storage. Returns the storage path — never a public URL,
// since the bucket is private and every read goes through a signed URL
// generated on demand for an authenticated admin.
async function uploadCurriculumPdf(localFilePath, originalName, schoolYear) {
    const fileBuffer = fs.readFileSync(localFilePath);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${schoolYear}/${Date.now()}-${safeName}`;

    const { error } = await supabaseAdmin.storage
        .from(CURRICULUM_BUCKET)
        .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: false });

    if (error) throw error;
    return storagePath;
}

async function getCurriculumPdfSignedUrl(storagePath, expiresInSeconds = 300) {
    const { data, error } = await supabaseAdmin.storage
        .from(CURRICULUM_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

    if (error) throw error;
    return data.signedUrl;
}

async function deleteCurriculumPdf(storagePath) {
    if (!storagePath) return;
    const { error } = await supabaseAdmin.storage.from(CURRICULUM_BUCKET).remove([storagePath]);
    if (error) throw error;
}

// Uploads a teacher's exam document (already saved to a temp path by multer)
// into private Supabase Storage. Namespaced by teacher so files never collide
// and an admin can trace a file back to who submitted it just from the path.
async function uploadSubmissionFile(localFilePath, originalName, teacherId, mimeType) {
    const fileBuffer = fs.readFileSync(localFilePath);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${teacherId}/${Date.now()}-${safeName}`;

    const { error } = await supabaseAdmin.storage
        .from(SUBMISSIONS_BUCKET)
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

    if (error) throw error;
    return storagePath;
}

// Downloads the raw file bytes server-side so the admin route can stream
// them straight back with the original filename — no signed URL needed.
async function downloadSubmissionFile(storagePath) {
    const { data, error } = await supabaseAdmin.storage
        .from(SUBMISSIONS_BUCKET)
        .download(storagePath);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
}

async function deleteSubmissionFile(storagePath) {
    if (!storagePath) return;
    const { error } = await supabaseAdmin.storage.from(SUBMISSIONS_BUCKET).remove([storagePath]);
    if (error) throw error;
}

module.exports = {
    CURRICULUM_BUCKET, uploadCurriculumPdf, getCurriculumPdfSignedUrl, deleteCurriculumPdf,
    SUBMISSIONS_BUCKET, uploadSubmissionFile, downloadSubmissionFile, deleteSubmissionFile
};
