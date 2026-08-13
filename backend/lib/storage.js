const fs = require('fs');
const { supabaseAdmin } = require('./supabase');

const CURRICULUM_BUCKET = 'curriculum-pdfs';

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

module.exports = { CURRICULUM_BUCKET, uploadCurriculumPdf, getCurriculumPdfSignedUrl, deleteCurriculumPdf };
