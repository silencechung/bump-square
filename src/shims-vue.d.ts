/**
 * Type shim for importing `.vue` Single-File Components from `.ts` files.
 * Without this, `import X from './X.vue'` inside a `.ts` errors with
 * `Cannot find module ... or its corresponding type declarations`. The Vue
 * tsc plugin handles SFCs imported from another SFC, but `.ts` imports go
 * through the plain TypeScript resolver and need the ambient declaration.
 *
 * Currently used by `src/lib/mentionSuggestion.ts` to mount `MentionList.vue`
 * via Tiptap's `VueRenderer`.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
