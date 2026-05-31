import { createPinia } from 'pinia';
import type { App } from 'vue';

export default (app: App) => {
  app.use(createPinia());
  app.directive('focus', { mounted: (el) => el.focus() });
};
