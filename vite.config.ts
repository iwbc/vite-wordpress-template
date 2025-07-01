import path from 'node:path';

import { globSync } from 'glob';
import type { UserConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import { liveReload } from 'vite-plugin-live-reload';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import ViteSvgSpriteWrapper from 'vite-svg-sprite-wrapper';
import tsconfigPaths from 'vite-tsconfig-paths';

import wp from './.wp-env.json';
import viteWordPress, { ViteWordPressOptions } from './vite-plugin-wordpress';

const entryPoints = {
  'global-script': { path: './src/assets/scripts/global.ts', global: true },
  'global-style': { path: './src/assets/styles/global.scss', global: true },
  'top-script': { path: './src/assets/scripts/top.ts' },
  'top-style': { path: './src/assets/styles/pages/top.scss' },
} satisfies ViteWordPressOptions['entryPoints'];

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
    viteWordPress({ entryPoints }),
  ],

  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    manifest: true,
    rollupOptions: {
      input: (() => {
        let inputs = {};
        for (const [name, data] of Object.entries(entryPoints)) {
          inputs[name] = path.resolve(import.meta.dirname, data.path);
        }
        inputs = { ...inputs, ...globSync('./src/assets/images/**/*.{jpg,jpeg,png,gif,tiff,webp,svg,avif}') };
        return inputs;
      })(),
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
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['mixed-decls'],
      },
    },
  },
} as const satisfies UserConfig;
