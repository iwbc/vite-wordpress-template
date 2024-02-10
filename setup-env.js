import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
