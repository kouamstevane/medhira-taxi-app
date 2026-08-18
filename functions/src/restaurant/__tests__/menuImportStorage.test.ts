const mockSave = jest.fn(async () => undefined);
const mockBucket = {
  name: 'medjira-service.appspot.com',
  file: jest.fn(() => ({ save: mockSave })),
};

jest.mock('firebase-admin', () => ({
  storage: jest.fn(() => ({ bucket: () => mockBucket })),
}));

import { uploadMenuItemImage } from '../menuImportStorage.js';

describe('menu import storage', () => {
  beforeEach(() => {
    mockSave.mockClear();
    mockBucket.file.mockClear();
  });

  test('uploads an imported image with content type and deterministic item path', async () => {
    const url = await uploadMenuItemImage('restaurant-1', 'item-1', {
      buffer: Buffer.from('image'),
      extension: 'jpeg',
      originalName: 'images/burger.jpg',
    });

    expect(mockBucket.file).toHaveBeenCalledWith('menu-images/restaurant-1/item-1/import.jpeg');
    expect(mockSave).toHaveBeenCalledWith(Buffer.from('image'), expect.objectContaining({
      resumable: false,
      metadata: expect.objectContaining({ contentType: 'image/jpeg' }),
    }));
    expect(url.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/medjira-service\.appspot\.com\/o\/menu-images%2Frestaurant-1%2Fitem-1%2Fimport\.jpeg\?alt=media&token=/);
    expect(url.storagePath).toBe('menu-images/restaurant-1/item-1/import.jpeg');
  });
});
