import { spawnSync } from 'node:child_process';

export default async function globalTeardown() {
  if (process.env.PLAYWRIGHT_SKIP_DOCKER === '1') return;
  spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.e2e.yml', 'down'],
    { stdio: 'inherit' },
  );
}
