import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const nextDevDir = resolve(process.cwd(), '.next', 'dev');

rmSync(nextDevDir, { recursive: true, force: true });
