import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * NOVA — Minimalist landing page.
 * Clean, spacious, near-monochrome with one precise cyan accent.
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hairline top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <NovaMark className="size-5 text-accent" />
          <span className="font-mono-caps text-xs font-semibold text-foreground">
            NOVA
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a
            href="#capabilities"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Capabilities
          </a>
          <a
            href="#connect"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Connect
          </a>
          <Link
            to="/nova"
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Open NOVA
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main>
        <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center sm:pt-28">
          {/* Soft radial accent behind the core visual */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-16 size-[480px] -translate-x-1/2 rounded-full opacity-60"
            style={{
              background:
                "radial-gradient(closest-side, oklch(0.72 0.1 220 / 14%), transparent 70%)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col items-center"
          >
            {/* CSS core visual */}
            <div className="relative mb-10 flex size-40 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-border" />
              <span className="absolute inset-3 rounded-full border border-border/70" />
              <span className="absolute inset-6 rounded-full border border-border/50" />
              <span
                className="absolute inset-0 rounded-full border border-accent/40"
                style={{ animation: "nova-ping 3s cubic-bezier(0,0,0.2,1) infinite" }}
              />
              <span className="size-10 rounded-full bg-foreground/90" />
              <span className="absolute size-16 rounded-full border border-accent/30" />
            </div>

            <p className="font-mono-caps text-[11px] text-accent">
              Three-dimensional intelligence
            </p>
            <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              Meet NOVA.
              <br />
              <span className="text-muted-foreground">Your AI, rendered in space.</span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
              A living 3D core powered by NVIDIA NIM. Watch it think, react,
              and answer — in a workspace built for focus.
            </p>
            <div className="mt-9 flex items-center gap-3">
              <Link
                to="/nova"
                className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.99]"
              >
                Start talking
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#capabilities"
                className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                See how it works
              </a>
            </div>
          </motion.div>

          {/* Capabilities — precise grid, hairline dividers */}
          <section id="capabilities" className="mt-32 w-full scroll-mt-16">
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
              <Feature
                title="Living 3D core"
                body="An interactive Three.js entity with orbiting rings, data nodes and energy pulses that mirror NOVA's state in real time."
              />
              <Feature
                title="NVIDIA NIM inside"
                body="Every answer is a real inference call through NVIDIA's accelerated microservice — fast, contextual, honest."
              />
              <Feature
                title="Built for focus"
                body="Minimal, monochrome surfaces, one accent color, and no noise. The AI is the interface."
              />
            </div>
          </section>

          {/* Connect strip */}
          <section id="connect" className="mt-32 w-full scroll-mt-16">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-12 text-center">
              <p className="font-mono-caps text-[11px] text-muted-foreground">
                Status
              </p>
              <p className="max-w-md text-pretty text-xl font-medium tracking-tight">
                NOVA connects to NVIDIA NIM the moment your API key is present.
              </p>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Add{" "}
                <code className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">
                  NIM_API_KEY
                </code>{" "}
                in the Keys tab and the core comes online. Until then, NOVA
                tells you exactly what's missing — never a silent failure.
              </p>
              <Link
                to="/nova"
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Open the core
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        </section>
      </main>

      {/* Hairline footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <NovaMark className="size-3.5 text-accent" />
            <span className="font-mono-caps">NOVA · v1.0</span>
          </div>
          <span>Three.js core · NVIDIA NIM · Minimal by design</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card p-7 text-left">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function NovaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="10.8" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
    </svg>
  );
}
