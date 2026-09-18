import { useState, type ReactNode } from "react";

/**
 * Minimal, dependency-free markdown renderer for NOVA messages.
 * Supports: fenced code blocks (with copy), headings, ordered/unordered
 * lists, paragraphs, inline code, bold, italic, and links.
 * Gracefully handles unterminated fences (e.g. while text streams in).
 */
export function MarkdownLite({ content }: { content: string }) {
  return <div className="nova-md">{renderBlocks(content)}</div>;
}

/* ── Block level ─────────────────────────────────────────────── */

function renderBlocks(src: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const fenceRe = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = fenceRe.exec(src)) !== null) {
    if (m.index > last) {
      nodes.push(<TextBlock key={key++} text={src.slice(last, m.index)} />);
    }
    nodes.push(
      <CodeBlock key={key++} lang={m[1] || "code"} code={m[2].replace(/\n$/, "")} />,
    );
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    nodes.push(<TextBlock key={key++} text={src.slice(last)} />);
  }
  return nodes;
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  let key = 0;

  const flush = () => {
    if (list.length === 0) return;
    const items = list.map((li, i) => <li key={i}>{inline(li)}</li>);
    out.push(
      ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>,
    );
    list = [];
    ordered = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);

    if (h) {
      flush();
      const level = h[1].length;
      const content = inline(h[2]);
      if (level === 1) out.push(<h1 key={key++}>{content}</h1>);
      else if (level === 2) out.push(<h2 key={key++}>{content}</h2>);
      else out.push(<h3 key={key++}>{content}</h3>);
    } else if (ul) {
      list.push(ul[1]);
    } else if (ol) {
      ordered = true;
      list.push(`${ol[1]}. ${ol[2]}`);
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      out.push(<p key={key++}>{inline(line)}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

/* ── Code block with copy ────────────────────────────────────── */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono-caps text-[10px] text-muted-foreground">
          {lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono-caps text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <pre className="!m-0 !rounded-none !border-0 !bg-transparent">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ── Inline level ────────────────────────────────────────────── */

function inline(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (mm) {
        out.push(
          <a key={k++} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>,
        );
      }
    } else {
      out.push(
        <a key={k++} href={tok} target="_blank" rel="noreferrer">
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}
