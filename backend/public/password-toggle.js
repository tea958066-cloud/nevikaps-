/**
 * Adds a show/hide eye-icon toggle to a password <input>.
 * Shared by the main app (login, first-login password form) and the
 * admin panel (Add Teacher form, admin's own change-password form).
 */
function attachPasswordToggle(input) {
    if (!input || input.dataset.toggleAttached) return;
    input.dataset.toggleAttached = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'password-field-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle-btn';
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = '<i class="ph ph-eye"></i>';

    btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.innerHTML = isHidden ? '<i class="ph ph-eye-slash"></i>' : '<i class="ph ph-eye"></i>';
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });

    wrapper.appendChild(btn);
}

function attachPasswordTogglesTo(selectors) {
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(attachPasswordToggle);
    });
}
