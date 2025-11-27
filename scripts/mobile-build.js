const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiDir = path.join(__dirname, '../src/app/api');
const tempApiDir = path.join(__dirname, '../src/app/_api_hidden');

// Fonction pour restaurer le dossier API en cas d'erreur ou de succès
function restoreApi() {
    if (fs.existsSync(tempApiDir)) {
        if (fs.existsSync(apiDir)) {
            // Si le dossier API a été recréé entre temps (peu probable), on le supprime
            fs.rmSync(apiDir, { recursive: true, force: true });
        }
        fs.renameSync(tempApiDir, apiDir);
        console.log('✅ Dossier API restauré.');
    }
}

try {
    console.log('🚀 Démarrage du build mobile...');

    // 1. Masquer le dossier API pour éviter les erreurs "API Routes not supported in static export"
    if (fs.existsSync(apiDir)) {
        console.log('🙈 Masquage temporaire des routes API...');
        fs.renameSync(apiDir, tempApiDir);
    } else {
        console.log('⚠️ Aucun dossier API trouvé, continuation...');
    }

    // 2. Exécuter le build avec la variable d'environnement
    console.log('📦 Compilation Next.js (Static Export)...');
    // Sur Windows, on doit gérer les variables d'env différemment si on n'utilise pas cross-env
    // Mais ici on est dans un script Node, donc on peut passer l'env à execSync
    execSync('next build', {
        stdio: 'inherit',
        env: { ...process.env, MOBILE_BUILD: 'true' }
    });

    // 3. Sync Capacitor
    console.log('📱 Synchronisation Capacitor...');
    execSync('npx cap sync', { stdio: 'inherit' });

    console.log('✅ Build mobile terminé avec succès !');

} catch (error) {
    console.error('❌ Erreur pendant le build:', error);
    process.exit(1);
} finally {
    // 4. Toujours restaurer le dossier API
    restoreApi();
}
