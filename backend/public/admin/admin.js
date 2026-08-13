/**
 * NEVIKAPS Admin Panel logic.
 * All data comes from /api/admin/* endpoints, which require an authenticated
 * admin session cookie — enforced server-side by requireAdmin middleware.
 */

const AdminState = {
    page: 1,
    pageSize: 10,
    search: '',
    total: 0
};

const ContentState = {
    page: 1,
    pageSize: 10,
    teacherId: '',
    type: '',
    total: 0
};

let teacherOptionsCache = [];
let curriculaCache = [];
let subjectsCache = [];
let activeEntryCurriculumId = null;
let editingEntryId = null;
let editingTeacherId = null;

function showMsg(el, message) {
    el.textContent = message;
    el.classList.remove('hidden');
}
function hideMsg(el) {
    el.classList.add('hidden');
    el.textContent = '';
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options
    });
    if (response.status === 401 || response.status === 403) {
        // Logged here (not just redirected) so if a session ever drops
        // unexpectedly, DevTools shows exactly which request caused it.
        console.error(`Session rejected (${response.status}) by ${url} — redirecting to login.`);
        window.location.href = '/';
        throw new Error('Not authorized');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }
    return data;
}

// Like apiRequest, but for multipart/form-data uploads — no Content-Type
// header so the browser sets the correct multipart boundary itself.
async function apiRequestForm(url, formData, method = 'POST') {
    const response = await fetch(url, { method, body: formData, credentials: 'same-origin' });
    if (response.status === 401 || response.status === 403) {
        console.error(`Session rejected (${response.status}) by ${url} — redirecting to login.`);
        window.location.href = '/';
        throw new Error('Not authorized');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }
    return data;
}

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleDateString();
    } catch (e) {
        return iso;
    }
}

