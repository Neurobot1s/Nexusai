/* ════════════════════════ window.NOVA_AI ═══════════════════════
   NVIDIA NIM client for NOVA (static build).

   window.NOVA_AI.sendMessage({ history, onState }) resolves with
   the assistant reply string, or throws a human-readable Error.

   Network strategy:
     1. Direct fetch to the NIM endpoint.
     2. If the browser blocks it (CORS) or it fails, retry through
        config.RELAY_URL, then config.PUBLIC_RELAY_URL.

   The model primary + fallback chain handles NIM model retirement
   (models are removed from the catalog over time and return 404).
   ══════════════════════════════════════════════════════════════ */

window.NOVA_AI = (() => {
  const CFG = window.NOVA_CONFIG;

  const RELAY_NOTE =
    "Browser to NVIDIA was blocked (CORS). Deploy the 30-second relay in " +
    "workers/nim-relay.js and set RELAY_URL in config.js. Technical cause is " +
    "visible in DevTools Console (F12).";

  function modelChain() {
    const chain = [CFG.MODEL].concat(CFG.MODEL_FALLBACKS || []);
    return chain.filter(function (m, i) { return m && chain.indexOf(m) === i; });
  }

  function buildUrl(relay) {
    if (!relay) return CFG.NVIDIA_NIM_ENDPOINT;
    var target = encodeURIComponent(CFG.NVIDIA_NIM_ENDPOINT);
    return relay.indexOf("?url=") !== -1 ? relay + target : relay + target;
  }

  function withTimeout(ms) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, ms);
    return { signal: c.signal, done: function () { clearTimeout(t); } };
  }

  /* Human-readable message from any error body shape. */
  function errorText(data, raw) {
    if (data && typeof data === "object") {
      if (typeof data.detail === "string") return data.detail;
      if (typeof data.message === "string") return data.message;
      if (data.error) {
        if (typeof data.error === "string") return data.error;
        if (typeof data.error.message === "string") return data.error.message;
      }
      if (typeof data.title === "string") return data.title;
    }
    return raw ? String(raw).slice(0, 220) : "";
  }

  function statusHint(status, detail) {
    switch (status) {
      case 401:
      case 403:
        return "NVIDIA rejected the API key (" + status + "). Check NVIDIA_API_KEY in config.js.";
      case 404:
        return "Model or endpoint not found (404)." + (detail ? " " + detail : "");
      case 429:
        return "NVIDIA NIM rate limit reached (429). Wait a moment and retry.";
      case 410:
        return "Model retired from NVIDIA NIM (410)." + (detail ? " " + detail : "");
      default:
        if (status >= 500) return "NVIDIA NIM service error (" + status + "). Try again shortly.";
        return "NVIDIA NIM returned HTTP " + status + "." + (detail ? " " + detail : "");
    }
  }

  function isCorsBlock(err) {
    return err instanceof TypeError && /fetch|network/i.test(err.message || "fetch");
  }

  function isTimeout(err) {
    return err && err.name === "AbortError";
  }

  /* One POST attempt to one URL with one model. */
  async function attempt(url, model, history, timeoutMs) {
    var guard = withTimeout(timeoutMs);
    var body = {
      model: model,
      messages: [{ role: "system", content: CFG.SYSTEM_PROMPT }].concat(history),
      temperature: CFG.TEMPERATURE,
      top_p: CFG.TOP_P,
      max_tokens: CFG.MAX_TOKENS,
      stream: false,
    };

    var res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + CFG.NVIDIA_API_KEY,
        },
        body: JSON.stringify(body),
        signal: guard.signal,
      });
    } finally {
      guard.done();
    }

    if (!res.ok) {
      var raw = "";
      try { raw = await res.text(); } catch (e) { raw = ""; }
      var parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
      var detail = errorText(parsed, raw);
      throw Object.assign(new Error(statusHint(res.status, detail)), {
        status: res.status,
      });
    }

    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    var content = data
      && data.choices
      && data.choices[0]
      && data.choices[0].message
      && typeof data.choices[0].message.content === "string"
      ? data.choices[0].message.content.trim()
      : "";

    if (!content) {
      throw new Error(
        "NIM returned an empty or unexpected response. Raw: " +
        JSON.stringify(data || {}).slice(0, 180)
      );
    }
    return content;
  }

  /* Try every relay until one passes the request through. */
  async function fetchWithRelayFallback(model, history, timeoutMs) {
    var relays = [];
    if (CFG.RELAY_URL) relays.push(CFG.RELAY_URL);
    if (CFG.PUBLIC_RELAY_URL) relays.push(CFG.PUBLIC_RELAY_URL);

    var lastErr = null;
    for (var i = 0; i < relays.length; i++) {
      try {
        return await attempt(buildUrl(relays[i]), model, history, timeoutMs);
      } catch (err) {
        lastErr = err;
        if (isTimeout(err)) throw err;
      }
    }
    throw lastErr || new Error(RELAY_NOTE);
  }

  /*
   * sendMessage: runs the full state machine and model fallback chain.
   * Returns the reply string. Throws on total failure.
   */
  async function sendMessage(opts) {
    var history = opts.history || [];
    var onState = opts.onState || function () {};
    if (!history.length) throw new Error("Empty conversation — nothing to send.");
    if (!CFG.NVIDIA_API_KEY || CFG.NVIDIA_API_KEY.indexOf("YOUR_") === 0) {
      throw new Error("NVIDIA_API_KEY is not set. Open config.js and add your key from build.nvidia.com.");
    }

    onState("thinking");

    var chain = modelChain();
    var lastErr = null;

    for (var i = 0; i < chain.length; i++) {
      var model = chain[i];
      try {
        try {
          return await attempt(CFG.NVIDIA_NIM_ENDPOINT, model, history, CFG.TIMEOUT_MS);
        } catch (err) {
          if (isCorsBlock(err)) {
            onState("thinking");
            return await fetchWithRelayFallback(model, history, CFG.TIMEOUT_MS);
          }
          throw err;
        }
      } catch (err) {
        lastErr = err;
        if (isTimeout(err)) throw err;
        // Direct AND relay both network-blocked → explain the fix, stop retrying.
        if (isCorsBlock(err)) throw new Error(RELAY_NOTE);
        // 401/403: key problem — retrying other models will not help.
        if (err.status === 401 || err.status === 403) throw err;
        // Otherwise (404 model gone, 5xx, empty) fall through to next model.
      }
    }
    throw lastErr || new Error("NVIDIA NIM request failed.");
  }

  /* Connection test used by the settings drawer. */
  async function testConnection(model) {
    var t0 = Date.now();
    var reply = await attempt(
      CFG.NVIDIA_NIM_ENDPOINT,
      model || CFG.MODEL,
      [{ role: "user", content: "Reply with exactly: NOVA ONLINE" }],
      20000
    );
    return { ms: Date.now() - t0, reply: reply.slice(0, 60) };
  }

  return {
    sendMessage: sendMessage,
    testConnection: testConnection,
    modelChain: modelChain,
  };
})();
