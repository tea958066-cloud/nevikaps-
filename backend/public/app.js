/**
 * NEVIKAPS Application Logic
 * Vanilla JavaScript implementation logic focusing on Prompt Architecture integration.
 */

// State Management
const State = {
    isAuthenticated: false,
    theme: 'dark',
    currentUser: null
};

// LocalStorage Database Wrapper
const DB = {
    initUser(username) {
        let users = JSON.parse(localStorage.getItem('nevicaps_users') || '{}');
        if (!users[username]) {
            users[username] = { username: username, history: [] };
            localStorage.setItem('nevicaps_users', JSON.stringify(users));
        }
        return users[username];
    },
    saveGeneration(username, item) {
        let users = JSON.parse(localStorage.getItem('nevicaps_users') || '{}');
        if (users[username]) {
            // Unshift to put newest at the top
            item.id = Date.now().toString();
            item.date = new Date().toLocaleDateString();
            users[username].history.unshift(item);
            localStorage.setItem('nevicaps_users', JSON.stringify(users));
        }
    },
    getHistory(username) {
        let users = JSON.parse(localStorage.getItem('nevicaps_users') || '{}');
        return users[username] ? users[username].history : [];
    },
    clearHistory() {
        if (State.currentUser && confirm('Are you sure you want to clear your generation history?')) {
            let users = JSON.parse(localStorage.getItem('nevicaps_users') || '{}');
            users[State.currentUser].history = [];
            localStorage.setItem('nevicaps_users', JSON.stringify(users));
            window.loadHistory();
        }
    }
};

