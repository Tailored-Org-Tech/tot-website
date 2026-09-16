# Tailored Organizational Technologies

A lightweight static website for Tailored Organizational Technologies LLC. It uses plain HTML, CSS, and JavaScript and can be deployed directly to Cloudflare Pages without a build step.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173` in a browser.

## Deploy to Cloudflare Pages

Connect this repository to a Pages project and use:

- **Framework preset:** None
- **Build command:** leave blank
- **Build output directory:** `/`

The contact form is intentionally presentation-only for this first version. Connect it to a form service or a Cloudflare Pages Function before accepting submissions.
