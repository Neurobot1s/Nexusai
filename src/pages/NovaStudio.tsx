import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { NovaScene, type NovaState, NODE_LABELS } from "@/three/nova-scene";
import { TopBar } from "@/components/nova/TopBar";
import { SidePanel } from "@/components/nova/SidePanel";
import { ChatPanel } from "@/components/nova/ChatPanel";
import { useNovaChat } from "@/lib/nova-chat";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export default function NovaStudio() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();

  /* ── 3D scene ─────────────────────────────────────────────── */
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<NovaScene | null>(null);
  const [sceneState, setSceneState] = useState<NovaState>("idle");

  /* ── Chat state ───────────────────────────────────────────── */
  const chat = useNovaChat();
  const chatRef = useRef(chat);
  chatRef.current = chat;

  /* ── Streaming reveal tracking ────────────────────────────── */
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (streamTimer.current) clearTimeout(streamTimer.current);
    };
  }, []);

  /* ── NIM key status (backend probe) ───────────────────────── */
  const nimStatus = useQuery(api.nimStatus.configured);
  const hasNimKey = nimStatus?.configured ?? true;

  /* ── Side panel / mobile drawer ───────────────────────────── */
  const [panelOpen, setPanelOpen] = useState(false);

  /* ── Data-node popup ──────────────────────────────────────── */
  const [nodePopup, setNodePopup] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!nodePopup) return;
    popupTimer.current = setTimeout(() => setNodePopup(null), 2600);
    return () => {
      if (popupTimer.current) clearTimeout(popupTimer.current);
    };
  }, [nodePopup]);

  /* ── Mount the 3D scene once ──────────────────────────────── */
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new NovaScene(mountRef.current, {
      onStateChange: setSceneState,
      onCoreClick: () => sceneRef.current?.pulse(),
      onDataNodeClick: (i) => {
        const r = mountRef.current?.getBoundingClientRect();
        if (!r) return;
        setNodePopup({
          label: NODE_LABELS[i % NODE_LABELS.length] ?? `Node ${i + 1}`,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
      },
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  /* ── Chat → 3D state machine ──────────────────────────────── */
  const cbFactory = useCallback(
    () => ({
      onListening: () => sceneRef.current?.setState("listening"),
      onThinking: () => sceneRef.current?.setState("thinking"),
      onResponding: () => sceneRef.current?.setState("responding"),
      onError: () => sceneRef.current?.setState("error"),
    }),
    [],
  );

  const handleSend = useCallback(
    async (text: string) => {
      const reply = await chatRef.current.send(text, cbFactory());
      if (reply !== null) {
        sceneRef.current?.pulse();
        setStreamingId(
          chatRef.current.streamAssistant(reply, () =>
            sceneRef.current?.streamTick(),
          ),
        );
        // Return to idle once the reveal finishes
        if (streamTimer.current) clearTimeout(streamTimer.current);
        streamTimer.current = setTimeout(
          () => {
            sceneRef.current?.setState("idle");
            setStreamingId(null);
          },
          Math.min(2400, 500 + reply.length * 6) + 150,
        );
      } else {
        setTimeout(() => sceneRef.current?.setState("idle"), 1400);
      }
    },
    [cbFactory],
  );

  const handleRegenerate = useCallback(async () => {
    const reply = await chatRef.current.regenerate(cbFactory());
    if (reply !== null) {
      sceneRef.current?.pulse();
      setStreamingId(
        chatRef.current.streamAssistant(reply, () =>
          sceneRef.current?.streamTick(),
        ),
      );
      if (streamTimer.current) clearTimeout(streamTimer.current);
      streamTimer.current = setTimeout(
        () => {
          sceneRef.current?.setState("idle");
          setStreamingId(null);
        },
        Math.min(2400, 500 + reply.length * 6) + 150,
      );
    } else {
      setTimeout(() => sceneRef.current?.setState("idle"), 1400);
    }
  }, [cbFactory]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const connection: "connected" | "error" | "not-configured" = chat.error
    ? "error"
    : hasNimKey
      ? "connected"
      : "not-configured";

  const sidePanel = (
    <SidePanel
      conversations={chat.conversations}
      activeId={chat.activeId}
      stateLabel={sceneState}
      modelName="meta/llama-3.1-8b-instruct"
      userName={user?.name ?? user?.email ?? undefined}
      onNewChat={chat.newChat}
      onOpen={chat.openConversation}
      onDelete={chat.deleteConversation}
      onSignOut={handleSignOut}
    />
  );

  return (
    <div className="dark relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── 3D scene layer ─────────────────────────────────── */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* ── Top bar ────────────────────────────────────────── */}
      <TopBar
        connection={connection}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />

      {/* ── Holographic status panel ───────────────────────── */}
      <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2">
        <div className="glass rounded-2xl border border-border px-5 py-3 text-center">
          <p className="font-mono-caps text-[9px] text-faint">AI STATUS</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium">
            <span className="nova-dot inline-block size-1.5 rounded-full text-accent" />
            ONLINE
          </p>
          <div className="mx-auto my-2 h-px w-24 bg-border" />
          <p className="font-mono-caps text-[9px] text-faint">MODEL</p>
          <p className="text-xs font-medium">NVIDIA NIM</p>
          <div className="mx-auto my-2 h-px w-24 bg-border" />
          <p className="font-mono-caps text-[9px] text-faint">STATE</p>
          <p
            key={sceneState}
            className="nova-state-swap mt-0.5 font-mono-caps text-[10px] text-accent"
          >
            {sceneState.toUpperCase()}
          </p>
        </div>
      </div>

      {/* ── Desktop side panel ─────────────────────────────── */}
      {!isMobile && (
        <aside
          className={`absolute inset-y-0 left-0 z-20 w-72 border-r border-border transition-transform duration-300 ${
            panelOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidePanel}
        </aside>
      )}

      {/* ── Mobile drawer ──────────────────────────────────── */}
      {isMobile && panelOpen && (
        <div className="absolute inset-0 z-30">
          <div
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
            onClick={() => setPanelOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-border shadow-2xl">
            {sidePanel}
          </div>
        </div>
      )}

      {/* ── Bottom chat panel ──────────────────────────────── */}
      <div className="relative z-10 mx-auto mt-auto w-full max-w-2xl px-4 pb-4 sm:pb-6">
        <ChatPanel
          messages={chat.messages}
          busy={chat.busy}
          streaming={streamingId !== null}
          error={chat.error}
          onSend={handleSend}
          onRegenerate={handleRegenerate}
          onClear={chat.clearActive}
        />
      </div>

      {/* ── Data-node info popup ───────────────────────────── */}
      {nodePopup && (
        <div
          className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full"
          style={{ left: nodePopup.x, top: nodePopup.y - 90 }}
        >
          <div className="glass rounded-xl border border-accent/40 px-3 py-2 text-center">
            <p className="font-mono-caps text-[9px] text-accent">DATA NODE</p>
            <p className="mt-0.5 text-xs font-medium">{nodePopup.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}
