/* eslint-disable @typescript-eslint/no-require-imports */
const os = require('os');

console.log('\n🔍 Configuration pour développement mobile\n');
console.log('━'.repeat(60));

// Obtenir toutes les interfaces réseau
const interfaces = os.networkInterfaces();
const ips = [];

Object.keys(interfaces).forEach(name => {
  interfaces[name].forEach(iface => {
    if (iface.family === 'IPv4' && !iface.internal) {
      ips.push({
        name,
        address: iface.address,
      });
    }
  });
});

console.log('\n📱 ÉTAPE 1 : Identifier votre adresse IP\n');
if (ips.length === 0) {
  console.log('❌ Aucune adresse IP locale trouvée');
  console.log('   Vérifiez votre connexion réseau');
} else {
  console.log('✅ Adresses IP détectées :\n');
  ips.forEach((iface, index) => {
    console.log(`   ${index + 1}. ${iface.name.padEnd(30)} → ${iface.address}`);
  });
}

console.log('\n━'.repeat(60));
console.log('\n🔥 ÉTAPE 2 : Configurer Firebase\n');
console.log('1. Ouvrir Firebase Console :');
console.log('   👉 https://console.firebase.google.com\n');
console.log('2. Sélectionner le projet : medjira-service\n');
console.log('3. Aller dans : Authentication > Settings > Authorized domains\n');
console.log('4. Cliquer sur "Add domain" et ajouter :\n');

// Afficher les domaines à ajouter
const domainsToAdd = new Set(['localhost', '127.0.0.1']);
ips.forEach(iface => {
  domainsToAdd.add(iface.address);
});

domainsToAdd.forEach(domain => {
  console.log(`   ✓ ${domain}`);
});

console.log('\n━'.repeat(60));
console.log('\n🚀 ÉTAPE 3 : Lancer le serveur\n');
console.log('Exécuter la commande suivante :\n');
console.log('   npm run dev -- -H 0.0.0.0\n');

console.log('\n━'.repeat(60));
console.log('\n📱 ÉTAPE 4 : Accéder depuis votre mobile\n');
console.log('Sur votre mobile (connecté au même WiFi) :\n');

if (ips.length > 0) {
  // Utiliser la première IP trouvée (généralement WiFi)
  const primaryIP = ips[0].address;
  console.log(`   👉 http://${primaryIP}:3000\n`);
  
  // Générer un QR code si possible
  console.log('💡 Conseil : Scannez ce QR code avec votre mobile\n');
  console.log(`   ou tapez l'URL manuellement : http://${primaryIP}:3000\n`);
}

console.log('\n━'.repeat(60));
console.log('\n🔒 ÉTAPE 5 : Configurer le Firewall (si nécessaire)\n');

if (process.platform === 'win32') {
  console.log('Sur Windows, exécuter (en tant qu\'administrateur) :\n');
  console.log('   netsh advfirewall firewall add rule name="Next.js Dev" dir=in action=allow protocol=TCP localport=3000\n');
} else if (process.platform === 'darwin') {
  console.log('Sur macOS, le firewall devrait autoriser automatiquement.\n');
  console.log('Si nécessaire, aller dans : Préférences Système > Sécurité > Pare-feu\n');
} else {
  console.log('Sur Linux (ufw) :\n');
  console.log('   sudo ufw allow 3000/tcp\n');
}

console.log('\n━'.repeat(60));
console.log('\n✅ CHECKLIST DE VÉRIFICATION\n');

const checklist = [
  'Mobile et PC sur le même réseau WiFi',
  'Domaines ajoutés dans Firebase Console',
  'Serveur lancé avec -H 0.0.0.0',
  'Firewall autorise le port 3000',
  'Pas de VPN actif',
];

checklist.forEach((item, index) => {
  console.log(`   [ ] ${index + 1}. ${item}`);
});

console.log('\n━'.repeat(60));
console.log('\n🆘 EN CAS DE PROBLÈME\n');
console.log('1. Vérifier que les domaines sont bien ajoutés dans Firebase');
console.log('2. Redémarrer le serveur Next.js');
console.log('3. Vider le cache du navigateur mobile');
console.log('4. Consulter : FIX_UNAUTHORIZED_DOMAIN.md\n');

console.log('━'.repeat(60));
console.log('\n💬 Besoin d\'aide ? Consulter la documentation Firebase :\n');
console.log('   https://firebase.google.com/docs/auth/web/redirect-best-practices\n');

// Afficher un résumé des commandes utiles
console.log('━'.repeat(60));
console.log('\n📝 COMMANDES UTILES\n');
console.log('Trouver l\'IP :');
if (process.platform === 'win32') {
  console.log('   ipconfig\n');
} else {
  console.log('   ifconfig\n');
}
console.log('Lancer le serveur :');
console.log('   npm run dev -- -H 0.0.0.0\n');
console.log('Tester la connexion depuis le mobile :');
if (ips.length > 0) {
  console.log(`   ping ${ips[0].address}\n`);
}

console.log('━'.repeat(60) + '\n');
