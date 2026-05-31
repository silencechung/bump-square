import { defineConfig, presetWind4 } from 'unocss';

/**
 * UnoCSS config (replaces the previous Tailwind v4 setup).
 *
 * presetWind4 is the Tailwind-v4-compatible preset, matching the original
 * `@import "tailwindcss"` (v4) setup the project used before: oklch colours and
 * a built-in v4 reset (which, crucially, sets `border-style: solid` globally so
 * border-WIDTH utilities like `border-2` render — presetWind3 did not, which is
 * why frame borders had vanished). `reset: true` enables that preflight.
 *
 * Existing `class="..."` utility usage keeps working as-is.
 */
export default defineConfig({
  presets: [
    presetWind4({
      preflights: { reset: true },
    }),
  ],

  // Reusable combinations for the repeated button / panel patterns. Behaviour is
  // identical to the inline utilities they replace — they just dedupe the long
  // strings. Colour-specific variants compose the base `btn`.
  shortcuts: {
    // Base pill shape (no font-weight / colour — callers add padding + colour).
    btn: 'rounded-full transition-colors disabled:opacity-40 disabled:cursor-default',
    // Filled accent pill (handoff / save / assets). font-medium matches originals.
    'btn-primary': 'btn font-medium bg-violet-400 text-violet-950 hover:bg-violet-300',
    // Neutral pill (toggles / copy / reset). No font-medium — matches originals.
    'btn-neutral': 'btn bg-zinc-700 text-zinc-200 hover:bg-zinc-600',
    // Circular icon button. Hover text colour is left to the caller (collapse uses
    // zinc-100, clear/delete use red-400), so it isn't baked in here.
    'icon-btn': 'flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-700 transition-colors',
  },

  preflights: [
    {
      getCSS: () => `
        html, body { height: 100%; }

        /* Buttons reset to transparent. The v4 reset already neutralizes button
           backgrounds, but we keep this explicit + add the pointer cursor; any
           bg-* utility still wins via the utilities layer. */
        button { background-color: transparent; cursor: pointer; }
        button:disabled { cursor: default; }

        /* .no-scrollbar — hide scrollbar chrome, keep scrolling. Centralized here
           (was a global <style> block inside WorkspaceCanvas.vue). Modern only. */
        .no-scrollbar { scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `,
    },
  ],
});