function formatRelativeTime(iso) {
    if (!iso) return 'Never';
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour;

    if (diffMs < minute) return 'Just now';
    if (diffMs < hour) return `${Math.floor(diffMs / minute)} min ago`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)} hour${Math.floor(diffMs / hour) === 1 ? '' : 's'} ago`;
    if (diffMs < 2 * day) return 'Yesterday';
    if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;
    return new Date(iso).toLocaleDateString();
}

function switchSection(targetId) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navMatch = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (navMatch) navMatch.classList.add('active');

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active-section'));
    document.getElementById(targetId).classList.add('active-section');
}

async function loadStats() {
    try {
        const stats = await apiRequest('/api/admin/stats');
        document.getElementById('stat-total').innerText = stats.total;
        document.getElementById('stat-active').innerText = stats.active;
        document.getElementById('stat-inactive').innerText = stats.inactive;
        document.getElementById('stat-new').innerText = stats.newThisMonth;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadTeachers() {
    const tbody = document.getElementById('teachers-tbody');
    const errorEl = document.getElementById('teachers-error');
    hideMsg(errorEl);

    try {
        const params = new URLSearchParams({
            page: AdminState.page,
            pageSize: AdminState.pageSize,
            search: AdminState.search
        });
        const result = await apiRequest(`/api/admin/teachers?${params.toString()}`);
        AdminState.total = result.total;

        teacherOptionsCache = result.data;
        refreshTeacherFilterOptions();

        if (result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--clr-text-muted); padding:2rem;">No teachers found.</td></tr>';
        } else {
            tbody.innerHTML = result.data.map(t => `
                <tr>
                    <td>${escapeHtml(t.fullName)}</td>
                    <td>${escapeHtml(t.teacherId)}</td>
                    <td>${t.isActive
                        ? '<span class="pill pill-success"><i class="ph ph-check"></i> Active</span>'
                        : '<span class="pill pill-danger"><i class="ph ph-x"></i> Inactive</span>'}</td>
                    <td>${formatRelativeTime(t.lastSeenAt)}</td>
                    <td>${formatDate(t.createdAt)}</td>
                    <td class="table-actions">
                        <button class="btn btn-primary" data-action="edit" data-id="${t.id}">Edit</button>
                        <button class="btn ${t.isActive ? 'btn-danger' : 'btn-success'}" data-action="toggle" data-id="${t.id}" data-active="${t.isActive}">
                            ${t.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button class="btn btn-secondary" data-action="reset" data-id="${t.id}" data-name="${escapeHtml(t.fullName)}">Reset Password</button>
                        <button class="btn btn-secondary" data-action="view" data-id="${t.id}" data-name="${escapeHtml(t.fullName)}">View Work</button>
                        <button class="btn btn-danger" data-action="delete" data-id="${t.id}" data-name="${escapeHtml(t.fullName)}">Delete</button>
                    </td>
                </tr>
            `).join('');
        }

        const totalPages = Math.max(Math.ceil(AdminState.total / AdminState.pageSize), 1);
        document.getElementById('pagination-info').innerText = `Page ${AdminState.page} of ${totalPages} (${AdminState.total} teachers)`;
        document.getElementById('prev-page-btn').disabled = AdminState.page <= 1;
        document.getElementById('next-page-btn').disabled = AdminState.page >= totalPages;
    } catch (error) {
        showMsg(errorEl, error.message);
        tbody.innerHTML = '';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str == null ? '' : str;
    return div.innerHTML;
}

async function ensureSubjectsLoaded() {
    if (subjectsCache.length > 0) return subjectsCache;
    try {
        const result = await apiRequest('/api/admin/subjects');
        subjectsCache = result.data;
    } catch (error) {
        console.error('Failed to load subjects:', error);
    }
    return subjectsCache;
}

function renderSubjectChecklist(containerId, subjects, checkedIds) {
    const container = document.getElementById(containerId);
    const checked = new Set(checkedIds || []);
    let lastLevel = null;
    let html = '';

    subjects.forEach(s => {
        if (s.level !== lastLevel) {
            html += `<div class="subject-group-label">${escapeHtml(s.level)}</div>`;
            lastLevel = s.level;
        }
        html += `<label><input type="checkbox" value="${s.id}" ${checked.has(s.id) ? 'checked' : ''}> ${escapeHtml(s.name)}</label>`;
    });

    container.innerHTML = html || '<p style="color:var(--clr-text-muted); font-size:0.85rem;">No subjects yet — add some from Settings.</p>';
}

function getCheckedSubjectIds(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)).map(cb => cb.value);
}

// Row action handling (event delegation)
document.getElementById('teachers-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const { action, id, active, name } = btn.dataset;

    try {
        if (action === 'toggle') {
            await apiRequest(`/api/admin/teachers/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: active !== 'true' })
            });
            await Promise.all([loadTeachers(), loadStats()]);
        } else if (action === 'reset') {
            if (!confirm(`Reset the password for ${name}?`)) return;
            const result = await apiRequest(`/api/admin/teachers/${id}/reset-password`, { method: 'POST' });
            alert(`New temporary password for ${name}:\n\n${result.tempPassword}\n\nThey will be asked to set their own password on next login.`);
        } else if (action === 'delete') {
            if (!confirm(`Delete ${name}'s account permanently? This cannot be undone.`)) return;
            await apiRequest(`/api/admin/teachers/${id}`, { method: 'DELETE' });
            await Promise.all([loadTeachers(), loadStats()]);
        } else if (action === 'view') {
            switchSection('admin-content');
            ContentState.teacherId = id;
            ContentState.page = 1;
            const filterSelect = document.getElementById('content-teacher-filter');
            refreshTeacherFilterOptions();
            filterSelect.value = id;
            document.getElementById('content-view-title').innerText = `Teacher Content — ${name}`;
            loadContent();
        } else if (action === 'edit') {
            await openEditTeacherModal(id);
        }
    } catch (error) {
        alert(error.message);
    }
});

// Search
let searchDebounce;
document.getElementById('admin-search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        AdminState.search = e.target.value.trim();
        AdminState.page = 1;
        loadTeachers();
    }, 300);
});

