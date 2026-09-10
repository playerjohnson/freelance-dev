// Nav scroll effect
const nav = document.querySelector('.nav');
if (nav) {
    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
}

// Mobile toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (nav && toggle && links) {
    const setMenuOpen = (open) => {
        links.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        toggle.textContent = open ? '✕' : '☰';
    };
    toggle.addEventListener('click', () => {
        setMenuOpen(!links.classList.contains('open'));
    });
    links.addEventListener('click', (event) => {
        if (event.target.closest('a')) setMenuOpen(false);
    });
    nav.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && links.classList.contains('open')) {
            setMenuOpen(false);
            toggle.focus();
        }
    });
    if (window.matchMedia) {
        const mobile = window.matchMedia('(max-width: 768px)');
        const resetMenu = () => setMenuOpen(false);
        if (mobile.addEventListener) mobile.addEventListener('change', resetMenu);
    }
    setMenuOpen(false);
    // Hide mobile links only once their disclosure control is ready.
    nav.classList.add('nav-menu-ready');
}

// Content is visible by default; it never depends on a scroll observer.

// Enhance the native form only when requests can be cancelled.
const form = document.querySelector('#contact-form');
const formStatus = document.querySelector('#contact-status');
if (form && formStatus && window.fetch && window.AbortController) {
    let submitting = false;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitting || !form.reportValidity()) return;

        submitting = true;
        const btn = form.querySelector('button[type="submit"]');
        const original = btn.textContent;
        const fields = Array.from(form.querySelectorAll('input, select, textarea'));
        const disabledStates = fields.map(field => field.disabled);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        btn.textContent = 'Sending...';
        btn.disabled = true;
        form.setAttribute('aria-busy', 'true');
        formStatus.dataset.state = 'pending';
        formStatus.textContent = 'Submitting your message…';

        try {
            const data = new FormData(form);
            // Keep the submitted values intact while the request is in flight.
            fields.forEach(field => { field.disabled = true; });
            const resp = await fetch(form.action, {
                method: 'POST',
                body: data,
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            if (resp.ok) {
                formStatus.dataset.state = 'success';
                formStatus.textContent = 'Your message has been submitted. Thank you.';
                form.reset();
            } else {
                formStatus.dataset.state = 'error';
                if (resp.status === 429) {
                    formStatus.textContent = 'Too many attempts. Please wait before trying again, or email me directly.';
                } else if (resp.status === 400 || resp.status === 422) {
                    formStatus.textContent = 'Please check your details and try again, or email me directly.';
                } else {
                    formStatus.textContent = 'We couldn’t confirm your submission. Your details are still here. Please try again later, or email me directly.';
                }
            }
        } catch {
            formStatus.dataset.state = 'error';
            formStatus.textContent = controller.signal.aborted
                ? 'This is taking longer than expected. We couldn’t confirm your submission. Please wait before trying again, or email me directly. Your details are still here.'
                : 'We couldn’t confirm your submission. Check your connection before trying again, or email me directly. Your details are still here.';
        } finally {
            clearTimeout(timeout);
            fields.forEach((field, index) => { field.disabled = disabledStates[index]; });
            btn.textContent = original;
            btn.disabled = false;
            form.removeAttribute('aria-busy');
            submitting = false;
        }
    });
}
