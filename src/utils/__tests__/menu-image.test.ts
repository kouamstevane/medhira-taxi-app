import {
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_MAX_INPUT_BYTES,
  MENU_IMAGE_MAX_DIMENSION,
  MENU_IMAGE_MAX_PIXELS,
  MENU_IMAGE_MAX_OUTPUT_DIMENSION,
  isKnownShareUrl,
  validateMenuImageUrl,
  isFirebaseStorageImageUrl,
  shouldUseNativeImageForFirebaseUrl,
  validateExternalImageLoad,
  MenuImageState,
} from '../menu-image';

describe('menu-image contract & utilities', () => {
  describe('Constants', () => {
    it('defines correct contractual limits', () => {
      expect(MENU_IMAGE_MAX_BYTES).toBe(500 * 1024);
      expect(MENU_IMAGE_MAX_INPUT_BYTES).toBe(10 * 1024 * 1024);
      expect(MENU_IMAGE_MAX_DIMENSION).toBe(6000);
      expect(MENU_IMAGE_MAX_PIXELS).toBe(16_000_000);
      expect(MENU_IMAGE_MAX_OUTPUT_DIMENSION).toBe(1200);
    });
  });

  describe('isKnownShareUrl', () => {
    it('detects google share / photo URLs as share URLs', () => {
      expect(isKnownShareUrl('https://photos.google.com/share/AF1QipN...')).toBe(true);
      expect(isKnownShareUrl('https://share.google/abc123')).toBe(true);
      expect(isKnownShareUrl('https://drive.google.com/file/d/123/view')).toBe(true);
      expect(isKnownShareUrl('https://dropbox.com/s/xyz123/photo.jpg')).toBe(true);
    });

    it('returns false for direct image URLs', () => {
      expect(isKnownShareUrl('https://images.unsplash.com/photo-123.jpg')).toBe(false);
      expect(isKnownShareUrl('https://example.com/pizza.png')).toBe(false);
      expect(isKnownShareUrl('https://firebasestorage.googleapis.com/v0/b/app/o/item.webp')).toBe(false);
    });
  });

  describe('validateMenuImageUrl', () => {
    it('validates HTTP and HTTPS URLs', () => {
      expect(validateMenuImageUrl('https://example.com/item.jpg')).toEqual({ valid: true });
      expect(validateMenuImageUrl('http://example.com/item.png')).toEqual({ valid: true });
    });

    it('rejects invalid format or non-http protocols', () => {
      expect(validateMenuImageUrl('not-a-url').valid).toBe(false);
      expect(validateMenuImageUrl('ftp://example.com/item.png').valid).toBe(false);
      expect(validateMenuImageUrl('javascript:alert(1)').valid).toBe(false);
    });

    it('rejects share URLs', () => {
      const res = validateMenuImageUrl('https://photos.google.com/share/AF1QipN...');
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('rejects excessively long URLs (> 2048 chars)', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);
      const res = validateMenuImageUrl(longUrl);
      expect(res.valid).toBe(false);
    });
  });

  describe('isFirebaseStorageImageUrl', () => {
    it('prioritizes imageStoragePath over URL checking', () => {
      expect(isFirebaseStorageImageUrl('https://custom-cdn.com/my-image.webp', 'menu-images/rest1/item1/up1.webp')).toBe(true);
      expect(isFirebaseStorageImageUrl(undefined, 'menu-images/rest1/item1/up1.webp')).toBe(true);
    });

    it('detects firebase storage domain URLs', () => {
      expect(isFirebaseStorageImageUrl('https://firebasestorage.googleapis.com/v0/b/app/o/item.webp')).toBe(true);
    });

    it('detects local emulator storage URLs', () => {
      expect(isFirebaseStorageImageUrl('http://127.0.0.1:9199/v0/b/app/o/item.webp')).toBe(true);
      expect(isFirebaseStorageImageUrl('http://localhost:9199/v0/b/app/o/item.webp')).toBe(true);
    });

    it('returns false for generic external URLs when no imageStoragePath is set', () => {
      expect(isFirebaseStorageImageUrl('https://images.unsplash.com/photo-123')).toBe(false);
      expect(isFirebaseStorageImageUrl('')).toBe(false);
      expect(isFirebaseStorageImageUrl(undefined, undefined)).toBe(false);
    });
  });

  describe('shouldUseNativeImageForFirebaseUrl', () => {
    it('returns true for emulator URLs', () => {
      expect(shouldUseNativeImageForFirebaseUrl('http://127.0.0.1:9199/v0/b/default-bucket/o/item.webp')).toBe(true);
      expect(shouldUseNativeImageForFirebaseUrl('http://localhost:9199/v0/b/default-bucket/o/item.webp')).toBe(true);
    });

    it('returns false for standard production Firebase Storage URLs', () => {
      expect(shouldUseNativeImageForFirebaseUrl('https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/item.webp')).toBe(false);
    });
  });

  describe('validateExternalImageLoad', () => {
    let originalImage: typeof window.Image;

    beforeEach(() => {
      originalImage = window.Image;
    });

    afterEach(() => {
      window.Image = originalImage;
    });

    it('resolves when image loads successfully', async () => {
      // Mock Image
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';
        set src(val: string) {
          this._src = val;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 10);
        }
        get src() { return this._src; }
      }
      (window as any).Image = MockImage;

      await expect(validateExternalImageLoad('https://example.com/good.jpg')).resolves.toBeUndefined();
    });

    it('rejects when image fails to load', async () => {
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_val: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 10);
        }
      }
      (window as any).Image = MockImage;

      await expect(validateExternalImageLoad('https://example.com/bad.jpg')).rejects.toThrow();
    });

    it('rejects on timeout', async () => {
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_val: string) {
          // Never calls onload or onerror
        }
      }
      (window as any).Image = MockImage;

      await expect(validateExternalImageLoad('https://example.com/slow.jpg', { timeoutMs: 50 })).rejects.toThrow(/timeout/i);
    });

    it('rejects when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(validateExternalImageLoad('https://example.com/image.jpg', { signal: controller.signal })).rejects.toThrow(/aborted/i);
    });
  });
});
