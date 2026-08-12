import { imageCompressionService } from '../image-compression.service';
import {
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_MAX_INPUT_BYTES,
  MENU_IMAGE_MAX_DIMENSION,
  MENU_IMAGE_MAX_PIXELS,
} from '../../utils/menu-image';

describe('ImageCompressionService - Menu Image Compression', () => {
  let mockFile: File;

  beforeAll(() => {
    if (!URL.createObjectURL) {
      URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-url');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = jest.fn();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFile = new File(['a'.repeat(1024)], 'pizza.jpg', { type: 'image/jpeg' });
  });

  it('refuses non-image MIME types', async () => {
    const badFile = new File(['hello'], 'document.pdf', { type: 'application/pdf' });
    await expect(imageCompressionService.compressImage(badFile)).rejects.toThrow(/n'est pas une image/i);
  });

  it('refuses input file larger than 10MB', async () => {
    const hugeFile = new File(['a'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(hugeFile, 'size', { value: MENU_IMAGE_MAX_INPUT_BYTES + 1 });
    await expect(imageCompressionService.compressImage(hugeFile)).rejects.toThrow(/10 Mo/i);
  });

  it('refuses image with dimension > 6000px', async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 6001;
      height = 4000;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    }
    (window as any).Image = MockImage;

    await expect(imageCompressionService.compressImage(mockFile)).rejects.toThrow(/6000/i);
  });

  it('refuses image with resolution > 16 Megapixels', async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 5000;
      height = 4000; // 20 Megapixels
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    }
    (window as any).Image = MockImage;

    await expect(imageCompressionService.compressImage(mockFile)).rejects.toThrow(/16/i);
  });

  it('respects AbortController signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      imageCompressionService.compressImage(mockFile, { signal: controller.signal })
    ).rejects.toThrow(/annulée|aborted/i);
  });

  it('fails if compressed output exceeds 500KB after maximum quality attempts without falling back to original', async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 800;
      height = 600;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    }
    (window as any).Image = MockImage;

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 800,
          height: 600,
          getContext: () => ({
            drawImage: jest.fn(),
          }),
          toBlob: (cb: (blob: Blob | null) => void) => {
            const bigBlob = new Blob(['x'.repeat(600 * 1024)], { type: 'image/webp' });
            cb(bigBlob);
          },
        } as any;
      }
      return originalCreateElement(tagName);
    });

    await expect(
      imageCompressionService.compressImage(mockFile, {
        maxOutputBytes: MENU_IMAGE_MAX_BYTES,
        qualityAttempts: 3,
      })
    ).rejects.toThrow(/500/i);

    jest.restoreAllMocks();
  });
});
