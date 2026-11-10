# Cloud deployment notes

This fork runs the existing JARVIS browser interface with a cloud-hosted Gemini brain. The browser keeps the face, microphone and voice playback; the Cloudflare Worker calls Gemini server-side so the API key is never included in the browser bundle.

## First-stage scope

- `worker/index.mjs` provides `POST /api/chat` and `GET /api/health`.
- The Gemini key is read only from the Worker secret `GEMINI_API_KEY`.
- The default model is `gemini-3.6-flash`; free-tier quotas are limited and may change.
- The chat endpoint accepts bounded text prompts and short conversation history. It has no external tools yet: no Calendar, phone, files or account access.
- The frontend selects this backend with the build-time variable `VITE_BACKEND=cloud`.
- The app can be built and deployed by Cloudflare Workers Builds from GitHub. A local Node/Wrangler installation is not required for that route.

## Required security before deployment

**Do not expose the Worker publicly before Cloudflare Access is protecting it.** The same-origin check in the Worker is not authentication. Without Access, another visitor could call the endpoint and consume the Gemini quota.

Recommended order:

1. In Cloudflare, enable Zero Trust / Access.
2. Before deploying code, protect this Worker behind Access. If this is the only Worker in the account, the account-level **Protect all Workers → All traffic** setting can protect it before it exists. If the account already has other Workers, create the `jarvis-cloud` Worker first without deploying the app, protect that Worker, and only then connect its Git build.
3. Set the Access allow policy to the user's own email only. Use an available email one-time-PIN login method if that is the preferred sign-in option.
4. Confirm Access covers the entire Worker, including `/api/chat`, not just the home page.

Cloudflare's current Workers Access documentation supports protecting a Worker, including its `workers.dev` hostname, before making it available to visitors. See [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) and [workers.dev access controls](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## GitHub-based deployment (no local installation)

In Cloudflare Workers & Pages, connect the GitHub repository `tridubjr/jarvis` and select branch `maverick/gemini-cloud`, not `main`. Configure the build:

- Root directory: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build variable: `VITE_BACKEND=cloud`

Workers Builds runs the build and deploy commands on Cloudflare when the selected Git branch receives a commit. See [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) and [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Secrets

Add `GEMINI_API_KEY` in the Worker dashboard under Settings → Variables and Secrets, using the **Secret** type. Never put it in a `VITE_*` variable, GitHub file, commit, or browser setting. The browser must never receive this key.

Do not enable paid billing or paid model usage. If the provider asks for billing details or the selected model is not available on its free tier, stop and review before proceeding.

## Privacy warning

Google's Gemini API pricing documentation says content submitted through the free tier may be used to improve Google's products. Do not send passwords, verification codes, sensitive personal information, private calendar details, or confidential material through the free tier. Calendar integration is not included in this stage and requires a separate privacy and permission review.

## Planned work after the first secure deployment

1. Verify the app through the Access login on desktop and Android, with the gaming PC switched off.
2. Test microphone permission and browser speech recognition only when the user is ready for an audio test.
3. Check the available British English voices on the Pixel. The current system voice is the no-download default; Kokoro's neural British voices are a separate, larger browser download and should only be enabled after a performance test.
4. Design Google Calendar OAuth with narrow permissions and explicit confirmation before creating events.
