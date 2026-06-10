#!/usr/bin/env node
//
// bump-square skill installer (cross-platform).
//
//   pnpm run setup          register the skill (symlink) into ~/.claude/skills/
//   pnpm run setup --copy   copy the skill instead of symlinking
//
// Dependencies are installed by `pnpm install` separately; this script only
// wires the Claude Code skill and prints how to launch with the fakechat
// channel. Node is already a hard requirement, so a .mjs installer runs the
// same on Linux, macOS, and Windows.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import fs from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(here, '..');
const skillSrc = join(repoDir, '.claude', 'skills', 'bump-square');
const skillsDir = process.env.CLAUDE_SKILLS_DIR ?? join(homedir(), '.claude', 'skills');
const skillDest = join(skillsDir, 'bump-square');

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(`bump-square skill installer

  pnpm run setup          register the skill (symlink) into ~/.claude/skills/
  pnpm run setup --copy   copy the skill instead of symlinking

Dependencies are installed separately by \`pnpm install\`.`);
  process.exit(0);
}
const copyMode = args.includes('--copy');

const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `[${code}m${s}[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const ok = (s) => console.log(`  ${c('32', 'ok')}  ${s}`);
const info = (s) => console.log(`${bold('==>')} ${s}`);
const die = (s) => {
  console.error(`  ${c('31', '✗')}   ${s}`);
  process.exit(1);
};

// --- sanity --------------------------------------------------------------
if (!fs.existsSync(skillSrc)) die(`skill source missing: ${skillSrc}`);

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) die(`Node >= 22 required, found ${process.version}`);

// --- register the skill --------------------------------------------------
info(`Registering the bump-square skill (${copyMode ? 'copy' : 'symlink'}) → ${skillDest}`);
fs.mkdirSync(skillsDir, { recursive: true });

// Replace a stale symlink; refuse to clobber a real directory (may hold data).
let existing = null;
try {
  existing = fs.lstatSync(skillDest);
} catch {
  /* nothing there — fine */
}
if (existing) {
  if (existing.isSymbolicLink()) {
    fs.rmSync(skillDest);
  } else {
    die(`${skillDest} already exists and is not a symlink. Remove/back it up, then re-run.`);
  }
}

if (copyMode) {
  fs.cpSync(skillSrc, skillDest, { recursive: true });
  ok('copied skill');
} else {
  // Windows dir symlinks need admin; a junction does not. Junctions require
  // an absolute target.
  const linkType = platform() === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(resolve(skillSrc), skillDest, linkType);
  ok('symlinked skill (edits in the repo take effect immediately)');
}

// --- done ----------------------------------------------------------------
info('Done');
console.log(`
  ${bold('Start the app')}
    pnpm dev                ${dim('# dev server → http://localhost:4399')}

  ${bold('Use with Claude Code')} (for the live agent / doorbell flow)
    Launch the main session WITH the fakechat channel:
      claude --channels plugin:fakechat@claude-plugins-official
    The channel only reaches a session started with that flag, and the
    fakechat service on :8787 must be up (a /mcp reconnect starts it).
    The MCP server is auto-spawned from .mcp.json when you open this project.

  ${bold('Invoke the skill')}
    /bump-square            ${dim('# brings the env up + health-checks ports')}
`);
