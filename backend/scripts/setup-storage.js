/**
 * One-time setup: creates the private Supabase Storage bucket used for
 * curriculum PDFs. Safe to re-run — does nothing if the bucket already exists.
 *
 * Usage: node scripts/setup-storage.js
 */
require('dotenv').config();
const { supabaseAdmin } = require('../lib/supabase');
const { CURRICULUM_BUCKET } = require('../lib/storage');

async function main() {
    try {
        const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
        if (listError) throw listError;

        const exists = (buckets || []).some(b => b.name === CURRICULUM_BUCKET);
        if (exists) {
            console.log(`Bucket "${CURRICULUM_BUCKET}" already exists. Nothing to do.`);
            return;
        }

        const { error: createError } = await supabaseAdmin.storage.createBucket(CURRICULUM_BUCKET, {
            public: false,
            fileSizeLimit: '20MB',
            allowedMimeTypes: ['application/pdf']
        });
        if (createError) throw createError;

        console.log(`Created private bucket "${CURRICULUM_BUCKET}" for curriculum PDFs.`);
    } catch (error) {
        console.error('Failed to set up storage bucket:', error.message || error);
        process.exit(1);
    }
}

main();