// Pagination
document.getElementById('prev-page-btn').addEventListener('click', () => {
    if (AdminState.page > 1) {
        AdminState.page -= 1;
        loadTeachers();
    }
});
document.getElementById('next-page-btn').addEventListener('click', () => {
    const totalPages = Math.max(Math.ceil(AdminState.total / AdminState.pageSize), 1);
    if (AdminState.page < totalPages) {
        AdminState.page += 1;
        loadTeachers();
    }
});

// Add Teacher
document.getElementById('add-teacher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-teacher-error');
    const successEl = document.getElementById('add-teacher-success');
    hideMsg(errorEl);
    hideMsg(successEl);
    document.getElementById('new-credential-box').classList.add('hidden');

    const fullName = document.getElementById('new-teacher-name').value.trim();
    const teacherId = document.getElementById('new-teacher-id').value.trim();
    const password = document.getElementById('new-teacher-password').value;
    const subjectIds = getCheckedSubjectIds('add-teacher-subjects');

    const btn = document.getElementById('btn-add-teacher');
    btn.disabled = true;

    try {
        const teacher = await apiRequest('/api/admin/teachers', {
            method: 'POST',
            body: JSON.stringify({ fullName, teacherId: teacherId || undefined, password, subjectIds })
        });

        showMsg(successEl, `Teacher account created for ${teacher.fullName}.`);
        document.getElementById('new-credential-box').classList.remove('hidden');
        document.getElementById('new-credential-text').innerText = `Teacher ID: ${teacher.teacherId}  |  Password: ${password}`;

        document.getElementById('add-teacher-form').reset();
        await Promise.all([loadTeachers(), loadStats()]);
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
    }
});

// ===================== Edit Teacher modal =====================

async function openEditTeacherModal(teacherId) {
    editingTeacherId = teacherId;
    const errorEl = document.getElementById('edit-teacher-error');
    const successEl = document.getElementById('edit-teacher-success');
    hideMsg(errorEl);
    hideMsg(successEl);

    document.getElementById('edit-teacher-modal').classList.remove('hidden');
    document.getElementById('edit-teacher-modal-title').innerText = 'Loading...';

    try {
        const [creds, subjects] = await Promise.all([
            apiRequest(`/api/admin/teachers/${teacherId}/credentials`),
            ensureSubjectsLoaded()
        ]);

        document.getElementById('edit-teacher-modal-title').innerText = `Edit — ${creds.fullName}`;
        document.getElementById('edit-teacher-name').value = creds.fullName;
        document.getElementById('edit-teacher-id').value = creds.teacherId;
        document.getElementById('edit-teacher-password').value = creds.password || '';

        if (!creds.passwordRecoverable) {
            showMsg(errorEl, 'This account still uses an older credential format. Enter and save a new password below to upgrade it.');
        }

        renderSubjectChecklist('edit-teacher-subjects', subjects, creds.subjectIds);
    } catch (error) {
        document.getElementById('edit-teacher-modal-title').innerText = 'Edit Teacher';
        showMsg(errorEl, error.message);
    }
}

document.getElementById('edit-teacher-modal-close').addEventListener('click', () => {
    document.getElementById('edit-teacher-modal').classList.add('hidden');
});
document.getElementById('edit-teacher-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-teacher-modal') e.target.classList.add('hidden');
});

