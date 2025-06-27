import path from 'node:path';

import type { UserConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import { liveReload } from 'vite-plugin-live-reload';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import ViteSvgSpriteWrapper from 'vite-svg-sprite-wrapper';
import tsconfigPaths from 'vite-tsconfig-paths';

import wp from './.wp-env.json';
import viteWordPress from './vite-plugin-wordpress';

const ENTRY_POINT = './src/assets/scripts/main.ts';

export default {
  root: 'src',
  base: '',
  publicDir: path.resolve(import.meta.dirname, 'public'),

  server: {
    host: true,
    port: 3000,
    strictPort: true,
    cors: true,
    proxy: {
      '^(?!/(assets|@vite|@fs|@id)/|/[^/]+\\.(gif|jpeg|jpg|png|svg|webp|txt|pdf|mp4|webm|mov|htaccess)$)': {
        target: `http://localhost:${wp.port}`,
        changeOrigin: true,
      },
    },
  },

  plugins: [
    tsconfigPaths(),
    liveReload('**/*.php'),
    sassGlobImports(),
    ViteSvgSpriteWrapper({
      icons: 'src/assets/svg/*.svg',
      outputDir: 'src/assets/images',
    }),
    ViteImageOptimizer({
      test: /\.(jpe?g|webp|avif|svg)$/i,
      exclude: 'sprite.svg', // ViteSvgSpriteWrapperで作成されたsvgを除外
      jpeg: {
        mozjpeg: true,
        quality: 95,
      },
      jpg: {
        mozjpeg: true,
        quality: 95,
      },
      webp: {
        quality: 90,
      },
      avif: {
        quality: 70,
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: ['style.css', '*.txt', 'screenshot.png', '.htaccess', '.vite/env.json'],
          dest: '.',
        },
      ],
      structured: true,
    }),
    viteWordPress({ entryPoint: ENTRY_POINT }),
  ],

  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, ENTRY_POINT),
      },
      output: {
        entryFileNames: `assets/scripts/[name]-[hash].js`,
        chunkFileNames: `assets/scripts/[name]-[hash].js`,
        assetFileNames: ({ name }) => {
          if (/\.(gif|jpeg|jpg|png|svg|webp|avif)$/.test(name ?? '')) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/\.css$/.test(name ?? '')) {
            return 'assets/styles/[name]-[hash][extname]';
          }
          if (/\.js$/.test(name ?? '')) {
            return 'assets/scripts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },

  css: {
    devSourcemap: true,
  },
} as const satisfies UserConfig;
