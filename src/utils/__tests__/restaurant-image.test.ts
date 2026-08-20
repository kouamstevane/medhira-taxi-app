import {
  getRestaurantImagePath,
  getRestaurantImagePathFromUrl,
  prepareRestaurantImage,
  validateRestaurantImageFile,
} from '../restaurant-image';

describe('restaurant image utilities', () => {
  it('accepts image MIME types and rejects non-images', () => {
    expect(validateRestaurantImageFile(new File(['x'], 'logo.png', { type: 'image/png' }), 'logo')).toBeNull();
    expect(validateRestaurantImageFile(new File(['x'], 'logo.pdf', { type: 'application/pdf' }), 'logo')).toContain('format');
  });

  it('builds versioned logo and cover Storage paths', () => {
    expect(getRestaurantImagePath('rest-1', 'logo', 'up-1')).toBe('restaurant-images/rest-1/logo-up-1.webp');
    expect(getRestaurantImagePath('rest-1', 'cover', 'up-1')).toBe('restaurant-images/rest-1/cover-up-1.webp');
  });

  it('rejects an asset larger than 2 MiB', () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'cover.webp', { type: 'image/webp' });
    expect(validateRestaurantImageFile(file, 'cover')).toContain('2 Mo');
  });

  it('extracts only managed Storage paths from Firebase download URLs', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/demo/o/restaurant-images%2Frest-1%2Fcover-up-1.webp?alt=media&token=abc';
    expect(getRestaurantImagePathFromUrl(url)).toBe('restaurant-images/rest-1/cover-up-1.webp');
    expect(getRestaurantImagePathFromUrl('https://example.com/image.webp')).toBeNull();
  });

  it('rejects invalid files before attempting browser conversion', async () => {
    const file = new File(['x'], 'logo.pdf', { type: 'application/pdf' });
    await expect(prepareRestaurantImage(file, 'logo')).rejects.toThrow('format');
  });

  it('crops and converts a selected image to the requested aspect ratio', async () => {
    const drawImage = jest.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({ drawImage })),
      toBlob: jest.fn((callback: BlobCallback) => callback(new Blob(['webp'], { type: 'image/webp' }))),
    } as unknown as HTMLCanvasElement;
    const createElement = jest.spyOn(document, 'createElement').mockReturnValue(canvas);
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = jest.fn(() => 'blob:restaurant-image');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const OriginalImage = global.Image;

    class MockImage {
      width = 1200;
      height = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    global.Image = MockImage as unknown as typeof Image;

    try {
      const result = await prepareRestaurantImage(
        new File(['x'], 'cover.png', { type: 'image/png' }),
        'cover',
      );

      expect(result.type).toBe('image/webp');
      expect(canvas.width).toBe(1600);
      expect(canvas.height).toBe(900);
      expect(drawImage).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:restaurant-image');
    } finally {
      global.Image = OriginalImage;
      createElement.mockRestore();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
    }
  });
});
