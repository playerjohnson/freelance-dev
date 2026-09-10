const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Dependency-free request fixtures. No network calls are made.
const script = readFileSync(join(__dirname, '../js/main.js'), 'utf8');

function fixture({ fetchImpl, valid = true, enhanced = true } = {}) {
    let submit;
    const calls = [];
    const timers = new Map();
    const status = { textContent: '', dataset: {} };
    const button = { textContent: 'Send Message →', disabled: false };
    const fields = ['name', 'email', 'message', '_gotcha'].map(name => ({
        name, value: name === '_gotcha' ? '' : `synthetic-${name}`, disabled: false
    }));
    const initialValues = fields.map(field => field.value);
    const form = {
        action: 'https://formspree.invalid/test-only',
        attributes: {},
        addEventListener(event, callback) { if (event === 'submit') submit = callback; },
        querySelector() { return button; },
        querySelectorAll() { return fields; },
        reportValidity() { return valid; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        reset() { fields.forEach(field => { field.value = ''; }); }
    };
    const fetch = async (url, options) => {
        calls.push({ url, options });
        return fetchImpl ? fetchImpl(options) : { ok: true, status: 200 };
    };
    const context = {
        window: { addEventListener() {}, fetch: enhanced ? fetch : undefined, AbortController },
        document: {
            querySelector(selector) {
                return ({ '#contact-form': form, '#contact-status': status })[selector] || null;
            },
            querySelectorAll() { return []; }
        },
        FormData: class {
            constructor() {
                this.values = Object.fromEntries(fields.filter(field => !field.disabled)
                    .map(field => [field.name, field.value]));
            }
        },
        fetch,
        AbortController,
        setTimeout(callback, delay) { timers.set(callback, delay); return callback; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(script, context);
    return {
        form, status, button, fields, calls, timers, initialValues,
        hasHandler: () => Boolean(submit),
        submit: () => submit({ preventDefault() {} }),
        expireRequest() {
            for (const [callback, delay] of [...timers]) {
                assert.equal(delay, 15000);
                timers.delete(callback);
                callback();
            }
        }
    };
}

function assertReady(f) {
    assert.equal(f.button.disabled, false);
    assert.equal(f.button.textContent, 'Send Message →');
    assert.ok(f.fields.every(field => !field.disabled));
    assert.equal(f.form.attributes['aria-busy'], undefined);
    assert.equal(f.timers.size, 0);
}

test('accepted submission includes fields and honeypot; feedback persists without claiming delivery', async () => {
    const f = fixture();
    await f.submit();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.method, 'POST');
    assert.equal(f.calls[0].options.body.values.email, 'synthetic-email');
    assert.equal(f.calls[0].options.body.values._gotcha, '');
    assert.equal(f.status.dataset.state, 'success');
    assert.equal(f.status.textContent, 'Your message has been submitted. Thank you.');
    assert.ok(f.fields.every(field => field.value === ''));
    assertReady(f);
});

for (const [code, message] of [[400, /check your details/i], [422, /check your details/i],
    [429, /wait before trying again/i], [500, /couldn’t confirm/i]]) {
    test(`HTTP ${code} retains details and leaves actionable feedback`, async () => {
        const f = fixture({ fetchImpl: async () => ({ ok: false, status: code }) });
        await f.submit();
        assert.equal(f.status.dataset.state, 'error');
        assert.match(f.status.textContent, message);
        assert.match(f.status.textContent, /email me directly/i);
        assert.deepEqual(f.fields.map(field => field.value), f.initialValues);
        assertReady(f);
    });
}

test('network failure retains the enquiry and releases the form', async () => {
    const f = fixture({ fetchImpl: async () => { throw new TypeError('Fixture connection failure'); } });
    await f.submit();
    assert.match(f.status.textContent, /check your connection/i);
    assert.deepEqual(f.fields.map(field => field.value), f.initialValues);
    assertReady(f);
});

test('a stalled request is aborted after 15 seconds without claiming it was not received', async () => {
    const f = fixture({ fetchImpl: ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Fixture aborted')), { once: true });
    }) });
    const pending = f.submit();
    f.expireRequest();
    await pending;
    assert.equal(f.calls[0].options.signal.aborted, true);
    assert.match(f.status.textContent, /couldn’t confirm your submission/i);
    assert.match(f.status.textContent, /wait before trying again/i);
    assert.deepEqual(f.fields.map(field => field.value), f.initialValues);
    assertReady(f);
});

test('a pending submission freezes the submitted fields and prevents duplicate requests', async () => {
    let complete;
    const f = fixture({ fetchImpl: () => new Promise(resolve => { complete = resolve; }) });
    const pending = f.submit();
    assert.equal(f.button.disabled, true);
    assert.ok(f.fields.every(field => field.disabled));
    await f.submit();
    assert.equal(f.calls.length, 1);
    complete({ ok: false, status: 500 });
    await pending;
    assertReady(f);
});

test('invalid fields do not initiate a request', async () => {
    const f = fixture({ valid: false });
    await f.submit();
    assert.equal(f.calls.length, 0);
    assertReady(f);
});

test('without fetch, native form submission remains available', () => {
    assert.equal(fixture({ enhanced: false }).hasHandler(), false);
});
