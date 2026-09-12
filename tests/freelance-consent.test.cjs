const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/freelance-consent.js'), 'utf8');

function fixture(pathname, existingChoices) {
    const forbidden = () => { throw Error('Paused tracking must not access providers, DOM, cookies or storage'); };
    const sentinel = () => 'existing tracker';
    const dataLayer = Object.freeze([Object.freeze({ event: 'existing-event' })]);
    const storage = Object.freeze({
        freelance_dev_cookie_preferences_v1: JSON.stringify(existingChoices),
        ictedge_cookie_consent: 'accepted'
    });
    const window = { trackEvent: sentinel, dataLayer, fetch: forbidden, addEventListener: forbidden };
    const context = {
        window, location: { pathname, reload: forbidden }, fetch: forbidden,
        setTimeout: forbidden, setInterval: forbidden,
        navigator: { sendBeacon: forbidden }
    };
    for (const key of ['document', 'localStorage', 'sessionStorage']) {
        Object.defineProperty(context, key, { get: forbidden });
        Object.defineProperty(window, key, { get: forbidden });
    }
    vm.runInNewContext(source, context);
    return { window, sentinel, dataLayer, storage };
}

test('fresh visits and every previously saved choice remain paused on home, contact and nested pages', () => {
    const choices = [undefined, ...[false, true].flatMap(analytics =>
        [false, true].map(advertising => ({ version: 1, analytics, advertising })))];
    for (const pathname of ['/freelance-dev', '/freelance-dev/', '/freelance-dev/contact.html',
        '/freelance-dev/services/dotnet-development.html', '/freelance-dev/blog/legacy-modernisation-without-rewrite.html']) {
        for (const choice of choices) {
            const f = fixture(pathname, choice);
            f.window.trackEvent('contact_form_submitted', { service: 'synthetic' });
            f.window.trackEvent('consent_granted');
            assert.equal(f.window.dataLayer, f.dataLayer);
            assert.equal(f.dataLayer.length, 1);
            assert.equal(f.storage.ictedge_cookie_consent, 'accepted');
        }
    }
});

test('root and sibling pages keep their existing tracker and shared data', () => {
    for (const pathname of ['/', '/uk-devtools/', '/freelance-dev-other/', '/freelance-development/']) {
        const f = fixture(pathname, { version: 1, analytics: true, advertising: true });
        assert.equal(f.window.trackEvent, f.sentinel);
        assert.equal(f.window.dataLayer, f.dataLayer);
    }
});

function htmlFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.name.startsWith('.')) return [];
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? htmlFiles(filename) : entry.name.endsWith('.html') ? [filename] : [];
    });
}

test('published pages load only reviewed local scripts and cannot restore a tag-manager iframe or legacy loader', () => {
    const allowed = new Map([
        [path.join(root, 'js/main.js'), 'v=20260912-nav-timing'],
        [path.join(root, 'js/freelance-consent.js'), 'v=20260912-paused']
    ]);
    const files = htmlFiles(root);
    assert.ok(files.includes(path.join(root, 'index.html')));
    assert.ok(files.includes(path.join(root, 'contact.html')));
    for (const filename of files) {
        const html = fs.readFileSync(filename, 'utf8');
        assert.doesNotMatch(html, /<iframe\b/i, filename);
        for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
            const src = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
            if (!src) {
                assert.match(attributes, /\btype\s*=\s*["']application\/ld\+json["']/i, filename);
                assert.doesNotThrow(() => JSON.parse(body), filename);
                continue;
            }
            const [relative, query] = src.split('?');
            assert.doesNotMatch(relative, /^(?:[a-z]+:|\/)/i, filename);
            const resolved = path.resolve(path.dirname(filename), relative);
            assert.ok(allowed.has(resolved), filename + ': unreviewed script ' + src);
            assert.equal(query, allowed.get(resolved), filename + ': stale script URL');
            assert.equal(body.trim(), '', filename);
        }
    }
});

test('privacy describes the pause without offering controls that enable optional tracking', () => {
    const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
    assert.match(privacy, /Optional analytics and advertising are temporarily paused/);
    assert.match(privacy, /does not load Google Analytics, Google Tag Manager or Google AdSense/);
    assert.doesNotMatch(privacy, /choose analytics and advertising separately|use Cookie settings|via the cookie banner/);
});
