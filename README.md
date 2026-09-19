# NOVA · 3D AI Interface

An immersive 3D AI chat experience. The assistant lives as a real-time
Three.js energy core at the center of the screen and reacts to every
message, thought, response, and error — powered by **NVIDIA NIM**.

Pure static site: plain HTML + CSS + JavaScript + Three.js ES modules.
**No frameworks, no bundler, no build step.** Deploys to GitHub Pages as-is.

## Project structure

```
index.html        App shell (top bar, side panel, chat, settings drawer)
style.css         Minimalist futuristic theme (dark navy + one cyan accent)
config.js         ★ ALL configuration lives here (API key, models, relay)
ai.js             NVIDIA NIM client — sendMessage(), timeouts, error taxonomy,
                  model fallback chain, direct→relay fetch strategy
three-scene.js    The 3D AI core (ES module): states, rings, particles,
                  data nodes, pulses, camera orbit, dispose
ui.js             DOM layer: rendering, safe markdown, panels, popups
app.js            Orchestrator: chat store (localStorage) + NIM flow wiring
workers/          Optional 30-line Cloudflare Worker CORS relay
```

## Run locally

Browsers require http(s) for ES modules, so serve the folder instead of
double-clicking `index.html`:

```bash
npx serve .          # or: python3 -m http.server 3000
```

Open http://localhost:3000.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo → **Settings → Pages → Source: Deploy from a branch** →
   branch `main`, folder `/ (root)` → Save.
3. Your site is live at `https://<user>.github.io/<repo>/`.

`.nojekyll` is included so Pages serves everything untouched.

## Configuration (`config.js`)

| Key | Purpose |
| --- | --- |
| `NVIDIA_API_KEY` | Your key from build.nvidia.com (already filled in) |
| `NVIDIA_NIM_ENDPOINT` | NIM chat-completions URL |
| `MODEL` | Primary NVIDIA model used for chat |
| `MODEL_FALLBACKS` | Tried in order if the primary is retired (404) or errors |
| `RELAY_URL` | Your own CORS relay (`workers/nim-relay.js`), optional |
| `PUBLIC_RELAY_URL` | Last-resort public relay (rate-limited; deploy your own) |
| `MAX_TOKENS / TEMPERATURE / TOP_P / TIMEOUT_MS` | Generation parameters |
| `AI_NAME` / `SYSTEM_PROMPT` | Identity + personality |

To rename the assistant, change `AI_NAME` — the UI picks it up everywhere.

### Models

All models in the chain are **NVIDIA-provided** (the `nvidia/*` namespace on
NIM), verified live against the endpoint. Models on NIM get retired over
time; when that happens NOVA automatically falls through the chain, and the
settings drawer shows the fallbacks. Swap the primary any time — e.g.
`nvidia/nemotron-3.5-lightning-30b-a3b` for faster replies.

## The CORS relay (why it exists)

`integrate.api.nvidia.com` currently sends **no CORS headers**, so some
browsers block a static site from calling it directly. NOVA tries the direct
call first and transparently retries through a relay if blocked. For a
personal deployment you can run your own relay in about 30 seconds:

```bash
cd workers
bunx wrangler deploy      # or: npx wrangler deploy
```

Then set `RELAY_URL` in `config.js` to your worker URL. The worker only
forwards to `integrate.api.nvidia.com`, and you can restrict it to your
GitHub Pages origin via `ORIGIN_ALLOWLIST`.

## Key safety

The API key ships client-side in `config.js` — that is inherent to a static
site. **Anyone who can load the site can read the key and spend your
quota.** Use a key with a hard spend limit, don't reuse a personal or
production key, and rotate it if it leaks. For a fully private setup, move
the key into the Worker (as a secret) and drop the auth header client-side.

## Interactions

- **Drag** to orbit · **scroll / pinch** to zoom · camera drifts home after 6 s idle
- **Click the core** → energy pulse · **click a data node** → holographic label
- Mouse movement subtly bends the particle field
- The core breathes (idle), brightens (listening), accelerates inward (thinking),
  pulses outward (responding), and dims red-tinted (error)

## Chat features

Streaming-style reveal, copy + regenerate per message, markdown with
copyable code blocks, multiple conversations with history (localStorage),
clear + new chat, Enter to send / Shift+Enter for newline, mobile bottom-sheet
chat and drawer, reduced-motion toggle, tab-hidden render pause, mobile
particle/ring budget reduction.
