import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appDir = path.join(__dirname, '../src/app');
const componentsDir = path.join(__dirname, '../src/components');
const middlewareFile = path.join(__dirname, '../middleware.ts');
const stagingDir = path.join(__dirname, '../.mobile-build-staging');
let modifiedFiles = [];

const MOBILE_EXCLUDED_PAGES = ['admin', 'test-matching'];
const MOBILE_EXCLUDED_COMPONENTS = ['admin'];

function getAllRouteFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllRouteFiles(filePath, fileList);
        } else if (file === 'route.ts' || file === 'route.js') {
            fileList.push(filePath);
        }
    });
    return fileList;
}

function moveToStaging(srcPath, label) {
    if (!fs.existsSync(srcPath)) return;
    const relativePath = path.relative(path.join(__dirname, '..'), srcPath);
    const stagingPath = path.join(stagingDir, relativePath);
    fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
    fs.renameSync(srcPath, stagingPath);
    modifiedFiles.push({ original: srcPath, staging: stagingPath });
    console.log(` Masqué : ${label}`);
}

async function restoreFiles() {
    console.log('Restauration des fichiers...');
    for (const { original, staging } of modifiedFiles) {
        if (fs.existsSync(staging)) {
            try {
                if (fs.existsSync(original)) fs.rmSync(original, { recursive: true, force: true });
                fs.mkdirSync(path.dirname(original), { recursive: true });
                fs.renameSync(staging, original);
                console.log(` Restauré : ${path.relative(path.join(__dirname, '..'), original)}`);
            } catch (err) {
                console.error(`Erreur restauration ${original}: ` + err.message);
            }
        }
    }
    if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
    }
}

async function runBuild() {
    try {
        console.log('Démarrage du build mobile...');

        if (fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true, force: true });
        }

        if (fs.existsSync(appDir)) {
            console.log('Masquage temporaire de tous les route handlers...');
            const routeFiles = getAllRouteFiles(appDir);
            for (const file of routeFiles) {
                moveToStaging(file, path.relative(appDir, file));
            }
        }

        console.log('Masquage temporaire des pages web-only...');
        for (const page of MOBILE_EXCLUDED_PAGES) {
            moveToStaging(path.join(appDir, page), `${page}/`);
        }

        for (const comp of MOBILE_EXCLUDED_COMPONENTS) {
            moveToStaging(path.join(componentsDir, comp), `components/${comp}/`);
        }

        if (fs.existsSync(middlewareFile)) {
            console.log('Masquage temporaire du middleware...');
            moveToStaging(middlewareFile, 'middleware.ts');
        }

        const nextCacheDir = path.join(__dirname, '../.next');
        if (fs.existsSync(nextCacheDir)) {
            console.log('Nettoyage du cache Next.js...');
            fs.rmSync(nextCacheDir, { recursive: true, force: true });
        }

        console.log('Compilation Next.js (Static Export)...');
        execSync('npx next build', {
            stdio: 'inherit',
            env: { ...process.env, MOBILE_BUILD: 'true' }
        });

        console.log('Synchronisation Capacitor...');
        execSync('npx cap sync', { stdio: 'inherit' });

        console.log('Build mobile terminé avec succès !');
    } catch (error) {
        console.error('Erreur pendant le build:', error.message);
    } finally {
        await restoreFiles();
    }
}

process.on('SIGINT', async () => {
    console.log('\nInterruption détectée — restauration des fichiers...');
    await restoreFiles();
    process.exit(1);
});
process.on('SIGTERM', async () => {
    await restoreFiles();
    process.exit(1);
});

runBuild();
