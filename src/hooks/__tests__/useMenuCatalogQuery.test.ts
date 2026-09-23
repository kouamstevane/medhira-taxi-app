import { act, renderHook, waitFor } from '@testing-library/react';
import { useMenuCatalogQuery } from '../useMenuCatalogQuery';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const replace = jest.fn();
const getRestaurantMenuPaginated = FoodDeliveryService.getRestaurantMenuPaginated as jest.Mock;
const getRestaurantMenuItemsMatchingQuery = FoodDeliveryService.getRestaurantMenuItemsMatchingQuery as jest.Mock;

jest.mock('next/navigation', () => ({
  usePathname: () => '/food/portal/menu',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getRestaurantMenuPaginated: jest.fn(),
    getRestaurantMenuItemsMatchingQuery: jest.fn(),
  },
}));

describe('useMenuCatalogQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRestaurantMenuPaginated.mockResolvedValue({
      items: [], lastDoc: null, hasMore: false, totalCount: 0, availableCount: 0,
    });
    getRestaurantMenuItemsMatchingQuery.mockResolvedValue([]);
  });

  it('loads the first page with the catalog query contract', async () => {
    renderHook(() => useMenuCatalogQuery('restaurant-1'));
    await waitFor(() => expect(getRestaurantMenuPaginated).toHaveBeenCalledWith('restaurant-1', expect.objectContaining({ pageSize: 50, cursor: null })));
  });

  it('resets to the first page when search changes', async () => {
    const { result } = renderHook(() => useMenuCatalogQuery('restaurant-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setSearch('burger'));
    await waitFor(() => expect(getRestaurantMenuPaginated).toHaveBeenLastCalledWith('restaurant-1', expect.objectContaining({ search: 'burger', cursor: null })));
    expect(result.current.pageIndex).toBe(0);
    expect(replace).toHaveBeenCalledWith('/food/portal/menu?restaurantId=restaurant-1&search=burger', { scroll: false });
  });

  it('keeps selected item metadata when selecting a visible dish', async () => {
    const item = { id: 'item-1', name: 'Burger', category: 'Plats', price: 10, isAvailable: true };
    getRestaurantMenuPaginated.mockResolvedValueOnce({
      items: [item], lastDoc: null, hasMore: false, totalCount: 1, availableCount: 1,
    });
    const { result } = renderHook(() => useMenuCatalogQuery('restaurant-1'));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.toggleSelected('item-1'));

    expect(result.current.selectedIds).toEqual(['item-1']);
    expect(result.current.selectedItems).toEqual([item]);
  });

  it('selects every item matching the active filters across pages', async () => {
    const matchingItems = [
      { id: 'item-1', name: 'Burger', category: 'Plats', price: 10, isAvailable: true },
      { id: 'item-2', name: 'Pizza', category: 'Plats', price: 12, isAvailable: true },
    ];
    getRestaurantMenuPaginated.mockResolvedValueOnce({
      items: [matchingItems[0]], lastDoc: null, hasMore: true, totalCount: 2, availableCount: 2,
    });
    getRestaurantMenuItemsMatchingQuery.mockResolvedValueOnce(matchingItems);
    const { result } = renderHook(() => useMenuCatalogQuery('restaurant-1'));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.selectAllMatching();
    });

    expect(getRestaurantMenuItemsMatchingQuery).toHaveBeenCalledWith('restaurant-1', expect.objectContaining({ pageSize: 50 }));
    expect(result.current.selectedIds).toEqual(['item-1', 'item-2']);
    expect(result.current.selectedItems).toEqual(matchingItems);
  });
});
