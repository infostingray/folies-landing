# Swot Portal — Setup (one time, ~7 minutes)

The dashboard is already live at:
**https://infostingray.github.io/folies-landing/dashboard.html**

It just needs its engine — a free Cloudflare Worker that holds the GitHub key
and publishes the client's edits. The key never touches the client's browser.

## 1. Create a SAFE GitHub token (2 min)
Don't reuse the chat token. Make a scoped one:
1. github.com/settings/personal-access-tokens → **Generate new token** (fine-grained)
2. Repository access → **Only select repositories** → `folies-landing`
3. Permissions → Repository permissions → **Contents: Read and write** (nothing else)
4. Expiry: 90 days (renew when it expires)
5. Copy the token

## 2. Deploy the Worker (3 min)
1. dash.cloudflare.com → sign up free → **Workers & Pages** → **Create Worker**
2. Name it e.g. `ofolies-portal` → Deploy
3. **Edit code** → delete the sample → paste all of `worker.js` from this repo → **Deploy**
4. Worker → **Settings → Variables and Secrets** → add two secrets:
   - `GH_TOKEN` = the token from step 1
   - `PASSCODE` = the passcode you'll give the client (e.g. `sunset2026`)
5. Copy the worker URL, e.g. `https://ofolies-portal.rami.workers.dev`

## 3. Connect the dashboard (1 min)
In `dashboard.html`, first script block:
```js
var WORKER_URL = "REPLACE_WITH_YOUR_WORKER_URL";
```
→ replace with your worker URL (no trailing slash). Commit.
(Or just paste the URL in the chat and I'll wire it.)

## 4. Hand off to the client
Send them:
- Link: https://infostingray.github.io/folies-landing/dashboard.html
- Passcode: whatever you set in step 2

They log in → edit events, menu prices, hours, announcement, contact →
**Publish changes** → live in ~1 minute.

## Safety net
Every publish is a git commit ("Content update via Swot Portal").
If the client breaks something: repo → Commits → find their commit → revert.
Full history, nothing is ever lost.

## Scaling to more clients (Phase 2)
Per client: 1 repo + 1 worker (or one worker with a passcode→repo map).
Same dashboard shell, re-branded per client. Ask Claude when ready.
