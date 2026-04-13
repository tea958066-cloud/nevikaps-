require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');

// Setup file upload (use system temp dir so it works locally and on Vercel)
const upload = multer({ dest: os.tmpdir() });

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Load system prompt on startup
const systemPromptPath = path.join(__dirname, 'system_prompt.md');
let systemPrompt = '';
try {
    systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
} catch (error) {
    console.error('Error reading system_prompt.md:', error.message);
}

// Initialize Anthropic Client
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = 'claude-opus-4-6';

app.get('/api/health', (req, res) => {
    res.json({ status: 'NEVIKAPS Claude AI backend is running optimally.' });
});

// Syllabus Upload Endpoint
app.post('/api/upload/syllabus', upload.single('syllabus'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded.' });
        }

        const filePath = req.file.path;
        const fileContent = fs.readFileSync(filePath);
        const base64Data = fileContent.toString('base64');

        const userPrompt = `SYLLABUS INGESTION PROMPT (FOR PDF)

Analyze the uploaded syllabus and extract the curriculum structure.

Return the following:
Subjects
Class levels
Learning themes / strands
Topics
Subtopics
Suggested lesson sequence

Format the results so the system can store them as structured curriculum data strictly in JSON format. Do not use markdown wrappers, just raw JSON. The JSON should have arrays for 'subjects', 'classLevels', and an array of objects for 'curriculum' (which includes themes, topics, subtopics, and lessonSequence).`;

        const response = await client.messages.create({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    {
                        type: 'document',
                        source: {
                            type: 'base64',
                            media_type: 'application/pdf',
                            data: base64Data
                        }
                    }
                ]
            }]
        });

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        let jsonResponse = response.content[0].text;
        if (jsonResponse.startsWith('```json')) {
            jsonResponse = jsonResponse.replace(/```json\n/g, '').replace(/\n```/g, '');
        } else if (jsonResponse.startsWith('```')) {
            jsonResponse = jsonResponse.replace(/```\n/g, '').replace(/\n```/g, '');
        }

        try {
            const parsedData = JSON.parse(jsonResponse);
            res.json({ result: parsedData });
        } catch (parseError) {
            console.error('Failed to parse AI response as JSON:', response.content[0].text);
            res.status(500).json({ error: 'AI did not return valid JSON.', raw: response.content[0].text });
        }

    } catch (error) {
        console.error('Syllabus parsing error:', error);

        if (error.status === 429 || error.status === 403) {
            console.log('Mocking Syllabus response due to rate limit.');
            return res.json({ result: {
                subjects: ['Mathematics', 'Science'],
                classLevels: ['Primary 4', 'Primary 5'],
                curriculum: [
                    {
                        theme: 'Numbers',
                        topics: ['Fractions', 'Decimals'],
                        subtopics: ['Improper Fractions', 'Addition of Decimals'],
                        lessonSequence: ['Introduction to Fractions', 'Types of Fractions', 'Improper to Mixed']
                    }
                ]
            }});
        }

        res.status(500).json({ error: 'Failed to process syllabus PDF.' });
    }
});

