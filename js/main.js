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

// Contact form (Formspree or similar)
const form = document.querySelector('#contact-form');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const original = btn.textContent;
        btn.textContent = 'Sending...';
        btn.disabled = true;

        try {
            const data = new FormData(form);
            const resp = await fetch(form.action, {
                method: 'POST',
                body: data,
                headers: { 'Accept': 'application/json' }
            });
            if (resp.ok) {
                btn.textContent = 'Message Sent ✓';
                btn.style.background = '#22c55e';
                form.reset();
                setTimeout(() => { btn.textContent = original; btn.style.background = ''; btn.disabled = false; }, 3000);
            } else {
                throw new Error();
            }
        } catch {
            btn.textContent = 'Error — try again';
            btn.style.background = '#ef4444';
            setTimeout(() => { btn.textContent = original; btn.style.background = ''; btn.disabled = false; }, 3000);
        }
    });
}
