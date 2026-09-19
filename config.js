/* ══════════════════════════════════════════════════════════════
   NOVA · CONFIGURATION  —  EDIT THIS FILE FIRST
   ──────────────────────────────────────────────────────────────
   NVIDIA NIM connection for the static build. The API key lives
   here (client-side) by design for this personal deployment:

   ⚠  Treat this key as PUBLIC. Anyone who loads the site can
      read it and spend your quota. Use a key with a hard spend
      limit, and rotate it if it leaks. Never reuse a personal/
      production key here.
   ══════════════════════════════════════════════════════════════ */

window.NOVA_CONFIG = {
  /* Your NVIDIA API key (build.nvidia.com). */
  NVIDIA_API_KEY: "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",

  /* NVIDIA NIM chat-completions endpoint. */
  NVIDIA_NIM_ENDPOINT: "https://integrate.api.nvidia.com/v1/chat/completions",

  /*
   * Primary model + fallback chain — all NVIDIA-provided models,
   * verified live against this endpoint (Sep 2026). If the primary
   * 404s (models retire on NIM) or errors, the next is tried.
   */
  MODEL: "nvidia/nemotron-3-super-120b-a12b",
  MODEL_FALLBACKS: [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  ],

  /*
   * Optional CORS relay for GitHub Pages (see workers/nim-relay.js).
   * integrate.api.nvidia.com currently returns no CORS headers for
   * browser origins. NOVA always tries the direct call first; if the
   * browser blocks it, it retries through this relay. Deploy your own
   * worker and paste the URL here — e.g.
   *   "https://nim-relay.your-name.workers.dev/?url="
   * Leave as-is to auto-fallback to the public relay (may rate-limit).
   */
  RELAY_URL: "",
  PUBLIC_RELAY_URL: "https://api.cors.lol/?url=",

  /* Generation parameters. */
  MAX_TOKENS: 1200,
  TEMPERATURE: 0.6,
  TOP_P: 0.9,
  TIMEOUT_MS: 30000,

  /* Identity + behavior. Change AI_NAME to rename the assistant. */
  AI_NAME: "NOVA",
  SYSTEM_PROMPT:
    "You are NOVA, a futuristic AI entity living inside a holographic 3D core. " +
    "Personality: concise, precise, warm, forward-thinking. Explain complex things simply. " +
    "You help with coding, brainstorming and general questions. Keep answers short unless " +
    "asked for detail. Use markdown for structure and fenced code blocks for code. " +
    "Never claim an API call or action succeeded unless it actually did.",
  MAX_HISTORY_SENT: 16, // conversation turns sent as model context
};
