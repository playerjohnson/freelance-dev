/* Draft: verify GTM purpose separation and provider ownership before deployment. */
(function () {
    'use strict';
    const base = '/freelance-dev/';
    if (!location.pathname.startsWith(base) && location.pathname !== base.slice(0, -1)) return;
    const key = 'freelance_dev_cookie_preferences_v1';
    let choice = { analytics: false, advertising: false };
    const loaded = { analytics: false, advertising: false };
    let saved = null;
    try {
        const raw = localStorage.getItem(key);
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && typeof parsed.analytics === 'boolean' && typeof parsed.advertising === 'boolean') {
            // Fail closed if preferences can be read but cannot be changed.
            localStorage.setItem(key, raw);
            saved = parsed;
            choice = parsed;
        }
    } catch { /* Unavailable or invalid storage never grants consent. */ }

    function loadScript(src) {
        const script = document.createElement('script');
        script.async = true;
        script.src = src;
        if (src.includes('googlesyndication.com')) script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
    }

    window.trackEvent = function (event, params) {
        if (!choice.analytics) return;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(Object.assign({}, params || {}, { event, site_name: 'freelance-dev' }));
    };

    function startAllowed() {
        if (choice.analytics && !loaded.analytics) {
            loaded.analytics = true;
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ site_name: 'freelance-dev', page_path: location.pathname, page_title: document.title });
            window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
            loadScript('https://www.googletagmanager.com/gtm.js?id=GTM-54K98MWX');
        }
        if (choice.advertising && !loaded.advertising) {
            loaded.advertising = true;
            loadScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6553969093740923');
        }
    }

    function ready() {
        const panel = document.createElement('section');
        panel.id = 'freelance-cookie-panel';
        panel.setAttribute('aria-label', 'Cookie preferences');
        panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a2035;color:#f1f5f9;padding:20px 24px;border-top:1px solid #475569;max-height:80vh;overflow:auto;';
        panel.innerHTML = '<p>Choose optional cookies for the freelance website. <a href="/freelance-dev/privacy.html">Privacy Policy</a></p>' +
            '<label style="display:block;min-height:44px;"><input id="freelance-analytics" type="checkbox"> Analytics</label>' +
            '<label style="display:block;min-height:44px;"><input id="freelance-advertising" type="checkbox"> Advertising</label>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap;"><button type="button" id="freelance-cookie-reject" class="btn btn-outline">Reject all</button>' +
            '<button type="button" id="freelance-cookie-save" class="btn btn-outline">Save choices</button></div>' +
            '<p id="freelance-cookie-status" role="status" aria-live="polite"></p>';
        document.body.appendChild(panel);
        const analytics = document.getElementById('freelance-analytics');
        const advertising = document.getElementById('freelance-advertising');
        const reject = document.getElementById('freelance-cookie-reject');
        const save = document.getElementById('freelance-cookie-save');
        const status = document.getElementById('freelance-cookie-status');
        const settings = document.createElement('button');
        settings.type = 'button';
        settings.id = 'freelance-cookie-settings';
        settings.textContent = 'Cookie settings';
        settings.className = 'btn btn-outline';
        settings.style.cssText = 'margin:16px 24px;min-height:44px;';
        (document.querySelector('footer') || document.body).appendChild(settings);

        function show(focus) {
            analytics.checked = choice.analytics;
            advertising.checked = choice.advertising;
            panel.hidden = false;
            settings.hidden = true;
            if (focus) reject.focus();
        }

        function apply(next) {
            const withdrawing = (loaded.analytics && !next.analytics) || (loaded.advertising && !next.advertising);
            try {
                localStorage.setItem(key, JSON.stringify(Object.assign({ version: 1 }, next)));
            } catch {
                status.textContent = 'Your browser could not save this choice. Optional cookies cannot be enabled. If you previously accepted them, clear this site’s stored preferences in your browser before continuing.';
                choice = { analytics: false, advertising: false };
                // Do not report a successful withdrawal while loaded provider code may still run.
                return;
            }
            choice = next;
            panel.hidden = true;
            settings.hidden = false;
            if (withdrawing) {
                // Reload ends provider timers. Never delete shared-origin cookies or other sites' choices.
                location.reload();
                return;
            }
            startAllowed();
            settings.focus();
        }

        settings.addEventListener('click', () => show(true));
        reject.addEventListener('click', () => apply({ analytics: false, advertising: false }));
        save.addEventListener('click', () => apply({ analytics: analytics.checked, advertising: advertising.checked }));
        if (saved) { panel.hidden = true; startAllowed(); } else { show(false); }

        window.addEventListener('storage', event => {
            if (event.key === key) {
                choice = { analytics: false, advertising: false };
                location.reload();
            }
        });

        const form = document.querySelector('#contactForm');
        if (form) {
            let started = false;
            form.addEventListener('focusin', () => {
                if (!choice.analytics || started) return;
                started = true;
                window.trackEvent('contact_form_started');
            });
            form.addEventListener('submit', () => window.trackEvent('contact_form_submitted'));
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
})();
