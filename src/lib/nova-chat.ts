import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface NovaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface NovaConversation {
  id: string;
  title: string;
  ts: number;
  messages: NovaMessage[];
}

const CONV_KEY = "nova.chat.conversations.v1";
const ACTIVE_KEY = "nova.chat.active.v1";
const MAX_HISTORY_SENT = 16; // turns sent as model context
const MAX_CONVERSATIONS = 30;

function newId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadConversations(): NovaConversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NovaConversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages))
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

interface NovaBootstrap {
  conversations: NovaConversation[];
  activeId: string;
}

/** Guarantees at least one conversation and a valid activeId. */
function loadBootstrap(): NovaBootstrap {
  let conversations = loadConversations();
  if (conversations.length === 0) {
    conversations = [
      { id: newId(), title: "New chat", ts: Date.now(), messages: [] },
    ];
  }
  const stored = loadActiveId();
  const activeId =
    stored && conversations.some((c) => c.id === stored)
      ? stored
      : conversations[0].id;
  return { conversations, activeId };
}

function persist(conversations: NovaConversation[], activeId: string | null) {
  try {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)),
    );
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // storage unavailable — chat still works in-memory
  }
}

export interface NovaChatCallbacks {
  onListening?: () => void;
  onThinking: () => void;
  onResponding: () => void;
  onError: () => void;
}

export function useNovaChat() {
  const chat = useAction(api.nvidia.chat);
  const bootstrap = useRef<NovaBootstrap | null>(null);
  if (bootstrap.current === null) bootstrap.current = loadBootstrap();

  const [conversations, setConversations] = useState(
    bootstrap.current.conversations,
  );
  const [activeId, setActiveId] = useState(bootstrap.current.activeId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  /* Debounced persistence */
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(conversations, activeId), 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [conversations, activeId]);

  const updateActive = useCallback(
    (fn: (conv: NovaConversation) => NovaConversation) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === activeId);
        if (idx === -1) {
          const conv = fn({
            id: activeId ?? newId(),
            title: "New chat",
            ts: Date.now(),
            messages: [],
          });
          return [conv, ...prev];
        }
        const next = [...prev];
        next[idx] = fn(next[idx]);
        return next;
      });
    },
    [activeId],
  );

  const run = useCallback(
    async (
      history: { role: "user" | "assistant"; content: string }[],
      callbacks: NovaChatCallbacks,
    ): Promise<string | null> => {
      setBusy(true);
      setError(null);
      callbacks.onThinking();
      try {
        const trimmed = history.slice(-MAX_HISTORY_SENT);
        const res = await chat({
          messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
        });
        callbacks.onResponding();
        return res.content;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected failure talking to NVIDIA NIM.";
        setError(message);
        callbacks.onError();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [chat],
  );

  /** Send a user message; resolves with the raw reply text (or null). */
  const send = useCallback(
    async (text: string, callbacks: NovaChatCallbacks): Promise<string | null> => {
      const content = text.trim();
      if (!content || busy) return null;
      callbacks.onListening?.();

      const userMsg: NovaMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content,
        ts: Date.now(),
      };
      updateActive((conv) => ({
        ...conv,
        title:
          conv.messages.length === 0
            ? content.slice(0, 42) + (content.length > 42 ? "…" : "")
            : conv.title,
        ts: Date.now(),
        messages: [...conv.messages, userMsg],
      }));

      const history = [
        ...(active?.messages ?? []).map(({ role, content }) => ({
          role,
          content,
        })),
        { role: "user" as const, content },
      ];
      return run(history, callbacks);
    },
    [busy, active, updateActive, run],
  );

  /** Regenerate: drop trailing assistant turns and resend. */
  const regenerate = useCallback(
    async (callbacks: NovaChatCallbacks): Promise<string | null> => {
      if (busy || !active) return null;
      let cut = active.messages.length;
      while (cut > 0 && active.messages[cut - 1].role === "assistant") cut--;
      if (cut === 0) return null;
      const kept = active.messages.slice(0, cut);
      updateActive((conv) => ({ ...conv, messages: kept }));
      return run(
        kept.map(({ role, content }) => ({ role, content })),
        callbacks,
      );
    },
    [busy, active, updateActive, run],
  );

  /**
   * Append an assistant message and reveal it progressively
   * (streaming-style). Calls onTick each frame for 3D flicker.
   */
  const streamAssistant = useCallback(
    (content: string, onTick?: () => void): string => {
      const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      updateActive((conv) => ({
        ...conv,
        ts: Date.now(),
        messages: [
          ...conv.messages,
          { id, role: "assistant", content: "", ts: Date.now() },
        ],
      }));

      const total = content.length;
      const duration = Math.min(2400, 500 + total * 6);
      const start = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / duration);
        const eased = 1 - Math.pow(1 - p, 2);
        const chars = Math.round(eased * total);
        const partial = content.slice(0, chars);
        updateActive((conv) => ({
          ...conv,
          messages: conv.messages.map((m) =>
            m.id === id ? { ...m, content: partial } : m,
          ),
        }));
        onTick?.();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return id;
    },
    [updateActive],
  );

  const newChat = useCallback(() => {
    const conv: NovaConversation = {
      id: newId(),
      title: "New chat",
      ts: Date.now(),
      messages: [],
    };
    setConversations((prev) => [conv, ...prev].slice(0, MAX_CONVERSATIONS));
    setActiveId(conv.id);
    setError(null);
  }, []);

  const openConversation = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
  }, []);

  const clearActive = useCallback(() => {
    updateActive((conv) => ({ ...conv, messages: [] }));
    setError(null);
  }, [updateActive]);

  const deleteConversation = useCallback(
    (id: string) => {
      const next = conversations.filter((c) => c.id !== id);
      if (next.length === 0) {
        const conv: NovaConversation = {
          id: newId(),
          title: "New chat",
          ts: Date.now(),
          messages: [],
        };
        setConversations([conv]);
        setActiveId(conv.id);
      } else {
        setConversations(next);
        if (id === activeId) setActiveId(next[0].id);
      }
    },
    [conversations, activeId],
  );

  return {
    conversations,
    activeId,
    messages,
    busy,
    error,
    send,
    regenerate,
    streamAssistant,
    newChat,
    openConversation,
    clearActive,
    deleteConversation,
  };
}
