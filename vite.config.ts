import { defineConfig } from 'vite';
import VitePluginBrowserSync from 'vite-plugin-browser-sync';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: './',

  build: {
    assetsInlineLimit: 0,
    target: 'es2022',
    manifest: true,
  },

  css: {
    devSourcemap: true,
  },

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      host: 'localhost',
    },
  },

  plugins: [
    tsconfigPaths(),
    VitePluginBrowserSync({
      dev: {
        bs: {
          port: 3000,
          proxy: 'localhost:8000',
          ui: {
            port: 3333,
          },
        },
      },
    }),
  ],
});
