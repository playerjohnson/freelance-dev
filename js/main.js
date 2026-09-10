// Nav scroll effect
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle) {
    toggle.addEventListener('click', () => {
        links.classList.toggle('open');
        toggle.textContent = links.classList.contains('open') ? '✕' : '☰';
    });
}

// Scroll reveal
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

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
