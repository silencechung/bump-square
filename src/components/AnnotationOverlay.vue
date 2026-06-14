<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { useAnnotations } from '~src/composables/useAnnotations';
import { useT } from '~src/composables/useT';
import { useWorkspaceStore } from '~src/stores/workspace';
import { DEFAULT_LOCALE } from '~src/i18n';

// Compile every help/<locale>/*.md into the bundle at build time, keyed as
// helpByLocale[locale][area]. Missing-locale lookups fall back to zh-TW so
// adding a new locale doesn't require translating every file up front.
const helpModules = import.meta.glob('../content/help/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const helpByLocale: Record<string, Record<string, string>> = {};
for (const path of Object.keys(helpModules)) {
  const parts = path.split('/');
  const file = parts.pop()!;
  const locale = parts.pop()!;
  const area = file.replace(/\.md$/, '');
  (helpByLocale[locale] ??= {})[area] = helpModules[path];
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

const { activeArea, close } = useAnnotations();
const store = useWorkspaceStore();
const t = useT();

// Anchor rect of the dot whose area is active. Refreshed on resize/scroll/
// activeArea change so the popover follows panel resizes or canvas zoom.
const rect = ref<DOMRect | null>(null);

// Reactive viewport size so the style computed re-runs on window resize even
// when the anchor element itself hasn't moved (edge case for dots pinned to
// viewport-relative positions). Initialised to 0 to stay SSR-safe; populated
// in onMounted.
const viewport = ref({ w: 0, h: 0 });

const html = computed(() => {
  if (!activeArea.value) {
    return '';
  }
  const area = activeArea.value;
  const raw = helpByLocale[store.locale]?.[area] ?? helpByLocale[DEFAULT_LOCALE]?.[area];
  return raw ? md.render(raw) : `<p>${t('annotation.missing')}</p>`;
});

function updateRect() {
  if (!activeArea.value) {
    rect.value = null;
    return;
  }
  const el = document.querySelector<HTMLElement>(
    `[data-annotation-area="${activeArea.value}"]`,
  );
  rect.value = el?.getBoundingClientRect() ?? null;
}

function onResize() {
  viewport.value = { w: window.innerWidth, h: window.innerHeight };
  updateRect();
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && activeArea.value) {
    close();
  }
}

function onClickOutside(e: MouseEvent) {
  if (!activeArea.value) {
    return;
  }
  const t = e.target as HTMLElement;
  if (t.closest('.annotation-popover, [data-annotation-area]')) {
    return;
  }
  close();
}

// Listeners that matter ONLY while a popover is open. Heaviest is the
// capture-phase scroll listener (fires on every scroll inside any descendant
// — notes rail, terminal panel, etc.). Attaching only when active avoids
// querySelectoring on every idle scroll event.
function attachActiveListeners() {
  document.addEventListener('click', onClickOutside);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', updateRect, true);
}
function detachActiveListeners() {
  document.removeEventListener('click', onClickOutside);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', updateRect, true);
}

watch(activeArea, async (newVal, oldVal) => {
  if (newVal && !oldVal) {
    attachActiveListeners();
  }
  else if (!newVal && oldVal) {
    detachActiveListeners();
  }
  await nextTick();
  updateRect();
});

onMounted(() => {
  viewport.value = { w: window.innerWidth, h: window.innerHeight };
  window.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  detachActiveListeners();
});

const POPOVER_W = 320;
const POPOVER_MAX_VH = 0.6; // Matches CSS max-h-[60vh]
const MARGIN = 12;

// Default placement: below-and-aligned-left to the dot. If that overflows
// right edge, clamp left; if it would overflow bottom, flip above. Use the
// actual popover max-height (60vh) instead of a hardcoded 200px so tall
// content flips above when it should.
const style = computed(() => {
  if (!rect.value || viewport.value.h === 0) {
    return { display: 'none' as const };
  }
  const r = rect.value;
  const v = viewport.value;
  const maxH = v.h * POPOVER_MAX_VH;
  let left = r.left;
  let top = r.bottom + 8;
  if (left + POPOVER_W > v.w - MARGIN) {
    left = Math.max(MARGIN, v.w - POPOVER_W - MARGIN);
  }
  if (top + maxH > v.h - MARGIN) {
    top = Math.max(MARGIN, r.top - 8 - maxH);
  }
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${POPOVER_W}px`,
  };
});
</script>

<template>
  <transition name="annotation">
    <div
      v-if="activeArea && rect"
      class="annotation-popover fixed z-50 px-4 py-3 text-sm rounded-md border border-violet-400/40 bg-zinc-900/85 backdrop-blur-md shadow-[0_0_24px_-4px_rgba(167,139,250,0.45)] max-h-[60vh] overflow-y-auto"
      :style="style"
      v-html="html"
    />
  </transition>
</template>

<style scoped>
/* Markdown-rendered children need plain CSS — UnoCSS classes can't be
   applied through v-html, and `@apply` isn't enabled in this project's
   UnoCSS config. Sized one notch smaller than body text since this is a
   floating annotation, not a doc page. */
.annotation-popover :deep(h1) {
  color: rgb(196 181 253);
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}
.annotation-popover :deep(p) {
  color: rgb(228 228 231);
  font-size: 0.78rem;
  line-height: 1.55;
  margin-bottom: 0.5rem;
}
.annotation-popover :deep(p:last-child) { margin-bottom: 0; }
.annotation-popover :deep(ul) {
  font-size: 0.78rem;
  color: rgb(212 212 216);
  list-style: disc;
  padding-left: 1.1rem;
  margin-bottom: 0.5rem;
}
.annotation-popover :deep(ul li) { margin-bottom: 0.15rem; }
.annotation-popover :deep(ul:last-child) { margin-bottom: 0; }
.annotation-popover :deep(code) {
  color: rgb(221 214 254);
  background: rgba(39, 39, 42, 0.8);
  padding: 0 0.28rem;
  border-radius: 3px;
  font-size: 0.7rem;
}
.annotation-popover :deep(strong) {
  color: rgb(244 244 245);
  font-weight: 600;
}
.annotation-popover :deep(table) {
  font-size: 0.72rem;
  margin-bottom: 0.5rem;
  border-collapse: collapse;
}
.annotation-popover :deep(th),
.annotation-popover :deep(td) {
  padding: 0.18rem 0.4rem;
  border-bottom: 1px solid rgba(82, 82, 91, 0.45);
  text-align: left;
}
.annotation-popover :deep(th) {
  color: rgb(196 181 253);
  font-weight: 600;
}

.annotation-enter-active,
.annotation-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.annotation-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
.annotation-leave-to {
  opacity: 0;
  transform: translateY(-2px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .annotation-enter-active,
  .annotation-leave-active { transition: none; }
}
</style>
