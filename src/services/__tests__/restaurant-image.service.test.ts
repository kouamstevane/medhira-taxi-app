import {
  createRestaurantImageUploadId,
  deleteRestaurantImage,
  getRestaurantImageStorageErrorMessage,
  uploadRestaurantImage,
} from '../restaurant-image.service';

jest.mock('../../config/firebase', () => ({
  getFirebaseStorage: jest.fn(() => ({ mockStorage: true })),
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: jest.fn(async () => undefined),
  getDownloadURL: jest.fn(async (storageRef: { fullPath: string }) => `https://cdn.test/${storageRef.fullPath}`),
  deleteObject: jest.fn(async () => undefined),
}));

describe('RestaurantImageService', () => {
  it('creates a unique upload id', () => {
    const uploadId = createRestaurantImageUploadId();
    expect(uploadId).toMatch(/^up_/);
  });

  it('uploads a converted WebP blob with cache metadata and returns its URL', async () => {
    const { uploadBytes } = require('firebase/storage');
    const result = await uploadRestaurantImage({
      restaurantId: 'rest-1',
      kind: 'cover',
      blob: new Blob(['webp'], { type: 'image/webp' }),
      uploadId: 'upload-1',
    });

    expect(result.path).toBe('restaurant-images/rest-1/cover-upload-1.webp');
    expect(result.url).toBe('https://cdn.test/restaurant-images/rest-1/cover-upload-1.webp');
    expect(uploadBytes).toHaveBeenCalledWith(
      { fullPath: result.path },
      expect.any(Blob),
      expect.objectContaining({ contentType: 'image/webp' }),
    );
  });

  it('deletes the managed object and tolerates a missing object', async () => {
    const { deleteObject } = require('firebase/storage');
    deleteObject.mockRejectedValueOnce({ code: 'storage/object-not-found' });

    await expect(deleteRestaurantImage('restaurant-images/rest-1/logo-upload-1.webp'))
      .resolves.toBeUndefined();
  });

  it('translates common Storage failures into French actions', () => {
    expect(getRestaurantImageStorageErrorMessage({ code: 'storage/unauthorized' }))
      .toContain('droits');
    expect(getRestaurantImageStorageErrorMessage({ code: 'storage/unauthenticated' }))
      .toContain('Reconnectez');
  });
});
