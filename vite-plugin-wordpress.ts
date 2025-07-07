/* eslint-disable no-console */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { default as ansi } from 'ansi-colors';
import { execa } from 'execa';
import { globSync } from 'glob';
import pLimit from 'p-limit';
import type { OutputAsset, OutputBundle, PluginContext } from 'rollup';
import sharp from 'sharp';
import { type Plugin, type ResolvedConfig } from 'vite';

import wp from './.wp-env.json';

type Options = {
  scriptDir: string;
  styleDir: string;
  imageDir: string;
  imageFormats?: ('webp' | 'avif')[] | false;
};

type EntryPoints = {
  [key: string]: {
    path: string;
    type: 'script' | 'style';
    global: boolean;
  };
};

type Manifest = {
  [key: string]: {
    file: string;
    src: string;
  };
};

export default function viteWordPress({
  scriptDir,
  styleDir,
  imageDir,
  imageFormats = ['webp', 'avif'],
}: Options): Plugin {
  const entryPoints: EntryPoints = getEntryPoints(scriptDir, styleDir);
  let host: string;
  let resolvedConfig: ResolvedConfig;

  // scripts, stylesディレクトリ直下のファイルをエントリーポイントとして取得
  function getEntryPoints(scriptDir: string, styleDir: string): EntryPoints {
    const scripts = globSync(path.join(scriptDir, '*.{js,ts}'));
    const styles = globSync(path.join(styleDir, '*.{css,scss}'));

    const entryPoints: EntryPoints = {};

    scripts.forEach((file) => {
      const name = path.basename(file);
      const nameWithoutExt = path.basename(file, path.extname(file));
      entryPoints[name] = {
        path: file,
        type: 'script',
        global: nameWithoutExt.endsWith('.global') || nameWithoutExt === 'global',
      };
    });
    styles.forEach((file) => {
      const name = path.basename(file);
      const nameWithoutExt = path.basename(file, path.extname(file));
      if (nameWithoutExt === 'wp-editor') {
        entryPoints['wp-editor'] = {
          path: file,
          type: 'style',
          global: false,
        };
      } else {
        entryPoints[name] = {
          path: file,
          type: 'style',
          global: nameWithoutExt.endsWith('.global') || nameWithoutExt === 'global',
        };
      }
    });

    return entryPoints;
  }

  // Viteの設定値の一部をWPから使用できるようenv.jsonとして書き出す
  function writeEnvJson() {
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
      fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(env, null, 2));
    } catch (e) {
      console.error(e);
    }
  }

  // 別のデバイスからネットワーク経由で表示できるよう、WP_HOMEとWP_SITEURLを実行環境のプライベートIPに設定
  async function setWpConstants() {
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
  }

  // jpgとpng画像をwebpとavifに変換して書き出す
  async function convertImageFormats(context: PluginContext, bundle: OutputBundle) {
    if (!imageFormats) {
      return;
    }

    resolvedConfig.logger.info(`\n\n${ansi.green(`Converting images to ${imageFormats.join(' and ')}...`)}`);

    const limit = pLimit(10);
    const images = Object.keys(bundle).filter((key) => /^\.(jpe?g|png)$/i.test(path.extname(key)));

    const convert = images.flatMap((image) => {
      return imageFormats.map((format) =>
        limit(async () => {
          const asset = bundle[image] as OutputAsset;
          const sharpImage = sharp(asset.source);
          const buffer = await sharpImage.toFormat(format, { quality: 100, lossless: true }).toBuffer();
          context.emitFile({
            type: 'asset',
            fileName: asset.fileName + '.' + format,
            source: new Uint8Array(buffer),
          });
          resolvedConfig.logger.info(`${ansi.blueBright(asset.fileName)} to ${ansi.yellowBright(format)}`);
          return buffer;
        }),
      );
    });

    await Promise.all(convert);
    resolvedConfig.logger.info(ansi.green('✓ images converted successfully.\n'));
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

  return {
    name: 'vite-wordpress',

    config: (config) => ({
      server: {
        proxy: {
          '^(?!/(assets|@vite|@fs|@id)/|/[^/]+\\.(jpe?g|png|gif|svg|webp|avif|txt|pdf|mp4|webm|mov|htaccess)$)': {
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
            const input: string[] = [];
            for (const ep of Object.values(entryPoints)) {
              input.push(path.resolve(import.meta.dirname, ep.path));
            }
            input.push(...globSync(path.join(imageDir, '**/*.{jpg,jpeg,png,gif,svg,webp,avif}')));
            return input;
          })(),
          output: {
            entryFileNames: () => {
              const dir = path.relative(config.root ?? '', scriptDir);
              return path.join(dir, '[name]-[hash].js');
            },
            chunkFileNames: () => {
              const dir = path.relative(config.root ?? '', scriptDir);
              return path.join(dir, '[name]-[hash].js');
            },
            assetFileNames: ({ originalFileNames }) => {
              const dir = originalFileNames[0]
                ? path.dirname(originalFileNames[0])
                : path.relative(config.root ?? '', styleDir);
              return path.join(dir, '[name]-[hash][extname]');
            },
          },
        },
      },
    }),

    configResolved: async (config) => {
      resolvedConfig = config;
      host = resolvedConfig.server.host ? getLocalIpAddress() : 'localhost';

      writeEnvJson();
      await setWpConstants();
    },

    generateBundle: async function (_, bundle) {
      await convertImageFormats(this, bundle);
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
