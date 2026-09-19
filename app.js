/* ═══════════════════════ window.NOVA_APP ═══════════════════════
   Orchestrator: chat store (localStorage) + NIM flow + 3D states.
   ══════════════════════════════════════════════════════════════ */

import { NovaScene, NODE_LABELS } from "./three-scene.js";

window.NOVA_APP = (() => {
  const CFG = window.NOVA_CONFIG;
  const UI = window.NOVA_UI;
  const AI = window.NOVA_AI;
  const els = UI.els;

  /* ── Store: conversations in localStorage ─────────────────── */

  const CONV_KEY = "nova.chat.conversations.v1";
  const ACTIVE_KEY = "nova.chat.active.v1";
  const MAX_CONVERSATIONS = 30;
  const REVEAL_MAX_MS = 2400;
  const REVEAL_PER_CHAR = 6;

  const store = {
    conversations: [],
    activeId: null,
    busy: false,
    error: null,
    /** ids of assistant messages whose reveal animation is running */
    revealing: new Set(),
  };

  function newId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      const raw = localStorage.getItem(CONV_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        store.conversations = parsed.filter(
          (c) => c && typeof c.id === "string" && Array.isArray(c.messages)
        ).slice(0, MAX_CONVERSATIONS);
      }
    } catch (e) { /* corrupted store — start fresh */ }

    if (store.conversations.length === 0) {
      store.conversations = [{ id: newId("c"), title: "New chat", ts: Date.now(), messages: [] }];
    }
    try {
      const saved = localStorage.getItem(ACTIVE_KEY);
      store.activeId =
        saved && store.conversations.some((c) => c.id === saved)
          ? saved
          : store.conversations[0].id;
    } catch (e) {
      store.activeId = store.conversations[0].id;
    }
  }

  let saveTimer = null;
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(CONV_KEY, JSON.stringify(store.conversations.slice(0, MAX_CONVERSATIONS)));
        if (store.activeId) localStorage.setItem(ACTIVE_KEY, store.activeId);
      } catch (e) { /* storage unavailable — in-memory only */ }
    }, 250);
  }

  const activeConv = () =>
    store.conversations.find((c) => c.id === store.activeId) || null;

  function mutateActive(fn) {
    const idx = store.conversations.findIndex((c) => c.id === store.activeId);
    if (idx === -1) return;
    store.conversations[idx] = fn(store.conversations[idx]);
    persist();
  }

  /* ── Scene wiring ─────────────────────────────────────────── */

  let scene = null;
  const NODE_POP_MS = 2600;
  let nodePopTimer = null;
  let idleTimer = null;

  function initScene() {
    const mount = els.scene;
    scene = new NovaScene(mount, {
      onStateChange: (state) => UI.setHoloState(state),
      onCoreClick: () => scene && scene.pulse(),
      onDataNodeClick: (i) => {
        const label = NODE_LABELS[i % NODE_LABELS.length] || ("Node " + (i + 1));
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2 - 120;
        UI.showNodePop(label, cx, cy);
        if (nodePopTimer) clearTimeout(nodePopTimer);
        nodePopTimer = setTimeout(UI.hideNodePop, NODE_POP_MS);
      },
    });
    UI.bootDone();
  }

  function setStateSafe(state) {
    if (scene) scene.setState(state);
  }

  /* ── Reveal (streaming-style) ─────────────────────────────── */

  function revealAssistant(id, content) {
    store.revealing.add(id);
    const total = content.length;
    const duration = Math.min(REVEAL_MAX_MS, 500 + total * REVEAL_PER_CHAR);
    const start = performance.now();

    UI.setStreamingCaret(id, true);
    const step = () => {
      if (!store.revealing.has(id)) {
        UI.updateMessageContent(id, content);
        UI.setStreamingCaret(id, false);
        return;
      }
      const p = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 2);
      const chars = Math.round(eased * total);
      UI.updateMessageContent(id, content.slice(0, chars));
      if (scene) scene.streamTick();
      if (p < 1) requestAnimationFrame(step);
      else {
        UI.setStreamingCaret(id, false);
        store.revealing.delete(id);
      }
    };
    requestAnimationFrame(step);
  }

  function finishRevealNow() {
    for (const id of Array.from(store.revealing)) store.revealing.delete(id);
  }

  /* ── Core send flow ───────────────────────────────────────── */

  function historyForApi() {
    const conv = activeConv();
    if (!conv) return [];
    return conv.messages
      .filter((m) => !store.revealing.has(m.id))
      .slice(-CFG.MAX_HISTORY_SENT)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function runTurn(history, callbacks) {
    store.busy = true;
    store.error = null;
    UI.setError(null);
    UI.setBusy(true);
    UI.showTyping();
    callbacks.onThinking();
    try {
      const reply = await AI.sendMessage({ history, onState: callbacks.onState });
      return reply;
    } catch (err) {
      const message = err && err.message ? err.message : "Unexpected failure talking to NVIDIA NIM.";
      store.error = message;
      UI.setError(message);
      callbacks.onError();
      return null;
    } finally {
      store.busy = false;
      UI.setBusy(false);
      UI.hideTyping();
    }
  }

  function afterReply(reply) {
    const conv = activeConv();
    if (!conv) return;
    const msg = { id: newId("a"), role: "assistant", content: reply, ts: Date.now() };
    mutateActive((c) => ({ ...c, ts: Date.now(), messages: [...c.messages, msg] }));
    UI.addMessage(msg);
    if (scene) scene.pulse();
    if (stopRequested) {
      stopRequested = false;
      setStateSafe("idle");
      return;
    }
    revealAssistant(msg.id, reply);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => setStateSafe("idle"),
      Math.min(REVEAL_MAX_MS, 500 + reply.length * REVEAL_PER_CHAR) + 200
    );
  }

  function scheduleIdle(delay) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setStateSafe("idle"), delay);
  }

  async function send(text) {
    const content = (text || "").trim();
    if (!content || store.busy) return;

    setStateSafe("listening");

    const userMsg = { id: newId("u"), role: "user", content, ts: Date.now() };
    mutateActive((c) => ({
      ...c,
      title: c.messages.length === 0 ? content.slice(0, 42) + (content.length > 42 ? "…" : "") : c.title,
      ts: Date.now(),
      messages: [...c.messages, userMsg],
    }));
    UI.addMessage(userMsg);
    renderConversations();

    const callbacks = {
      onThinking: () => setStateSafe("thinking"),
      onResponding: () => setStateSafe("responding"),
      onError: () => setStateSafe("error"),
      onState: () => {},
    };

    const history = historyForApi();
    const reply = await runTurn(history, callbacks);

    if (reply !== null) {
      setStateSafe("responding");
      afterReply(reply);
    } else {
      scheduleIdle(1400);
    }
  }

  async function regenerate() {
    if (store.busy) return;
    const conv = activeConv();
    if (!conv) return;
    let cut = conv.messages.length;
    while (cut > 0 && conv.messages[cut - 1].role === "assistant") cut--;
    if (cut === 0) return;

    setStateSafe("thinking");
    mutateActive((c) => ({ ...c, messages: c.messages.slice(0, cut) }));
    UI.renderAllMessages(activeConv().messages);

    const callbacks = {
      onThinking: () => setStateSafe("thinking"),
      onResponding: () => setStateSafe("responding"),
      onError: () => setStateSafe("error"),
      onState: () => {},
    };
    const reply = await runTurn(activeConv().messages.slice(-CFG.MAX_HISTORY_SENT), callbacks);

    if (reply !== null) {
      setStateSafe("responding");
      afterReply(reply);
    } else {
      scheduleIdle(1400);
    }
  }

  let stopRequested = false;
  function stop() {
    finishRevealNow();
    if (store.busy) stopRequested = true;
    else scheduleIdle(200);
  }

  /* ── Conversation controls ────────────────────────────────── */

  function newChat() {
    const conv = { id: newId("c"), title: "New chat", ts: Date.now(), messages: [] };
    store.conversations.unshift(conv);
    if (store.conversations.length > MAX_CONVERSATIONS) store.conversations.pop();
    store.activeId = conv.id;
    store.error = null;
    UI.setError(null);
    UI.clearMessages();
    persist();
    renderConversations();
  }

  function openConversation(id) {
    store.activeId = id;
    store.error = null;
    UI.setError(null);
    UI.renderAllMessages(activeConv().messages);
    persist();
    renderConversations();
    if (window.innerWidth <= 900) UI.closeSide();
  }

  function deleteConversation(id) {
    store.conversations = store.conversations.filter((c) => c.id !== id);
    if (store.conversations.length === 0) {
      store.conversations = [{ id: newId("c"), title: "New chat", ts: Date.now(), messages: [] }];
    }
    if (id === store.activeId) store.activeId = store.conversations[0].id;
    UI.renderAllMessages(activeConv().messages);
    persist();
    renderConversations();
  }

  function renderConversations() {
    UI.renderConversations(store.conversations, store.activeId, {
      onOpen: openConversation,
      onDelete: deleteConversation,
    });
  }

  /* ── Static single-file reveal (used after reload) ────────── */

  function renderInitial() {
    const conv = activeConv();
    UI.renderAllMessages(conv ? conv.messages : []);
    renderConversations();
  }

  /* ── Composer & events ────────────────────────────────────── */

  function wire() {
    UI.autoGrow();
    els.composer.addEventListener("input", UI.autoGrow);
    els.composer.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    els.btnSend.addEventListener("click", submit);
    els.btnStop.addEventListener("click", stop);

    /* Mic + attach are explicit UI demos — say so when clicked. */
    els.btnMic.addEventListener("click", () => {
      els.btnMic.classList.toggle("composer__btn--mic-on");
      UI.setError("Voice input is UI-only in this build (press again to dismiss).");
      if (!els.btnMic.classList.contains("composer__btn--mic-on")) UI.setError(null);
    });
    els.btnAttach.addEventListener("click", () => {
      UI.setError("File attachment is UI-only in this build.");
      setTimeout(() => { if (!store.busy) UI.setError(null); }, 2200);
    });

    els.btnNewChat.addEventListener("click", newChat);
    els.btnMenu.addEventListener("click", () => UI.openSide());
    els.drawerVeil.addEventListener("click", () => UI.closeSide());
    els.btnSettings.addEventListener("click", () => UI.openSettings());
    els.btnSettingsClose.addEventListener("click", () => UI.closeSettings());
    els.settingsVeil.addEventListener("click", () => UI.closeSettings());

    /* Side panel toggles */
    els.toggleMotion.addEventListener("click", () => {
      const on = els.toggleMotion.getAttribute("aria-checked") === "true";
      els.toggleMotion.setAttribute("aria-checked", String(!on));
      document.documentElement.classList.toggle("reduce-motion", on);
      try { localStorage.setItem("nova.motion.reduce", on ? "1" : "0"); } catch (e) {}
      if (scene) scene.paused = on ? scene.paused : scene.paused;
    });
    els.toggleSound.addEventListener("click", () => {
      const on = els.toggleSound.getAttribute("aria-checked") === "true";
      els.toggleSound.setAttribute("aria-checked", String(!on));
      try { localStorage.setItem("nova.sound.typing", on ? "1" : "0"); } catch (e) {}
    });
    els.toggleSound2.addEventListener("click", () => {
      const on = els.toggleSound2.getAttribute("aria-checked") === "true";
      els.toggleSound2.setAttribute("aria-checked", String(!on));
      try { localStorage.setItem("nova.sound.design", on ? "1" : "0"); } catch (e) {}
    });

    /* Connection test */
    els.btnTest.addEventListener("click", async () => {
      els.btnTest.disabled = true;
      els.testResult.hidden = false;
      els.testResult.className = "settings__result mono-caps";
      els.testResult.textContent = "TESTING…";
      const model = els.setModel.value.trim() || CFG.MODEL;
      try {
        const r = await AI.testConnection(model);
        els.testResult.classList.add("settings__result--ok");
        els.testResult.textContent = "OK · " + r.ms + "ms · " + r.reply;
      } catch (err) {
        els.testResult.classList.add("settings__result--err");
        els.testResult.textContent = (err && err.message ? err.message : "FAILED") +
          "\nTip: if this is a CORS failure, the relay path is tested automatically during normal chat.";
      } finally {
        els.btnTest.disabled = false;
      }
    });

    /* Restore persisted preferences */
    try {
      if (localStorage.getItem("nova.motion.reduce") === "1") {
        els.toggleMotion.setAttribute("aria-checked", "true");
        document.documentElement.classList.add("reduce-motion");
      } else {
        els.toggleMotion.setAttribute("aria-checked", "false");
      }
      if (localStorage.getItem("nova.sound.typing") === "1") {
        els.toggleSound.setAttribute("aria-checked", "true");
      }
      if (localStorage.getItem("nova.sound.design") === "0") {
        els.toggleSound2.setAttribute("aria-checked", "false");
      }
    } catch (e) { /* prefs are best-effort */ }

    /* Mobile: show the menu button, panel starts closed */
    const mq = window.matchMedia("(max-width: 900px)");
    const applyMq = () => {
      els.btnMenu.hidden = !mq.matches;
      els.side.classList.remove("side--open");
      els.drawerVeil.hidden = true;
      els.drawerVeil.classList.remove("drawer-veil--show");
    };
    mq.addEventListener("change", applyMq);
    applyMq();
  }

  function submit() {
    const text = els.composer.value;
    if (!text.trim()) return;
    els.composer.value = "";
    UI.autoGrow();
    send(text);
  }

  /* ── Boot ─────────────────────────────────────────────────── */

  function boot() {
    load();
    renderInitial();
    wire();
    initScene();

    UI.setStatus("ok", "CONNECTED");
    UI.setModelInfo(CFG.MODEL, "NVIDIA NIM · CLOUD");

    /* Real connectivity probe: tiny direct request to the catalog. */
    fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: "Bearer " + CFG.NVIDIA_API_KEY },
    })
      .then((r) => {
        if (r.ok) UI.setStatus("ok", "CONNECTED");
        else if (r.status === 401 || r.status === 403) UI.setStatus("err", "KEY REJECTED");
        else UI.setStatus("err", "HTTP " + r.status);
      })
      .catch(() => {
        /* CORS or offline — chat itself will try the relay path. */
        UI.setStatus("off", "READY · RELAY");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  return { send, regenerate, stop, newChat, openConversation, deleteConversation };
})();
