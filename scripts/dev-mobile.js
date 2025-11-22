/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('child_process');
const os = require('os');

// Obtenir les adresses IP
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

console.log('\n🚀 Démarrage du serveur Next.js pour mobile...\n');

if (ips.length > 0) {
  console.log('📱 Accédez depuis votre mobile à :');
  ips.forEach(iface => {
    console.log(`   👉 http://${iface.address}:3000`);
  });
  console.log('');
}

// Lancer Next.js
const child = spawn('npm', ['run', 'dev', '--', '-H', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
});

child.on('error', (error) => {
  console.error(`Erreur: ${error.message}`);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.log(`Process exited with code ${code}`);
  }
});
