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

        const { enhancements = [] } = req.body;
        const isNursery   = (req.body.class || '').toLowerCase().includes('nursery');
        const hasStimulus = enhancements.includes('Include Stimulus');
        const hasDiagrams = enhancements.includes('Include Diagrams');
        const hasMatch    = (qtypes || []).includes('Match the Correct Answer');
        const hasWordBank = (qtypes || []).includes('Word Bank');

        const diagramRule = hasDiagrams
            ? `\n\nDIAGRAM RULE: Wherever a diagram, illustration, or image would help a pupil understand or answer a question, insert a marker on its own line in EXACTLY this format (no extra punctuation):\n[DIAGRAM: a labelled diagram of the human digestive system]\nUse this for: science diagrams, maps, geometry figures, bar/pie charts, life cycle illustrations, body parts, plant structures, or any observation-based question. The marker will be replaced with a real generated image.`
            : '';

        const stimulusRule = hasStimulus
            ? `\n\nSTIMULUS RULE: For the Multiple Choice section, open with a clearly labelled STIMULUS block BEFORE the questions:\n**Read the following carefully, then answer the questions below.**\n> [Write a short 3–5 sentence passage, OR a small data table with real values, OR a described scenario relevant to the topic]\nAll MCQ questions in that section must relate directly to the stimulus.`
            : '';

        const matchSection = hasMatch
            ? `\n\n## SECTION F: Match the Correct Answer (Bloom's Level: Remember & Understand)\n**Instructions:** Draw a line OR write the correct letter from Column B next to each item in Column A.\n\nCreate a two-column matching table with 6–8 pairs. Use a Markdown table:\n\n| Column A (Term / Question) | Column B (Answer) |\n|---|---|\n| (item 1) | (answer — shuffled so order differs from Column A) |\n| ... | ... |\n\nEach correct match = 1 mark. Include this section's answers in the Marking Scheme.`
            : '';

        const wordBankSection = hasWordBank
            ? `\n\n## SECTION G: Word Bank — Choose and Fill In\n**Instructions:** Choose the correct word from the box below and write it in the blank space.\n\n> **Word Bank:** [ word1 | word2 | word3 | word4 | word5 | word6 ]\n\nProvide 6 sentences, each missing one key word that is in the Word Bank above. The Word Bank words must exactly match the correct answers. Each blank = 1 mark. Include answers in the Marking Scheme.`
            : '';

        const userPrompt = isNursery
            ? `Generate a fun, print-ready Nursery Activity Sheet (NOT a formal exam).

Teacher Input:
\`\`\`json
${structuredInput}
\`\`\`

---

NURSERY ACTIVITY SHEET FORMAT — Follow every rule below exactly:

**HEADER (at the top of the sheet):**
- School Name: _______________________
- Name of Child: _______________________
- Class: ${req.body.class || ''}
- Subject: ${req.body.subject || ''}
- Date: _______________________
- Teacher: _______________________

---

**ACTIVITIES — Use ONLY these child-friendly activity types (choose the most suitable for the topic):**

## ACTIVITY 1: Trace and Colour
- Provide dotted letters, numbers, or shapes for the child to trace.
- Include a colouring instruction (e.g., "Colour the apple RED").

## ACTIVITY 2: Match the Pictures
- Create a simple matching exercise (e.g., match animal to its name, number to objects).
- Describe what pictures should be drawn (teacher will draw or print separately).

## ACTIVITY 3: Circle the Correct Answer
- Short picture-based questions where the child circles the right picture/word.
- Use no more than 3 options per question.

## ACTIVITY 4: Fill in the Missing Letter / Number
- Provide sequences with one item missing (e.g., 1, 2, ___, 4 or A, B, ___, D).

## ACTIVITY 5: Yes or No
- Simple statements the child ticks YES or NO (with smiley/sad face symbols).

---

**RULES:**
1. Keep all text VERY simple — single words or short phrases only.
2. All ${req.body.number || 10} activities must be extremely age-appropriate for ${req.body.class || 'Nursery'}.
3. Make the sheet fun, colourful (describe colours in instructions), and child-friendly.
4. Use Cameroon-relevant context (local animals, foods, names) where appropriate.
5. End with a TEACHER'S GUIDE section: correct answers and how to assess each activity.`

            : `Generate a complete, print-ready term examination using Bloom's Taxonomy.
${diagramRule}${stimulusRule}

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

**SECTIONS — Structure the exam exactly like this. IMPORTANT: Section headings must appear EXACTLY as shown below (no Bloom's taxonomy labels in headings — those are for your internal guidance only):**

## SECTION A: Multiple Choice
[Internal guide — target Bloom's levels: Remember & Understand]
${hasStimulus ? '**Read the following carefully, then answer the questions below.**\n> [Insert a 3–5 sentence stimulus passage or data relevant to the topic here]\n' : ''}- Write clear multiple choice questions with 4 options each (A, B, C, D).
- Instruction to pupils: *Circle the letter of the correct answer.*
- Each question = 1 mark.

## SECTION B: Fill in the Blanks
[Internal guide — target Bloom's levels: Remember & Understand]
- Provide sentences with one key word missing.
- Each blank = 1 mark.
${hasDiagrams ? '- Where appropriate, insert a [DIAGRAM: ...] marker so pupils observe and fill in labels or answers.' : ''}

## SECTION C: Short Answer Questions
[Internal guide — target Bloom's levels: Understand & Apply]
- Questions requiring 1–3 sentence answers.
- Each question = 2 marks.
${hasDiagrams ? '- Include at least one question with a [DIAGRAM: ...] marker that pupils must study and describe or label.' : ''}

## SECTION D: Problem Solving
[Internal guide — target Bloom's levels: Apply & Analyze]
- Practical questions requiring working out or observation.
- Each question = 3–5 marks.
${hasDiagrams ? '- Include at least one [DIAGRAM: ...] marker for a chart, figure, or geometry diagram pupils must interpret.' : ''}

## SECTION E: Theory / Essay Questions
[Internal guide — target Bloom's levels: Evaluate & Create — only for Primary 4, 5, 6]
- Higher order thinking questions.
- Each question = 5–10 marks.
${matchSection}${wordBankSection}

---

**RULES:**
1. Distribute all ${req.body.number || 20} questions across the sections based on the question types allowed: ${(qtypes || []).join(', ')}.
2. Difficulty must increase from Section A to the last section.
3. All questions must match the class level — ${req.body.class || 'Primary'}.
4. Use Cameroon-relevant context (local names, places, currency, animals) where appropriate.
5. Write clear pupil instructions at the start of each section.
6. Make the exam clean and ready to print.

---

**At the end, include a complete MARKING SCHEME / ANSWER KEY for the teacher:**

## MARKING SCHEME (For Teacher Use Only)
- List every correct answer by section and question number.
- Include model answers for short answer and essay questions.
- Include answers for the Matching and Word Bank sections if present.
- Include the marks allocation for each question.`;

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
            const isNurseryMock = (req.body.class || '').toLowerCase().includes('nursery');
            const mockMarkdown = isNurseryMock
                ? `# Nursery Activity Sheet: ${req.body.subject || 'Subject'} — ${req.body.class || 'Nursery'}\n\n## ACTIVITY 1: Trace and Colour\nTrace the letter **A**. Colour the apple **RED**.\n\n## ACTIVITY 2: Match the Pictures\nDraw a line to match the animal to its name.\n\n*API Key Quota Exceeded. This is dynamically mocked data.*`
                : `# Term Examination: ${req.body.subject || 'Subject'}\n\n**Total Questions:** ${req.body.number || 10}\n\n## SECTION A: Multiple Choice\n1. What is the core concept?\n   A) Option 1\n   B) Option 2\n\n*API Key Quota Exceeded. This is dynamically mocked data.*`;
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

