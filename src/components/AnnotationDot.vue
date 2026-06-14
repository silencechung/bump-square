<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotations, type HelpArea } from '~src/composables/useAnnotations';
import { useT } from '~src/composables/useT';

const t = useT();
const props = defineProps<{
  area: HelpArea;
  /** Tailwind/UnoCSS positioning override — defaults to top-right corner of
   * the nearest positioned parent. Pass e.g. "top-1 right-1" or
   * "-top-2 -right-2" depending on whether you want the dot inside or
   * floating off the corner. */
  pos?: string;
}>();

const { annotationMode, activeArea, open } = useAnnotations();

/** Stagger each dot's pulse cycle so adjacent dots don't beat in lockstep.
 * Derived from a stable hash of the area name → 0–700ms range. Pure CSS
 * delay; doesn't move the dot or change layout. */
const animationDelay = computed(() => {
  let h = 0;
  for (let i = 0; i < props.area.length; i++) h = (h * 31 + props.area.charCodeAt(i)) | 0;
  return `${((h % 8) + 8) % 8 * 100}ms`;
});
</script>

<template>
  <button
    v-if="annotationMode"
    type="button"
    :data-annotation-area="area"
    :aria-label="`${t('annotation.dotLabel')}${area}`"
    :style="{ animationDelay }"
    :class="[
      'annotation-dot absolute z-30 w-2.5 h-2.5 rounded-full',
      'bg-violet-400',
      'shadow-[0_0_10px_2px_rgba(167,139,250,0.55)]',
      'transition-transform hover:scale-150',
      activeArea === area ? 'scale-150 ring-2 ring-violet-200/60' : '',
      pos ?? 'top-1 right-1',
    ]"
    @click.stop="open(area)"
  />
</template>

<style scoped>
.annotation-dot {
  animation: bsq-pulse 2.4s ease-in-out infinite;
}

@keyframes bsq-pulse {
  0%, 100% {
    box-shadow: 0 0 6px 1px rgba(167, 139, 250, 0.35);
    opacity: 0.85;
  }
  50% {
    box-shadow: 0 0 14px 3px rgba(167, 139, 250, 0.7);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .annotation-dot { animation: none; }
}
</style>
