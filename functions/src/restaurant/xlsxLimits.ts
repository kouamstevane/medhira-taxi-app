import yauzl from 'yauzl';

const MAX_UNCOMPRESSED_TOTAL_BYTES = 64 * 1024 * 1024; // 64 MiB
const MAX_ENTRIES_COUNT = 1000;

/**
 * Inspects a ZIP/XLSX archive before decompression to prevent ZIP bombs and resource exhaustion.
 */
export async function assertXlsxArchiveWithinLimits(buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return reject(new Error(`Fichier XLSX invalide ou corrompu: ${err.message}`));
      }

      if (!zipfile) {
        return reject(new Error('Archive XLSX vide ou illisible'));
      }

      let totalUncompressedSize = 0;
      let entryCount = 0;

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        entryCount++;

        if (entryCount > MAX_ENTRIES_COUNT) {
          return reject(new Error(`L'archive XLSX contient un nombre excessif d'entrées (> ${MAX_ENTRIES_COUNT})`));
        }

        // Prevent directory traversal attacks
        if (entry.fileName.includes('..') || entry.fileName.startsWith('/') || entry.fileName.startsWith('\\')) {
          return reject(new Error(`Chemin suspect détecté dans l'archive XLSX: ${entry.fileName}`));
        }

        totalUncompressedSize += entry.uncompressedSize;
        if (totalUncompressedSize > MAX_UNCOMPRESSED_TOTAL_BYTES) {
          return reject(
            new Error(
              `La taille décompressée totale du fichier XLSX dépasse la limite autorisée de 64 MiB (${Math.round(
                totalUncompressedSize / (1024 * 1024)
              )} MiB)`
            )
          );
        }

        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        resolve();
      });

      zipfile.on('error', (zipErr) => {
        reject(new Error(`Erreur lors de la lecture de l'archive XLSX: ${zipErr.message}`));
      });
    });
  });
}