// Monthly Lesson Plan endpoint
app.post('/api/generate/monthly-lesson', async (req, res) => {
    try {
        const {
            subject, class: className, term, month, year,
            weeks, lessonsPerWeek, theme, topics, custom
        } = req.body;

        const structuredInput = JSON.stringify({
            subject, class: className, term, month, year,
            numberOfWeeks: weeks,
            lessonsPerWeek,
            mainTheme: theme,
            topicsTocover: topics,
            customInstructions: custom || 'None'
        }, null, 2);

        const userPrompt = `Create a complete, print-ready MONTHLY LESSON PLAN for an entire school month.

Teacher Input:
\`\`\`json
${structuredInput}
\`\`\`

Follow the Cameroon Competency Based Approach (CBA). Do NOT skip any section.

---

## MONTHLY LESSON PLAN — ${month} ${year}

### IDENTIFICATION

| Field | Details |
|-------|---------|
| School | _______________________ |
| Teacher | _______________________ |
| Subject | ${subject || ''} |
| Class / Grade | ${className || ''} |
| Term | ${term || ''} |
| Month | ${month || ''} ${year || ''} |
| Main Theme / Strand | ${theme || ''} |

---

### MONTHLY OVERVIEW

Write a 3–4 sentence summary of what pupils will learn this month, the competencies to be developed, and why this month's content matters.

---

### MONTHLY OBJECTIVES

By the end of the month, pupils should be able to:
(Write 5–6 measurable objectives using action verbs appropriate for ${className || 'the class'} level.)

---

### WEEK-BY-WEEK BREAKDOWN

For EACH of the ${weeks || 4} weeks, produce a full section in this format:

---

#### WEEK [N] — Dates: _____________ to _____________

**Weekly Focus / Sub-theme:** (state the sub-theme for this week)

**Weekly Objective:** Learners will be able to [skill] correctly by end of week.

**Lesson Schedule:**

| Day | Lesson No. | Topic | Sub-topic | Objectives | Teaching Method | Materials |
|-----|-----------|-------|-----------|------------|----------------|-----------|
| Monday | | | | | | |
| Tuesday | | | | | | |
| Wednesday | | | | | | |
| Thursday | | | | | | |
| Friday | | | | | | |

Fill EVERY cell. Use ${lessonsPerWeek || 5} lessons per week. Spread topics logically across days.

**End-of-Week Assessment:** Describe in 2 sentences how the teacher checks understanding at end of week (e.g., oral questions, short quiz, class activity).

**Homework for the Week:** Write 2 homework tasks appropriate for ${className || 'the class'}.

---

(Repeat the above block for all ${weeks || 4} weeks, using different topics each week as listed in the topics input.)

---

### MONTHLY ASSESSMENT PLAN

| Assessment Type | Week | Description | Marks |
|----------------|------|-------------|-------|
| Classwork | Weekly | Daily exercises and participation | /10 |
| Weekly Quiz | End of each week | Short written or oral quiz | /20 |
| Mid-Month Test | Week 2 | Written test covering weeks 1–2 | /30 |
| End-of-Month Evaluation | Week ${weeks || 4} | Full month evaluation | /40 |

---

### TEACHING RESOURCES NEEDED THIS MONTH

List at least 8 resources the teacher will use across the month (textbooks, charts, real objects, ICT tools, etc.).

---

### TEACHER'S MONTHLY REFLECTION (to fill after the month)

| Reflection Point | Notes |
|-----------------|-------|
| Topics completed on schedule? | |
| Topics not completed — reason? | |
| Pupils who excelled | |
| Pupils needing extra support | |
| What to improve next month | |

${custom ? `\n---\n\n**Additional Teacher Instructions:** ${custom}` : ''}`;

        const response = await client.messages.create({
            model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        res.json({ result: response.content[0].text });
    } catch (error) {
        console.error('Monthly Lesson Plan Error:', error);
        if (error.status === 429 || error.status === 403) {
            const mock = `# Monthly Lesson Plan: ${req.body.subject || 'Subject'} — ${req.body.month || 'Month'} ${req.body.year || ''}\n\n## Week 1\n| Day | Topic |\n|-----|-------|\n| Monday | Introduction |\n\n*API Key Quota Exceeded. This is mocked data.*`;
            return res.json({ result: mock });
        }
        res.status(500).json({ error: 'Failed to generate monthly lesson plan.' });
    }
});

// Diagram Generator endpoint (returns Mermaid.js syntax)
app.post('/api/generate/diagram', async (req, res) => {
    try {
        const { topic, dtype, class: className, subject, custom } = req.body;

        const userPrompt = `Generate a Mermaid.js diagram for the following educational request.

Topic: ${topic}
Diagram Type: ${dtype}
Class Level: ${className || 'Primary'}
Subject: ${subject || 'General'}
Additional Instructions: ${custom || 'None'}

STRICT RULES:
1. Return ONLY the raw Mermaid.js syntax — no explanations, no markdown fences, no extra text.
2. Start directly with the Mermaid keyword (e.g., graph TD, mindmap, timeline, flowchart LR, pie, etc.).
3. Make the diagram educational, accurate, and appropriate for the class level.
4. Keep it simple enough for a school classroom.
5. Use Cameroon-relevant context where applicable (local animals, plants, geography).

Supported diagram types and when to use them:
- mindmap → for topic summaries, concept maps
- flowchart TD → for processes, steps, how things work
- timeline → for historical events, sequences of events
- pie → for data, fractions, percentages
- graph TD → for cause and effect, relationships between concepts
- sequenceDiagram → for interactions, conversations, step-by-step processes`;

        const response = await client.messages.create({
            model,
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        let mermaidCode = response.content[0].text.trim();
        // Strip markdown fences if model wrapped it anyway
        mermaidCode = mermaidCode.replace(/^```(?:mermaid)?\n?/i, '').replace(/\n?```$/i, '').trim();

        res.json({ result: mermaidCode });
    } catch (error) {
        console.error('Diagram Generator Error:', error);
        if (error.status === 429 || error.status === 403) {
            const mock = `mindmap\n  root((${req.body.topic || 'Topic'}))\n    Concept A\n      Detail 1\n      Detail 2\n    Concept B\n      Detail 3\n    Concept C`;
            return res.json({ result: mock });
        }
        res.status(500).json({ error: 'Failed to generate diagram.' });
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