// Real LLM Generator (Connects to Node.js / Express Backend)
const NexicapsAI = {
    async generateLessonPlan(input) {
        try {
            const response = await fetch('/api/generate/lesson', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return '# Error\\nFailed to connect to the NEVIKAPS AI backend. Please ensure the local server is running on port 3000.';
        }
    },

    async generateExam(input) {
        try {
            const response = await fetch('/api/generate/exam', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return '# Error\\nFailed to connect to the NEVIKAPS AI backend. Please ensure the local server is running on port 3000.';
        }
    },

    async generateWorksheet(input) {
        try {
            const response = await fetch('/api/generate/worksheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return '# Error\\nFailed to connect to the NEVIKAPS AI backend. Please ensure the local server is running on port 3000.';
        }
    },

    async generateReportComment(input) {
        try {
            const response = await fetch('/api/generate/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return '# Error\\nFailed to connect to the NEVIKAPS AI backend. Please ensure the local server is running on port 3000.';
        }
    },

    async generateImage(prompt) {
        try {
            const response = await fetch(`/api/generate/image?prompt=${encodeURIComponent(prompt)}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.url;
        } catch (error) {
            console.error('Image Generation Error:', error);
            return null;
        }
    },

    async uploadSyllabus(file) {
        try {
            const formData = new FormData();
            formData.append('syllabus', file);

            const response = await fetch('/api/upload/syllabus', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    },

    async generateChat(messages) {
        try {
            const response = await fetch('/api/generate/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            });

            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return 'I am sorry, but I am unable to connect to the backend server. Please verify it is running on port 3000.';
        }
    }
};

// UI Interactions
document.addEventListener('DOMContentLoaded', () => {

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.classList.contains('dark-theme')) {
            html.classList.remove('dark-theme');
            themeBtn.innerHTML = '<i class="ph ph-moon"></i>';
            State.theme = 'light';
        } else {
            html.classList.add('dark-theme');
            themeBtn.innerHTML = '<i class="ph ph-sun"></i>';
            State.theme = 'dark';
        }
    });

    // Login Form Submit
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        if (!username) return;

        DB.initUser(username);
        State.currentUser = username;

        document.querySelector('.user-name').innerText = username;
        document.querySelector('.avatar img').src = `https://ui-avatars.com/api/?name=${username}&background=random&color=fff`;

        document.getElementById('login-view').classList.remove('active-view');
        document.getElementById('dashboard-view').classList.add('active-view');
        State.isAuthenticated = true;

        window.loadHistory();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        document.getElementById('dashboard-view').classList.remove('active-view');
        document.getElementById('login-view').classList.add('active-view');
        State.isAuthenticated = false;
    });

    // Navigation Logic
    const navItems = document.querySelectorAll('.nav-item:not(.disabled)');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            if (targetId) navigateTo(targetId);
        });
    });

    // Set today's date in lesson planner
    document.getElementById('lesson-date').valueAsDate = new Date();

    // Lesson Generation Flow
    const lessonForm = document.getElementById('lesson-form');
    lessonForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Structure input exactly as requested by prompt guidelines
        const input = {
            subject: document.getElementById('lesson-subject').value,
            class: document.getElementById('lesson-class').value,
            topic: document.getElementById('lesson-topic').value,
            subtopic: document.getElementById('lesson-subtopic').value,
            duration: document.getElementById('lesson-duration').value,
            theme: document.getElementById('lesson-theme').value,
            date: document.getElementById('lesson-date').value,
            custom: document.getElementById('lesson-custom').value
        };

        await simulateAILoading('lesson');
        const markdownOutput = await NexicapsAI.generateLessonPlan(input);

        const imagePrompt = `Cameroon Primary School ${input.class} ${input.subject} lesson about ${input.topic} ${input.theme} illustration clean, colorful vector 2d flat style, educational, highly aesthetic`;
        const imageUrl = await NexicapsAI.generateImage(imagePrompt);

        let finalMarkdown = markdownOutput;
        if (imageUrl) {
            finalMarkdown = `![Lesson Representation](${imageUrl})\n\n` + finalMarkdown;
        }

        DB.saveGeneration(State.currentUser, {
            type: 'Lesson Plan', title: input.topic, content: finalMarkdown, meta: `${input.class} | ${input.subject}`
        });
        window.loadHistory();

        displayResult('lesson-preview', finalMarkdown, 'Lesson Plan');
    });

    // Exam Generation Flow
    const examForm = document.getElementById('exam-form');
    examForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const checkedTypes = Array.from(document.querySelectorAll('input[name="qtype"]:checked')).map(cb => cb.value);

        const input = {
            subject: document.getElementById('exam-subject').value,
            class: document.getElementById('exam-class').value,
            topic: document.getElementById('exam-topic').value,
            number: document.getElementById('exam-number').value,
            qtypes: checkedTypes,
            custom: document.getElementById('exam-custom').value
        };

        if (checkedTypes.length === 0) {
            alert("Please select at least one question type.");
            return;
        }

        await simulateAILoading('exam');
        const markdownOutput = await NexicapsAI.generateExam(input);

        const imagePrompt = `Cameroon Primary School ${input.class} ${input.subject} exam test on ${input.topic} illustration clean flat vector layout style educational`;
        const imageUrl = await NexicapsAI.generateImage(imagePrompt);

        let finalMarkdown = markdownOutput;
        if (imageUrl) {
            finalMarkdown = `![Exam Representation](${imageUrl})\n\n` + finalMarkdown;
        }

        DB.saveGeneration(State.currentUser, {
            type: 'Examination', title: input.topic, content: finalMarkdown, meta: `${input.class} | ${input.subject}`
        });
        window.loadHistory();

        displayResult('exam-preview', finalMarkdown, 'Exam');
    });

    // Worksheet Generation Flow
    const worksheetForm = document.getElementById('worksheet-form');
    if (worksheetForm) {
        worksheetForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const wtypeInput = document.querySelector('input[name="wtype"]:checked');
            const input = {
                subject: document.getElementById('worksheet-subject').value,
                class: document.getElementById('worksheet-class').value,
                topic: document.getElementById('worksheet-topic').value,
                wtype: wtypeInput ? wtypeInput.value : 'Standard Exercise',
                number: document.getElementById('worksheet-number').value,
                custom: document.getElementById('worksheet-custom').value
            };

            await simulateAILoading('worksheet');
            const markdownOutput = await NexicapsAI.generateWorksheet(input);

            const imagePrompt = `Cameroon Primary School ${input.class} ${input.subject} printable worksheet exercises on ${input.topic} flat vector colorful educational layout`;
            const imageUrl = await NexicapsAI.generateImage(imagePrompt);

            let finalMarkdown = markdownOutput;
            if (imageUrl) {
                finalMarkdown = `![Worksheet Representation](${imageUrl})\n\n` + finalMarkdown;
            }

            DB.saveGeneration(State.currentUser, {
                type: 'Worksheet', title: input.topic, content: finalMarkdown, meta: `${input.class} | ${input.subject}`
            });
            window.loadHistory();

            displayResult('worksheet-preview', finalMarkdown, 'Worksheet');
        });
    }

    // Report Card Generation Flow
    const reportForm = document.getElementById('report-form');
    if (reportForm) {
        reportForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const input = {
                name: document.getElementById('report-name').value,
                subject: document.getElementById('report-subject').value,
                level: document.getElementById('report-level').value,
                strengths: document.getElementById('report-strengths').value,
                improve: document.getElementById('report-improve').value,
                custom: document.getElementById('report-custom').value
            };

            await simulateAILoading('report');
            const markdownOutput = await NexicapsAI.generateReportComment(input);

            const imagePrompt = `School report card certificate achievement 3d icon clean vector illustration for student ${input.subject}`;
            const imageUrl = await NexicapsAI.generateImage(imagePrompt);

            let finalMarkdown = markdownOutput;
            if (imageUrl) {
                finalMarkdown = `![Report Card](${imageUrl})\n\n` + finalMarkdown;
            }

            DB.saveGeneration(State.currentUser, {
                type: 'Report Card', title: input.name, content: finalMarkdown, meta: input.subject
            });
            window.loadHistory();

            displayResult('report-preview', finalMarkdown, 'Report_Card');
        });
    }

    // Syllabus Ingestion Flow
    const syllabusForm = document.getElementById('syllabus-form');
    if (syllabusForm) {
        syllabusForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('syllabus-file');
            if (!fileInput.files.length) return;

            await simulateAILoading('syllabus');
            const result = await NexicapsAI.uploadSyllabus(fileInput.files[0]);

            if (result) {
                // Format the JSON result into nice Markdown
                let markdownContent = `# Extracted Curriculum Data\n\n`;
                
                if (result.subjects) markdownContent += `**Subjects Detected:** ${result.subjects.join(', ')}\n\n`;
                if (result.classLevels) markdownContent += `**Class Levels Detected:** ${result.classLevels.join(', ')}\n\n`;
                
                if (result.curriculum && result.curriculum.length > 0) {
                    result.curriculum.forEach((curr, index) => {
                        markdownContent += `### Theme: ${curr.theme || `Module ${index+1}`}\n`;
                        if (curr.topics && curr.topics.length) markdownContent += `- **Topics:** ${curr.topics.join(', ')}\n`;
                        if (curr.subtopics && curr.subtopics.length) markdownContent += `- **Subtopics:** ${curr.subtopics.join(', ')}\n`;
                        if (curr.lessonSequence && curr.lessonSequence.length) {
                            markdownContent += `- **Suggested Sequence:**\n`;
                            curr.lessonSequence.forEach((seq, i) => {
                                markdownContent += `  ${i+1}. ${seq}\n`;
                            });
                        }
                        markdownContent += `\n`;
                    });
                } else if (result.topics) {
                    markdownContent += `### Topics Found\n${result.topics.join(', ')}\n\n`;
                }

                // Try generating an image representation
                const imagePrompt = `Curriculum map document clean professional vector illustration educational theme colorful diagram layout`;
                const imageUrl = await NexicapsAI.generateImage(imagePrompt);

                let finalMarkdown = markdownContent;
                if (imageUrl) {
                    finalMarkdown = `![Curriculum Map](${imageUrl})\n\n` + finalMarkdown;
                }

                DB.saveGeneration(State.currentUser, {
                    type: 'Curriculum', 
                    title: 'Syllabus PDF Extraction', 
                    content: finalMarkdown, 
                    meta: result.subjects ? result.subjects.join(', ') : 'Generated Curriculum'
                });
                window.loadHistory();

                displayResult('syllabus-preview', finalMarkdown, 'Curriculum');
            } else {
                displayResult('syllabus-preview', '# Error\nFailed to parse PDF syllabus. Ensure the backend is running.', 'Error');
            }
        });
    }

    // Custom Image Generator Flow
    const imageForm = document.getElementById('image-form');
    if (imageForm) {
        imageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const promptInput = document.getElementById('custom-image-prompt').value;
            if (!promptInput.trim()) return;

            const previewPanel = document.getElementById('custom-image-preview');
            previewPanel.innerHTML = '<div class="loader-spinner" style="margin: 3rem auto;"></div><p style="text-align:center;">Generating image...</p>';

            const imageUrl = await NexicapsAI.generateImage(promptInput);

            if (imageUrl) {
                previewPanel.innerHTML = `<img src="${imageUrl}" style="max-width: 100%; border-radius: var(--border-radius-sm); box-shadow: var(--glass-shadow);" alt="Generated visual">
                <div style="margin-top: 1.5rem; display: flex; justify-content: center; gap: 1rem;">
                    <button class="btn btn-secondary glass-btn" onclick="window.open('${imageUrl}', '_blank')"><i class="ph ph-download-simple"></i> Open Full Size</button>
                    <button class="btn btn-primary glass-btn" onclick="document.getElementById('custom-image-prompt').value=''; document.getElementById('custom-image-preview').innerHTML='<div class=\\'empty-state\\'><div class=\\'pulse-icon\\'><i class=\\'ph ph-image\\'></i></div><h3>Pollinations AI Studio</h3><p>Type a prompt above and instantly generate visual assets for your classes.</p></div>';" style="background: transparent; border: 1px solid var(--clr-border);"><i class="ph ph-arrow-counter-clockwise"></i> Clear</button>
                </div>`;
            } else {
                previewPanel.innerHTML = '<p style="color: var(--clr-accent);">Failed to load image. Please try again.</p>';
            }
        });
    }

    // AI Assistant Chat Flow
    const chatForm = document.getElementById('chat-form');
    let chatHistoryState = [];

    if (chatForm) {
        const chatContainer = document.getElementById('chat-history-container');
        const chatInput = document.getElementById('chat-input');
        
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if(!text) return;
            
            chatInput.value = '';
            document.getElementById('chat-empty')?.remove();

            chatContainer.innerHTML += `<div style="align-self: flex-end; background: var(--clr-primary); color: white; padding: 1rem 1.5rem; border-radius: 16px 16px 0 16px; max-width: 80%; line-height: 1.5; font-size: 0.95rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">${text}</div>`;
            chatContainer.scrollTop = chatContainer.scrollHeight;

            chatHistoryState.push({ role: "user", parts: [{ text }] });

            const typingId = 'typing-' + Date.now();
            chatContainer.innerHTML += `<div id="${typingId}" style="align-self: flex-start; background: rgba(0,0,0,0.05); border: 1px solid var(--clr-border); padding: 0.8rem 1.5rem; border-radius: 16px 16px 16px 0; display: flex; align-items: center; gap: 0.8rem;"><div class="loader-spinner" style="width:16px; height:16px; border-width: 2px; margin:0;"></div> <span style="color: var(--clr-text-muted); font-size: 0.85rem;">AI is thinking...</span></div>`;
            chatContainer.scrollTop = chatContainer.scrollHeight;

            const aiResponse = await NexicapsAI.generateChat(chatHistoryState);

            chatHistoryState.push({ role: "model", parts: [{ text: aiResponse }] });

            document.getElementById(typingId)?.remove();

            const safeHtml = typeof marked !== 'undefined' ? marked.parse(aiResponse) : aiResponse;
            chatContainer.innerHTML += `<div style="align-self: flex-start; background: var(--clr-surface); border: 1px solid var(--clr-border); padding: 1rem 1.5rem; border-radius: 16px 16px 16px 0; max-width: 85%; line-height: 1.5; font-size: 0.95rem; box-shadow: var(--glass-shadow);" class="markdown-content">${safeHtml}</div>`;
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
    }
});

