/**
 * One-time setup: creates the private Supabase Storage buckets used for
 * curriculum PDFs and teacher submission documents. Safe to re-run — does
 * nothing for a bucket that already exists.
 *
 * Usage: node scripts/setup-storage.js
 */
require('dotenv').config();
const { supabaseAdmin } = require('../lib/supabase');
const { CURRICULUM_BUCKET, SUBMISSIONS_BUCKET } = require('../lib/storage');

async function ensureBucket(name, options) {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) throw listError;

    if ((buckets || []).some(b => b.name === name)) {
        console.log(`Bucket "${name}" already exists. Nothing to do.`);
        return;
    }

    const { error: createError } = await supabaseAdmin.storage.createBucket(name, options);
    if (createError) throw createError;

    console.log(`Created private bucket "${name}".`);
}

async function main() {
    try {
        await ensureBucket(CURRICULUM_BUCKET, {
            public: false,
            fileSizeLimit: '20MB',
            allowedMimeTypes: ['application/pdf']
        });

        await ensureBucket(SUBMISSIONS_BUCKET, {
            public: false,
            fileSizeLimit: '20MB',
            allowedMimeTypes: [
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/pdf'
            ]
        });
    } catch (error) {
        console.error('Failed to set up storage buckets:', error.message || error);
        process.exit(1);
    }
}

main();
