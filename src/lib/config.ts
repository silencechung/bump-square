import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * User-overridable runtime config for bump-square.
 *
 * Lives at ~/.bump-square/config.json. Whatever the user writes is shallow-
 * merged ON TOP of the hardcoded defaults, so the file is purely OVERRIDES —
 * you only put in it what you want to change.
 *
 * Example: switch to opus and remove Bash from allowed tools:
 *   {
 *     "claude": {
 *       "model": "opus",
 *       "allowedTools": ["Read", "Write", "Edit"]
 *     }
 *   }
 *
 * Re-read on every claudeRunner.runClaude() call so edits take effect on the
 * next agent action without restarting the dev server.
 */

const CONFIG_PATH = resolve(homedir(), '.bump-square', 'config.json');

export interface ClaudeConfig {
  /** --model: sonnet (default), opus, haiku, or any string Claude Code accepts. */
  model: string;
  /** --allowedTools (comma-joined for the CLI). Bash is included by default
   * so the agent can run small node -e snippets to crunch geometry; remove if
   * you want a stricter sandbox. The bump-layout skill itself enforces "only
   * touch workspace.json", so tool perms are a safety net, not the boundary. */
  allowedTools: string[];
  /** --output-format. stream-json is required for the xterm streaming UI to
   * parse events; switching to 'text' will make the panel show raw text. */
  outputFormat: 'stream-json' | 'text';
  /** --verbose. Required by stream-json; toggling off only makes sense if
   * outputFormat is 'text'. */
  verbose: boolean;
  /** Escape hatch: extra CLI args appended verbatim, after every other flag.
   * Use for one-offs your schema doesn't cover yet. */
  extraArgs?: string[];
}

export interface BumpSquareConfig {
  claude: ClaudeConfig;
}

const DEFAULTS: BumpSquareConfig = {
  claude: {
    model: 'sonnet',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash'],
    outputFormat: 'stream-json',
    verbose: true,
  },
};

/** Read config.json if present and merge over defaults. Never throws — a bad
 * config file falls back to defaults so the app keeps working. */
export function loadConfig(): BumpSquareConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULTS;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const user = JSON.parse(raw) as Partial<BumpSquareConfig>;
    return {
      claude: { ...DEFAULTS.claude, ...(user.claude ?? {}) },
    };
  } catch (err) {
    console.error('[bump-square] Failed to read config.json, using defaults:', err);
    return DEFAULTS;
  }
}

/** Translate a ClaudeConfig into the argv array passed to `spawn('claude', ...)`.
 * Caller appends `--print <prompt>` (or whatever invocation form they need). */
export function claudeArgsFromConfig(cfg: ClaudeConfig): string[] {
  const args: string[] = [
    '--model', cfg.model,
    '--output-format', cfg.outputFormat,
    '--allowedTools', cfg.allowedTools.join(','),
  ];
  if (cfg.verbose) args.push('--verbose');
  if (cfg.extraArgs?.length) args.push(...cfg.extraArgs);
  return args;
}