// Helper Functions
window.navigateTo = function (sectionId) {
    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-target="' + sectionId + '"]').classList.add('active');

    // Update Content
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active-section'));
    document.getElementById(sectionId).classList.add('active-section');

    // Update Title
    const titleMap = {
        'dashboard-content': 'Welcome back, Educator',
        'history-view': 'History & Saved Documents',
        'lesson-planner': 'Lesson Planner',
        'exam-generator': 'Exam Generator',
        'worksheet-generator': 'Class Worksheets',
        'report-card-generator': 'Report Cards',
        'syllabus-ingestion': 'Syllabus Parser',
        'image-generator': 'Image Generation Studio',
        'ai-assistant': 'NEVIKAPS AI Assistant'
    };
    document.getElementById('page-title').innerText = titleMap[sectionId] || 'NEVIKAPS';
};

async function simulateAILoading(type) {
    const overlay = document.getElementById('ai-loading');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.getElementById('ai-progress');

    if (type === 'lesson') {
        loadingText.innerText = "Synthesizing CBA competencies and mapping objectives...";
    } else if (type === 'exam') {
        loadingText.innerText = "Applying Bloom's Taxonomy and balancing question difficulty...";
    } else if (type === 'worksheet') {
        loadingText.innerText = "Structuring class exercises and formatting layout...";
    } else if (type === 'report') {
        loadingText.innerText = "Generating personalized and professional feedback...";
    } else if (type === 'syllabus') {
        loadingText.innerText = "Extracting curriculum structure and themes from PDF...";
    }

    overlay.classList.remove('hidden');
    progressBar.style.width = '0%';

    // Simulate progression
    await new Promise(r => setTimeout(r, 100));
    progressBar.style.width = '30%';

    await new Promise(r => setTimeout(r, 1000));
    progressBar.style.width = '70%';

    await new Promise(r => setTimeout(r, 1500));
    progressBar.style.width = '100%';

    await new Promise(r => setTimeout(r, 400));
    overlay.classList.add('hidden');
}

