import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

const env = {
  WP_ENV_CONTAINER_HASH: '',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { stdout } = await execa('npm', ['run', 'wp-env', '--', 'install-path']);
env.WP_ENV_CONTAINER_HASH = path.basename(stdout);

const output = Object.entries(env)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
fs.writeFileSync(path.resolve(__dirname, '.env'), output);

const wpEnvDir = path.join(os.homedir(), '.wp-env', env.WP_ENV_CONTAINER_HASH);
const wpDir = path.resolve(__dirname, 'wp', 'plugins');

if (fs.lstatSync(wpDir)) {
  fs.rmSync(wpDir, { recursive: true, force: true });
}
fs.symlink(wpEnvDir, wpDir, 'dir', () => {});
