
console.log('Loading firebase-functions/v2/https...');
const https = require('firebase-functions/v2/https');
console.log('Loaded.');

console.log('Loading firebase-functions/v2/scheduler...');
const scheduler = require('firebase-functions/v2/scheduler');
console.log('Loaded.');

console.log('Loading firebase-admin...');
const admin = require('firebase-admin');
console.log('Loaded.');

console.log('Loading validators/bank.validator.js...');
const bank = require('./lib/validators/bank.validator.js');
console.log('Loaded.');

console.log('Loading utils/encryption.js...');
const encryption = require('./lib/utils/encryption.js');
console.log('Loaded.');

console.log('Loading voip/index.js...');
const voip = require('./lib/voip/index.js');
console.log('Loaded.');

console.log('All modules loaded successfully.');
