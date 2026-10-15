const toggle = document.querySelector('.nav-toggle');
const navigation = document.querySelector('.site-nav');

toggle?.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const contactForm = document.querySelector('[data-contact-form]');
let turnstileWidgetId;

const showFormStatus = (message, type = '') => {
  const status = contactForm?.querySelector('.form-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
};

const initializeTurnstile = async () => {
  const container = document.querySelector('[data-turnstile-widget]');
  if (!container) return;

  try {
    const response = await fetch('/api/contact');
    if (!response.ok) throw new Error('Unable to load contact configuration.');
    const { turnstileSiteKey } = await response.json();
    if (!turnstileSiteKey) throw new Error('Spam protection is not configured.');

    container.replaceChildren();
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: turnstileSiteKey,
      action: 'contact',
      theme: 'light',
      size: 'flexible',
    });
  } catch (error) {
    container.textContent = 'Spam protection could not load. Please refresh and try again.';
    showFormStatus(error.message, 'error');
  }
};

if (contactForm) {
  window.addEventListener('load', initializeTurnstile);
}

contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Sending…';
  showFormStatus('');

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your message could not be sent.');

    form.reset();
    showFormStatus('Thanks — your message has been sent. We’ll be in touch soon.', 'success');
  } catch (error) {
    showFormStatus(error.message || 'Your message could not be sent. Please try again.', 'error');
  } finally {
    if (window.turnstile && turnstileWidgetId !== undefined) window.turnstile.reset(turnstileWidgetId);
    button.disabled = false;
    button.innerHTML = 'Send message <span>→</span>';
  }
});
