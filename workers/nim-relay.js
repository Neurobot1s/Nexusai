/* ══════════════════════════════════════════════════════════════
   NOVA · NIM CORS Relay (Cloudflare Worker)
   ──────────────────────────────────────────────────────────────
   integrate.api.nvidia.com sends no CORS headers, so browsers on
   origins like https://you.github.io cannot call it directly.
   This 30-line worker forwards your browser's request to NVIDIA
   and adds CORS headers to the response.

   Deploy (free tier is plenty):
     cd workers
     bunx wrangler deploy        # or: npx wrangler deploy

   Then in config.js set:
     RELAY_URL: "https://<your-worker>.<your-subdomain>.workers.dev/?url="

   Security notes:
     • The browser still holds the NVIDIA key; the worker only
       relays requests. Lock the worker down if you care — e.g.
       check an Origin allowlist (see ORIGIN_ALLOWLIST below) or
       move the key into a Worker secret instead.
   ══════════════════════════════════════════════════════════════ */

const ALLOWED_TARGET_HOST = "integrate.api.nvidia.com";

/* e.g. ["https://you.github.io", "http://localhost:3000"] — [] allows all. */
const ORIGIN_ALLOWLIST = [];

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
  headers["Access-Control-Allow-Origin"] =
    ORIGIN_ALLOWLIST.length === 0
      ? origin || "*"
      : ORIGIN_ALLOWLIST.includes(origin)
        ? origin
        : ORIGIN_ALLOWLIST[0];
  return headers;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return new Response("POST only", { status: 405, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    let target = url.searchParams.get("url");
    if (!target) {
      // Convenience: default to NIM chat completions if no ?url= given.
      target = "https://integrate.api.nvidia.com/v1/chat/completions";
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Invalid target URL", { status: 400, headers: corsHeaders(origin) });
    }
    if (targetUrl.host !== ALLOWED_TARGET_HOST) {
      return new Response("Target host not allowed", { status: 403, headers: corsHeaders(origin) });
    }

    // Forward the request, dropping hop-by-hop headers.
    const headers = new Headers();
    for (const name of ["authorization", "content-type", "accept"]) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }

    try {
      const upstream = await fetch(targetUrl.toString(), {
        method: "POST",
        headers,
        body: await request.text(),
      });
      const resHeaders = new Headers(corsHeaders(origin));
      const ct = upstream.headers.get("content-type");
      if (ct) resHeaders.set("Content-Type", ct);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: resHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ message: "Relay could not reach NVIDIA: " + (err && err.message) }),
        { status: 502, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }
  },
};
