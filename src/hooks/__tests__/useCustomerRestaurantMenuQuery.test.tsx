import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomerRestaurantMenuQuery } from '../useCustomerRestaurantMenuQuery';
import {
  getCustomerRestaurantMenuCategories,
  getCustomerRestaurantMenuPage,
} from '@/services/food-delivery.service';

let searchParams = new URLSearchParams('category=Pizzas');
let pathname = '/restaurants/resto-1/menu';
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

jest.mock('@/services/food-delivery.service', () => ({
  getCustomerRestaurantMenuCategories: jest.fn(),
  getCustomerRestaurantMenuPage: jest.fn(),
}));

const mockedGetCustomerRestaurantMenuPage = getCustomerRestaurantMenuPage as jest.Mock;
const mockedGetCustomerRestaurantMenuCategories = getCustomerRestaurantMenuCategories as jest.Mock;

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

describe('useCustomerRestaurantMenuQuery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    searchParams = new URLSearchParams('category=Pizzas');
    pathname = '/restaurants/resto-1/menu';
    mockedGetCustomerRestaurantMenuCategories.mockResolvedValue([
      { name: 'Pizzas', availableCount: 2 },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the initial category from the URL and fetches the first page', async () => {
    mockedGetCustomerRestaurantMenuPage.mockResolvedValue({
      items: [{ id: 'item-1', name: 'Pizza Margherita' }],
      lastDoc: { id: 'cursor-1' },
      hasMore: false,
    });

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => {
      expect(mockedGetCustomerRestaurantMenuPage).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: 'resto-1',
          search: '',
          category: 'Pizzas',
          pageSize: 24,
          cursor: null,
        }),
      );
    });

    expect(result.current.category).toBe('Pizzas');
    expect(result.current.items).toEqual([{ id: 'item-1', name: 'Pizza Margherita' }]);
    expect(mockedGetCustomerRestaurantMenuCategories).toHaveBeenCalledTimes(1);
    expect(mockedGetCustomerRestaurantMenuCategories).toHaveBeenCalledWith('resto-1');
  });

  it('loads category metadata once for the restaurant', async () => {
    mockedGetCustomerRestaurantMenuPage.mockResolvedValue({
      items: [],
      lastDoc: null,
      hasMore: false,
    });

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => expect(mockedGetCustomerRestaurantMenuPage).toHaveBeenCalled());

    act(() => {
      result.current.setSearch('burger');
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => expect(mockedGetCustomerRestaurantMenuPage).toHaveBeenCalledTimes(2));
    expect(mockedGetCustomerRestaurantMenuCategories).toHaveBeenCalledTimes(1);
  });

  it('appends the next page without clearing existing items', async () => {
    mockedGetCustomerRestaurantMenuPage
      .mockResolvedValueOnce({
        items: [{ id: 'item-1', name: 'Pizza Margherita' }],
        lastDoc: { id: 'cursor-1' },
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [{ id: 'item-2', name: 'Pizza Royale' }],
        lastDoc: { id: 'cursor-2' },
        hasMore: false,
      });

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => expect(result.current.items).toEqual([{ id: 'item-1', name: 'Pizza Margherita' }]));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(mockedGetCustomerRestaurantMenuPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          restaurantId: 'resto-1',
          search: '',
          category: 'Pizzas',
          pageSize: 24,
          cursor: { id: 'cursor-1' },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([
        { id: 'item-1', name: 'Pizza Margherita' },
        { id: 'item-2', name: 'Pizza Royale' },
      ]);
    });
  });

  it('updates the URL when search changes', async () => {
    mockedGetCustomerRestaurantMenuPage.mockResolvedValue({
      items: [],
      lastDoc: null,
      hasMore: false,
    });

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    act(() => {
      result.current.setSearch('burger');
    });

    expect(replace).toHaveBeenLastCalledWith('/restaurants/resto-1/menu?category=Pizzas&search=burger', {
      scroll: false,
    });
  });

  it('preserves the canonical restaurant id and unrelated query params when syncing filters', async () => {
    pathname = '/food/restaurant';
    searchParams = new URLSearchParams('id=resto-1&category=Pizzas&source=homepage');
    mockedGetCustomerRestaurantMenuPage.mockResolvedValue({
      items: [],
      lastDoc: null,
      hasMore: false,
    });

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    act(() => {
      result.current.setSearch('burger');
    });

    expect(replace).toHaveBeenLastCalledWith(
      '/food/restaurant?id=resto-1&category=Pizzas&source=homepage&search=burger',
      { scroll: false },
    );

    act(() => {
      result.current.clearFilters();
    });

    expect(replace).toHaveBeenLastCalledWith('/food/restaurant?id=resto-1&source=homepage', {
      scroll: false,
    });
  });

  it('ignores a stale first response after a newer search request', async () => {
    const initialRequest = createDeferred<{
      items: Array<{ id: string; name: string }>;
      lastDoc: { id: string } | null;
      hasMore: boolean;
    }>();
    const nextRequest = createDeferred<{
      items: Array<{ id: string; name: string }>;
      lastDoc: { id: string } | null;
      hasMore: boolean;
    }>();

    mockedGetCustomerRestaurantMenuPage
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(nextRequest.promise);

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    act(() => {
      result.current.setSearch('burger');
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await act(async () => {
      nextRequest.resolve({
        items: [{ id: 'item-2', name: 'Burger Maison' }],
        lastDoc: { id: 'cursor-2' },
        hasMore: false,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([{ id: 'item-2', name: 'Burger Maison' }]);
    });

    await act(async () => {
      initialRequest.resolve({
        items: [{ id: 'item-1', name: 'Pizza Margherita' }],
        lastDoc: { id: 'cursor-1' },
        hasMore: true,
      });
      await Promise.resolve();
    });

    expect(result.current.items).toEqual([{ id: 'item-2', name: 'Burger Maison' }]);
  });

  it('does not apply an old response after criteria change during the debounce window', async () => {
    const initialRequest = createDeferred<{
      items: Array<{ id: string; name: string }>;
      lastDoc: { id: string } | null;
      hasMore: boolean;
    }>();
    const nextRequest = createDeferred<{
      items: Array<{ id: string; name: string }>;
      lastDoc: { id: string } | null;
      hasMore: boolean;
    }>();

    mockedGetCustomerRestaurantMenuPage
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(nextRequest.promise);

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    act(() => {
      result.current.setSearch('burger');
    });

    await act(async () => {
      initialRequest.resolve({
        items: [{ id: 'item-1', name: 'Pizza Margherita' }],
        lastDoc: { id: 'cursor-1' },
        hasMore: true,
      });
      await Promise.resolve();
    });

    expect(result.current.items).toEqual([]);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await act(async () => {
      nextRequest.resolve({
        items: [{ id: 'item-2', name: 'Burger Maison' }],
        lastDoc: { id: 'cursor-2' },
        hasMore: false,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([{ id: 'item-2', name: 'Burger Maison' }]);
    });
  });

  it('clears the error and refetches on retry', async () => {
    mockedGetCustomerRestaurantMenuPage
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        items: [{ id: 'item-1', name: 'Pizza Margherita' }],
        lastDoc: null,
        hasMore: false,
      });

    const { result } = renderHook(() => useCustomerRestaurantMenuQuery('resto-1'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(mockedGetCustomerRestaurantMenuPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          restaurantId: 'resto-1',
          search: '',
          category: 'Pizzas',
          pageSize: 24,
          cursor: null,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.items).toEqual([{ id: 'item-1', name: 'Pizza Margherita' }]);
    });
  });
});
