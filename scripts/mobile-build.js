import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = promisify(setTimeout);

const apiDir = path.join(__dirname, '../src/app/api');
const middlewareFile = path.join(__dirname, '../middleware.ts');
let modifiedFiles = [];

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
    console.log('🔄 Restauration des fichiers API...');
    for (const { original, temp } of modifiedFiles) {
        if (fs.existsSync(temp)) {
            try {
                if (fs.existsSync(original)) {
                    fs.unlinkSync(original);
                }
                fs.renameSync(temp, original);
                console.log(` Restauré : ${path.relative(apiDir, original)}`);
            } catch (err) {
                console.error(`Erreur lors de la restauration de ${original}: ` + err.message);
            }
        }
    }
}

async function runBuild() {
    try {
        console.log('🚀 Démarrage du build mobile...');
        if (fs.existsSync(apiDir)) {
            console.log('🙈 Masquage temporaire des routes API (renommage chirurgical)...');
            const routeFiles = getAllRouteFiles(apiDir);
            for (const file of routeFiles) {
                const tempFile = file + '.tmp_build';
                try {
                    fs.renameSync(file, tempFile);
                    modifiedFiles.push({ original: file, temp: tempFile });
                    console.log(`� Masqué : ${path.relative(apiDir, file)}`);
                } catch (err) {
                    console.error(`Impossible de masquer ${file}: ` + err.message);
                    throw err;
                }
            }
        }

        if (fs.existsSync(middlewareFile)) {
            console.log('🙈 Masquage temporaire du middleware...');
            const tempMiddleware = middlewareFile + '.tmp_build';
            try {
                fs.renameSync(middlewareFile, tempMiddleware);
                modifiedFiles.push({ original: middlewareFile, temp: tempMiddleware });
            } catch (err) {
                console.error(`Impossible de masquer le middleware: ` + err.message);
                throw err;
            }
        }

        console.log('📦 Compilation Next.js (Static Export)...');
        // On utilise npx pour être sûr de trouver l'exécutable local
        execSync('npx next build', {
            stdio: 'inherit',
            env: { ...process.env, MOBILE_BUILD: 'true' }
        });

        console.log('📱 Synchronisation Capacitor...');
        execSync('npx cap sync', { stdio: 'inherit' });

        console.log(' Build mobile terminé avec succès !');
    } catch (error) {
        console.error('Erreur pendant le build:', error.message);
    } finally {
        await restoreFiles();
    }
}

runBuild();
