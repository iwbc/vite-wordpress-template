/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

import { execa } from 'execa';
import { glob } from 'glob';
import { default as ip } from 'ip';
import type { Plugin, UserConfig } from 'vite';
import { liveReload } from 'vite-plugin-live-reload';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import tsconfigPaths from 'vite-tsconfig-paths';

import wp from './.wp-env.json';

type Manifest = {
  [key: string]: {
    file: string;
    src: string;
  };
};

const main = 'assets/js/main.ts';

const userConfig = {
  root: 'src',
  base: '',

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    proxy: {
      '^(?!/(assets|@vite|@fs|@id)/|/[^/]+\\.(gif|jpeg|jpg|png|svg|webp|txt|pdf|mp4|webm|mov|htaccess)$)': {
        target: `http://localhost:${wp.port}`,
        changeOrigin: true,
      },
    },
  },

  preview: {
    port: 4173,
  },

  plugins: [
    tsconfigPaths(),
    sassGlobImports(),
    liveReload('**/*.php'),
    viteStaticCopy({
      targets: [
        {
          src: ['style.css', '*.txt', 'screenshot.png', './.vite/env.json'],
          dest: '.',
        },
      ],
      structured: true,
    }),
    viteWordPress(),
  ],

  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src', main),
      },
      output: {
        entryFileNames: `assets/js/[name]-[hash].js`,
        chunkFileNames: `assets/js/[name]-[hash].js`,
        assetFileNames: ({ name }) => {
          if (/\.( gif|jpeg|jpg|png|svg|webp| )$/.test(name ?? '')) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/\.css$/.test(name ?? '')) {
            return 'assets/css/[name]-[hash][extname]';
          }
          if (/\.js$/.test(name ?? '')) {
            return 'assets/js/[name]-[hash][extname]';
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

function viteWordPress(): Plugin {
  return {
    name: 'vite-wordpress',

    configResolved: async (config) => {
      const host = config.server.host ? ip.address() : 'localhost';

      const env = {
        VITE_SERVER: `${host}:${config.mode === 'development' ? config.server.port : config.preview.port}`,
        ENTRY_POINT: main,
        MANIFEST_PATH: '.vite/manifest.json',
      };

      try {
        const dir = __dirname + '/src/.vite';
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dir + '/env.json', JSON.stringify(env));
      } catch (e) {
        console.error(e);
      }

      if (config.command === 'serve') {
        const server = `${host}:${wp.port}`;
        const args = ['run', 'wp-env', '--', 'run', 'cli', 'wp', 'config', 'set'];

        try {
          console.log((await execa('npm', [...args, 'WP_HOME', `http://${server}`, '--add'])).stdout);
          console.log((await execa('npm', [...args, 'WP_SITEURL', `http://${server}`, '--add'])).stdout);
        } catch (e) {
          console.error(e);
        }
      }
    },

    writeBundle: async () => {
      try {
        const phpFiles = glob.sync(userConfig.root + '/**/*.php');
        const manifest = JSON.parse(
          fs.readFileSync(userConfig.build.outDir + '/.vite/manifest.json', 'utf-8'),
        ) as Manifest;

        phpFiles.forEach(async (file) => {
          const output = file.replace(userConfig.root, userConfig.build.outDir);
          let content = fs.readFileSync(file, 'utf-8');

          Object.keys(manifest).forEach((key) => {
            const { file, src } = manifest[key];
            content = content.replace(new RegExp(src, 'g'), file);
          });

          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, content);
        });
      } catch (e) {
        console.error(e);
      }
    },
  };
}

export default userConfig;
