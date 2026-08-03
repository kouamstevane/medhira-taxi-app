import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    clearReleaseApkOutput,
    findReleaseApks,
    runCommand,
    runReleaseBuild,
    validateReleaseKeystore,
} from './android-apk-release.mjs';

function createTempProject() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'medjira-release-test-'));
}

function createAndroidLayout(rootDir) {
    const androidDir = path.join(rootDir, 'android');
    fs.mkdirSync(path.join(androidDir, 'app'), { recursive: true });
    return androidDir;
}

test('rejects a release build when keystore.properties is absent', () => {
    const rootDir = createTempProject();
    const androidDir = createAndroidLayout(rootDir);

    assert.throws(
        () => validateReleaseKeystore(androidDir),
        /keystore\.properties.*introuvable/i,
    );
});

test('rejects a release build when the keystore configuration is incomplete', () => {
    const rootDir = createTempProject();
    const androidDir = createAndroidLayout(rootDir);
    fs.writeFileSync(
        path.join(androidDir, 'keystore.properties'),
        'MEDJIRA_KEYSTORE_FILE=release.jks\nMEDJIRA_KEYSTORE_PASSWORD=secret\n',
    );

    assert.throws(
        () => validateReleaseKeystore(androidDir),
        /propriétés obligatoires manquantes/i,
    );
});

test('rejects a release build when the keystore file does not exist', () => {
    const rootDir = createTempProject();
    const androidDir = createAndroidLayout(rootDir);
    fs.writeFileSync(
        path.join(androidDir, 'keystore.properties'),
        [
            'MEDJIRA_KEYSTORE_FILE=release.jks',
            'MEDJIRA_KEYSTORE_PASSWORD=secret',
            'MEDJIRA_KEY_ALIAS=medjira',
            'MEDJIRA_KEY_PASSWORD=secret',
        ].join('\n'),
    );

    assert.throws(
        () => validateReleaseKeystore(androidDir),
        /fichier keystore.*introuvable/i,
    );
});

test('validates the keystore before deleting existing APKs', () => {
    const rootDir = createTempProject();
    const androidDir = createAndroidLayout(rootDir);
    fs.writeFileSync(path.join(androidDir, 'gradlew.bat'), '@echo off');
    const outputDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release');
    fs.mkdirSync(outputDir, { recursive: true });
    const oldApk = path.join(outputDir, 'old-release.apk');
    fs.writeFileSync(oldApk, 'old apk');

    assert.throws(() => runReleaseBuild({ rootDir }), /keystore\.properties.*introuvable/i);
    assert.equal(fs.existsSync(oldApk), true);
});

test('removes the complete stale release APK output directory', () => {
    const rootDir = createTempProject();
    const outputDir = path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'app-arm64-v8a-release.apk'), 'old apk');
    fs.writeFileSync(path.join(outputDir, 'output-metadata.json'), '{}');

    clearReleaseApkOutput(outputDir);

    assert.equal(fs.existsSync(outputDir), false);
});

test('finds only non-empty APK files in the release output tree', () => {
    const rootDir = createTempProject();
    const outputDir = path.join(rootDir, 'release');
    fs.mkdirSync(path.join(outputDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'app-arm64-v8a-release.apk'), 'apk');
    fs.writeFileSync(path.join(outputDir, 'nested', 'app-armeabi-v7a-release.apk'), 'apk');
    fs.writeFileSync(path.join(outputDir, 'empty.apk'), '');
    fs.writeFileSync(path.join(outputDir, 'not-an-apk.txt'), 'text');

    assert.deepEqual(
        findReleaseApks(outputDir).sort(),
        [
            path.join(outputDir, 'app-arm64-v8a-release.apk'),
            path.join(outputDir, 'nested', 'app-armeabi-v7a-release.apk'),
        ].sort(),
    );
});

test('fails when a child build command returns a non-zero exit code', () => {
    assert.throws(
        () => runCommand(process.execPath, ['-e', 'process.exit(7)'], { cwd: process.cwd() }),
        /code de sortie 7/i,
    );
});

test('fails when a child build command exceeds its timeout', () => {
    assert.throws(
        () => runCommand(
            process.execPath,
            ['-e', 'setTimeout(() => {}, 1000)'],
            { cwd: process.cwd(), timeoutMs: 20 },
        ),
        /délai maximal/i,
    );
});
