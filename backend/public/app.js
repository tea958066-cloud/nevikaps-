/**
 * NEVIKAPS Application Logic
 * Vanilla JavaScript implementation logic focusing on Prompt Architecture integration.
 */

// Initialize Mermaid.js for diagram rendering
if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
}

// State Management
const State = {
    isAuthenticated: false,
    theme: 'light',
    currentUser: null,
    currentRole: null
};

// Generated content is now persisted server-side (see /api/content); this
// wrapper just gives the "Clear History" button a server-backed action.
const DB = {
    async clearHistory() {
        if (!State.currentUser || !confirm('Are you sure you want to clear your generation history?')) return;
        try {
            const response = await fetch('/api/content', { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to clear history');
            window.loadHistory();
        } catch (error) {
            console.error('Clear history error:', error);
            alert('Could not clear history. Please try again.');
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

    async generateImage(prompt, standalone = false) {
        try {
            const url = `/api/generate/image?prompt=${encodeURIComponent(prompt)}${standalone ? '&standalone=true' : ''}`;
            const response = await fetch(url);
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

    async generateMonthlyLesson(input) {
        try {
            const response = await fetch('/api/generate/monthly-lesson', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('API Error:', error);
            return '# Error\nFailed to connect to the NEVIKAPS AI backend. Please ensure the server is running.';
        }
    },

    async generateDiagram(input) {
        try {
            const response = await fetch('/api/generate/diagram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('Diagram API Error:', error);
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

    attachPasswordTogglesTo(['#password']);

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

    // --- Auth: real server-backed login. Teachers never set or change their
    // own credentials — only an admin can, from the Teachers roster. ---
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    function showError(el, message) {
        el.textContent = message;
        el.classList.remove('hidden');
    }
    function hideError(el) {
        el.classList.add('hidden');
        el.textContent = '';
    }

    function enterDashboard(teacherId, fullName) {
        State.currentUser = teacherId;
        State.isAuthenticated = true;

        document.querySelector('.user-name').innerText = fullName || teacherId;
        document.querySelector('.avatar img').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || teacherId)}&background=random&color=fff`;

        loginForm.reset();
        document.getElementById('login-view').classList.remove('active-view');
        document.getElementById('dashboard-view').classList.add('active-view');

        window.loadHistory();
        if (typeof window.loadAssignedSubjects === 'function') window.loadAssignedSubjects();
        if (typeof window.loadSubmissions === 'function') window.loadSubmissions();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError(loginError);

        const id = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        if (!id || !password) return;

        const btn = document.getElementById('btn-login');
        btn.disabled = true;
        btn.querySelector('span').innerText = 'Logging in...';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id, password })
            });
            const data = await response.json();

            if (!response.ok) {
                showError(loginError, data.error || 'Login failed.');
                return;
            }

            if (data.role === 'admin') {
                window.location.href = '/admin';
                return;
            }

            State.currentRole = 'teacher';
            enterDashboard(data.id, data.fullName);
        } catch (error) {
            console.error('Login request failed:', error);
            showError(loginError, 'Could not reach the server. Please try again.');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').innerText = 'Log In';
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout request failed:', error);
        }
        document.getElementById('dashboard-view').classList.remove('active-view');
        document.getElementById('login-view').classList.add('active-view');
        State.isAuthenticated = false;
        State.currentUser = null;
    });

    // Resume an existing session on page load/refresh instead of forcing a re-login.
    (async function checkExistingSession() {
        try {
            const response = await fetch('/api/auth/me');
            if (!response.ok) return;
            const data = await response.json();
            if (data.role === 'admin') {
                window.location.href = '/admin';
            } else if (data.role === 'teacher') {
                enterDashboard(data.id, data.id);
            }
        } catch (error) {
            // No session yet — stay on the login screen.
        }
    })();

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

    // Curriculum proposal: when Class + Subject (+ Date) are picked, check the
    // active admin curriculum for that month. It's always a suggestion the
    // teacher can accept (Use) or ignore (Skip) — never forced.
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let lessonCurriculumEntry = null;
    const lessonBanner = document.getElementById('lesson-curriculum-banner');
    const lessonBannerDetail = document.getElementById('lesson-curriculum-banner-detail');

    async function tryLoadCurriculumForLessonPlanner() {
        const classLevel = document.getElementById('lesson-class').value;
        const subject = document.getElementById('lesson-subject').value;
        const dateValue = document.getElementById('lesson-date').value;

        lessonBanner.classList.add('hidden');
        lessonCurriculumEntry = null;
        if (!classLevel || !subject) return;

        const month = dateValue ? monthNames[new Date(dateValue).getMonth()] : '';

        try {
            const params = new URLSearchParams({ classLevel, subject, month });
            const response = await fetch(`/api/curriculum/lookup?${params.toString()}`);
            if (!response.ok) return;
            const result = await response.json();

            if (result.found && (result.entry.theme || (result.entry.topics || []).length > 0)) {
                lessonCurriculumEntry = result.entry;
                const topicSummary = (result.entry.topics || []).join(', ');
                lessonBannerDetail.textContent = `Today's suggested focus — Theme: ${result.entry.theme || 'N/A'}${topicSummary ? `, Topic: ${topicSummary}` : ''}`;
                lessonBanner.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Curriculum lookup failed:', error);
        }
    }

    ['lesson-class', 'lesson-subject', 'lesson-date'].forEach(id => {
        document.getElementById(id).addEventListener('change', tryLoadCurriculumForLessonPlanner);
    });

    document.getElementById('btn-use-curriculum').addEventListener('click', () => {
        if (!lessonCurriculumEntry) return;
        document.getElementById('lesson-theme').value = lessonCurriculumEntry.theme || '';
        const topics = lessonCurriculumEntry.topics || [];
        document.getElementById('lesson-topic').value = topics[0] || '';
        document.getElementById('lesson-subtopic').value = topics.slice(1).join(', ');
        lessonBanner.classList.add('hidden');
    });

    document.getElementById('btn-skip-curriculum').addEventListener('click', () => {
        lessonBanner.classList.add('hidden');
    });

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

        window.loadHistory();

        displayResult('lesson-preview', finalMarkdown, 'Lesson Plan');
    });

    // Update exam button label when nursery class is selected
    document.getElementById('exam-class').addEventListener('change', function () {
        const btn = document.getElementById('btn-generate-exam');
        const isNursery = this.value.toLowerCase().includes('nursery');
        btn.innerHTML = isNursery
            ? '<i class="ph ph-paint-brush"></i> Generate Activity Sheet'
            : '<i class="ph ph-brain"></i> Generate Bloom\'s Exam';
    });

    // Exam Generation Flow
    const examForm = document.getElementById('exam-form');
    examForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const checkedTypes       = Array.from(document.querySelectorAll('input[name="qtype"]:checked')).map(cb => cb.value);
        const checkedEnhancements = Array.from(document.querySelectorAll('input[name="enhancement"]:checked')).map(cb => cb.value);
        const hasDiagramsEnabled = checkedEnhancements.includes('Include Diagrams');

        const input = {
            subject:      document.getElementById('exam-subject').value,
            class:        document.getElementById('exam-class').value,
            topic:        document.getElementById('exam-topic').value,
            number:       document.getElementById('exam-number').value,
            qtypes:       checkedTypes,
            enhancements: checkedEnhancements,
            custom:       document.getElementById('exam-custom').value
        };

        if (checkedTypes.length === 0) {
            alert("Please select at least one question type.");
            return;
        }

        await simulateAILoading('exam');
        let markdownOutput = await NexicapsAI.generateExam(input);

        // Replace [DIAGRAM: description] markers with real generated images
        if (hasDiagramsEnabled && markdownOutput) {
            markdownOutput = await injectDiagramImages(markdownOutput);
        }

        const imagePrompt = `Cameroon Primary School ${input.class} ${input.subject} exam test on ${input.topic} illustration clean flat vector layout style educational`;
        const imageUrl = await NexicapsAI.generateImage(imagePrompt);

        let finalMarkdown = markdownOutput;
        if (imageUrl) {
            finalMarkdown = `![Exam Representation](${imageUrl})\n\n` + finalMarkdown;
        }

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

            window.loadHistory();

            displayResult('report-preview', finalMarkdown, 'Report_Card');
        });
    }

    // Submit to Admin Flow — a teacher can submit an exam (for the admin to
    // download and verify) or a student comment, sharing one form whose
    // fields relabel based on the selected type.
    const submissionForm = document.getElementById('submission-form');
    if (submissionForm) {
        let submissionType = 'exam';
        const btnExamType = document.getElementById('btn-submission-type-exam');
        const btnCommentType = document.getElementById('btn-submission-type-comment');
        const titleLabel = document.getElementById('submission-title-label');
        const titleInput = document.getElementById('submission-title');
        const studentGroup = document.getElementById('submission-student-group');
        const studentInput = document.getElementById('submission-student');
        const fileLabel = document.getElementById('submission-file-label');
        const fileInput = document.getElementById('submission-file');
        const fileHint = document.getElementById('submission-file-hint');
        const contentLabel = document.getElementById('submission-content-label');
        const contentInput = document.getElementById('submission-content');

        function setSubmissionType(type) {
            submissionType = type;
            const isExam = type === 'exam';

            btnExamType.className = isExam ? 'btn btn-primary' : 'btn btn-secondary glass-btn';
            btnCommentType.className = isExam ? 'btn btn-secondary glass-btn' : 'btn btn-primary';

            titleLabel.innerText = isExam ? 'Exam Title / Topic' : 'Comment Title';
            titleInput.placeholder = isExam
                ? 'e.g., Second Term Mathematics Exam — Fractions'
                : 'e.g., End of Term Comment — John Doe';

            studentGroup.classList.toggle('hidden', isExam);

            fileLabel.innerText = isExam
                ? 'Upload Exam Document (.doc, .docx, or .pdf)'
                : 'Upload Comments Document (.doc, .docx, or .pdf)';
            fileHint.innerText = isExam
                ? 'Upload the exam exactly as you typed it in Word — the admin downloads and opens the original file.'
                : 'Upload your student comments exactly as you typed them in Word — one file can cover a whole class.';

            contentLabel.innerText = 'Additional Notes (optional)';
            contentInput.rows = 3;
            contentInput.required = false;
            contentInput.placeholder = 'Anything the admin should know about this file (optional).';
        }

        btnExamType.addEventListener('click', () => setSubmissionType('exam'));
        btnCommentType.addEventListener('click', () => setSubmissionType('comment'));
        setSubmissionType('exam');

        submissionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = document.getElementById('submission-error');
            const successEl = document.getElementById('submission-success');
            errorEl.classList.add('hidden');
            successEl.classList.add('hidden');

            if (!fileInput.files.length) {
                errorEl.textContent = 'Please attach the document.';
                errorEl.classList.remove('hidden');
                return;
            }

            const formData = new FormData();
            formData.append('type', submissionType);
            formData.append('title', titleInput.value.trim());
            formData.append('subject', document.getElementById('submission-subject').value);
            formData.append('classLevel', document.getElementById('submission-class').value);
            formData.append('content', contentInput.value.trim());
            formData.append('file', fileInput.files[0]);
            if (submissionType === 'comment') {
                formData.append('studentName', studentInput.value.trim());
            }

            const btn = document.getElementById('btn-submit-work');
            btn.disabled = true;

            try {
                const response = await fetch('/api/submissions', { method: 'POST', body: formData });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to submit.');

                successEl.textContent = 'Submitted for admin review.';
                successEl.classList.remove('hidden');
                submissionForm.reset();
                setSubmissionType(submissionType);
                window.loadSubmissions();
            } catch (error) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
            }
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

            const imageUrl = await NexicapsAI.generateImage(promptInput, true);
            window.loadHistory();

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

    // Monthly Lesson Plan Flow
    const monthlyLessonForm = document.getElementById('monthly-lesson-form');
    if (monthlyLessonForm) {
        // Auto-set current month/year
        const now = new Date();
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        document.getElementById('ml-month').value = months[now.getMonth()];
        document.getElementById('ml-year').value = now.getFullYear();

        // Whenever Class/Subject/Term/Month are all chosen, pull the matching
        // entry from the admin-managed curriculum and pre-fill theme/topics.
        // Falls back silently to manual entry if nothing matches.
        let mlCurriculumSourced = false;
        const mlStatusEl = document.getElementById('ml-curriculum-status');
        const mlThemeInput = document.getElementById('ml-theme');
        const mlTopicsInput = document.getElementById('ml-topics');

        async function tryLoadCurriculumForMonthlyPlan() {
            const classLevel = document.getElementById('ml-class').value;
            const subject = document.getElementById('ml-subject').value;
            const term = document.getElementById('ml-term').value;
            const month = document.getElementById('ml-month').value;

            mlStatusEl.classList.add('hidden');
            if (!classLevel || !subject) return;

            try {
                const params = new URLSearchParams({ classLevel, subject, term, month });
                const response = await fetch(`/api/curriculum/lookup?${params.toString()}`);
                if (!response.ok) return;
                const result = await response.json();

                if (result.found) {
                    mlThemeInput.value = result.entry.theme || '';
                    mlTopicsInput.value = (result.entry.topics || []).join('\n');
                    mlCurriculumSourced = true;
                    mlStatusEl.textContent = 'Loaded from the school curriculum for this class, subject, and month — still editable below.';
                    mlStatusEl.classList.remove('hidden');
                } else {
                    mlCurriculumSourced = false;
                }
            } catch (error) {
                console.error('Curriculum lookup failed:', error);
            }
        }

        ['ml-class', 'ml-subject', 'ml-term', 'ml-month'].forEach(id => {
            document.getElementById(id).addEventListener('change', tryLoadCurriculumForMonthlyPlan);
        });

        // Manual edits after an autofill mean the teacher has taken over —
        // stop telling the AI this is authoritative curriculum scope.
        [mlThemeInput, mlTopicsInput].forEach(el => {
            el.addEventListener('input', () => { mlCurriculumSourced = false; });
        });

        monthlyLessonForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const input = {
                subject:        document.getElementById('ml-subject').value,
                class:          document.getElementById('ml-class').value,
                term:           document.getElementById('ml-term').value,
                month:          document.getElementById('ml-month').value,
                year:           document.getElementById('ml-year').value,
                weeks:          document.getElementById('ml-weeks').value,
                lessonsPerWeek: document.getElementById('ml-lessons-per-week').value,
                theme:          document.getElementById('ml-theme').value,
                topics:         document.getElementById('ml-topics').value,
                custom:         document.getElementById('ml-custom').value,
                curriculumSourced: mlCurriculumSourced
            };

            await simulateAILoading('monthly');
            const markdownOutput = await NexicapsAI.generateMonthlyLesson(input);

            const imagePrompt = `Cameroon school ${input.class} ${input.subject} monthly lesson plan calendar clean flat vector educational illustration`;
            const imageUrl = await NexicapsAI.generateImage(imagePrompt);

            let finalMarkdown = markdownOutput;
            if (imageUrl) {
                finalMarkdown = `![Monthly Plan](${imageUrl})\n\n` + finalMarkdown;
            }

            window.loadHistory();

            displayResult('monthly-lesson-preview', finalMarkdown, 'Monthly_Lesson_Plan');
        });
    }

    // Diagram Generator Flow
    const diagramForm = document.getElementById('diagram-form');
    if (diagramForm) {
        diagramForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const input = {
                topic:   document.getElementById('diagram-topic').value,
                dtype:   document.getElementById('diagram-type').value,
                subject: document.getElementById('diagram-subject').value,
                class:   document.getElementById('diagram-class').value,
                custom:  document.getElementById('diagram-custom').value
            };

            const preview = document.getElementById('diagram-preview');
            preview.innerHTML = '<div class="loader-spinner" style="margin: 3rem auto;"></div><p style="text-align:center; color: var(--clr-text-muted);">Generating diagram...</p>';

            const mermaidCode = await NexicapsAI.generateDiagram(input);

            if (!mermaidCode) {
                preview.innerHTML = '<p style="color:var(--clr-accent); padding:2rem;">Failed to generate diagram. Please try again.</p>';
                return;
            }

            // Render with Mermaid.js
            const diagramId = 'mermaid-svg-' + Date.now();
            preview.innerHTML = `
                <div id="${diagramId}" style="background: white; padding: 2rem; border-radius: var(--border-radius-sm); min-height: 200px; overflow: auto;"></div>
                <div style="margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--clr-border);">
                    <button class="btn btn-primary" onclick="downloadDiagramSVG('${diagramId}', '${input.topic}')"><i class="ph ph-download-simple"></i> Download SVG</button>
                    <button class="btn btn-primary" onclick="downloadDiagramPDF('${diagramId}', '${input.topic}')"><i class="ph ph-file-pdf"></i> Download PDF</button>
                    <button class="btn btn-secondary glass-btn" onclick="showMermaidCode('${diagramId}')"><i class="ph ph-code"></i> View Code</button>
                </div>`;

            try {
                const { svg } = await mermaid.render(diagramId + '-render', mermaidCode);
                document.getElementById(diagramId).innerHTML = svg;
                // Store raw code for later
                document.getElementById(diagramId).dataset.mermaid = mermaidCode;
            } catch (err) {
                console.error('Mermaid render error:', err);
                document.getElementById(diagramId).innerHTML = `<pre style="white-space:pre-wrap; font-size:0.85rem; color: var(--clr-text);">${mermaidCode}</pre><p style="color:var(--clr-text-muted); margin-top:1rem; font-size:0.85rem;">⚠ Could not render as diagram. The raw code is shown above.</p>`;
            }

            window.loadHistory();
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
        'submissions-view': 'Submit to Admin',
        'lesson-planner': 'Lesson Planner',
        'monthly-lesson-planner': 'Monthly Lesson Planner',
        'exam-generator': 'Exam Generator',
        'worksheet-generator': 'Class Worksheets',
        'report-card-generator': 'Report Cards',
        'syllabus-ingestion': 'Syllabus Parser',
        'image-generator': 'Image Generation Studio',
        'diagram-generator': 'Diagram Generator',
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
    } else if (type === 'monthly') {
        loadingText.innerText = "Building your full monthly lesson schedule week by week...";
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
            '<button class="btn btn-primary" onclick="downloadWord(\'pdf-content-' + containerId + '\', \'' + (typeLabel || 'Document') + '\')"><i class="ph ph-file-doc"></i> Download Word</button>' +
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

/**
 * Finds every [DIAGRAM: description] marker in a markdown string,
 * calls Pollinations AI for each, and replaces the marker with a real image.
 */
async function injectDiagramImages(markdown) {
    const markerRegex = /\[DIAGRAM:\s*([^\]]+)\]/gi;
    const matches = [...markdown.matchAll(markerRegex)];
    if (!matches.length) return markdown;

    let result = markdown;
    for (const match of matches) {
        const fullMarker  = match[0];
        const description = match[1].trim();
        const prompt = `educational school diagram illustration: ${description}, clean labelled vector style, white background, black ink, suitable for primary school textbook`;
        const url = await NexicapsAI.generateImage(prompt);
        const replacement = url
            ? `\n![${description}](${url})\n*Fig: ${description}*\n`
            : `\n> *(Diagram: ${description})*\n`;
        result = result.replace(fullMarker, replacement);
    }
    return result;
}

window.downloadDiagramSVG = function (containerId, title) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NEVIKAPS_Diagram_' + (title || 'diagram').replace(/\s+/g, '_') + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.downloadDiagramPDF = function (containerId, title) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const opt = {
        margin: 0.5,
        filename: 'NEVIKAPS_Diagram_' + (title || 'diagram').replace(/\s+/g, '_') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(container).save();
};

