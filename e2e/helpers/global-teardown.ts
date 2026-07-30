import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const STATE_FILE = join(process.cwd(), 'test-results', 'e2e-global-state.json');

function stopProcessTree(pid: number) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
    }
  }
}

export default async function globalTeardown() {
  if (process.env.PLAYWRIGHT_SKIP_DOCKER !== '1') {
    spawnSync(
      'docker',
      ['compose', '-f', 'docker-compose.e2e.yml', 'down'],
      { stdio: 'inherit' },
    );
  }

  if (!existsSync(STATE_FILE)) return;
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    firebasePid?: number;
    startedFirebase?: boolean;
  };
  if (state.startedFirebase && state.firebasePid) {
    stopProcessTree(state.firebasePid);
  }
  rmSync(STATE_FILE, { force: true });
}
