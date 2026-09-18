"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * ─────────────────────────────────────────────────────────────
 *  NOVA · NVIDIA NIM INTEGRATION — EDIT THIS BLOCK
 * ─────────────────────────────────────────────────────────────
 *  1. NIM blocks direct browser (CORS) requests, so the call is
 *     proxied through this Convex action.
 *  2. Paste your NVIDIA API key in the Keys/API keys tab →
 *     NIM_API_KEY  (never hardcode it here).
 *  3. Endpoint/model are overridable via env: NIM_ENDPOINT / NIM_MODEL.
 * ─────────────────────────────────────────────────────────────
 */
export const NIM_CONFIG = {
  ENDPOINT:
    process.env.NIM_ENDPOINT ??
    "https://integrate.api.nvidia.com/v1/chat/completions",
  MODEL: process.env.NIM_MODEL ?? "meta/llama-3.1-8b-instruct",
  API_KEY_ENV: "NIM_API_KEY",
} as const;

const SYSTEM_PROMPT =
  "You are NOVA, a futuristic AI entity living inside a holographic 3D core. " +
  "Personality: concise, precise, warm, forward-thinking. Explain complex things simply. " +
  "You help with coding, brainstorming and general questions. Keep answers short unless asked for detail. " +
  "Use markdown for structure and fenced code blocks for code.";

const TIMEOUT_MS = 30_000;

interface NimResponse {
  choices?: { message?: { role?: string; content?: string | null } }[];
  error?: { message?: string } | string;
  message?: string;
  detail?: string;
}

/** Safe response parsing — never throws on shape mismatches. */
function extractContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as NimResponse;

  // OpenAI-compatible shape: { choices: [{ message: { content } }] }
  const first = obj.choices?.[0];
  const content = first?.message?.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/** Human-readable message from any error shape. */
function errorText(data: unknown, fallback: string): string {
  if (typeof data === "string") return data.slice(0, 300);
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const key of ["message", "detail"]) {
      const val = obj[key];
      if (typeof val === "string" && val.trim().length > 0) return val.slice(0, 300);
    }
    const err = obj.error;
    if (typeof err === "string") return err.slice(0, 300);
    if (typeof err === "object" && err !== null) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim().length > 0) return msg.slice(0, 300);
    }
  }
  return fallback;
}

function statusHint(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "NVIDIA API key was rejected (401/403). Check NIM_API_KEY in the Keys tab.";
    case 404:
      return "Endpoint or model not found (404). Verify the NIM endpoint and model name.";
    case 429:
      return "NVIDIA NIM rate limit reached (429). Wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "NVIDIA NIM service error (5xx). The upstream service may be temporarily down.";
    default:
      return `NVIDIA NIM returned HTTP ${status}.`;
  }
}

export const chat = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(
          v.literal("system"),
          v.literal("user"),
          v.literal("assistant"),
        ),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // ── 1. Auth guard ──────────────────────────────────────────
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sign in to talk with NOVA.");
    }

    // ── 2. Config check — never fake a successful response ─────
    const apiKey = process.env.NIM_API_KEY;
    if (!apiKey) {
      throw new Error(
        "NOVA is not connected to NVIDIA NIM yet. Add NIM_API_KEY in the " +
          "project's Keys/API keys tab, then reload. " +
          `Endpoint: ${NIM_CONFIG.ENDPOINT} · Model: ${NIM_CONFIG.MODEL}`,
      );
    }

    if (args.messages.length === 0) {
      throw new Error("Empty conversation — nothing to send.");
    }
    if (args.messages.length > 40) {
      throw new Error("Conversation too long. Start a new chat to continue.");
    }

    // ── 3. Timeout guard ───────────────────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(NIM_CONFIG.ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: NIM_CONFIG.MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...args.messages,
          ],
          temperature: 0.6,
          top_p: 0.9,
          max_tokens: 1024,
          stream: false,
        }),
        signal: controller.signal,
      });

      // ── 4. HTTP error handling ───────────────────────────────
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let parsed: unknown = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          // non-JSON error body is fine
        }
        const detail = errorText(parsed, raw);
        throw new Error(
          statusHint(res.status) + (detail ? ` · ${detail.slice(0, 200)}` : ""),
        );
      }

      // ── 5. Safe parsing of valid responses ───────────────────
      const data: unknown = await res.json().catch(() => null);
      const content = extractContent(data);
      if (!content) {
        throw new Error(
          "NIM returned an empty or unexpected response format. Raw: " +
            JSON.stringify(data ?? {}).slice(0, 200),
        );
      }
      return { content };
    } catch (err) {
      // ── 6. Network / timeout / abort handling ────────────────
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          throw new Error(
            `NVIDIA NIM timed out after ${TIMEOUT_MS / 1000}s. Try again in a moment.`,
          );
        }
        if (
          err.message === "Failed to fetch" ||
          err.message.includes("fetch failed")
        ) {
          throw new Error(
            "Could not reach NVIDIA NIM (network failure). Check connectivity and try again.",
          );
        }
        throw err;
      }
      throw new Error("Unexpected error talking to NVIDIA NIM.");
    } finally {
      clearTimeout(timer);
    }
  },
});
