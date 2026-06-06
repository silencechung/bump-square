import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const MAX_BUFFER_LINES = 10000;

const g = globalThis as unknown as {
  __bumpClaudeBuffer?: string[];
  __bumpClaudeBus?: EventEmitter;
  __bumpClaudeRunning?: boolean;
  __bumpClaudeQueue?: Array<() => void>;
};

const buffer: string[] = g.__bumpClaudeBuffer ?? (g.__bumpClaudeBuffer = []);
const bus: EventEmitter = g.__bumpClaudeBus ?? (g.__bumpClaudeBus = new EventEmitter());
bus.setMaxListeners(100);

if (g.__bumpClaudeRunning === undefined) g.__bumpClaudeRunning = false;
if (!g.__bumpClaudeQueue) g.__bumpClaudeQueue = [];

const queue: Array<() => void> = g.__bumpClaudeQueue;

function pushChunk(chunk: string) {
  const lines = chunk.split('\n');
  buffer.push(...lines);
  if (buffer.length > MAX_BUFFER_LINES) buffer.splice(0, buffer.length - MAX_BUFFER_LINES);
  bus.emit('chunk', chunk);
}

function runNext() {
  if (g.__bumpClaudeRunning || queue.length === 0) return;
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

export function subscribeRunning(cb: (running: boolean) => void): () => void {
  const onStart = () => cb(true);
  const onDone = () => cb(false);
  bus.on('start', onStart);
  bus.on('done', onDone);
  return () => { bus.off('start', onStart); bus.off('done', onDone); };
}

export function isRunning(): boolean {
  return g.__bumpClaudeRunning ?? false;
}

export function runClaude(prompt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = () => {
      g.__bumpClaudeRunning = true;
      bus.emit('start');
      pushChunk(`\r\n\x1b[33m▶ claude --print\x1b[0m\r\n`);

      const child = spawn('claude', ['--print', prompt, '--allowedTools', 'Read,Write,Edit'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      child.stdout.on('data', (data: Buffer) => pushChunk(data.toString()));
      child.stderr.on('data', (data: Buffer) => pushChunk(`\x1b[31m${data.toString()}\x1b[0m`));

      child.on('close', (code) => {
        const msg = code === 0
          ? `\r\n\x1b[32m✓ done (exit 0)\x1b[0m\r\n`
          : `\r\n\x1b[31m✗ exit ${code}\x1b[0m\r\n`;
        pushChunk(msg);
        g.__bumpClaudeRunning = false;
        bus.emit('done', code);
        resolve();
        runNext();
      });

      child.on('error', (err) => {
        pushChunk(`\r\n\x1b[31m⚠ spawn error: ${err.message}\x1b[0m\r\n`);
        g.__bumpClaudeRunning = false;
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
