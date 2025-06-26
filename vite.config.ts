/* eslint-disable no-console */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { default as ansi } from 'ansi-colors';
import { execa } from 'execa';
import { glob } from 'glob';
import type { OutputAsset } from 'rollup';
import sharp from 'sharp';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import { liveReload } from 'vite-plugin-live-reload';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import ViteSvgSpriteWrapper from 'vite-svg-sprite-wrapper';
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
  publicDir: path.resolve(__dirname, 'public'),

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
      sprite: {
        shape: {
          transform: [
            {
              svgo: {
                plugins: [
                  {
                    name: 'preset-default',
                    params: {
                      overrides: {
                        convertShapeToPath: false,
                        moveGroupAttrsToElems: false,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
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
          if (/\.(gif|jpeg|jpg|png|svg|webp|avif)$/.test(name ?? '')) {
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
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'vite-wordpress',

    configResolved: async (config) => {
      // プライベートIPアドレスを取得する関数
      const getLocalIpAddress = (): string => {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          const networkInterface = interfaces[name];
          if (networkInterface) {
            for (const net of networkInterface) {
              // IPv4でかつ内部ネットワークでないもの（プライベートIP）を選択
              if (net.family === 'IPv4' && !net.internal) {
                return net.address;
              }
            }
          }
        }
        return 'localhost';
      };

      const host = config.server.host ? getLocalIpAddress() : 'localhost';
      resolvedConfig = config;

      // Viteの設定値の一部をWPから使用できるようenv.jsonとして書き出す
      const env = {
        IS_DEVELOPMENT: resolvedConfig.mode === 'development' ? true : false,
        VITE_DEV_SERVER: `${host}:${resolvedConfig.server.port}`,
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

      // 別のデバイスからネットワーク経由で表示できるよう、
      // WP_HOMEとWP_SITEURLを実行環境のプライベートIPに設定
      if (resolvedConfig.command === 'serve') {
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

    generateBundle: async function (_, bundle) {
      // jpgとpng画像をwebpとavifに変換して書き出す
      const formats = ['webp', 'avif'] as const;
      const images = Object.keys(bundle).filter((key) => /^\.(jpe?g|png)$/i.test(path.extname(key)));

      resolvedConfig.logger.info(`\n\n${ansi.green('Converting images to webp and avif...')}`);

      await Promise.all(
        images.map(async (image) => {
          const asset = bundle[image] as OutputAsset;
          const sharpImage = sharp(asset.source);

          await Promise.all(
            formats.map(async (format) => {
              // 最適化はViteImageOptimizerで行うため、ここでは最高品質を指定
              const converted = await sharpImage.toFormat(format, { quality: 100, lossless: true }).toBuffer();
              this.emitFile({
                type: 'asset',
                fileName: asset.fileName + '.' + format,
                source: converted,
              });

              resolvedConfig.logger.info(`${ansi.blueBright(asset.fileName)} to ${ansi.yellowBright(format)}`);
            }),
          );
        }),
      );

      resolvedConfig.logger.info(ansi.green('✓ Image conversion completed.\n'));
    },

    writeBundle: async () => {
      // manifest.jsonをもとに、
      // PHPファイル内のファイルパスをビルド後のパスに書き換え
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
