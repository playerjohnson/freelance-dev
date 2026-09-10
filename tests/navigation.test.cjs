const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = readFileSync(join(__dirname, '../js/main.js'), 'utf8');

function element() {
    const classes = new Set();
    return {
        handlers: {}, attributes: {}, focused: false,
        classList: {
            add(name) { classes.add(name); },
            contains(name) { return classes.has(name); },
            toggle(name, force = !classes.has(name)) {
                if (force) classes.add(name); else classes.delete(name);
            }
        },
        addEventListener(name, callback) { this.handlers[name] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; }
    };
}

function fixture({ withLinks = true, withMatchMedia = true } = {}) {
    const nav = element(), toggle = element(), links = element(), media = element();
    vm.runInNewContext(script, {
        window: { addEventListener() {}, matchMedia: withMatchMedia ? () => media : undefined },
        document: {
            querySelector(selector) {
                return ({ '.nav': nav, '.nav-toggle': toggle, '.nav-links': withLinks ? links : null })[selector] || null;
            }
        }
        // No IntersectionObserver: navigation and form code must not depend on it.
    });
    return { nav, toggle, links, media };
}

test('the menu exposes its expanded state and closes on a second activation', () => {
    const f = fixture();
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
    f.toggle.handlers.click();
    assert.equal(f.links.classList.contains('open'), true);
    assert.equal(f.toggle.attributes['aria-expanded'], 'true');
    assert.equal(f.toggle.attributes['aria-label'], 'Close menu');
    f.toggle.handlers.click();
    assert.equal(f.links.classList.contains('open'), false);
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
});

test('Escape dismisses an open menu and returns focus to its control', () => {
    const f = fixture();
    f.toggle.handlers.click();
    f.nav.handlers.keydown({ key: 'Escape' });
    assert.equal(f.links.classList.contains('open'), false);
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
    assert.equal(f.toggle.focused, true);
});

test('following a navigation link closes the menu; clicking its empty space does not', () => {
    const f = fixture();
    f.toggle.handlers.click();
    f.links.handlers.click({ target: { closest() { return null; } } });
    assert.equal(f.links.classList.contains('open'), true);
    f.links.handlers.click({ target: { closest() { return {}; } } });
    assert.equal(f.links.classList.contains('open'), false);
});

test('changing the viewport breakpoint resets a previously open menu', () => {
    const f = fixture();
    f.toggle.handlers.click();
    f.media.handlers.change();
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
    assert.equal(f.links.classList.contains('open'), false);
});

test('missing menu markup leaves navigation uncollapsed and does not throw', () => {
    const f = fixture({ withLinks: false });
    assert.equal(f.nav.classList.contains('nav-menu-ready'), false);
    assert.equal(f.toggle.handlers.click, undefined);
});

test('menu activation still works without matchMedia or IntersectionObserver', () => {
    const f = fixture({ withMatchMedia: false });
    f.toggle.handlers.click();
    assert.equal(f.links.classList.contains('open'), true);
});
