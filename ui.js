/* ═══════════════════════ window.NOVA_UI ════════════════════════
   DOM layer for NOVA (static build). No frameworks.
   All user/AI text is inserted via textContent — XSS-safe.
   ══════════════════════════════════════════════════════════════ */

window.NOVA_UI = (() => {
  const CFG = window.NOVA_CONFIG;

  const $ = (id) => document.getElementById(id);
  const els = {
    scene: $("scene"), boot: $("boot"),
    app: $("app"),
    btnMenu: $("btn-menu"), btnSettings: $("btn-settings"),
    statusChip: $("status-chip"), statusDot: $("status-dot"), statusLabel: $("status-label"),
    drawerVeil: $("drawer-veil"), side: $("side"),
    btnNewChat: $("btn-new-chat"), convos: $("convos"),
    modelName: $("model-name"), modelMeta: $("model-meta"),
    toggleMotion: $("toggle-motion"), toggleSound: $("toggle-sound"), toggleSound2: $("toggle-sound2"),
    holo: $("holo"), holoState: $("holo-state"),
    hudHint: $("hud-hint"),
    chatScroll: $("chat-scroll"), chatEmpty: $("chat-empty"),
    msgs: $("msgs"), chatError: $("chat-error"), errorText: $("error-text"),
    composer: $("composer"), btnSend: $("btn-send"), btnStop: $("btn-stop"),
    btnMic: $("btn-mic"), btnAttach: $("btn-attach"),
    nodePop: $("node-pop"), nodePopLabel: $("node-pop-label"),
    settingsVeil: $("settings-veil"), settings: $("settings"),
    btnSettingsClose: $("btn-settings-close"),
    setEndpoint: $("set-endpoint"), setModel: $("set-model"), setRelay: $("set-relay"),
    setModelHint: $("set-model-hint"),
    btnTest: $("btn-test"), testResult: $("test-result"),
    emptyTitle: $("empty-title"), brandName: $("brand-name"),
  };

  /* Apply identity from config */
  if (CFG.AI_NAME) {
    els.brandName.textContent = CFG.AI_NAME;
    els.emptyTitle.textContent = CFG.AI_NAME + " is online.";
    els.composer.placeholder = "Message " + CFG.AI_NAME + "…";
    document.title = CFG.AI_NAME + " · 3D AI Interface";
  }

  /* ── Markdown (safe, dependency-free) ─────────────────────── */

  function inlineMd(src, out) {
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g;
    let last = 0, m;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) out.push(document.createTextNode(src.slice(last, m.index)));
      const tok = m[0];
      if (tok.startsWith("`")) {
        const code = document.createElement("code");
        code.textContent = tok.slice(1, -1);
        out.push(code);
      } else if (tok.startsWith("**")) {
        const b = document.createElement("strong");
        b.textContent = tok.slice(2, -2);
        out.push(b);
      } else if (tok.startsWith("*")) {
        const i = document.createElement("em");
        i.textContent = tok.slice(1, -1);
        out.push(i);
      } else {
        const a = document.createElement("a");
        a.target = "_blank";
        a.rel = "noreferrer";
        const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
        if (mm) { a.href = mm[2]; a.textContent = mm[1]; }
        else { a.href = tok; a.textContent = tok; }
        out.push(a);
      }
      last = m.index + tok.length;
    }
    if (last < src.length) out.push(document.createTextNode(src.slice(last)));
  }

  /* Render inline markdown nodes into a parent element. */
  function appendInline(parent, src) {
    const out = [];
    inlineMd(src, out);
    for (const n of out) parent.appendChild(n);
  }

  function makeCodeBlock(lang, code) {
    const wrap = document.createElement("div");
    wrap.className = "code";
    const bar = document.createElement("div");
    bar.className = "code__bar";
    const l = document.createElement("span");
    l.className = "code__lang mono-caps";
    l.textContent = lang || "code";
    const copy = document.createElement("button");
    copy.className = "code__copy mono-caps";
    copy.type = "button";
    copy.textContent = "COPY";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "COPIED";
        setTimeout(() => { copy.textContent = "COPY"; }, 1600);
      } catch (e) { /* clipboard unavailable */ }
    });
    bar.appendChild(l); bar.appendChild(copy);
    const pre = document.createElement("pre");
    const c = document.createElement("code");
    c.textContent = code;
    pre.appendChild(c);
    wrap.appendChild(bar); wrap.appendChild(pre);
    return wrap;
  }

  function renderTextBlockInto(container, text) {
    const lines = text.split("\n");
    let list = null, ordered = false;

    const flush = () => {
      if (!list) return;
      container.appendChild(list);
      list = null; ordered = false;
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      const h = /^(#{1,3})\s+(.*)$/.exec(line);
      const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
      const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);

      if (h) {
        flush();
        addHeading(container, Math.min(3, h[1].length), h[2]);
      } else if (ul) {
        if (!list || ordered) { flush(); list = document.createElement("ul"); }
        const li = document.createElement("li");
        appendInline(li, ul[1]);
        list.appendChild(li);
      } else if (ol) {
        if (!list || !ordered) { flush(); list = document.createElement("ol"); ordered = true; }
        const li = document.createElement("li");
        appendInline(li, ol[2]);
        list.appendChild(li);
      } else if (line.trim() === "") {
        flush();
      } else {
        flush();
        const p = document.createElement("p");
        appendInline(p, line);
        container.appendChild(p);
      }
    }
    flush();
  }

  /* Simplified, correct heading renderer (used by renderBlocksInto). */
  function addHeading(container, level, src) {
    const el = document.createElement("h" + level);
    appendInline(el, src);
    container.appendChild(el);
  }

  function renderMarkdown(text) {
    const frag = document.createDocumentFragment();
    const fenceRe = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
    let last = 0, m;
    while ((m = fenceRe.exec(text)) !== null) {
      if (m.index > last) renderTextBlockInto(frag, text.slice(last, m.index));
      frag.appendChild(makeCodeBlock(m[1], m[2].replace(/\n$/, "")));
      last = m.index + m[0].length;
    }
    if (last < text.length) renderTextBlockInto(frag, text.slice(last));
    return frag;
  }

  /* ── Messages ─────────────────────────────────────────────── */

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function buildMessage(msg) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (msg.role === "user" ? "msg--user" : "msg--ai");
    wrap.dataset.id = msg.id;

    const head = document.createElement("div");
    head.className = "msg__head";
    const role = document.createElement("span");
    role.className = "msg__role mono-caps" + (msg.role === "assistant" ? " msg__role--accent" : "");
    role.textContent = msg.role === "user" ? "YOU" : CFG.AI_NAME;
    const time = document.createElement("span");
    time.className = "msg__time";
    time.textContent = fmtTime(msg.ts);
    head.appendChild(role); head.appendChild(time);
    wrap.appendChild(head);

    const bubble = document.createElement("div");
    bubble.className = "msg__bubble";
    if (msg.role === "user") bubble.textContent = msg.content;
    else bubble.appendChild(renderMarkdown(msg.content));
    wrap.appendChild(bubble);

    if (msg.role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "msg__actions";
      const copy = document.createElement("button");
      copy.className = "act";
      copy.type = "button";
      copy.textContent = "COPY";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(msg.content);
          copy.textContent = "COPIED";
          setTimeout(() => { copy.textContent = "COPY"; }, 1500);
        } catch (e) { /* ignore */ }
      });
      const regen = document.createElement("button");
      regen.className = "act";
      regen.type = "button";
      regen.textContent = "REGENERATE";
      regen.addEventListener("click", () => {
        if (window.NOVA_APP) window.NOVA_APP.regenerate();
      });
      actions.appendChild(copy); actions.appendChild(regen);
      wrap.appendChild(actions);
    }
    return wrap;
  }

  function addMessage(msg) {
    els.chatEmpty.classList.add("chat__empty--hidden");
    els.msgs.appendChild(buildMessage(msg));
    scrollDown();
  }

  function updateMessageContent(id, content) {
    const el = els.msgs.querySelector('[data-id="' + id + '"]');
    if (!el) return;
    const bubble = el.querySelector(".msg__bubble");
    bubble.textContent = "";
    bubble.appendChild(renderMarkdown(content));
    scrollDown();
  }

  function removeMessage(id) {
    const el = els.msgs.querySelector('[data-id="' + id + '"]');
    if (el) el.remove();
    if (!els.msgs.children.length) els.chatEmpty.classList.remove("chat__empty--hidden");
  }

  function clearMessages() {
    els.msgs.textContent = "";
    els.chatEmpty.classList.remove("chat__empty--hidden");
  }

  function renderAllMessages(messages) {
    els.msgs.textContent = "";
    for (const m of messages) els.msgs.appendChild(buildMessage(m));
    if (messages.length) els.chatEmpty.classList.add("chat__empty--hidden");
    else els.chatEmpty.classList.remove("chat__empty--hidden");
    scrollDown();
  }

  function setStreamingCaret(id, on) {
    const el = els.msgs.querySelector('[data-id="' + id + '"] .msg__bubble');
    if (!el) return;
    if (on) el.classList.add("msg__bubble--caret");
    else el.classList.remove("msg__bubble--caret");
  }

  function showTyping() {
    hideTyping();
    els.chatEmpty.classList.add("chat__empty--hidden");
    typingEl = document.createElement("div");
    typingEl.className = "msg msg--ai";
    typingEl.id = "typing-row";
    const bubble = document.createElement("div");
    bubble.className = "msg__bubble typing";
    bubble.innerHTML = "<span></span><span></span><span></span>";
    typingEl.appendChild(bubble);
    els.msgs.appendChild(typingEl);
    scrollDown();
  }
  function hideTyping() {
    const t = document.getElementById("typing-row");
    if (t) t.remove();
    typingEl = null;
  }

  function scrollDown() {
    requestAnimationFrame(() => {
      els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    });
  }

  function setError(msg) {
    if (msg) {
      els.errorText.textContent = msg;
      els.chatError.hidden = false;
    } else {
      els.chatError.hidden = true;
    }
  }

  /* ── Status surfaces ──────────────────────────────────────── */

  function setStatus(kind, label) {
    els.statusChip.classList.remove("status--ok", "status--err", "status--off");
    els.statusChip.classList.add("status--" + kind);
    els.statusLabel.textContent = label;
  }

  function setHoloState(state) {
    els.holoState.textContent = state.toUpperCase();
    els.holoState.classList.remove("holo__state--swap");
    void els.holoState.offsetWidth; // restart animation
    els.holoState.classList.add("holo__state--swap");
  }

  function setModelInfo(name, meta) {
    els.modelName.textContent = name;
    els.modelMeta.textContent = meta;
    els.setModelHint.textContent =
      "Primary model. Fallbacks: " + window.NOVA_AI.modelChain().slice(1).join(", ");
  }

  function bootDone() {
    els.boot.classList.add("boot--done");
    setTimeout(() => { els.hudHint.classList.add("hud-hint--fade"); }, 7000);
  }

  /* ── Conversations ────────────────────────────────────────── */

  function renderConversations(convs, activeId, handlers) {
    els.convos.textContent = "";
    for (const c of convs) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "convo" + (c.id === activeId ? " convo--active" : "");

      const title = document.createElement("span");
      title.className = "convo__title";
      title.textContent = c.title || "New chat";
      row.appendChild(title);

      const del = document.createElement("span");
      del.className = "convo__del";
      del.title = "Delete";
      del.innerHTML =
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        handlers.onDelete(c.id);
      });
      row.appendChild(del);

      row.addEventListener("click", () => handlers.onOpen(c.id));
      els.convos.appendChild(row);
    }
  }

  /* ── Panels ───────────────────────────────────────────────── */

  function openSide() {
    els.side.classList.add("side--open");
    els.drawerVeil.hidden = false;
    requestAnimationFrame(() => els.drawerVeil.classList.add("drawer-veil--show"));
  }
  function closeSide() {
    els.side.classList.remove("side--open");
    els.drawerVeil.classList.remove("drawer-veil--show");
    setTimeout(() => { els.drawerVeil.hidden = true; }, 250);
  }

  function openSettings() {
    els.settings.hidden = false;
    els.settingsVeil.hidden = false;
    els.btnSettings.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      els.settings.classList.add("settings--open");
      els.settingsVeil.classList.add("settings-veil--show");
    });
    // Reflect current config into fields
    els.setEndpoint.value = CFG.NVIDIA_NIM_ENDPOINT;
    els.setModel.value = CFG.MODEL;
    els.setRelay.value = CFG.RELAY_URL || "";
  }
  function closeSettings() {
    els.settings.classList.remove("settings--open");
    els.settingsVeil.classList.remove("settings-veil--show");
    els.btnSettings.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      els.settings.hidden = true;
      els.settingsVeil.hidden = true;
    }, 320);
  }

  function showNodePop(label, x, y) {
    els.nodePopLabel.textContent = label;
    els.nodePop.style.left = x + "px";
    els.nodePop.style.top = y + "px";
    els.nodePop.hidden = false;
  }
  function hideNodePop() {
    els.nodePop.hidden = true;
  }

  /* ── Composer ─────────────────────────────────────────────── */

  function autoGrow() {
    const ta = els.composer;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 132) + "px";
  }

  function setBusy(busy) {
    els.btnSend.hidden = busy;
    els.btnStop.hidden = !busy;
  }

  return {
    els, renderMarkdown, addMessage, updateMessageContent, removeMessage,
    clearMessages, renderAllMessages, setStreamingCaret,
    showTyping, hideTyping, setError, setStatus, setHoloState, setModelInfo,
    bootDone, renderConversations, openSide, closeSide,
    openSettings, closeSettings, showNodePop, hideNodePop,
    autoGrow, setBusy,
  };
})();
