import { renderHook, act } from '@testing-library/react';
import { useMenuImageUrlValidation } from '../useMenuImageUrlValidation';

describe('useMenuImageUrlValidation hook', () => {
  let originalImage: typeof window.Image;

  beforeEach(() => {
    originalImage = window.Image;
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
      get src() {
        return this._src;
      }
    }
    (window as any).Image = MockImage;
  });

  afterEach(() => {
    window.Image = originalImage;
  });

  it('returns valid state for good URL', async () => {
    const { result } = renderHook(() => useMenuImageUrlValidation());

    let isValid = false;
    await act(async () => {
      isValid = await result.current.validateUrl('https://example.com/pizza.jpg');
    });

    expect(isValid).toBe(true);
    expect(result.current.validationError).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });

  it('rejects invalid format URL instantly without network request', async () => {
    const { result } = renderHook(() => useMenuImageUrlValidation());

    let isValid = false;
    await act(async () => {
      isValid = await result.current.validateUrl('not-a-url');
    });

    expect(isValid).toBe(false);
    expect(result.current.validationError).toBeDefined();
  });

  it('resets validation state', async () => {
    const { result } = renderHook(() => useMenuImageUrlValidation());

    await act(async () => {
      await result.current.validateUrl('not-a-url');
    });
    expect(result.current.validationError).not.toBeNull();

    act(() => {
      result.current.resetValidation();
    });

    expect(result.current.validationError).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });
});
