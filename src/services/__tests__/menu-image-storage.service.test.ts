import {
  createMenuItemId,
  createMenuImagePath,
  uploadMenuImage,
  deleteMenuImage,
  isStorageObjectNotFound,
} from '../menu-image-storage.service';

let mockEmitUploadComplete: (() => void) | undefined;

jest.mock('../../config/firebase', () => ({
  getFirebaseStorage: jest.fn(() => ({ mockStorage: true })),
}));

jest.mock('firebase/storage', () => {
  const original = jest.requireActual('firebase/storage');
  return {
    ...original,
    ref: jest.fn(() => ({ fullPath: 'mock-ref-path' })),
    uploadBytesResumable: jest.fn(() => {
      const listeners: Record<string, (snapshot: any) => void> = {};
      return {
        on: (event: string, next: (snap: any) => void, _error: any, complete: () => void) => {
          listeners[event] = next;
          mockEmitUploadComplete = complete;
          next({ bytesTransferred: 50, totalBytes: 100 });
        },
        pause: jest.fn(() => true),
        resume: jest.fn(() => true),
        cancel: jest.fn(() => true),
      };
    }),
    getDownloadURL: jest.fn(async () => 'https://firebasestorage.googleapis.com/v0/b/app/o/item.webp'),
    deleteObject: jest.fn(async () => {}),
  };
});

describe('MenuImageStorageService', () => {
  it('generates item ID and correct path structure', () => {
    const itemId = createMenuItemId('rest123');
    expect(itemId).toBeDefined();
    expect(typeof itemId).toBe('string');

    const path = createMenuImagePath('rest123', itemId, 'up456');
    expect(path).toBe(`menu-images/rest123/${itemId}/up456.webp`);
  });

  it('detects storage/object-not-found error', () => {
    expect(isStorageObjectNotFound({ code: 'storage/object-not-found' })).toBe(true);
    expect(isStorageObjectNotFound({ code: 'storage/unauthorized' })).toBe(false);
    expect(isStorageObjectNotFound(new Error('other'))).toBe(false);
  });

  it('creates resumable upload task with correct metadata', () => {
    const file = new File(['data'], 'item.webp', { type: 'image/webp' });
    const progressFn = jest.fn();

    const uploadTask = uploadMenuImage({
      restaurantId: 'rest123',
      itemId: 'item456',
      file,
      onProgress: progressFn,
    });

    expect(uploadTask.path).toContain('menu-images/rest123/item456/');
    expect(uploadTask.uploadId).toBeDefined();
    expect(typeof uploadTask.pause).toBe('function');
    expect(typeof uploadTask.resume).toBe('function');
    expect(typeof uploadTask.cancel).toBe('function');
    expect(progressFn).toHaveBeenCalledWith(50);
  });

  it('resolves its completion promise only after the upload finishes', async () => {
    const file = new File(['data'], 'item.webp', { type: 'image/webp' });
    const uploadTask = uploadMenuImage({
      restaurantId: 'rest123',
      itemId: 'item456',
      file,
    });

    let completed = false;
    const completion = uploadTask.complete.then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);

    mockEmitUploadComplete?.();
    await expect(completion).resolves.toBeUndefined();
    expect(completed).toBe(true);
  });

  it('tolerates object-not-found during deleteMenuImage', async () => {
    const { deleteObject } = require('firebase/storage');
    deleteObject.mockImplementationOnce(async () => {
      const err = new Error('Object not found');
      (err as any).code = 'storage/object-not-found';
      throw err;
    });

    await expect(deleteMenuImage('menu-images/rest1/item1/up1.webp')).resolves.toBeUndefined();
  });
});
