# Cloud deployment notes

This repository is being adapted to run with a cloud-hosted Gemini brain. The browser remains the face and voice; the Worker is the private server-side boundary that keeps the Gemini API key out of the browser bundle.

## Current first-stage scope

- `worker/index.mjs` provides a same-origin `POST /api/chat` endpoint and a basic `GET /api/health` endpoint.
- The Gemini key is read only from the Worker environment as `GEMINI_API_KEY`; it must never be placed in a `VITE_*` variable or committed to Git.
- The Worker uses the free-tier-compatible `gemini-3.6-flash` model by default. The model can be changed with the server-side `GEMINI_MODEL` variable.
- The chat endpoint accepts a bounded text prompt and a short conversation history. It does not expose tools or account integrations yet.
- The React app can select this backend with the build-time setting `VITE_BACKEND=cloud`.

## Before deploying publicly

**Do not deploy this Worker as a public assistant endpoint until the site is protected by Cloudflare Access or equivalent authentication.** The same-origin check is a useful browser boundary, not user authentication; a public visitor could otherwise consume the Gemini quota.

Set the Gemini API key as a Worker secret, never as a plain variable or frontend build variable:

```sh
npx wrangler secret put GEMINI_API_KEY
```

Optional model setting:

```sh
npx wrangler secret put GEMINI_MODEL
```

Use the Cloudflare dashboard to configure Access so the entire hostname, including `/api/*`, requires your login. Verify this protection before publishing or sharing the URL.

## Privacy and free-tier warning

Google's Gemini API pricing documentation says free-tier content may be used to improve Google's products. Do not send sensitive personal information, passwords, private calendar details, or confidential material through the free tier. Calendar integration is deliberately not included in this first stage and will need a separate privacy and permission review.

## Planned next steps

1. Connect the existing React voice interface to `/api/chat`.
2. Add authenticated Cloudflare deployment and verify the app works with the PC off.
3. Only then design Google Calendar OAuth with narrow permissions and explicit confirmation before creating events.
