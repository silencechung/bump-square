import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { loadConfig, claudeArgsFromConfig } from './config';
import { addAgentEvent, completeAgentEvent, getState, stampStructureVersion } from './serverState';

const MAX_BUFFER_LINES = 10000;

const g = globalThis as unknown as {
  __bumpClaudeBuffer?: string[];
  __bumpClaudeBus?: EventEmitter;
  __bumpClaudeRunning?: boolean;
  __bumpClaudeRunningKind?: string | null;
  __bumpClaudeQueue?: Array<() => void>;
};

const buffer: string[] = g.__bumpClaudeBuffer ?? (g.__bumpClaudeBuffer = []);
const bus: EventEmitter = g.__bumpClaudeBus ?? (g.__bumpClaudeBus = new EventEmitter());
bus.setMaxListeners(100);

if (g.__bumpClaudeRunning === undefined) {
  g.__bumpClaudeRunning = false;
}
if (g.__bumpClaudeRunningKind === undefined) {
  g.__bumpClaudeRunningKind = null;
}
if (!g.__bumpClaudeQueue) {
  g.__bumpClaudeQueue = [];
}

const queue: Array<() => void> = g.__bumpClaudeQueue;

function pushChunk(chunk: string) {
  const lines = chunk.split('\n');
  buffer.push(...lines);
  if (buffer.length > MAX_BUFFER_LINES) {
    buffer.splice(0, buffer.length - MAX_BUFFER_LINES);
  }
  bus.emit('chunk', chunk);
}

function runNext() {
  if (g.__bumpClaudeRunning || queue.length === 0) {
    return;
  }
  const next = queue.shift()!;
  next();
}

export function getTerminalBuffer(): string[] {
  return [...buffer];
}

export function clearTerminalBuffer() {
  buffer.length = 0;
  bus.emit('clear');
}

export function subscribeTerminal(cb: (chunk: string) => void): () => void {
  bus.on('chunk', cb);
  return () => bus.off('chunk', cb);
}

export function subscribeTerminalClear(cb: () => void): () => void {
  bus.on('clear', cb);
  return () => bus.off('clear', cb);
}

/** Subscribe to start/done — payload is the kind currently running, or null
 * when the run finished. Buttons key off this to spin only on their own kind. */
export function subscribeRunning(cb: (kind: string | null) => void): () => void {
  const onStart = (kind: string) => cb(kind);
  const onDone = () => cb(null);
  bus.on('start', onStart);
  bus.on('done', onDone);
  return () => { bus.off('start', onStart); bus.off('done', onDone); };
}

export function isRunning(): boolean {
  return g.__bumpClaudeRunning ?? false;
}

/** Kind of the run currently in flight, or null if idle. Used by the SSE
 * endpoint to emit a status snapshot on connect. */
export function runningKind(): string | null {
  return g.__bumpClaudeRunningKind ?? null;
}

/** Translate one stream-json line into a human-readable xterm chunk, or null
 * if the event should be dropped (hook noise, partial deltas without text). */
