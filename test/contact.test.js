import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet, onRequestPost } from '../functions/api/contact.js';

const env = {
  RESEND_API_KEY: 'resend-test-key',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_SITE_KEY: 'turnstile-site-key',
  CONTACT_FROM_EMAIL: 'TOT Website <contact@forms.totsoftware.com>',
  CONTACT_TO_EMAIL: 'inquire@totsoftware.com',
};

const validFields = {
  firstName: 'Taylor',
  lastName: 'Owner',
  email: 'taylor@example.com',
  business: 'Example & Co',
  message: '<b>Need an automation</b>',
  'cf-turnstile-response': 'valid-token',
};

const requestWith = (fields, headers = {}) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return new Request('https://totsoftware.com/api/contact', { method: 'POST', body: form, headers });
};

const mockProviders = (context, turnstile = {}) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return url.includes('siteverify')
      ? Response.json({ success: true, hostname: 'totsoftware.com', action: 'contact', ...turnstile })
      : Response.json({ id: 'email-id' });
  };
  return calls;
};

test('returns the public Turnstile site key without exposing secrets', async () => {
  const response = onRequestGet({ env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    turnstileSiteKey: 'turnstile-site-key',
    contactHandler: 'resend-v2',
    emailConfigured: true,
    turnstileConfigured: true,
  });
});

test('reports incomplete server configuration without exposing configuration values', async () => {
  const response = onRequestGet({ env: { TURNSTILE_SITE_KEY: 'public-key' } });
  assert.deepEqual(await response.json(), {
    turnstileSiteKey: 'public-key',
    contactHandler: 'resend-v2',
    emailConfigured: false,
    turnstileConfigured: false,
  });
});

test('rejects incomplete submissions before calling external services', async () => {
  const response = await onRequestPost({ request: requestWith({ firstName: 'Taylor' }), env });
  assert.equal(response.status, 400);
});

test('rejects oversized requests', async () => {
  const response = await onRequestPost({
    request: requestWith(validFields, { 'Content-Length': '32001' }),
    env,
  });
  assert.equal(response.status, 413);
});

for (const invalidResponse of [
  { success: false },
  { hostname: 'attacker.example' },
  { action: 'login' },
]) {
  test(`rejects invalid Turnstile response ${JSON.stringify(invalidResponse)}`, async (context) => {
    const calls = mockProviders(context, invalidResponse);
    const response = await onRequestPost({ request: requestWith(validFields), env });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
  });
}

test('verifies Turnstile and sends with Resend configuration', async (context) => {
  const calls = mockProviders(context);
  const response = await onRequestPost({ request: requestWith(validFields), env });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer resend-test-key');
  const email = JSON.parse(calls[1].options.body);
  assert.deepEqual(email.to, ['inquire@totsoftware.com']);
  assert.equal(email.from, 'TOT Website <contact@forms.totsoftware.com>');
  assert.equal(email.reply_to, 'taylor@example.com');
  assert.equal(email.subject, 'New website inquiry');
  assert.match(email.html, /&lt;b&gt;Need an automation&lt;\/b&gt;/);
});

test('returns a safe error when Resend rejects a message', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => url.includes('siteverify')
    ? Response.json({ success: true, hostname: 'totsoftware.com', action: 'contact' })
    : Response.json({ name: 'validation_error', message: 'provider detail' }, { status: 422 });

  const response = await onRequestPost({ request: requestWith(validFields), env });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: 'Your message could not be sent. Please try again later.',
  });
});
