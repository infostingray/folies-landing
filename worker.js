/**
 * SWOT PORTAL — publish worker
 * Receives saves from dashboard.html and commits content.json to GitHub.
 * The GitHub token lives ONLY here (never in the browser).
 *
 * Setup (see SETUP.md):
 *   Variables to configure in the Worker settings:
 *     GH_TOKEN  — fine-grained GitHub token, Contents R/W, ONLY the folies-landing repo
 *     PASSCODE  — the passcode you give the client
 */

const REPO = "infostingray/folies-landing";
const FILE = "content.json";
const META_PIXEL_ID = "1644172166643880";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const url = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Bad JSON" }, 400);
    }

    // ---- Meta Conversions API relay (public; no passcode) ----
    if (url.pathname.endsWith("/fb")) {
      const ALLOWED_EVENTS = ["PageView", "QRScanWebsite", "QRScanWebsiteOffline", "ViewContent", "AddToWishlist", "Contact", "FindLocation"];
      if (!ALLOWED_EVENTS.includes(body.event_name)) return json({ ok: false, error: "Event not allowed" }, 400);
      if (!env.META_CAPI_TOKEN) return json({ ok: false, error: "CAPI not configured" }, 500);
      const payload = {
        data: [{
          event_name: body.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id ? String(body.event_id).slice(0, 64) : undefined,
          event_source_url: String(body.url || "https://ofolies.com/").slice(0, 512),
          action_source: "website",
          user_data: {
            client_ip_address: request.headers.get("CF-Connecting-IP") || undefined,
            client_user_agent: request.headers.get("User-Agent") || undefined,
            fbp: body.fbp || undefined,
            fbc: body.fbc || undefined,
          },
          custom_data: body.custom_data && typeof body.custom_data === "object" ? body.custom_data : undefined,
        }],
      };
      const fb = await fetch(
        `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      if (!fb.ok) {
        const err = await fb.text();
        return json({ ok: false, error: "Meta error: " + err.slice(0, 140) }, 502);
      }
      return json({ ok: true });
    }

    // constant-ish comparison
    if (!body.passcode || body.passcode !== env.PASSCODE) {
      return json({ ok: false, error: "Wrong passcode" }, 401);
    }

    if (url.pathname.endsWith("/auth")) {
      return json({ ok: true });
    }

    if (url.pathname.endsWith("/upload")) {
      const ALLOWED = ["assets/sunset.jpg", "assets/bar.jpg", "assets/terrace.jpg"];
      const GALLERY_RE = /^assets\/gallery-\d{10,16}\.jpg$/;
      if (!ALLOWED.includes(body.path) && !GALLERY_RE.test(body.path))
        return json({ ok: false, error: "Path not allowed" }, 400);
      if (typeof body.base64 !== "string" || body.base64.length < 100) return json({ ok: false, error: "No image" }, 400);
      if (body.base64.length > 4_500_000) return json({ ok: false, error: "Image too large" }, 400);

      const gh2 = (path, init = {}) =>
        fetch(`https://api.github.com/repos/${REPO}/${path}`, {
          ...init,
          headers: {
            Authorization: `token ${env.GH_TOKEN}`,
            "Content-Type": "application/json",
            "User-Agent": "swot-portal-worker",
            ...(init.headers || {}),
          },
        });

      let psha = undefined;
      const pcur = await gh2(`contents/${body.path}`);
      if (pcur.ok) psha = (await pcur.json()).sha;

      const pput = await gh2(`contents/${body.path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `Photo update via Swot Portal: ${body.path}`,
          content: body.base64,
          branch: "main",
          ...(psha ? { sha: psha } : {}),
        }),
      });
      if (!pput.ok) {
        const err = await pput.text();
        return json({ ok: false, error: "GitHub error: " + err.slice(0, 140) }, 502);
      }
      return json({ ok: true });
    }

    if (url.pathname.endsWith("/save")) {
      if (!body.content || typeof body.content !== "object") {
        return json({ ok: false, error: "No content" }, 400);
      }
      // basic sanity: required top-level keys
      for (const k of ["contact", "hours", "events", "menu"]) {
        if (!(k in body.content)) return json({ ok: false, error: "Malformed content: missing " + k }, 400);
      }

      const gh = (path, init = {}) =>
        fetch(`https://api.github.com/repos/${REPO}/${path}`, {
          ...init,
          headers: {
            Authorization: `token ${env.GH_TOKEN}`,
            "Content-Type": "application/json",
            "User-Agent": "swot-portal-worker",
            ...(init.headers || {}),
          },
        });

      // current sha (file may not exist on first run)
      let sha = undefined;
      const cur = await gh(`contents/${FILE}`);
      if (cur.ok) sha = (await cur.json()).sha;

      const pretty = JSON.stringify(body.content, null, 2);
      const b64 = btoa(unescape(encodeURIComponent(pretty)));

      const put = await gh(`contents/${FILE}`, {
        method: "PUT",
        body: JSON.stringify({
          message: "Content update via Swot Portal",
          content: b64,
          branch: "main",
          ...(sha ? { sha } : {}),
        }),
      });

      if (!put.ok) {
        const err = await put.text();
        return json({ ok: false, error: "GitHub error: " + err.slice(0, 140) }, 502);
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown endpoint" }, 404);
  },
};