function formatStreamEvent(line: string): string | null {
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(line); } catch { return null; }

  const type = ev.type as string | undefined;
  const subtype = ev.subtype as string | undefined;

  if (type === 'system') {
    if (subtype?.startsWith('hook_')) {
      return null;
    }
    if (subtype === 'init') {
      return `\x1b[90m· session 就緒\x1b[0m\r\n`;
    }
    if (subtype === 'status') {
      return null;
    }
    return null;
  }

  if (type === 'assistant') {
    const message = ev.message as { content?: Array<Record<string, unknown>> } | undefined;
    const content = message?.content ?? [];
    const out: string[] = [];
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        out.push(block.text);
      } else if (block.type === 'tool_use') {
        const name = block.name as string;
        const input = block.input as Record<string, unknown> | undefined;
        const target = (input?.file_path ?? input?.path ?? input?.command) as string | undefined;
        const label = target ? `${name} \x1b[90m${target}\x1b[0m` : name;
        out.push(`\x1b[36m🛠  ${label}\x1b[0m`);
      }
    }
    return out.length ? out.join('\r\n') + '\r\n' : null;
  }

  if (type === 'user') {
    // tool_result: silent on success; on error surface the first 120 chars so
    // it's actionable (and obvious whether the agent recovered or not).
    const message = ev.message as { content?: Array<Record<string, unknown>> } | undefined;
    const errBlock = message?.content?.find(b => b.is_error);
    if (!errBlock) {
      return null;
    }
    const raw = typeof errBlock.content === 'string'
      ? errBlock.content
      : Array.isArray(errBlock.content)
        ? errBlock.content.map(c => (c as Record<string, unknown>).text ?? '').join(' ')
        : '';
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    return `\x1b[33m⚠ tool error\x1b[0m ${snippet ? `\x1b[90m${snippet}\x1b[0m` : ''}\r\n`;
  }

  if (type === 'result') {
    return null; // 'done (exit N)' is emitted by the close handler below
  }

  return null;
}

export function runClaude(prompt: string, kind = 'generic'): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = () => {
      // Open an AgentEvent row before we even spawn — the panel shows the
      // running spinner immediately, and a spawn-error case still has a row
      // to mark as failed.
      const eventId = addAgentEvent(kind);
      // Track the last assistant-text block so we can stamp it as the
      // event's summary on close (the agent prints a Chinese one-liner
      // recap as its final assistant message per /bump-layout skill rules).
      let lastAssistantText: string | null = null;
      // Capture the board version at spawn time so the version stamp written
      // on success reflects the world the agent actually read — not the world
      // at completion (which may have shifted if the user kept editing).
      const tSpawn = getState().boardVersion;

      g.__bumpClaudeRunning = true;
      g.__bumpClaudeRunningKind = kind;
      bus.emit('start', kind);
      pushChunk(`\r\n\x1b[33m▶ claude --print\x1b[0m \x1b[90m(${kind})\x1b[0m\r\n`);

      // Re-read config on each spawn so edits to ~/.bump-square/config.json
      // take effect on the next agent action — no dev-server restart needed.
      const cfg = loadConfig();
      const child = spawn(
        'claude',
        ['--print', prompt, ...claudeArgsFromConfig(cfg.claude)],
        { stdio: ['ignore', 'pipe', 'pipe'], shell: false },
      );

      // stream-json emits one JSON object per line. Translate the meaningful
      // events to xterm-friendly progress lines; drop hook noise — but show a
      // single early "init" line so the user knows the agent is alive while
      // the SessionStart hooks are still warming up.
      let stdoutBuf = '';
      let earlyHookCount = 0;
      let initShown = false;
      child.stdout.on('data', (data: Buffer) => {
        stdoutBuf += data.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          if (!initShown) {
            try {
              const ev = JSON.parse(line) as { type?: string; subtype?: string };
              if (ev.type === 'system' && ev.subtype?.startsWith('hook_')) {
                earlyHookCount++;
                if (earlyHookCount === 1) {
                  pushChunk(`\x1b[90m· 連線中… session 啟動中\x1b[0m\r\n`);
                }
                continue;
              }
              if (ev.type === 'system' && ev.subtype === 'init') {
                pushChunk(`\x1b[90m· session 就緒（${earlyHookCount} hooks）\x1b[0m\r\n`);
                initShown = true;
                continue;
              }
            } catch { /* fall through to formatter */ }
          }
          // Sniff each line for assistant.text blocks — the LAST one we see
          // wins as the event summary. Parse failures are silently skipped
          // (formatStreamEvent will also try its own parse below).
          try {
            const ev = JSON.parse(line) as {
              type?: string;
              message?: { content?: Array<Record<string, unknown>> };
            };
            if (ev.type === 'assistant') {
              for (const block of ev.message?.content ?? []) {
                if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                  lastAssistantText = block.text.trim();
                }
              }
            }
          } catch { /* ignore */ }
          const out = formatStreamEvent(line);
          if (out) {
            pushChunk(out);
          }
        }
      });
      child.stderr.on('data', (data: Buffer) => pushChunk(`\x1b[31m${data.toString()}\x1b[0m`));

      child.on('close', (code) => {
        const msg = code === 0
          ? `\r\n\x1b[32m✓ done (exit 0)\x1b[0m\r\n`
          : `\r\n\x1b[31m✗ exit ${code}\x1b[0m\r\n`;
        pushChunk(msg);
        completeAgentEvent(eventId, code ?? -1, lastAssistantText);
        // Stamp the version against `tSpawn` (the boardVersion at spawn time)
        // so subsequent edits make Prompt show as stale. generate-structure
        // also clears `assetsPrompt` per the skill — reset its stamp to match.
        if (code === 0) {
          if (kind === 'generate-structure') {
            stampStructureVersion('prompt', tSpawn);
            stampStructureVersion('assets', null);
          } else if (kind === 'suggest-assets') {
            stampStructureVersion('assets', tSpawn);
          }
        }
        g.__bumpClaudeRunning = false;
        g.__bumpClaudeRunningKind = null;
        bus.emit('done', code);
        resolve();
        runNext();
      });

      child.on('error', (err) => {
        pushChunk(`\r\n\x1b[31m⚠ spawn error: ${err.message}\x1b[0m\r\n`);
        completeAgentEvent(eventId, -1, `spawn error: ${err.message}`);
        g.__bumpClaudeRunning = false;
        g.__bumpClaudeRunningKind = null;
        bus.emit('done', -1);
        reject(err);
        runNext();
      });
    };

    if (g.__bumpClaudeRunning) {
      pushChunk(`\r\n\x1b[90m⏳ queued (claude already running)\x1b[0m\r\n`);
      queue.push(task);
    } else {
      task();
    }
  });
}