function displayResult(containerId, markdown, typeLabel) {
    const container = document.getElementById(containerId);

    // Ensure marked is loaded (via CDN in index.html)
    if (typeof marked !== 'undefined') {
        const html = marked.parse(markdown);
        container.innerHTML = '<div class="markdown-content" id="pdf-content-' + containerId + '">' + html + '</div>' +
            '<div style="margin-top: 2rem; display: flex; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--clr-border); flex-wrap: wrap;">' +
            '<button class="btn btn-primary" onclick="downloadPDF(\'pdf-content-' + containerId + '\', \'' + (typeLabel || 'Document') + '\')"><i class="ph ph-file-pdf"></i> Download PDF</button>' +
            '<button class="btn btn-primary" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); box-shadow: 0 4px 15px rgba(37,99,235,0.4);" onclick="downloadWord(\'pdf-content-' + containerId + '\', \'' + (typeLabel || 'Document') + '\')"><i class="ph ph-file-doc"></i> Download Word</button>' +
            '<button class="btn btn-secondary glass-btn" onclick="copyToClipboard(this)"><i class="ph ph-copy"></i> Copy Text</button>' +
            '</div>';
    } else {
        container.innerHTML = '<pre style="white-space: pre-wrap; font-family: var(--font-family);">' + markdown + '</pre>';
    }
}

