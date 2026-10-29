const CONTACT_ACTION = 'contact';
const MAX_REQUEST_BYTES = 32_000;
const PRODUCTION_HOSTNAMES = new Set(['totsoftware.com', 'www.totsoftware.com']);
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const CONTACT_HANDLER_VERSION = 'resend-v2';

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

const field = (form, name, maximumLength, required = false) => {
  const raw = form.get(name);
  if (typeof raw !== 'string') return required ? { error: true } : { value: '' };

  const value = raw.trim();
  if ((required && !value) || value.length > maximumLength) return { error: true };
  return { value };
};

const escapeHtml = (value) =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);

const verifyTurnstile = async (token, request, secret) => {
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || undefined,
      }),
    });
    if (!response.ok) {
      console.error('Turnstile verification request rejected', { status: response.status });
      return false;
    }

    const result = await response.json();
    const valid = result.success === true
      && result.action === CONTACT_ACTION
      && PRODUCTION_HOSTNAMES.has(result.hostname);
    if (!valid) {
      console.error('Turnstile verification failed', {
        success: result.success === true,
        action: result.action || null,
        hostname: result.hostname || null,
        errorCodes: Array.isArray(result['error-codes']) ? result['error-codes'] : [],
      });
    }
    return valid;
  } catch {
    console.error('Turnstile verification request failed');
    return false;
  }
};

export const onRequestGet = ({ env }) => {
  if (!env.TURNSTILE_SITE_KEY) return json({ error: 'Contact form is not configured.' }, 503);
  return json({
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    contactHandler: CONTACT_HANDLER_VERSION,
    emailConfigured: Boolean(env.RESEND_API_KEY && env.CONTACT_FROM_EMAIL && env.CONTACT_TO_EMAIL),
    turnstileConfigured: Boolean(env.TURNSTILE_SECRET_KEY),
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) {
    return json({ error: 'Contact form is not configured.' }, 503);
  }

  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Your message is too large.' }, 413);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid form submission.' }, 400);
  }

  // Silently accept bot submissions that fill the field hidden from people.
  if (field(form, 'website', 100).value) return json({ ok: true });

  const firstName = field(form, 'firstName', 80, true);
  const lastName = field(form, 'lastName', 80, true);
  const email = field(form, 'email', 254, true);
  const business = field(form, 'business', 160);
  const message = field(form, 'message', 5000, true);
  const turnstileToken = field(form, 'cf-turnstile-response', 2048, true);
  const fields = [firstName, lastName, email, business, message, turnstileToken];

  if (fields.some((item) => item.error)) {
    return json({ error: 'Please check the required fields and their lengths.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  const isHuman = await verifyTurnstile(turnstileToken.value, request, env.TURNSTILE_SECRET_KEY);
  if (!isHuman) {
    return json({ error: 'Spam protection failed. Please refresh and try again.' }, 403);
  }

  const name = `${firstName.value} ${lastName.value}`;
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email.value),
    business: escapeHtml(business.value || 'Not provided'),
    message: escapeHtml(message.value).replace(/\n/g, '<br>'),
  };

  let delivery;
  try {
    delivery = await fetch(RESEND_EMAIL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email.value,
        subject: 'New website inquiry',
        text: `Name: ${name}\nEmail: ${email.value}\nBusiness: ${business.value || 'Not provided'}\n\n${message.value}`,
        html: `<h2>New website inquiry</h2><p><strong>Name:</strong> ${safe.name}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Business:</strong> ${safe.business}</p><p><strong>Message:</strong><br>${safe.message}</p>`,
      }),
    });
  } catch {
    console.error('Resend contact-email request failed');
    return json({ error: 'Your message could not be sent. Please try again later.' }, 502);
  }

  if (!delivery.ok) {
    let providerError = {};
    try {
      const body = await delivery.json();
      providerError = {
        name: typeof body.name === 'string' ? body.name : undefined,
        statusCode: typeof body.statusCode === 'number' ? body.statusCode : undefined,
      };
    } catch {
      // Resend did not return JSON. The HTTP status still provides a useful diagnostic.
    }
    console.error('Resend rejected contact email', { status: delivery.status, ...providerError });
    return json({ error: 'Your message could not be sent. Please try again later.' }, 502);
  }

  return json({ ok: true });
};
