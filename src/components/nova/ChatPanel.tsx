import { useEffect, useRef, useState } from "react";
import { ArrowUp, Eraser, Mic, Paperclip } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { NovaMessage } from "@/lib/nova-chat";

interface Props {
  messages: NovaMessage[];
  busy: boolean;
  streaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRegenerate: () => void;
  onClear: () => void;
}

export function ChatPanel({
  messages,
  busy,
  streaming,
  error,
  onSend,
  onRegenerate,
  onClear,
}: Props) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsg = messages[messages.length - 1];
  const lastLen = lastMsg?.content.length ?? 0;

  /* Auto-scroll on new messages and while text streams in */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastLen, streaming, error, busy]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="glass flex max-h-[52vh] flex-col overflow-hidden rounded-3xl border border-border shadow-[0_24px_70px_-30px_oklch(0.4_0.05_260/0.35)]">
      {/* Header hairline */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-mono-caps text-[10px] text-muted-foreground">
          Conversation · {messages.length} message{messages.length === 1 ? "" : "s"}
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 font-mono-caps text-[10px] text-faint transition-colors hover:text-destructive"
          >
            <Eraser className="size-3" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        {messages.length === 0 && !error && (
          <div className="flex h-full min-h-28 flex-col items-center justify-center gap-2 text-center">
            <p className="font-mono-caps text-[10px] text-faint">
              Channel open
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Say hello to NOVA — ask anything, or tap the core to feel its
              pulse.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            streaming={streaming && i === messages.length - 1 && m.role === "assistant"}
            canRegenerate={!busy && i === messages.length - 1}
            onRegenerate={onRegenerate}
          />
        ))}

        {busy && !streaming && (
          <div className="flex items-center gap-3 px-1">
            <span className="font-mono-caps text-[10px] text-accent">
              NOVA is thinking
            </span>
            <span className="nova-typing text-accent">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="font-mono-caps text-[10px] text-destructive">
              Connection issue
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground/90">{error}</p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          {/* Attachment button (UI) */}
          <button
            type="button"
            title="Attachments coming soon"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Paperclip className="size-4" />
          </button>

          {/* Microphone button (UI) */}
          <button
            type="button"
            title="Voice input coming soon"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Mic className="size-4" />
          </button>

          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Message NOVA…"
            className="max-h-28 min-h-9 flex-1 resize-none rounded-xl border border-input bg-background/70 px-3 py-2 text-sm leading-6 outline-none transition-colors placeholder:text-faint focus:border-accent/60"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || busy}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-primary-foreground transition-all hover:opacity-90 disabled:opacity-30"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="font-mono-caps text-[9px] text-faint">
            Enter to send · Shift+Enter for newline
          </span>
          <span className="font-mono-caps text-[9px] text-faint">
            NVIDIA NIM
          </span>
        </div>
      </div>
    </div>
  );
}