window.copyToClipboard = function (btn) {
    const content = btn.parentElement.previousElementSibling.innerText;
    navigator.clipboard.writeText(content);

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-check"></i> Copied!';
    setTimeout(() => {
        btn.innerHTML = originalText;
    }, 2000);
}

window.downloadPDF = function (elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Quick visual prep for PDF
    const originalBg = element.style.background;
    const originalColor = element.style.color;
    const originalPadding = element.style.padding;

    element.style.background = 'white';
    element.style.color = 'black';
    element.style.padding = '20px';

    const opt = {
        margin: 0.5,
        filename: 'NEVIKAPS_' + filename.replace(/\s+/g, '_') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        // Restore styles
        element.style.background = originalBg;
        element.style.color = originalColor;
        element.style.padding = originalPadding;
    });
};

window.downloadWord = function (elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const htmlContent = element.innerHTML;
    const safeFilename = 'NEVIKAPS_' + filename.replace(/\s+/g, '_');

    const docContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>${safeFilename}</title>
            <style>
                body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #000; margin: 2cm; }
                h1 { font-size: 20pt; color: #1e293b; }
                h2 { font-size: 16pt; color: #4f46e5; border-bottom: 1px solid #e2e8f0; padding-bottom: 4pt; }
                h3 { font-size: 13pt; color: #1e293b; }
                p { margin-bottom: 8pt; line-height: 1.5; }
                ul, ol { margin-left: 20pt; margin-bottom: 8pt; }
                li { margin-bottom: 4pt; }
                strong { font-weight: bold; }
                em { font-style: italic; }
                img { max-width: 100%; }
            </style>
        </head>
        <body>${htmlContent}</body>
        </html>`;

    const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename + '.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.loadHistory = function () {
    const container = document.getElementById('history-container');
    if (!container) return;

    const history = DB.getHistory(State.currentUser);

    if (history.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="ph ph-file-dashed pulse-icon"></i><p>You have not generated anything yet.</p></div>';
        return;
    }

    container.innerHTML = history.map((item, index) => {
        const safeHtml = marked.parse(item.content).replace(/"/g, '&quot;');
        return '<div class="history-item glass-panel" style="margin-bottom:1rem; padding: 1.5rem; cursor: pointer; border" onclick="viewHistoryItem(' + index + ')">' +
            '<div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">' +
            '<span style="font-size:0.85rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">' + item.type + '</span>' +
            '<span style="font-size:0.85rem; color:var(--clr-text-muted);">' + item.date + '</span>' +
            '</div>' +
            '<h4 style="margin-bottom:0.5rem; font-size:1.1rem; color: var(--clr-text);">' + item.title + '</h4>' +
            '<p style="font-size:0.9rem; color:var(--clr-text-muted);">' + item.meta + '</p>' +
            '<div id="hist-content-' + index + '" style="display:none;" data-raw="' + safeHtml + '" data-type="' + item.type + '"></div>' +
            '</div>';
    }).join('');

    // Update Dashboard Stats
    const statsLesson = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (statsLesson) statsLesson.innerText = history.filter(h => h.type === 'Lesson Plan').length;

    const statsExam = document.querySelector('.stat-card:nth-child(2) .stat-value');
    if (statsExam) statsExam.innerText = history.filter(h => h.type === 'Examination').length;
};

window.viewHistoryItem = function (index) {
    const rawEl = document.getElementById('hist-content-' + index);
    if (rawEl) {
        navigateTo('lesson-planner');
        const container = document.getElementById('lesson-preview');
        const type = rawEl.getAttribute('data-type');

        container.innerHTML = '<div class="markdown-content" id="pdf-content-hist">' + rawEl.getAttribute('data-raw') + '</div>' +
            '<div style="margin-top: 2rem; display: flex; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--clr-border);">' +
            '<button class="btn btn-primary" onclick="downloadPDF(\'pdf-content-hist\', \'' + type + '\')"><i class="ph ph-download-simple"></i> Download PDF</button>' +
            '<button class="btn btn-secondary glass-btn" onclick="copyToClipboard(this)"><i class="ph ph-copy"></i> Copy Text</button>' +
            '</div>';
    }
};
