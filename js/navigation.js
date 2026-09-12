// Canonical navigation bootstrap; HTML embeds this exact source before main content.
(function () {
    'use strict';
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

})();
