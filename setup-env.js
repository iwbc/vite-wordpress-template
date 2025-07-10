import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

const env = {
  WP_ENV_CONTAINER_HASH: '',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// コンテナハッシュを取得し.envとして書き出す
const { stdout } = await execa('npm', ['run', 'wp-env', '--', 'install-path']);
env.WP_ENV_CONTAINER_HASH = path.basename(stdout);

const output = Object.entries(env)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
fs.writeFileSync(path.resolve(__dirname, '.env'), output);

// プラグインをコンテナからコピー
const containerPluginsDir = `${env.WP_ENV_CONTAINER_HASH}-wordpress-1:/var/www/html/wp-content/plugins`;
const hostPluginsDir = path.resolve(__dirname, 'wp', 'plugins');

if (fs.existsSync(hostPluginsDir)) {
  fs.rmdirSync(hostPluginsDir, { recursive: true, force: true });
}
await execa('docker', ['cp', containerPluginsDir, hostPluginsDir]);