// Image generation endpoint (uses Pollinations AI — no API change needed)
app.get('/api/generate/image', (req, res) => {
    const prompt = req.query.prompt;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=1024&height=512&nologo=true`;
    res.json({ url: imageUrl });
});

// Chat endpoint
app.post('/api/generate/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required.' });
        }

        // Convert from Gemini format { role: "user"|"model", parts: [{text}] }
        // to Anthropic format { role: "user"|"assistant", content: string }
        const contents = messages.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.parts && msg.parts[0] ? msg.parts[0].text : ''
        }));

        const response = await client.messages.create({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: contents
        });

        res.json({ result: response.content[0].text });
    } catch (error) {
        console.error('Chat API Error:', error);

        if (error.status === 429 || error.status === 403) {
            console.log('Mocking Chat response due to rate limit.');
            return res.json({ result: 'I am responding to you using exactly the Cameroon competency based framework you requested. However, my AI quota limit has been exceeded, so this is a dynamically generated placeholder response.' });
        }
        res.status(500).json({ error: 'Failed to generate chat response.' });
    }
});

// Lesson Plan endpoint
app.post('/api/generate/lesson', async (req, res) => {
    try {
        const { subject, class: className, topic, subtopic, duration, theme, date, custom } = req.body;

        const structuredInput = JSON.stringify({
            subject,
            class: className,
            topic,
            subtopic,
            duration,
            theme,
            date,
            customInstructions: custom || 'None'
        }, null, 2);

        const userPrompt = `Create a complete, detailed, print-ready lesson plan using the NEVIKAPS Lesson Plan Structure.

Teacher Input:
\`\`\`json
${structuredInput}
\`\`\`

The lesson must strictly follow the Cameroon Competency Based Approach (CBA) and match the learner level exactly.
Do NOT skip any section. Complete every section fully.

---

## 1. IDENTIFICATION INFORMATION

| Field | Details |
|-------|---------|
| School | _______________________ |
| Teacher | _______________________ |
| Subject | ${req.body.subject || ''} |
| Class / Grade | ${req.body.class || ''} |
| Date | ${req.body.date || ''} |
| Duration | ${req.body.duration || ''} |
| Topic | ${req.body.topic || ''} |
| Sub-topic | ${req.body.subtopic || ''} |
| Learning Theme / Strand | ${req.body.theme || ''} |

---

## 2. GENERAL OBJECTIVE

Write one clear objective using this formula:
**Learners will be able to** + [skill] + **correctly.**

---

## 3. SPECIFIC (MEASURABLE) OBJECTIVES

Start with: *By the end of the lesson, pupils should be able to:*

Write 4 objectives using action verbs: Identify, Describe, Explain, Calculate, Convert, Compare, List, Solve, Demonstrate, Match.

---

## 4. COMPETENCIES DEVELOPED

**Subject Competence:** (Write 2 competencies directly related to the subject)

**Cognitive Skills:** (Write 2 thinking skills developed during the lesson)

---

## 5. TEACHING MATERIALS / TEACHING AIDS

List all materials the teacher will use (at least 6 items):
Examples: Chalkboard, chalk, charts, textbook, flash cards, diagrams, real objects, pictures, projector, worksheets.

---

## 6. PREVIOUS KNOWLEDGE (INTRODUCTION)

Write 3 short questions the teacher asks pupils to link this lesson to what they already know:

1.
2.
3.

---

## 7. PRESENTATION / LESSON DEVELOPMENT

Use a clear table with columns: Step | Teacher Activity | Learner Activity | Time

| Step | Teacher Activity | Learner Activity | Time |
|------|-----------------|------------------|------|
| Step 1 — Introduction | | | |
| Step 2 — Explanation | | | |
| Step 3 — Demonstration | | | |
| Step 4 — Guided Practice | | | |
| Step 5 — Independent Practice | | | |

Fill in every cell with specific, practical activities.

---

## 8. EVALUATION

Write 4 questions the teacher asks at the end to check understanding:

1.
2.
3.
4.

---

## 9. SUMMARY / CONCLUSION

Write a short, clear summary (3–4 sentences) the teacher delivers to close the lesson.

---

## 10. ASSIGNMENT / HOMEWORK

Write 3 homework questions appropriate for ${req.body.class || 'the class'} level:

1.
2.
3.

${req.body.custom ? `\n---\n\n**Additional Teacher Instructions:** ${req.body.custom}` : ''}`;

        const response = await client.messages.create({
            model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        res.json({ result: response.content[0].text });
    } catch (error) {
        console.error('Lesson Plan Error:', error);
        if (error.status === 429 || error.status === 403) {
            console.log('Mocking Lesson Plan response due to rate limit.');
            const mockMarkdown = `# Lesson Plan: ${req.body.topic || 'General Topic'}\n\n## General Objective\nLearners will be able to understand and apply concepts of ${req.body.subtopic || 'the topic'} correctly.\n\n## Presentation\n- *Teacher:* Reviews previous knowledge.\n- *Learners:* Answer questions.\n\n*API Key Quota Exceeded. This is dynamically mocked data.*`;
            return res.json({ result: mockMarkdown });
        }
        res.status(500).json({ error: 'Failed to generate lesson plan.' });
    }
});

// Exam Generator endpoint
app.post('/api/generate/exam', async (req, res) => {
    try {
        const { subject, class: className, topic, number, qtypes, custom } = req.body;

        const structuredInput = JSON.stringify({
            subject,
            class: className,
            topic,
            number,
            questionTypesAllowed: qtypes,
            customInstructions: custom || 'None'
        }, null, 2);

        const userPrompt = `Generate a complete, print-ready term examination using Bloom's Taxonomy.

Teacher Input:
\`\`\`json
${structuredInput}
\`\`\`

---

EXAM FORMAT INSTRUCTIONS — Follow every rule below exactly:

**HEADER (at the top of the exam):**
- School Name: _______________________
- Name of Pupil: _______________________
- Class: ${req.body.class || ''}
- Subject: ${req.body.subject || ''}
- Date: _______________________
- Duration: _______________________
- Total Marks: (calculate based on number of questions)

---

**SECTIONS — Structure the exam exactly like this:**

## SECTION A: Multiple Choice (Bloom's Level: Remember & Understand)
- Write clear multiple choice questions with 4 options each (A, B, C, D)
- Circle the correct answer instruction
- Each question = 1 mark

## SECTION B: Fill in the Blanks (Bloom's Level: Remember & Understand)
- Provide sentences with one key word missing
- Each blank = 1 mark

## SECTION C: Short Answer Questions (Bloom's Level: Understand & Apply)
- Questions requiring 1–3 sentence answers
- Each question = 2 marks

## SECTION D: Problem Solving / Structured Questions (Bloom's Level: Apply & Analyze)
- Practical questions requiring working out
- Each question = 3–5 marks

## SECTION E: Theory / Essay (Bloom's Level: Evaluate & Create)
- Only include for Primary 4, 5, 6
- Higher order thinking questions
- Each question = 5–10 marks

---

**RULES:**
1. Distribute all ${req.body.number || 20} questions across sections based on the question types allowed.
2. Difficulty must increase from Section A to Section E.
3. All questions must match the class level — ${req.body.class || 'Primary'}.
4. Use Cameroon-relevant context (local names, places, currency) where appropriate.
5. Write clear instructions at the start of each section.
6. Make the exam clean and ready to print.

---

**At the end, include a complete MARKING SCHEME / ANSWER KEY for the teacher:**

## MARKING SCHEME (For Teacher Use Only)
- List every correct answer by section and question number
- Include model answers for short answer and essay questions
- Include the marks allocation for each question`;

        const response = await client.messages.create({
            model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        res.json({ result: response.content[0].text });
    } catch (error) {
        console.error('Exam Error:', error);
        if (error.status === 429 || error.status === 403) {
            console.log('Mocking Exam response due to rate limit.');
            const mockMarkdown = `# Term Examination: ${req.body.subject || 'Subject'}\n\n**Total Questions:** ${req.body.number || 10}\n\n## SECTION A: Multiple Choice\n1. What is the core concept?\n   A) Option 1\n   B) Option 2\n\n*API Key Quota Exceeded. This is dynamically mocked data.*`;
            return res.json({ result: mockMarkdown });
        }
        res.status(500).json({ error: 'Failed to generate exam.' });
    }
});

// Worksheet endpoint
app.post('/api/generate/worksheet', async (req, res) => {
    try {
        const { subject, class: className, topic, wtype, number, custom } = req.body;

        const structuredInput = JSON.stringify({
            subject,
            class: className,
            topic,
            exerciseType: wtype,
            numberOfQuestions: number,
            customInstructions: custom || 'None'
        }, null, 2);

        const userPrompt = `Generate a classroom worksheet.

Teacher Input:
\`\`\`json
${structuredInput}
\`\`\`

Provide engaging, age-appropriate questions related to the topic. Output cleanly formatted Markdown.`;

        const response = await client.messages.create({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        res.json({ result: response.content[0].text });
    } catch (error) {
        console.error('Worksheet Error:', error);
        if (error.status === 429 || error.status === 403) {
            console.log('Mocking Worksheet response due to rate limit.');
            const mockMarkdown = `# Worksheet: ${req.body.topic || 'Topic'}\n\n1. Fill in the blank related to ${req.body.topic || 'topic'}.\n\n*API Key Quota Exceeded. This is dynamically mocked data.*`;
            return res.json({ result: mockMarkdown });
        }
        res.status(500).json({ error: 'Failed to generate worksheet.' });
    }
});

// Report Card endpoint
app.post('/api/generate/report', async (req, res) => {
    try {
        const { name, subject, level, strengths, improve, custom } = req.body;

        const structuredInput = JSON.stringify({
            studentName: name,
            subject,
            performanceLevel: level,
            strengths,
            areasForImprovement: improve,
            additionalRemarks: custom || 'None'
        }, null, 2);

        const userPrompt = `Generate a report card comment.

Teacher Input:
\`\`\`json
${structuredInput}
\`\`\`

Write a professional, encouraging paragraph describing the student's progress, highlighting their strengths, and offering constructive feedback for areas of improvement.`;

        const response = await client.messages.create({
            model,
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        res.json({ result: response.content[0].text });
    } catch (error) {
        console.error('Report Card Error:', error);
        if (error.status === 429 || error.status === 403) {
            console.log('Mocking Report response due to rate limit.');
            const mockMarkdown = `# Report Card Comment\n\n${req.body.name || 'Student'} has demonstrated a **${req.body.level || 'Good'}** performance in ${req.body.subject || 'the subject'}.\n\n*API Key Quota Exceeded. This is dynamically mocked data.*`;
            return res.json({ result: mockMarkdown });
        }
        res.status(500).json({ error: 'Failed to generate report card comment.' });
    }
});

// Start server locally (Vercel handles this automatically in production)
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`NEVIKAPS Claude AI Backend serving on port ${port}`);
        console.log(`Open http://localhost:${port} in your browser`);
    });
}

module.exports = app;
