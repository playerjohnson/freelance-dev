const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/freelance-consent.js'), 'utf8');
const KEY = 'freelance_dev_cookie_preferences_v1';

function fixture({ pathname = '/freelance-dev/contact.html', stored = {}, blocked = false, loading = false } = {}) {
    const ids = new Map();
    const scripts = [];
    const storage = new Map(Object.entries(stored));
    const events = {};
    let reloads = 0;
    let denyWrites = blocked;
    class Element {
        constructor(tag) { this.tag = tag; this.handlers = {}; this.hidden = false; this.checked = false; this.style = {}; }
        setAttribute(name, value) { this[name] = value; }
        appendChild(child) { if (child.id) ids.set(child.id, child); if (child.tag === 'script') scripts.push(child); }
        set innerHTML(value) {
            this.markup = value;
            for (const match of value.matchAll(/<(\w+)[^>]*id="([^"]+)"/g)) {
                const element = new Element(match[1]); element.id = match[2]; ids.set(element.id, element);
            }
        }
        addEventListener(name, handler) { this.handlers[name] = handler; }
        focus() { document.activeElement = this; }
        click() { this.handlers.click(); }
    }
    const form = new Element('form');
    const footer = new Element('footer');
    const document = {
        title: 'Freelance', readyState: loading ? 'loading' : 'complete',
        head: new Element('head'), body: new Element('body'),
        createElement: tag => new Element(tag), getElementById: id => ids.get(id),
        querySelector: selector => selector === 'footer' ? footer : selector === '#contactForm' ? form : null,
        addEventListener: (name, handler) => { events[name] = handler; }
    };
    Object.defineProperty(document, 'cookie', { get() { throw Error('Shared cookies must not be read'); }, set() { throw Error('Shared cookies must not be changed'); } });
    const window = { addEventListener: (name, handler) => { events[name] = handler; } };
    const localStorage = {
        getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
        setItem(key, value) { if (denyWrites) throw Error('blocked'); storage.set(key, value); }
    };
    vm.runInNewContext(source, { window, document, localStorage, location: { pathname, reload() { reloads++; } }, Date });
    return { ids, scripts, storage, window, document, events, form, blockWrites() { denyWrites = true; }, get reloads() { return reloads; } };
}

test('fresh consent loads no providers and discards pre-consent events', () => {
    const f = fixture();
    f.window.trackEvent('private-before-consent');
    assert.equal(f.scripts.length, 0);
    assert.equal(f.window.dataLayer, undefined);
    assert.equal(f.ids.get('freelance-cookie-panel').hidden, false);
    assert.match(f.ids.get('freelance-cookie-panel').markup, /href="\/freelance-dev\/privacy.html"/);
});

test('shared-origin acceptance is not imported or overwritten', () => {
    const f = fixture({ stored: { ictedge_cookie_consent: 'accepted' } });
    f.ids.get('freelance-cookie-reject').click();
    assert.equal(f.scripts.length, 0);
    assert.equal(f.storage.get('ictedge_cookie_consent'), 'accepted');
    assert.equal(JSON.parse(f.storage.get(KEY)).analytics, false);
});

test('analytics selection loads only the GTM loader, once', () => {
    const f = fixture();
    f.ids.get('freelance-analytics').checked = true;
    f.ids.get('freelance-cookie-save').click();
    f.ids.get('freelance-cookie-settings').click();
    f.ids.get('freelance-cookie-save').click();
    assert.equal(f.scripts.length, 1);
    assert.match(f.scripts[0].src, /googletagmanager/);
    assert.equal(f.scripts[0].crossOrigin, undefined);
});

test('advertising selection loads only the AdSense loader', () => {
    const f = fixture();
    f.ids.get('freelance-advertising').checked = true;
    f.ids.get('freelance-cookie-save').click();
    assert.equal(f.scripts.length, 1);
    assert.match(f.scripts[0].src, /googlesyndication/);
    assert.equal(f.window.dataLayer, undefined);
});

test('withdrawal persists rejection and reloads to end loaded provider code', () => {
    const f = fixture({ stored: { [KEY]: JSON.stringify({ version: 1, analytics: true, advertising: true }), ictedge_cookie_consent: 'accepted' } });
    assert.equal(f.scripts.length, 2);
    f.ids.get('freelance-cookie-settings').click();
    assert.equal(f.document.activeElement.id, 'freelance-cookie-reject');
    f.ids.get('freelance-cookie-reject').click();
    assert.equal(f.reloads, 1);
    const after = JSON.parse(f.storage.get(KEY));
    assert.equal(after.analytics, false);
    assert.equal(after.advertising, false);
    assert.equal(f.storage.get('ictedge_cookie_consent'), 'accepted');
    const second = fixture({ stored: Object.fromEntries(f.storage) });
    assert.equal(second.scripts.length, 0);
});

test('invalid or blocked storage fails closed', () => {
    for (const options of [{ stored: { [KEY]: 'invalid' } }, { blocked: true }]) {
        const f = fixture(options);
        assert.equal(f.scripts.length, 0);
        assert.equal(f.ids.get('freelance-cookie-panel').hidden, false);
    }
});

test('a failed preference write cannot enable providers or claim successful withdrawal', () => {
    const f = fixture({ blocked: true });
    f.ids.get('freelance-analytics').checked = true;
    f.ids.get('freelance-cookie-save').click();
    assert.equal(f.scripts.length, 0);
    assert.match(f.ids.get('freelance-cookie-status').textContent, /could not save/);
    const accepted = fixture({ stored: { [KEY]: JSON.stringify({ version: 1, analytics: true, advertising: false }) } });
    accepted.blockWrites();
    accepted.ids.get('freelance-cookie-settings').click();
    accepted.ids.get('freelance-cookie-reject').click();
    assert.equal(accepted.reloads, 0);
    assert.equal(accepted.ids.get('freelance-cookie-panel').hidden, false);
    assert.match(accepted.ids.get('freelance-cookie-status').textContent, /clear this site/);
});

test('only changes to this site preference trigger a reload', () => {
    const f = fixture();
    f.events.storage({ key: 'ictedge_cookie_consent' });
    assert.equal(f.reloads, 0);
    f.events.storage({ key: KEY });
    assert.equal(f.reloads, 1);
});

test('the script does not run on root or sibling pages', () => {
    for (const pathname of ['/', '/everyday-tools/', '/freelance-dev-other/']) {
        const f = fixture({ pathname });
        assert.equal(f.scripts.length, 0);
        assert.equal(f.ids.size, 0);
        assert.equal(f.window.trackEvent, undefined);
    }
});

test('deferred DOM readiness and form events respect analytics selection', () => {
    const f = fixture({ loading: true });
    assert.equal(f.ids.size, 0);
    f.events.DOMContentLoaded();
    f.form.handlers.focusin();
    assert.equal(f.window.dataLayer, undefined);
    f.ids.get('freelance-analytics').checked = true;
    f.ids.get('freelance-cookie-save').click();
    f.form.handlers.focusin();
    f.form.handlers.focusin();
    assert.equal(f.window.dataLayer.filter(e => e.event === 'contact_form_started').length, 1);
});
