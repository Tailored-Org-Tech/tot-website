const stickyHeader = document.querySelector(".site-header");
if (stickyHeader && "ResizeObserver" in window) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty(
      "--header-height",
      `${stickyHeader.getBoundingClientRect().height + 12}px`,
    );
  }).observe(stickyHeader);
}

const motionToggle = document.querySelector("[data-motion-toggle]");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let savedMotion = null;
try {
  savedMotion = localStorage.getItem("tot-motion");
} catch {
  /* Storage can be unavailable. */
}
const applyMotion = (enabled) => {
  document.documentElement.dataset.motion = enabled ? "on" : "off";
  if (motionToggle) {
    motionToggle.textContent = `Animations: ${enabled ? "On" : "Off"}`;
    motionToggle.setAttribute("aria-pressed", String(enabled));
    motionToggle.hidden = false;
  }
  if (!enabled) window.scrollTo({ top: window.scrollY, behavior: "instant" });
};
applyMotion(
  savedMotion === "on" || (savedMotion !== "off" && !motionQuery.matches),
);
motionToggle?.addEventListener("click", () => {
  const enabled = document.documentElement.dataset.motion !== "on";
  savedMotion = enabled ? "on" : "off";
  try {
    localStorage.setItem("tot-motion", savedMotion);
  } catch {
    /* Keep in-memory preference. */
  }
  applyMotion(enabled);
});
motionQuery.addEventListener("change", () => {
  if (savedMotion === null) applyMotion(!motionQuery.matches);
});
window.addEventListener("storage", (event) => {
  if (event.key !== "tot-motion") return;
  savedMotion = event.newValue;
  applyMotion(
    savedMotion === "on" || (savedMotion !== "off" && !motionQuery.matches),
  );
});

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const contactForm = document.querySelector("[data-contact-form]");
let turnstileWidgetId;

const showFormStatus = (message, type = "") => {
  const status = contactForm?.querySelector(".form-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
};

const initializeTurnstile = async () => {
  const container = document.querySelector("[data-turnstile-widget]");
  if (!container) return;

  try {
    const response = await fetch("/api/contact");
    if (!response.ok) throw new Error("Unable to load contact configuration.");
    const { turnstileSiteKey } = await response.json();
    if (!turnstileSiteKey)
      throw new Error("Spam protection is not configured.");

    container.replaceChildren();
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: turnstileSiteKey,
      action: "contact",
      theme: "light",
      size: "flexible",
    });
  } catch (error) {
    container.textContent =
      "Spam protection could not load. Please refresh and try again.";
    showFormStatus(error.message, "error");
  }
};

if (contactForm) {
  window.addEventListener("load", initializeTurnstile);
}

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Sending…";
  showFormStatus("");

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Your message could not be sent.");

    form.reset();
    showFormStatus(
      "Thanks — your message has been sent. I’ll be in touch soon.",
      "success",
    );
  } catch (error) {
    showFormStatus(
      error.message || "Your message could not be sent. Please try again.",
      "error",
    );
  } finally {
    if (window.turnstile && turnstileWidgetId !== undefined)
      window.turnstile.reset(turnstileWidgetId);
    button.disabled = false;
    button.innerHTML = "Send message <span>→</span>";
  }
});