document.getElementById('edit-teacher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('edit-teacher-error');
    const successEl = document.getElementById('edit-teacher-success');
    hideMsg(errorEl);
    hideMsg(successEl);

    const payload = {
        fullName: document.getElementById('edit-teacher-name').value.trim(),
        teacherId: document.getElementById('edit-teacher-id').value.trim(),
        password: document.getElementById('edit-teacher-password').value,
        subjectIds: getCheckedSubjectIds('edit-teacher-subjects')
    };

    const btn = document.getElementById('btn-save-edit-teacher');
    btn.disabled = true;

    try {
        await apiRequest(`/api/admin/teachers/${editingTeacherId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        showMsg(successEl, 'Teacher updated.');
        await Promise.all([loadTeachers(), loadStats()]);
        setTimeout(() => document.getElementById('edit-teacher-modal').classList.add('hidden'), 700);
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
    }
});

// Admin settings — change own password
document.getElementById('admin-change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('admin-settings-error');
    const successEl = document.getElementById('admin-settings-success');
    hideMsg(errorEl);
    hideMsg(successEl);

    const newPassword = document.getElementById('admin-new-password').value;
    const confirmPassword = document.getElementById('admin-confirm-password').value;

    if (newPassword !== confirmPassword) {
        showMsg(errorEl, 'Passwords do not match.');
        return;
    }

    const btn = document.getElementById('btn-admin-change-password');
    btn.disabled = true;

    try {
        await apiRequest('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ newPassword })
        });
        showMsg(successEl, 'Password updated.');
        document.getElementById('admin-change-password-form').reset();
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
    }
});

// Navigation between sections
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.getAttribute('data-target');
        switchSection(target);
        if (target === 'admin-curriculum') loadCurricula();
        if (target === 'admin-settings') { loadAdmins(); loadSubjectsSettings(); }
    });
});

document.getElementById('btn-open-add-teacher').addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    switchSection('admin-add-teacher');
    const subjects = await ensureSubjectsLoaded();
    renderSubjectChecklist('add-teacher-subjects', subjects, []);
});

document.getElementById('btn-view-all-content').addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    ContentState.teacherId = '';
    ContentState.page = 1;
    document.getElementById('content-teacher-filter').value = '';
    document.getElementById('content-view-title').innerText = 'Teacher Content';
    switchSection('admin-content');
    loadContent();
});

// Logout
document.getElementById('admin-logout-btn').addEventListener('click', async () => {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
        console.error('Logout failed:', error);
    }
    window.location.href = '/';
});

// ===================== Teacher Content (read-only, all teachers) =====================

function refreshTeacherFilterOptions() {
    const select = document.getElementById('content-teacher-filter');
    const current = select.value;
    select.innerHTML = '<option value="">All Teachers</option>' +
        teacherOptionsCache.map(t => `<option value="${t.id}">${escapeHtml(t.fullName)} (${escapeHtml(t.teacherId)})</option>`).join('');
    select.value = current;
}

async function loadContent() {
    const tbody = document.getElementById('content-tbody');
    const errorEl = document.getElementById('content-error');
    hideMsg(errorEl);

    try {
        const params = new URLSearchParams({
            page: ContentState.page,
            pageSize: ContentState.pageSize
        });
        if (ContentState.teacherId) params.set('teacherId', ContentState.teacherId);
        if (ContentState.type) params.set('type', ContentState.type);

        const result = await apiRequest(`/api/admin/content?${params.toString()}`);
        ContentState.total = result.total;

        if (result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--clr-text-muted); padding:2rem;">No content found.</td></tr>';
        } else {
            tbody.innerHTML = result.data.map(item => `
                <tr style="cursor:pointer;" data-open-content="${item.id}">
                    <td>${item.teacher ? escapeHtml(item.teacher.fullName) + ' (' + escapeHtml(item.teacher.teacherId) + ')' : 'Unknown'}</td>
                    <td>${escapeHtml(item.type)}</td>
                    <td>${escapeHtml(item.title)}</td>
                    <td>${[item.classLevel, item.subject].filter(Boolean).map(escapeHtml).join(' | ')}</td>
                    <td>${formatDate(item.createdAt)}</td>
                    <td><button class="btn btn-secondary" data-open-content="${item.id}">Open</button></td>
                </tr>
            `).join('');
        }

        const totalPages = Math.max(Math.ceil(ContentState.total / ContentState.pageSize), 1);
        document.getElementById('content-pagination-info').innerText = `Page ${ContentState.page} of ${totalPages} (${ContentState.total} items)`;
        document.getElementById('content-prev-page-btn').disabled = ContentState.page <= 1;
        document.getElementById('content-next-page-btn').disabled = ContentState.page >= totalPages;
    } catch (error) {
        showMsg(errorEl, error.message);
        tbody.innerHTML = '';
    }
}

document.getElementById('content-teacher-filter').addEventListener('change', (e) => {
    ContentState.teacherId = e.target.value;
    ContentState.page = 1;
    loadContent();
});
document.getElementById('content-type-filter').addEventListener('change', (e) => {
    ContentState.type = e.target.value;
    ContentState.page = 1;
    loadContent();
});
document.getElementById('content-prev-page-btn').addEventListener('click', () => {
    if (ContentState.page > 1) { ContentState.page -= 1; loadContent(); }
});
document.getElementById('content-next-page-btn').addEventListener('click', () => {
    const totalPages = Math.max(Math.ceil(ContentState.total / ContentState.pageSize), 1);
    if (ContentState.page < totalPages) { ContentState.page += 1; loadContent(); }
});

document.getElementById('content-tbody').addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-content]');
    if (!trigger) return;
    openContentModal(trigger.getAttribute('data-open-content'));
});

async function openContentModal(id) {
    const modal = document.getElementById('content-view-modal');
    const titleEl = document.getElementById('content-view-modal-title');
    const bodyEl = document.getElementById('content-view-modal-body');

    modal.classList.remove('hidden');
    titleEl.innerText = 'Loading...';
    bodyEl.innerHTML = '<div class="loader-spinner" style="margin: 2rem auto;"></div>';

    try {
        const item = await apiRequest(`/api/admin/content/${id}`);
        titleEl.innerText = `${item.type} — ${item.title}`;

        const metaLine = item.teacher
            ? `<p style="color:var(--clr-text-muted); margin-bottom:1rem;">By ${escapeHtml(item.teacher.fullName)} (${escapeHtml(item.teacher.teacherId)}) — ${formatDate(item.createdAt)}</p>`
            : '';

        if (item.type === 'Diagram' && item.content && item.content.mermaid) {
            const diagramId = 'mermaid-admin-' + Date.now();
            bodyEl.innerHTML = metaLine + `<div id="${diagramId}" style="background:white; padding:1.5rem; border-radius:var(--border-radius-sm); overflow:auto;"></div>`;
            if (typeof mermaid !== 'undefined') {
                try {
                    const { svg } = await mermaid.render(diagramId + '-render', item.content.mermaid);
                    document.getElementById(diagramId).innerHTML = svg;
                } catch (renderError) {
                    document.getElementById(diagramId).innerHTML = `<pre style="white-space:pre-wrap;">${escapeHtml(item.content.mermaid)}</pre>`;
                }
            }
        } else if (item.type === 'Image' && item.content && item.content.url) {
            bodyEl.innerHTML = metaLine + `<img src="${item.content.url}" style="max-width:100%; border-radius:var(--border-radius-sm);" alt="${escapeHtml(item.title)}">`;
        } else {
            const markdown = (item.content && item.content.markdown) || '';
            const html = typeof marked !== 'undefined' ? marked.parse(markdown) : markdown;
            bodyEl.innerHTML = metaLine + `<div class="markdown-content">${html}</div>`;
        }
    } catch (error) {
        titleEl.innerText = 'Error';
        bodyEl.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
}

document.getElementById('content-view-modal-close').addEventListener('click', () => {
    document.getElementById('content-view-modal').classList.add('hidden');
});
document.getElementById('content-view-modal').addEventListener('click', (e) => {
    if (e.target.id === 'content-view-modal') e.target.classList.add('hidden');
});

// ===================== Curriculum management =====================

async function loadCurricula() {
    const tbody = document.getElementById('curricula-tbody');
    const errorEl = document.getElementById('curricula-error');
    hideMsg(errorEl);

    try {
        const result = await apiRequest('/api/admin/curriculum');
        curriculaCache = result.data;

        if (curriculaCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--clr-text-muted); padding:2rem;">No curriculum uploaded yet.</td></tr>';
        } else {
            tbody.innerHTML = curriculaCache.map(c => `
                <tr>
                    <td>${escapeHtml(c.schoolYear)}</td>
                    <td>${escapeHtml(c.title)}</td>
                    <td>${c.isActive
                        ? '<span class="pill pill-success"><i class="ph ph-check"></i> Active</span>'
                        : '<span class="pill pill-danger">Inactive</span>'}</td>
                    <td>${c.entryCount}</td>
                    <td>${formatDate(c.createdAt)}</td>
                    <td class="table-actions">
                        <button class="btn btn-secondary" data-curriculum-action="manage" data-id="${c.id}" data-title="${escapeHtml(c.title)}">Manage Entries</button>
                        ${!c.isActive ? `<button class="btn btn-primary" data-curriculum-action="activate" data-id="${c.id}">Set Active</button>` : ''}
                        <button class="btn btn-danger" data-curriculum-action="delete" data-id="${c.id}" data-title="${escapeHtml(c.title)}">Delete</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        showMsg(errorEl, error.message);
        tbody.innerHTML = '';
    }
}

document.getElementById('curricula-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-curriculum-action]');
    if (!btn) return;
    const { curriculumAction, id, title } = btn.dataset;

    try {
        if (curriculumAction === 'manage') {
            await openCurriculumEntries(id, title);
        } else if (curriculumAction === 'activate') {
            await apiRequest(`/api/admin/curriculum/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
            await loadCurricula();
        } else if (curriculumAction === 'delete') {
            if (!confirm(`Delete curriculum "${title}"? This removes all its entries too.`)) return;
            await apiRequest(`/api/admin/curriculum/${id}`, { method: 'DELETE' });
            if (activeEntryCurriculumId === id) {
                document.getElementById('curriculum-entries-panel').classList.add('hidden');
                activeEntryCurriculumId = null;
            }
            await loadCurricula();
        }
    } catch (error) {
        alert(error.message);
    }
});

async function openCurriculumEntries(curriculumId, title) {
    activeEntryCurriculumId = curriculumId;
    document.getElementById('curriculum-entries-panel').classList.remove('hidden');
    document.getElementById('curriculum-entries-title').innerText = `Entries — ${title}`;
    await loadCurriculumEntries();
    document.getElementById('curriculum-entries-panel').scrollIntoView({ behavior: 'smooth' });
}

async function loadCurriculumEntries() {
    const tbody = document.getElementById('curriculum-entries-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--clr-text-muted); padding:1.5rem;">Loading...</td></tr>';

    try {
        const detail = await apiRequest(`/api/admin/curriculum/${activeEntryCurriculumId}`);
        if (detail.entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--clr-text-muted); padding:1.5rem;">No entries yet.</td></tr>';
        } else {
            tbody.innerHTML = detail.entries.map(entry => `
                <tr>
                    <td>${escapeHtml(entry.classLevel)}</td>
                    <td>${escapeHtml(entry.subject)}</td>
                    <td>${escapeHtml(entry.term || '')}</td>
                    <td>${escapeHtml(entry.month || '')}</td>
                    <td>${escapeHtml(entry.theme || '')}</td>
                    <td>${escapeHtml((entry.topics || []).join(', '))}</td>
                    <td class="table-actions">
                        <button class="btn btn-secondary" data-entry-action="edit" data-id="${entry.id}">Edit</button>
                        <button class="btn btn-danger" data-entry-action="delete" data-id="${entry.id}">Delete</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="form-error" style="padding:1.5rem;">${escapeHtml(error.message)}</td></tr>`;
    }
}

document.getElementById('curriculum-entries-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-entry-action]');
    if (!btn) return;
    const { entryAction, id } = btn.dataset;

    if (entryAction === 'delete') {
        if (!confirm('Delete this curriculum entry?')) return;
        try {
            await apiRequest(`/api/admin/curriculum/entries/${id}`, { method: 'DELETE' });
            await loadCurriculumEntries();
        } catch (error) {
            alert(error.message);
        }
    } else if (entryAction === 'edit') {
        try {
            const detail = await apiRequest(`/api/admin/curriculum/${activeEntryCurriculumId}`);
            const entry = detail.entries.find(en => en.id === id);
            if (entry) openEntryModal(entry);
        } catch (error) {
            alert(error.message);
        }
    }
});

document.getElementById('btn-add-entry').addEventListener('click', () => openEntryModal(null));

function openEntryModal(entry) {
    editingEntryId = entry ? entry.id : null;
    document.getElementById('entry-modal-title').innerText = entry ? 'Edit Entry' : 'Add Entry';
    document.getElementById('entry-class-level').value = entry ? entry.classLevel : '';
    document.getElementById('entry-subject').value = entry ? entry.subject : '';
    document.getElementById('entry-term').value = entry ? (entry.term || '') : '';
    document.getElementById('entry-month').value = entry ? (entry.month || '') : '';
    document.getElementById('entry-theme').value = entry ? (entry.theme || '') : '';
    document.getElementById('entry-topics').value = entry ? (entry.topics || []).join(', ') : '';
    hideMsg(document.getElementById('entry-form-error'));
    document.getElementById('entry-modal').classList.remove('hidden');
}

document.getElementById('entry-modal-close').addEventListener('click', () => {
    document.getElementById('entry-modal').classList.add('hidden');
});
document.getElementById('entry-modal').addEventListener('click', (e) => {
    if (e.target.id === 'entry-modal') e.target.classList.add('hidden');
});

document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('entry-form-error');
    hideMsg(errorEl);

    const payload = {
        classLevel: document.getElementById('entry-class-level').value.trim(),
        subject: document.getElementById('entry-subject').value.trim(),
        term: document.getElementById('entry-term').value.trim(),
        month: document.getElementById('entry-month').value.trim(),
        theme: document.getElementById('entry-theme').value.trim(),
        topics: document.getElementById('entry-topics').value.split(',').map(t => t.trim()).filter(Boolean)
    };

    const btn = document.getElementById('btn-save-entry');
    btn.disabled = true;

    try {
        if (editingEntryId) {
            await apiRequest(`/api/admin/curriculum/entries/${editingEntryId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
            await apiRequest(`/api/admin/curriculum/${activeEntryCurriculumId}/entries`, { method: 'POST', body: JSON.stringify(payload) });
        }
        document.getElementById('entry-modal').classList.add('hidden');
        await Promise.all([loadCurriculumEntries(), loadCurricula()]);
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
    }
});

// Upload curriculum PDF
document.getElementById('curriculum-upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('curriculum-upload-error');
    const successEl = document.getElementById('curriculum-upload-success');
    hideMsg(errorEl);
    hideMsg(successEl);

    const schoolYear = document.getElementById('curriculum-school-year').value.trim();
    const title = document.getElementById('curriculum-title').value.trim();
    const fileInput = document.getElementById('curriculum-file');

    if (!fileInput.files.length) {
        showMsg(errorEl, 'Please choose a PDF file.');
        return;
    }

    const formData = new FormData();
    formData.append('schoolYear', schoolYear);
    formData.append('title', title);
    formData.append('curriculumFile', fileInput.files[0]);

    const btn = document.getElementById('btn-upload-curriculum');
    btn.disabled = true;
    const originalLabel = btn.innerHTML;
    btn.innerHTML = '<div class="loader-spinner" style="width:18px;height:18px;border-width:2px;margin:0;"></div> Parsing PDF...';

    try {
        const curriculum = await apiRequestForm('/api/admin/curriculum', formData);
        showMsg(successEl, `"${curriculum.title}" uploaded and parsed into ${curriculum.entryCount} curriculum entries. It is now the active curriculum.`);
        document.getElementById('curriculum-upload-form').reset();
        await loadCurricula();
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalLabel;
    }
});

