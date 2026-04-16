import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appDir = path.join(__dirname, '../src/app');
const middlewareFile = path.join(__dirname, '../middleware.ts');
let modifiedFiles = [];  // { original, temp } — fichiers renommés

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


async function restoreFiles() {
    console.log('Restauration des fichiers...');

    // Restaurer les route handlers / middleware renommés
    for (const { original, temp } of modifiedFiles) {
        if (fs.existsSync(temp)) {
            try {
                if (fs.existsSync(original)) fs.unlinkSync(original);
                fs.renameSync(temp, original);
                console.log(` Restauré : ${path.relative(appDir, original)}`);
            } catch (err) {
                console.error(`Erreur restauration ${original}: ` + err.message);
            }
        }
    }
}

async function runBuild() {
    try {
        console.log('Démarrage du build mobile...');

        // 1. Masquer les route handlers
        if (fs.existsSync(appDir)) {
            console.log('Masquage temporaire de tous les route handlers...');
            const routeFiles = getAllRouteFiles(appDir);
            for (const file of routeFiles) {
                const tempFile = file + '.tmp_build';
                try {
                    fs.renameSync(file, tempFile);
                    modifiedFiles.push({ original: file, temp: tempFile });
                    console.log(` Masqué : ${path.relative(appDir, file)}`);
                } catch (err) {
                    console.error(`Impossible de masquer ${file}: ` + err.message);
                    throw err;
                }
            }
        }

        // 2. Masquer le middleware
        if (fs.existsSync(middlewareFile)) {
            console.log('Masquage temporaire du middleware...');
            const tempMiddleware = middlewareFile + '.tmp_build';
            try {
                fs.renameSync(middlewareFile, tempMiddleware);
                modifiedFiles.push({ original: middlewareFile, temp: tempMiddleware });
            } catch (err) {
                console.error(`Impossible de masquer le middleware: ` + err.message);
                throw err;
            }
        }

        // 3. Supprimer le cache dev de Next.js (contient validator.ts qui référence les routes masquées)
        const nextDevDir = path.join(__dirname, '../.next/dev');
        if (fs.existsSync(nextDevDir)) {
            console.log('Nettoyage du cache Next.js dev...');
            fs.rmSync(nextDevDir, { recursive: true, force: true });
        }

        // 4. Build Next.js static export
        console.log('Compilation Next.js (Static Export)...');
        execSync('npx next build', {
            stdio: 'inherit',
            env: { ...process.env, MOBILE_BUILD: 'true' }
        });

        // 5. Sync Capacitor
        console.log('Synchronisation Capacitor...');
        execSync('npx cap sync', { stdio: 'inherit' });

        console.log('Build mobile terminé avec succès !');
    } catch (error) {
        console.error('Erreur pendant le build:', error.message);
    } finally {
        await restoreFiles();
    }
}

// Restaurer les fichiers même si le processus est interrompu (Ctrl+C, SIGTERM)
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
