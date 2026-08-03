import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getNextBuildDirectory,
    getStaticExportDirectory,
} from './next-build-path.mjs';

test('uses a separate Next.js output directory for mobile builds', () => {
    assert.equal(getNextBuildDirectory({ isMobile: true }), '.next-mobile');
    assert.equal(getNextBuildDirectory({ isMobile: false }), '.next');
    assert.equal(getStaticExportDirectory({ isMobile: true }), '.next-mobile');
    assert.equal(getStaticExportDirectory({ isMobile: false }), 'out');
});