// ===================== Settings: Admin accounts =====================

async function loadAdmins() {
    const tbody = document.getElementById('admins-tbody');
    try {
        const result = await apiRequest('/api/admin/admins');
        tbody.innerHTML = result.data.length === 0
            ? '<tr><td colspan="2" style="text-align:center; color:var(--clr-text-muted); padding:1rem;">No admins yet.</td></tr>'
            : result.data.map(a => `<tr><td>${escapeHtml(a.username)}</td><td>${formatDate(a.createdAt)}</td></tr>`).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="2" class="form-error" style="padding:1rem;">${escapeHtml(error.message)}</td></tr>`;
    }
}

document.getElementById('add-admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-admin-error');
    const successEl = document.getElementById('add-admin-success');
    hideMsg(errorEl);
    hideMsg(successEl);

    const username = document.getElementById('new-admin-username').value.trim();
    const password = document.getElementById('new-admin-password').value;

    const btn = document.getElementById('btn-add-admin');
    btn.disabled = true;

    try {
        const admin = await apiRequest('/api/admin/admins', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        showMsg(successEl, `Admin "${admin.username}" created. They can log in immediately.`);
        document.getElementById('add-admin-form').reset();
        await loadAdmins();
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
    }
});

// ===================== Settings: Subjects =====================

async function loadSubjectsSettings() {
    const tbody = document.getElementById('subjects-tbody');
    try {
        const result = await apiRequest('/api/admin/subjects');
        subjectsCache = result.data;
        tbody.innerHTML = subjectsCache.length === 0
            ? '<tr><td colspan="3" style="text-align:center; color:var(--clr-text-muted); padding:1rem;">No subjects yet.</td></tr>'
            : subjectsCache.map(s => `
                <tr>
                    <td>${escapeHtml(s.name)}</td>
                    <td>${escapeHtml(s.level)}</td>
                    <td>${s.isCustom ? `<button class="btn btn-danger" data-delete-subject="${s.id}">Delete</button>` : '<span class="pill pill-success">Built-in</span>'}</td>
                </tr>
            `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" class="form-error" style="padding:1rem;">${escapeHtml(error.message)}</td></tr>`;
    }
}

