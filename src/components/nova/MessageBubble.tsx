import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { MarkdownLite } from "@/lib/markdown-lite";
import type { NovaMessage } from "@/lib/nova-chat";

interface Props {
  message: NovaMessage;
  streaming?: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({
  message,
  streaming = false,
  canRegenerate,
  onRegenerate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div
      className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <div className="mb-1 flex items-center gap-2 px-1">
        <span className="font-mono-caps text-[10px] text-faint">
          {isUser ? "You" : "NOVA"}
        </span>
        <span className="font-mono-caps text-[10px] text-faint/70">
          {timeLabel(message.ts)}
        </span>
      </div>

      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm leading-6 text-primary-foreground"
            : "max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5 text-sm leading-6"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <>
            <MarkdownLite content={message.content} />
            {streaming && (
              <span className="nova-typing mt-1 inline-flex text-accent">
                <span />
                <span />
                <span />
              </span>
            )}
          </>
        )}
      </div>

      {!isUser && !streaming && (
        <div className="mt-1 flex items-center gap-1 px-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono-caps text-[10px] text-faint transition-colors hover:text-foreground"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          {canRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono-caps text-[10px] text-faint transition-colors hover:text-foreground"
            >
              <RefreshCw className="size-3" />
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
