import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const REQUIRED_KEYSTORE_PROPERTIES = [
    'MEDJIRA_KEYSTORE_FILE',
    'MEDJIRA_KEYSTORE_PASSWORD',
    'MEDJIRA_KEY_ALIAS',
    'MEDJIRA_KEY_PASSWORD',
];

function readProperties(propertiesFile) {
    const properties = {};
    const content = fs.readFileSync(propertiesFile, 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) continue;

        const separator = line.search(/[=:]/);
        if (separator === -1) continue;

        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        properties[key] = value;
    }

    return properties;
}

export function validateReleaseKeystore(androidDir) {
    const propertiesFile = path.join(androidDir, 'keystore.properties');
    if (!fs.existsSync(propertiesFile)) {
        throw new Error('android/keystore.properties introuvable : le build Release est refusé.');
    }

    const properties = readProperties(propertiesFile);
    const missingProperties = REQUIRED_KEYSTORE_PROPERTIES.filter(
        (property) => !properties[property],
    );

    if (missingProperties.length > 0) {
        throw new Error(
            `Propriétés obligatoires manquantes dans android/keystore.properties : ${missingProperties.join(', ')}.`,
        );
    }

    const keystorePath = path.resolve(
        androidDir,
        'app',
        properties.MEDJIRA_KEYSTORE_FILE,
    );

    if (!fs.existsSync(keystorePath)) {
        throw new Error(`Fichier keystore introuvable : ${keystorePath}.`);
    }

    const keytoolCommand = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
    const passwordEnvironmentVariable = `MEDJIRA_RELEASE_STORE_PASSWORD_${process.pid}`;
    const keytoolResult = spawnSync(
        keytoolCommand,
        [
            '-list',
            '-keystore',
            keystorePath,
            '-alias',
            properties.MEDJIRA_KEY_ALIAS,
            '-storepass:env',
            passwordEnvironmentVariable,
        ],
        {
            encoding: 'utf8',
            env: {
                ...process.env,
                [passwordEnvironmentVariable]: properties.MEDJIRA_KEYSTORE_PASSWORD,
            },
            stdio: 'pipe',
            windowsHide: true,
        },
    );

    if (keytoolResult.error) {
        if (keytoolResult.error.code === 'ENOENT') {
            throw new Error('keytool est introuvable : Java JDK est requis pour valider le keystore.');
        }
        throw new Error(`Impossible de valider le keystore : ${keytoolResult.error.message}`);
    }

    if (keytoolResult.status !== 0) {
        throw new Error(
            'Keystore invalide, mot de passe du keystore incorrect ou alias de clé introuvable.',
        );
    }

    return {
        propertiesFile,
        keystorePath,
        keyAlias: properties.MEDJIRA_KEY_ALIAS,
    };
}

export function clearReleaseApkOutput(apkOutputDir) {
    fs.rmSync(apkOutputDir, { recursive: true, force: true });
}

function collectApks(directory, apks = []) {
    if (!fs.existsSync(directory)) return apks;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectApks(entryPath, apks);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.apk')) {
            if (fs.statSync(entryPath).size > 0) apks.push(entryPath);
        }
    }

    return apks;
}

export function findReleaseApks(apkOutputDir) {
    return collectApks(apkOutputDir);
}

export function runCommand(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...(options.env ?? {}) },
        shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
        stdio: 'inherit',
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        windowsHide: true,
    });

    if (result.error) {
        if (result.error.code === 'ETIMEDOUT') {
            throw new Error(`${command} a dépassé le délai maximal autorisé.`);
        }
        throw new Error(`Échec du lancement de ${command} : ${result.error.message}`);
    }

    if (result.signal) {
        throw new Error(`${command} a été interrompu par le signal ${result.signal}.`);
    }

    if (result.status !== 0) {
        throw new Error(`${command} a échoué avec le code de sortie ${result.status}.`);
    }
}

function assertStaticExport(outDir) {
    if (!fs.existsSync(outDir) || fs.readdirSync(outDir).length === 0) {
        throw new Error('Le dossier out est absent ou vide après le build Next.js.');
    }
}

export function runReleaseBuild({ rootDir = projectRoot } = {}) {
    const androidDir = path.join(rootDir, 'android');
    const apkOutputDir = path.join(
        androidDir,
        'app',
        'build',
        'outputs',
        'apk',
        'release',
    );
    const gradleWrapper = path.join(
        androidDir,
        process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
    );

    if (!fs.existsSync(gradleWrapper)) {
        throw new Error(`Gradle Wrapper introuvable : ${gradleWrapper}.`);
    }

    const keystore = validateReleaseKeystore(androidDir);
    console.log(`Keystore Release validé : alias ${keystore.keyAlias}.`);

    console.log('Suppression des anciens APK Release...');
    clearReleaseApkOutput(apkOutputDir);

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
        console.log('Construction du bundle web et synchronisation Capacitor...');
        runCommand(
            npmCommand,
            ['run', 'mobile:build'],
            { cwd: rootDir, env: { CAPACITOR_PLATFORM: 'android' } },
        );
        assertStaticExport(path.join(rootDir, 'out'));

        console.log('Compilation de l’APK Release...');
        runCommand(
            gradleWrapper,
            ['assembleRelease', '--console=plain', '--no-daemon'],
            { cwd: androidDir, timeoutMs: 15 * 60 * 1000 },
        );
    } catch (error) {
        clearReleaseApkOutput(apkOutputDir);
        throw error;
    }

    const apks = findReleaseApks(apkOutputDir);
    if (apks.length === 0) {
        throw new Error('Gradle a terminé sans produire de nouvel APK Release.');
    }

    console.log('APK Release générés :');
    for (const apk of apks) console.log(`- ${apk}`);
    return apks;
}

const isMainModule = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
    try {
        runReleaseBuild();
    } catch (error) {
        console.error(`Build Release annulé : ${error.message}`);
        process.exitCode = 1;
    }
}
