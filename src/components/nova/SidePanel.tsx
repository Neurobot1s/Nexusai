import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { NovaMark } from "./NovaMark";
import type { NovaConversation } from "@/lib/nova-chat";

interface Props {
  conversations: NovaConversation[];
  activeId: string | null;
  stateLabel: string;
  modelName: string;
  userName?: string;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
}

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export function SidePanel({
  conversations,
  activeId,
  stateLabel,
  modelName,
  userName,
  onNewChat,
  onOpen,
  onDelete,
  onSignOut,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          New chat
        </button>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 font-mono-caps text-[10px] text-faint">
          History
        </p>
        {conversations.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">
            No conversations yet.
          </p>
        )}
        <ul className="space-y-0.5">
          {conversations.map((c) => {
            const isActive = c.id === activeId;
            const empty = c.messages.length === 0;
            return (
              <li key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !empty && onOpen(c.id)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !empty) onOpen(c.id);
                  }}
                  className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  } ${empty ? "opacity-60" : ""}`}
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate text-xs">
                    {empty ? "New chat" : c.title}
                  </span>
                  {!empty && (
                    <>
                      <span className="font-mono-caps text-[9px] text-faint group-hover:hidden">
                        {relTime(c.ts)}
                      </span>
                      <button
                        type="button"
                        title="Delete conversation"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                        className="hidden shrink-0 rounded p-0.5 text-faint transition-colors hover:text-destructive group-hover:block"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Model information */}
      <div className="border-t border-border px-5 py-4">
        <p className="pb-3 font-mono-caps text-[10px] text-faint">Model</p>
        <dl className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="font-medium">NVIDIA NIM</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">Endpoint</dt>
            <dd className="truncate font-mono text-[10px]">{modelName}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Context</dt>
            <dd className="font-medium">16 turns</dd>
          </div>
        </dl>
      </div>

      {/* Settings */}
      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">
              {userName ?? "Guest session"}
            </p>
            <p className="font-mono-caps text-[9px] text-faint">
              State · {stateLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Sign out
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <NovaMark className="size-3 text-accent" />
          <span className="font-mono-caps text-[9px] text-faint">
            NOVA · v1.0
          </span>
        </div>
      </div>
    </div>
  );
}
