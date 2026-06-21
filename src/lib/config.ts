import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n';

/**
 * User-overridable runtime config for bump-square.
 *
 * Lives at ~/.bump-square/config.json. Whatever the user writes is shallow-
 * merged ON TOP of the hardcoded defaults, so the file is purely OVERRIDES —
 * you only put in it what you want to change.
 *
 * Example: switch to opus and add Bash to allowed tools:
 *   {
 *     "claude": {
 *       "model": "opus",
 *       "allowedTools": ["Read", "Write", "Edit", "Bash"]
 *     }
 *   }
 *
 * Re-read on every claudeRunner.runClaude() call so edits take effect on the
 * next agent action without restarting the dev server.
 */

const CONFIG_PATH = resolve(homedir(), '.bump-square', 'config.json');

export interface ClaudeConfig {
  /** --model: opus (default), sonnet, haiku, or any string Claude Code accepts. */
  model: string;
  /** --allowedTools (comma-joined for the CLI). Defaults to Read/Write/Edit —
   * the bump-layout skill only needs to touch workspace.json. Add 'Bash' or
   * other tools via config.json if you want a wider sandbox; this is the
   * safety net, so widen it deliberately. */
  allowedTools: string[];
  /** --output-format. stream-json is required for the xterm streaming UI to
   * parse events; switching to 'text' will make the panel show raw text. */
  outputFormat: 'stream-json' | 'text';
  /** --verbose. Required by stream-json; toggling off only makes sense if
   * outputFormat is 'text'. */
  verbose: boolean;
}

export interface UiConfig {
  /** UI language. The locale toggle in the header writes this back via
   * /api/state setLocale; agent flow doesn't read it. */
  locale: Locale;
}

export interface BumpSquareConfig {
  claude: ClaudeConfig;
  ui: UiConfig;
}

const DEFAULTS: BumpSquareConfig = {
  claude: {
    model: 'opus',
    allowedTools: ['Read', 'Write', 'Edit'],
    outputFormat: 'stream-json',
    verbose: true,
  },
  ui: {
    locale: DEFAULT_LOCALE,
  },
};

/** Read config.json if present and merge over defaults. Never throws — a bad
 * config file falls back to defaults so the app keeps working. */
export function loadConfig(): BumpSquareConfig {
  if (!existsSync(CONFIG_PATH)) {
    return DEFAULTS;
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const user = JSON.parse(raw) as Partial<BumpSquareConfig>;
    return {
      claude: { ...DEFAULTS.claude, ...(user.claude ?? {}) },
      ui: { ...DEFAULTS.ui, ...(user.ui ?? {}) },
    };
  } catch (err) {
    console.error('[bump-square] Failed to read config.json, using defaults:', err);
    return DEFAULTS;
  }
}

/** Persist a locale change to config.json. Read-modify-write keeps any
 * unrelated user overrides intact (e.g. claude.model). Atomic-ish: writes
 * to tmp + rename so a crash mid-write can't leave a half-file. */
export function saveLocale(locale: Locale): void {
  if (!isLocale(locale)) {
    throw new Error(`Invalid locale: ${String(locale)}`);
  }
  let current: Partial<BumpSquareConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      current = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<BumpSquareConfig>;
    } catch { /* corrupt file — overwrite with just our field */ }
  }
  const next = { ...current, ui: { ...(current.ui ?? {}), locale } };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  renameSync(tmp, CONFIG_PATH);
}

/** Translate a ClaudeConfig into the argv array passed to `spawn('claude', ...)`.
 * Caller appends `--print <prompt>` (or whatever invocation form they need). */
export function claudeArgsFromConfig(cfg: ClaudeConfig): string[] {
  const args: string[] = [
    '--model', cfg.model,
    '--output-format', cfg.outputFormat,
    '--allowedTools', cfg.allowedTools.join(','),
  ];
  if (cfg.verbose) {
    args.push('--verbose');
  }
  // Always pass this flag. Without it, Claude Code's default system prompt
  // bakes in dynamic per-machine sections (cwd, env info, memory paths,
  // git status) — every git change invalidates the cache prefix and we
  // re-pay full prefill cost. With it, those sections move to the first
  // user message and the system-prompt prefix stays byte-stable, so
  // Anthropic's 5-minute prompt cache actually hits on subsequent runs
  // (cache read = 0.1x input cost; first write = 1.25x — net win on any
  // repeat press within the TTL). Hardcoded (not configurable) because
  // it's a pure improvement for this app's call pattern — no scenario
  // where you'd want the prefix tied to git status.
  args.push('--exclude-dynamic-system-prompt-sections');
  return args;
}
