import path from 'node:path';

import type { UserConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import ViteSvgSpriteWrapper from 'vite-svg-sprite-wrapper';
import tsconfigPaths from 'vite-tsconfig-paths';

import viteWordPress from './vite-plugin-wordpress';

export default {
  root: 'src',
  base: '',
  publicDir: path.resolve(import.meta.dirname, 'public'),

  server: {
    host: true,
    port: 3000,
    strictPort: true,
    cors: true,
  },

  plugins: [
    tsconfigPaths(),
    sassGlobImports(),
    ViteSvgSpriteWrapper({
      icons: 'src/assets/svg/*.svg',
      outputDir: 'src/assets/images',
    }),
    ViteImageOptimizer({
      exclude: 'sprite.svg', // ViteSvgSpriteWrapperで作成されたsvgを除外
      jpeg: {
        quality: 95,
      },
      jpg: {
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
          src: ['style.css', '*.txt', 'screenshot.png', '.htaccess', '.vite/env.json', '**/*.php'],
          dest: '.',
        },
      ],
      structured: true,
    }),
    viteWordPress({
      scriptDir: 'assets/scripts',
      styleDir: 'assets/styles',
      imageDir: 'assets/images',
    }),
  ],

  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
  },

  css: {
    devSourcemap: true,
    preprocessorOptions: {
      scss: {
        // SassのMixed Declarations警告を無視
        // https://sass-lang.com/documentation/breaking-changes/mixed-decls/
        silenceDeprecations: ['mixed-decls'],
      },
    },
  },
} as const satisfies UserConfig;
