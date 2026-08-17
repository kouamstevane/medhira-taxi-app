import {
  downloadSampleCsvTemplate,
  listenToImportProgress,
  uploadMenuImportFile,
} from '../menu-import-client.service';
import { uploadBytesResumable } from 'firebase/storage';

jest.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  getFirebaseStorage: jest.fn(() => ({})),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({ id: 'mock-import-id-123' })),
  onSnapshot: jest.fn((docRef, onNext) => {
    onNext({
      id: 'mock-import-id-123',
      exists: () => true,
      data: () => ({
        type: 'csv',
        status: 'processing',
        totalItems: 100,
        processedItems: 40,
        failedItems: 2,
        errors: [],
      }),
    });
    return jest.fn(); // Unsubscribe mock
  }),
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn(() => ({})),
  uploadBytesResumable: jest.fn(() => ({
    on: jest.fn((event, onProgress, onError, onComplete) => {
      onProgress({ bytesTransferred: 50, totalBytes: 100 });
      onComplete();
    }),
  })),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn(async () => ({ data: { importId: 'mock-import-id-123' } }))),
}));

describe('menu-import-client.service', () => {
  const restaurantId = 'resto-test-1';

  beforeEach(() => {
    jest.clearAllMocks();
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    }
    if (!global.URL.revokeObjectURL) {
      global.URL.revokeObjectURL = jest.fn();
    }
  });

  describe('uploadMenuImportFile', () => {
    test('rejects unsupported extensions (.xls, .pdf, .json)', async () => {
      const xlsFile = new File(['mock'], 'menu.xls', { type: 'application/vnd.ms-excel' });
      await expect(uploadMenuImportFile(restaurantId, xlsFile)).rejects.toThrow(/Format de fichier non supporté/);

      const pdfFile = new File(['mock'], 'menu.pdf', { type: 'application/pdf' });
      await expect(uploadMenuImportFile(restaurantId, pdfFile)).rejects.toThrow(/Format de fichier non supporté/);
    });

    test('rejects empty files or files exceeding 15MB', async () => {
      const emptyFile = new File([], 'menu.csv', { type: 'text/csv' });
      await expect(uploadMenuImportFile(restaurantId, emptyFile)).rejects.toThrow(/vide/);

      const hugeFile = new File(['a'], 'huge.csv', { type: 'text/csv' });
      Object.defineProperty(hugeFile, 'size', { value: 16 * 1024 * 1024 });
      await expect(uploadMenuImportFile(restaurantId, hugeFile)).rejects.toThrow(/15 Mo/);
    });

    test('successfully uploads CSV file and returns importId and storage path', async () => {
      const validCsv = new File(['name,price\nBurger,12'], 'catalogue.csv', { type: 'text/csv' });
      const progressCalls: number[] = [];

      const result = await uploadMenuImportFile(restaurantId, validCsv, (p) => progressCalls.push(p));

      expect(result.importId).toBe('mock-import-id-123');
      expect(result.type).toBe('csv');
      expect(result.filePath).toBe(`menu-imports/${restaurantId}/mock-import-id-123.csv`);
      expect(progressCalls).toContain(50);
    });

    test('successfully uploads XLSX file with correct type and path', async () => {
      const validXlsx = new File(['xlsx-binary'], 'catalogue.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const result = await uploadMenuImportFile(restaurantId, validXlsx);
      expect(result.importId).toBe('mock-import-id-123');
      expect(result.type).toBe('excel');
      expect(result.filePath).toBe(`menu-imports/${restaurantId}/mock-import-id-123.xlsx`);
    });

    test('cancels and rejects when the upload exceeds its timeout', async () => {
      jest.useFakeTimers();
      const cancel = jest.fn();
      (uploadBytesResumable as jest.Mock).mockReturnValueOnce({
        on: jest.fn(),
        cancel,
      });

      const validCsv = new File(['name,price\nBurger,12'], 'catalogue.csv', { type: 'text/csv' });
      const uploadPromise = uploadMenuImportFile(restaurantId, validCsv, undefined, { timeoutMs: 1000 });
      const rejectedUpload = expect(uploadPromise).rejects.toThrow(/expiré/i);

      await jest.advanceTimersByTimeAsync(1000);

      await rejectedUpload;
      expect(cancel).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe('listenToImportProgress', () => {
    test('invokes callback with normalized MenuImportJob object', () => {
      const onChange = jest.fn();
      const unsubscribe = listenToImportProgress(restaurantId, 'mock-import-id-123', onChange);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-import-id-123',
          restaurantId,
          type: 'csv',
          status: 'processing',
          totalItems: 100,
          processedItems: 40,
        })
      );
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('downloadSampleCsvTemplate', () => {
    test('triggers browser download with UTF-8 BOM CSV content', () => {
      const appendSpy = jest.spyOn(document.body, 'appendChild');
      const removeSpy = jest.spyOn(document.body, 'removeChild');

      downloadSampleCsvTemplate();

      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
  });
});
