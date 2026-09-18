import { PanelLeft } from "lucide-react";
import { NovaMark } from "./NovaMark";

interface Props {
  connection: "connected" | "error" | "not-configured";
  onTogglePanel: () => void;
}

const CONNECTION_LABEL: Record<Props["connection"], string> = {
  connected: "Connected",
  error: "Connection issue",
  "not-configured": "Key required",
};

const CONNECTION_DOT: Record<Props["connection"], string> = {
  connected: "text-accent",
  error: "text-destructive",
  "not-configured": "text-muted-foreground",
};

export function TopBar({ connection, onTogglePanel }: Props) {
  const tone = CONNECTION_DOT[connection];

  return (
    <header className="z-20 flex items-center justify-between px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          title="Toggle panel"
          onClick={onTogglePanel}
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <NovaMark className="size-5 text-accent" />
          <span className="font-mono-caps text-xs font-semibold">NOVA</span>
        </div>
        <span className="hidden h-4 w-px bg-border sm:block" />
        <span className="hidden font-mono-caps text-[10px] text-muted-foreground sm:block">
          3D AI Interface
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`nova-dot inline-block size-1.5 rounded-full ${tone}`} />
          <span className={`font-mono-caps text-[10px] ${tone}`}>
            {CONNECTION_LABEL[connection]} · NVIDIA NIM
          </span>
        </div>
      </div>
    </header>
  );
}
