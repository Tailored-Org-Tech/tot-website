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

The contact form posts to a Cloudflare Pages Function, validates visitors with Cloudflare Turnstile, and sends submissions through Resend to the Zoho-hosted `inquire@totsoftware.com` inbox.

## Configure the contact form

The Resend domain and credentials are configured outside this repository. Zoho remains the mail provider; do not change its DNS records or enable Cloudflare Email Routing for this form.

In the Cloudflare Pages project, configure the following for the **Production** environment:

| Name | Type | Value |
| --- | --- | --- |
| `RESEND_API_KEY` | Encrypted secret | Resend key restricted to sending from `forms.totsoftware.com` |
| `TURNSTILE_SECRET_KEY` | Encrypted secret | Secret for the existing Turnstile widget |
| `TURNSTILE_SITE_KEY` | Plain text | Public site key for the existing Turnstile widget |
| `CONTACT_FROM_EMAIL` | Plain text | `TOT Website <contact@forms.totsoftware.com>` |
| `CONTACT_TO_EMAIL` | Plain text | `inquire@totsoftware.com` |

`TURNSTILE_SITE_KEY` is returned to the browser by the contact endpoint because it is a public identifier. The Turnstile and Resend secrets remain server-only. The endpoint accepts Turnstile tokens only when their action is `contact` and their hostname is `totsoftware.com` or `www.totsoftware.com`.

The `CONTACT_TO_EMAIL` value is read only from the server environment; visitors cannot select or override the recipient. Redeploy the Pages project after adding or changing variables.

For local Turnstile testing, use Cloudflare's documented test keys and account for the production-only hostname and `contact` action validation.

## Test

```bash
npm test
```
