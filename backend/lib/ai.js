const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const systemPromptPath = path.join(__dirname, '..', 'system_prompt.md');
let systemPrompt = '';
try {
    systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
} catch (error) {
    console.error('Error reading system_prompt.md:', error.message);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = 'claude-opus-4-6';

// Sends a PDF (already on disk) to Claude with the given instruction prompt
// and returns the parsed JSON response. Shared by the teacher-facing
// Syllabus Parser and the admin Curriculum upload, which use the same
// PDF-to-structured-JSON pattern with different target shapes.
async function extractJsonFromPdf(pdfBase64, instructionPrompt, maxTokens = 4096) {
    const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: instructionPrompt },
                {
                    type: 'document',
                    source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
                }
            ]
        }]
    });

    let text = response.content[0].text;
    if (text.startsWith('```json')) {
        text = text.replace(/```json\n/g, '').replace(/\n```/g, '');
    } else if (text.startsWith('```')) {
        text = text.replace(/```\n/g, '').replace(/\n```/g, '');
    }
    return JSON.parse(text);
}

module.exports = { client, model, systemPrompt, extractJsonFromPdf };