window.showMermaidCode = function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const code = container.dataset.mermaid || '';
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:2rem;';
    modal.innerHTML = `
        <div style="background:var(--clr-surface);border-radius:var(--border-radius);padding:2rem;max-width:700px;width:100%;max-height:80vh;overflow:auto;position:relative;">
            <h3 style="margin-bottom:1rem;">Mermaid Source Code</h3>
            <pre style="background:rgba(0,0,0,0.08);padding:1.5rem;border-radius:8px;white-space:pre-wrap;font-size:0.85rem;overflow:auto;">${code}</pre>
            <div style="margin-top:1.5rem;display:flex;gap:1rem;">
                <button class="btn btn-secondary glass-btn" onclick="navigator.clipboard.writeText(\`${code.replace(/`/g, '\\`')}\`);this.innerHTML='<i class=\\'ph ph-check\\'></i> Copied!'">
                    <i class="ph ph-copy"></i> Copy Code
                </button>
                <button class="btn btn-secondary glass-btn" onclick="this.closest('div[style]').remove()">
                    <i class="ph ph-x"></i> Close
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};

// Subject dropdowns across every generator are populated from the admin's
// subject list, scoped to what this teacher is assigned to teach.
function populateSubjectSelect(select, subjects, includeAnyOption) {
    if (!select) return;
    const previousValue = select.value;
    let html = includeAnyOption ? '<option value="">Any Subject</option>' : '<option value="">Select Subject</option>';

    let lastLevel = null;
    subjects.forEach(s => {
        if (s.level !== lastLevel) {
            if (lastLevel !== null) html += '</optgroup>';
            html += `<optgroup label="— ${s.level} —">`;
            lastLevel = s.level;
        }
        html += `<option value="${s.name}">${s.name}</option>`;
    });
    if (lastLevel !== null) html += '</optgroup>';

    select.innerHTML = html;

    const stillValid = Array.from(select.options).some(o => o.value === previousValue);
    select.value = stillValid ? previousValue : (subjects[0] ? subjects[0].name : '');
}

window.loadAssignedSubjects = async function () {
    try {
        const response = await fetch('/api/subjects');
        if (!response.ok) return;
        const result = await response.json();

        // A teacher with no assignments yet still needs a working dropdown —
        // fall back to the full list rather than locking them out.
        const scoped = result.assignedSubjectIds && result.assignedSubjectIds.length > 0
            ? result.data.filter(s => result.assignedSubjectIds.includes(s.id))
            : result.data;

        ['lesson-subject', 'ml-subject', 'exam-subject', 'worksheet-subject'].forEach(id => {
            populateSubjectSelect(document.getElementById(id), scoped, false);
        });
        populateSubjectSelect(document.getElementById('diagram-subject'), scoped, true);
        populateSubjectSelect(document.getElementById('submission-subject'), scoped, true);
    } catch (error) {
        console.error('Failed to load assigned subjects:', error);
    }
};

// In-memory cache of the teacher's own history, loaded from the server —
// generated content is persisted server-side now, not in localStorage.
let historyCache = [];

window.loadHistory = async function () {
    const container = document.getElementById('history-container');
    if (!container) return;

    try {
        const response = await fetch('/api/content');
        if (!response.ok) throw new Error('Failed to load history');
        const data = await response.json();
        historyCache = data.data || [];
    } catch (error) {
        console.error('Failed to load history:', error);
        container.innerHTML = '<div class="empty-state"><div class="pulse-icon"><i class="ph ph-warning"></i></div><h3>Could not load your history</h3><p>Please check your connection and try again.</p></div>';
        return;
    }

    if (historyCache.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="pulse-icon"><i class="ph ph-file-dashed"></i></div><h3>Nothing here yet</h3><p>Everything you generate will be saved here automatically.</p><button class="btn btn-primary" onclick="navigateTo(\'lesson-planner\')" style="margin-top:1rem;"><i class="ph ph-magic-wand"></i> Generate a Lesson Plan</button></div>';
    } else {
        container.innerHTML = historyCache.map((item) => {
            const meta = [item.classLevel, item.subject].filter(Boolean).join(' | ') || item.subject || '';
            const dateLabel = new Date(item.createdAt).toLocaleDateString();
            return '<div class="history-item glass-panel" style="margin-bottom:1rem; padding: 1.5rem; cursor: pointer; border" onclick="viewHistoryItem(\'' + item.id + '\')">' +
                '<div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">' +
                '<span style="font-size:0.85rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">' + item.type + '</span>' +
                '<span style="font-size:0.85rem; color:var(--clr-text-muted);">' + dateLabel + '</span>' +
                '</div>' +
                '<h4 style="margin-bottom:0.5rem; font-size:1.1rem; color: var(--clr-text);">' + item.title + '</h4>' +
                '<p style="font-size:0.9rem; color:var(--clr-text-muted);">' + meta + '</p>' +
                '</div>';
        }).join('');
    }

    // Update Dashboard Stats
    const statsLesson = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (statsLesson) statsLesson.innerText = historyCache.filter(h => h.type === 'Lesson Plan').length;

    const statsExam = document.querySelector('.stat-card:nth-child(2) .stat-value');
    if (statsExam) statsExam.innerText = historyCache.filter(h => h.type === 'Examination').length;
};

// Submissions the teacher has sent to the admin for review (exams + student
// comments). Loaded on login and refreshed after every submit/withdraw.
let submissionsCache = [];

const statusPillHtml = {
    pending: '<span class="pill pill-warning"><i class="ph ph-clock"></i> Pending</span>',
    approved: '<span class="pill pill-success"><i class="ph ph-check"></i> Approved</span>',
    rejected: '<span class="pill pill-danger"><i class="ph ph-x"></i> Rejected</span>'
};

window.loadSubmissions = async function () {
    const container = document.getElementById('submissions-container');
    if (!container) return;

    try {
        const response = await fetch('/api/submissions');
        if (!response.ok) throw new Error('Failed to load submissions');
        const data = await response.json();
        submissionsCache = data.data || [];
    } catch (error) {
        console.error('Failed to load submissions:', error);
        container.innerHTML = '<div class="empty-state"><div class="pulse-icon"><i class="ph ph-warning"></i></div><h3>Could not load your submissions</h3><p>Please check your connection and try again.</p></div>';
        return;
    }

    if (submissionsCache.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="pulse-icon"><i class="ph ph-paper-plane-tilt"></i></div><h3>Nothing submitted yet</h3><p>Exams and student comments you submit for admin review will show up here with their status.</p></div>';
        return;
    }

    container.innerHTML = submissionsCache.map((item) => {
        const meta = [item.classLevel, item.subject, item.studentName].filter(Boolean).join(' | ');
        const dateLabel = new Date(item.createdAt).toLocaleDateString();
        const fileLine = item.fileName
            ? '<p style="font-size:0.85rem; color:var(--clr-text-muted); margin-top:0.4rem;"><i class="ph ph-file-doc"></i> ' + escapeHtmlApp(item.fileName) + '</p>'
            : '';
        const feedback = item.adminFeedback
            ? '<p style="font-size:0.85rem; color:var(--clr-text-muted); margin-top:0.5rem;"><strong>Admin feedback:</strong> ' + escapeHtmlApp(item.adminFeedback) + '</p>'
            : '';
        const withdrawBtn = item.status === 'pending'
            ? '<button class="btn btn-secondary glass-btn" style="margin-top:0.75rem;" onclick="withdrawSubmission(\'' + item.id + '\')"><i class="ph ph-x"></i> Withdraw</button>'
            : '';
        return '<div class="history-item glass-panel" style="margin-bottom:1rem; padding: 1.5rem; border">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; gap:0.5rem; flex-wrap:wrap;">' +
            '<span style="font-size:0.85rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">' + (item.type === 'exam' ? 'Exam' : 'Student Comment') + '</span>' +
            (statusPillHtml[item.status] || '') +
            '</div>' +
            '<h4 style="margin-bottom:0.5rem; font-size:1.1rem; color: var(--clr-text);">' + escapeHtmlApp(item.title) + '</h4>' +
            '<p style="font-size:0.9rem; color:var(--clr-text-muted);">' + escapeHtmlApp(meta) + ' — ' + dateLabel + '</p>' +
            fileLine + feedback + withdrawBtn +
            '</div>';
    }).join('');
};

function escapeHtmlApp(str) {
    const div = document.createElement('div');
    div.innerText = str == null ? '' : str;
    return div.innerHTML;
}

window.withdrawSubmission = async function (id) {
    if (!confirm('Withdraw this submission?')) return;
    try {
        const response = await fetch('/api/submissions/' + id, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to withdraw submission');
        window.loadSubmissions();
    } catch (error) {
        console.error('Withdraw submission error:', error);
        alert('Could not withdraw submission. Please try again.');
    }
};

window.viewHistoryItem = function (id) {
    const item = historyCache.find(h => h.id === id);
    if (item) {
        navigateTo('lesson-planner');
        const container = document.getElementById('lesson-preview');

        if (item.type === 'Diagram' && item.content && item.content.mermaid) {
            const diagramId = 'mermaid-hist-' + Date.now();
            container.innerHTML = `<div id="${diagramId}" style="background: white; padding: 2rem; border-radius: var(--border-radius-sm); min-height: 200px; overflow: auto;"></div>`;
            if (typeof mermaid !== 'undefined') {
                mermaid.render(diagramId + '-render', item.content.mermaid).then(({ svg }) => {
                    document.getElementById(diagramId).innerHTML = svg;
                }).catch(() => {
                    document.getElementById(diagramId).innerHTML = `<pre style="white-space:pre-wrap;">${item.content.mermaid}</pre>`;
                });
            }
            return;
        }

        if (item.type === 'Image' && item.content && item.content.url) {
            container.innerHTML = `<img src="${item.content.url}" style="max-width:100%; border-radius: var(--border-radius-sm);" alt="${item.title}"><div style="margin-top:1.5rem;"><button class="btn btn-primary" onclick="window.open('${item.content.url}', '_blank')"><i class="ph ph-download-simple"></i> Open Full Size</button></div>`;
            return;
        }

        const markdown = (item.content && item.content.markdown) || '';
        const safeHtml = typeof marked !== 'undefined' ? marked.parse(markdown) : markdown;

        container.innerHTML = '<div class="markdown-content" id="pdf-content-hist">' + safeHtml + '</div>' +
            '<div style="margin-top: 2rem; display: flex; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--clr-border);">' +
            '<button class="btn btn-primary" onclick="downloadPDF(\'pdf-content-hist\', \'' + item.type + '\')"><i class="ph ph-download-simple"></i> Download PDF</button>' +
            '<button class="btn btn-secondary glass-btn" onclick="copyToClipboard(this)"><i class="ph ph-copy"></i> Copy Text</button>' +
            '</div>';
    }
};