document.getElementById('add-subject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-subject-error');
    const successEl = document.getElementById('add-subject-success');
    hideMsg(errorEl);
    hideMsg(successEl);

    const name = document.getElementById('new-subject-name').value.trim();
    const level = document.getElementById('new-subject-level').value;

    const btn = document.getElementById('btn-add-subject');
    btn.disabled = true;

    try {
        await apiRequest('/api/admin/subjects', { method: 'POST', body: JSON.stringify({ name, level }) });
        showMsg(successEl, `"${name}" added to ${level}.`);
        document.getElementById('add-subject-form').reset();
        await loadSubjectsSettings();
    } catch (error) {
        showMsg(errorEl, error.message);
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('subjects-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-delete-subject]');
    if (!btn) return;
    if (!confirm('Delete this custom subject? Teachers assigned to it will lose that assignment.')) return;

    try {
        await apiRequest(`/api/admin/subjects/${btn.dataset.deleteSubject}`, { method: 'DELETE' });
        await loadSubjectsSettings();
    } catch (error) {
        alert(error.message);
    }
});

attachPasswordTogglesTo(['#new-teacher-password', '#admin-new-password', '#admin-confirm-password', '#new-admin-password', '#edit-teacher-password']);

// Init
(async function init() {
    try {
        const me = await apiRequest('/api/auth/me');
        document.getElementById('admin-username').innerText = me.id;
        document.getElementById('admin-avatar-initial').innerText = me.id.charAt(0).toUpperCase();
        document.getElementById('admin-avatar-topbar').innerText = me.id.charAt(0).toUpperCase();
    } catch (error) {
        return; // apiRequest already redirected to '/'
    }

    await Promise.all([loadStats(), loadTeachers()]);
})();
