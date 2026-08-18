import { act, renderHook, waitFor } from '@testing-library/react';
import { useMenuCatalogQuery } from '../useMenuCatalogQuery';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const replace = jest.fn();
const getRestaurantMenuPaginated = FoodDeliveryService.getRestaurantMenuPaginated as jest.Mock;

jest.mock('next/navigation', () => ({
  usePathname: () => '/food/portal/menu',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: { getRestaurantMenuPaginated: jest.fn() },
}));

describe('useMenuCatalogQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRestaurantMenuPaginated.mockResolvedValue({ items: [], lastDoc: null, hasMore: false, totalCount: 0, availableCount: 0 });
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
});
