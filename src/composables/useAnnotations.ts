import { ref } from 'vue';

/**
 * Tiny shared state for the annotation overlay. Not in Pinia because there is
 * no persistence or cross-store coupling — just two refs the header toggle, the
 * dots, and the popover all read.
 */

/** All known help-content areas. Adding a new annotation = (1) add a markdown
 * file under src/content/help/<area>.md, (2) add the area to this union. Keeps
 * `<AnnotationDot area="…" />` call sites type-checked so typos surface at
 * compile time instead of as "(說明缺失)" at runtime. */
export type HelpArea =
  | 'breadcrumb'
  | 'save-cluster'
  | 'ai-cluster'
  | 'reset'
  | 'canvas'
  | 'canvas-toolbar'
  | 'notes-rail'
  | 'structure-view'
  | 'terminal-panel';

const annotationMode = ref(false);
const activeArea = ref<HelpArea | null>(null);

export function useAnnotations() {
  return {
    annotationMode,
    activeArea,
    toggleMode() {
      annotationMode.value = !annotationMode.value;
      if (!annotationMode.value) activeArea.value = null;
    },
    open(area: HelpArea) {
      activeArea.value = activeArea.value === area ? null : area;
    },
    close() {
      activeArea.value = null;
    },
  };
}
