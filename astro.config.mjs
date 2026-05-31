// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import UnoCSS from '@unocss/astro';

import node from '@astrojs/node';

export default defineConfig({
  output: 'server',

  server: { port: 4399 },

  integrations: [
    // Picks up uno.config.ts and injects the generated stylesheet into pages and
    // Vue islands. Replaces the previous @tailwindcss/vite plugin.
    UnoCSS(),
    vue({
      appEntrypoint: '/src/app.ts',
    }),
  ],

  adapter: node({
    mode: 'standalone',
  }),
});