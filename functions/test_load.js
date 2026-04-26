try {
    require('./lib/index.js');
    console.log('Successfully loaded!');
    process.exit(0);
} catch (e) {
    console.error('Error loading module:', e);
    process.exit(1);
}
