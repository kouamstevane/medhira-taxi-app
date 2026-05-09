import { spawnSync } from 'node:child_process';

async function waitForHttp(
  url: string,
  timeoutMs = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Service ${url} not ready within ${timeoutMs}ms`,
  );
}

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SKIP_DOCKER === '1') return;
  const r = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.e2e.yml',
      'up',
      '-d',
      'stripe-mock',
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0)
    throw new Error(
      'docker compose up failed (is Docker running?)',
    );
  await waitForHttp('http://localhost:12111/v1/charges', 20000);
}
