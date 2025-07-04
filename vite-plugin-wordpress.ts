/* eslint-disable no-console */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { default as ansi } from 'ansi-colors';
import { execa } from 'execa';
import { globSync } from 'glob';
import type { OutputAsset } from 'rollup';
import sharp from 'sharp';
import { type Plugin, type ResolvedConfig } from 'vite';

import wp from './.wp-env.json';

export type ViteWordPressOptions = {
  imageFormats?: ('webp' | 'avif')[] | false;
};

type EntryPoints = {
  [key: string]: {
    path: string;
    global: boolean;
  };
};

type Manifest = {
  [key: string]: {
    file: string;
    src: string;
  };
};

export default function viteWordPress(options?: ViteWordPressOptions): Plugin {
  const optionImageFormats = options?.imageFormats ?? ['webp', 'avif'];
  const entryPoints: EntryPoints = {};
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'vite-wordpress',

    config: () => {
      // scripts, stylesディレクトリ直下のファイルをエントリーポイントとして設定
      const scripts = globSync(path.join(import.meta.dirname, 'src/assets/scripts/*.{ts,js}'));
      const styles = globSync(path.join(import.meta.dirname, 'src/assets/styles/*.{scss,css}'));

      scripts.forEach((file) => {
        const name = path.basename(file, path.extname(file));
        entryPoints[`${name}-script`] = { path: file, global: name.endsWith('.global') || name === 'global' };
      });
      styles.forEach((file) => {
        const name = path.basename(file, path.extname(file));
        entryPoints[`${name}-style`] = { path: file, global: name.endsWith('.global') || name === 'global' };
      });

      return {
        server: {
          proxy: {
            '^(?!/(assets|@vite|@fs|@id)/|/[^/]+\\.(gif|jpeg|jpg|png|svg|webp|txt|pdf|mp4|webm|mov|htaccess)$)': {
              target: `http://localhost:${wp.port}`,
              changeOrigin: true,
            },
          },
        },
        build: {
          emptyOutDir: true,
          assetsInlineLimit: 0,
          manifest: true,
          rollupOptions: {
            input: (() => {
              let inputs = {};
              for (const [name, data] of Object.entries(entryPoints)) {
                inputs[name] = path.resolve(import.meta.dirname, data.path);
              }
              inputs = {
                ...inputs,
                ...globSync('./src/assets/images/**/*.{jpg,jpeg,png,gif,tiff,webp,svg,avif}'),
              };
              return inputs;
            })(),
            output: {
              assetFileNames: ({ originalFileNames }) => {
                const dir = originalFileNames[0] ? path.dirname(originalFileNames[0]) : 'assets/styles';
                return path.join(dir, '[name]-[hash][extname]');
              },
            },
          },
        },
      };
    },

    configResolved: async (config) => {
      const host = config.server.host ? getLocalIpAddress() : 'localhost';
      resolvedConfig = config;

      // Viteの設定値の一部をWPから使用できるようenv.jsonとして書き出す
      const env = {
        IS_DEVELOPMENT: resolvedConfig.mode === 'development' ? true : false,
        VITE_DEV_SERVER: `${host}:${resolvedConfig.server.port}`,
        ENTRY_POINTS: Object.fromEntries(
          Object.entries(entryPoints).map(([key, value]) => [
            key,
            { ...value, path: path.relative(resolvedConfig.root, value.path) },
          ]),
        ),
        MANIFEST_PATH: '.vite/manifest.json',
      };

      try {
        const dir = path.join(import.meta.dirname, 'src/.vite');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(env));
      } catch (e) {
        console.error(e);
      }

      // 別のデバイスからネットワーク経由で表示できるよう、
      // WP_HOMEとWP_SITEURLを実行環境のプライベートIPに設定
      if (resolvedConfig.command === 'serve') {
        const server = `${host}:${wp.port}`;
        const args = ['run', 'wp-env', '--', 'run', 'cli', 'wp', 'config', 'set'];

        try {
          console.log((await execa`npm ${args} WP_HOME http://${server} --add`).stdout);
          console.log((await execa`npm ${args} WP_SITEURL http://${server} --add`).stdout);
        } catch (e) {
          console.error(e);
        }
      }
    },

    generateBundle: async function (_, bundle) {
      // jpgとpng画像をwebpとavifに変換して書き出す
      if (!optionImageFormats) {
        return;
      }

      const images = Object.keys(bundle).filter((key) => /^\.(jpe?g|png)$/i.test(path.extname(key)));

      resolvedConfig.logger.info(`\n\n${ansi.green('Converting images to webp and avif...')}`);

      await Promise.all(
        images.map(async (image) => {
          const asset = bundle[image] as OutputAsset;
          const sharpImage = sharp(asset.source);

          await Promise.all(
            optionImageFormats.map(async (format) => {
              // 最適化はViteImageOptimizerで行うため、ここでは最高品質を指定
              const converted = await sharpImage.toFormat(format, { quality: 100, lossless: true }).toBuffer();
              this.emitFile({
                type: 'asset',
                fileName: asset.fileName + '.' + format,
                source: new Uint8Array(converted),
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
        const phpFiles = globSync(path.join(resolvedConfig.root, '**/*.php'));
        const manifest = JSON.parse(
          fs.readFileSync(path.join(resolvedConfig.build.outDir, '.vite/manifest.json'), 'utf-8'),
        ) as Manifest;

        phpFiles.forEach(async (file) => {
          const output = file.replace(resolvedConfig.root, resolvedConfig.build.outDir);
          let content = fs.readFileSync(file, 'utf-8');

          Object.keys(manifest).forEach((key) => {
            const { file, src } = manifest[key];
            if (src) {
              content = content.replace(new RegExp(src, 'g'), file);
            }
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

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const networkInterface = interfaces[name];
    if (networkInterface) {
      for (const net of networkInterface) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }
  return 'localhost';
}
