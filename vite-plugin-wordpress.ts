/* eslint-disable no-console */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { default as ansi } from 'ansi-colors';
import { default as chokidar } from 'chokidar';
import { execa } from 'execa';
import { globSync } from 'glob';
import { imageSizeFromFile } from 'image-size/fromFile';
import pLimit from 'p-limit';
import type { OutputAsset, OutputBundle, PluginContext } from 'rollup';
import sharp from 'sharp';
import { WebSocketServer, type Plugin, type ResolvedConfig } from 'vite';

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
    width?: number;
    height?: number;
  };
};

export default function viteWordPress({
  scriptDir,
  styleDir,
  imageDir,
  imageFormats = ['webp', 'avif'],
}: Options): Plugin {
  const entryPoints: EntryPoints = getEntryPoints(scriptDir, styleDir);
  const manifestPath = '.vite/manifest.json';
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'avif'];

  let host: string;
  let resolvedConfig: ResolvedConfig;

  /**
   * scripts, stylesディレクトリ直下のファイルをエントリーポイントとして取得
   */
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

  /**
   * Viteの設定値の一部をWPから使用できるようenv.jsonとして書き出す
   */
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
      MANIFEST_PATH: manifestPath,
    };

    try {
      const dir = path.join(import.meta.dirname, 'src/.vite');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(env, null, 2));
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 別のデバイスからネットワーク経由で表示できるよう、WP_HOMEとWP_SITEURLを実行環境のプライベートIPに設定
   */
  async function setWpConstants() {
    const server = `${host}:${wp.port}`;
    const args = ['run', 'wp-env', '--', 'run', 'cli', 'wp', 'config', 'set'];

    try {
      console.log((await execa`npm ${args} WP_HOME http://${server} --add`).stdout);
      console.log((await execa`npm ${args} WP_SITEURL http://${server} --add`).stdout);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 開発モードのmanifest.jsonを生成
   */
  async function writeDevManifest() {
    const inputs = resolvedConfig.build.rollupOptions.input ?? [];
    let manifest: Manifest = {};

    if (typeof inputs === 'string') {
      const filePath = path.relative(resolvedConfig.root, path.resolve(inputs));
      manifest['main'] = {
        file: filePath,
        src: filePath,
      };
    } else if (Array.isArray(inputs)) {
      inputs.forEach((input) => {
        const filePath = path.relative(resolvedConfig.root, path.resolve(input));
        manifest[filePath] = {
          file: filePath,
          src: filePath,
        };
      });
    } else {
      Object.entries(inputs).forEach(([name, input]) => {
        const filePath = path.relative(resolvedConfig.root, path.resolve(input));
        manifest[name] = {
          file: filePath,
          src: filePath,
        };
      });
    }

    manifest = await addImageSizeToManifest(resolvedConfig.root, manifest);
    fs.writeFileSync(path.join(resolvedConfig.root, manifestPath), JSON.stringify(manifest, null, 2));
  }

  /**
   * 開発モードのmanifest.jsonを更新（画像ファイルの情報更新）
   */
  async function updateDevManifest(mode: 'change' | 'add' | 'unlink', filePath: string) {
    if (new RegExp(`\\.(${imageExtensions.join('|')})$`, 'i').test(filePath) && !filePath.endsWith('sprite.svg')) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(resolvedConfig.root, '.vite/manifest.json'), 'utf-8'),
      ) as Manifest;

      const name = path.relative(resolvedConfig.root, path.resolve(filePath));

      if (mode === 'change' || mode === 'add') {
        const { width, height } = await imageSizeFromFile(filePath);
        manifest[name] = {
          file: name,
          src: name,
          width,
          height,
        };
      } else if (mode === 'unlink') {
        if (manifest[name]) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete manifest[name];
        }
      }

      fs.writeFileSync(path.join(resolvedConfig.root, manifestPath), JSON.stringify(manifest, null, 2));
    }
  }

  /**
   * ページをリロードする
   */
  function reload(ws: WebSocketServer, filePath: string) {
    ws.send({ type: 'full-reload', path: filePath });
    const fileName = filePath.startsWith(resolvedConfig.root + '/')
      ? path.posix.relative(resolvedConfig.root, filePath)
      : filePath;
    resolvedConfig.logger.info(ansi.green(`page reload `) + ansi.dim(fileName), {
      clear: true,
      timestamp: true,
    });
  }

  /**
   * jpgとpng画像をwebpとavifに変換して書き出す
   */
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

  /**
   * 画像のサイズをmanifest.jsonに書き込む
   */
  async function writeImageSizeToManifest() {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(resolvedConfig.build.outDir, '.vite/manifest.json'), 'utf-8'),
    ) as Manifest;
    const newManifest: Manifest = await addImageSizeToManifest(resolvedConfig.build.outDir, manifest);
    fs.writeFileSync(path.join(resolvedConfig.build.outDir, manifestPath), JSON.stringify(newManifest, null, 2));
  }

  /**
   * 画像のサイズをmanifestに追加
   */
  async function addImageSizeToManifest(root: string, manifest: Manifest) {
    const newManifest: Manifest = { ...manifest };
    const promises = Object.entries(newManifest).map(async ([fileName, info]) => {
      if (new RegExp(`\\.(${imageExtensions.join('|')})$`, 'i').test(info.file) && !fileName.endsWith('sprite.svg')) {
        const { width, height } = await imageSizeFromFile(path.join(root, info.file));
        newManifest[fileName] = {
          ...info,
          width,
          height,
        };
      }
    });

    await Promise.all(promises);
    return newManifest;
  }

  /**
   * 実行環境のプライベートIPアドレスを取得
   */
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

  /**
   * プラグインフック
   */
  return {
    name: 'wordpress',

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
            input.push(...globSync(path.join(imageDir, `**/*.{${imageExtensions.join(',')}}`)));
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
    },

    configureServer: (server) => {
      let watcher: chokidar.FSWatcher;

      server.httpServer?.once('listening', () => {
        setWpConstants();
        writeDevManifest();

        const limit = pLimit(1);
        watcher = chokidar
          .watch(
            [path.join(resolvedConfig.root, '**/*.php'), path.join(imageDir, `**/*.{${imageExtensions.join(',')}}`)],
            { ignoreInitial: true, ignored: /sprite\.svg$/ },
          )
          .on('add', (filePath) => {
            reload(server.ws, filePath);
            limit(() => updateDevManifest('add', filePath));
          })
          .on('change', (filePath) => {
            reload(server.ws, filePath);
            limit(() => updateDevManifest('change', filePath));
          })
          .on('unlink', (filePath) => {
            reload(server.ws, filePath);
            limit(() => updateDevManifest('unlink', filePath));
          });
      });

      server.httpServer?.once('close', async () => {
        await watcher?.close();
      });
    },

    generateBundle: async function (_, bundle) {
      await convertImageFormats(this, bundle);
    },

    writeBundle: async () => {
      await writeImageSizeToManifest();
    },
  };
}
