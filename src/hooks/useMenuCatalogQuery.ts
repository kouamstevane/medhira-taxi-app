'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { MenuItem } from '@/types';
import type { MenuCatalogAvailability, MenuCatalogQuery, MenuCatalogSort } from '@/utils/menu-catalog';

const PAGE_SIZE = 50;

interface MenuCatalogState {
  items: MenuItem[];
  totalCount: number;
  availableCount: number;
  pageIndex: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  isLoadingPage: boolean;
  error: string | null;
  selectedIds: string[];
}

function readQuery(searchParams: { get: (name: string) => string | null }): Pick<MenuCatalogQuery, 'search' | 'category' | 'availability' | 'sort'> {
  const availability = searchParams.get('availability');
  const sort = searchParams.get('sort');
  return {
    search: searchParams.get('search') ?? '',
    category: searchParams.get('category'),
    availability: availability === 'available' || availability === 'unavailable' ? availability : 'all',
    sort: sort === 'name' || sort === 'price-asc' || sort === 'price-desc' ? sort : 'category',
  };
}

export function useMenuCatalogQuery(restaurantId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQuery = useMemo(() => readQuery(searchParams), [searchParams]);
  const [search, setSearchState] = useState<string>(initialQuery.search ?? '');
  const [category, setCategoryState] = useState<string | null>(initialQuery.category ?? null);
  const [availability, setAvailabilityState] = useState<MenuCatalogAvailability>(initialQuery.availability ?? 'all');
  const [sort, setSortState] = useState<MenuCatalogSort>(initialQuery.sort ?? 'category');
  const [state, setState] = useState<MenuCatalogState>({
    items: [], totalCount: 0, availableCount: 0, pageIndex: 0, hasNextPage: false,
    hasPreviousPage: false, isLoading: true, isLoadingPage: false, error: null, selectedIds: [],
  });
  const cursorByPageRef = useRef<Array<QueryDocumentSnapshot<DocumentData> | null>>([null]);
  const requestIdRef = useRef(0);

  const currentQuery = useMemo<MenuCatalogQuery>(() => ({
    search, category, availability, sort, pageSize: PAGE_SIZE,
  }), [search, category, availability, sort]);

  const syncUrl = useCallback((next: Pick<MenuCatalogQuery, 'search' | 'category' | 'availability' | 'sort'>) => {
    const params = new URLSearchParams();
    params.set('restaurantId', restaurantId);
    if (next.search) params.set('search', next.search);
    if (next.category) params.set('category', next.category);
    if (next.availability && next.availability !== 'all') params.set('availability', next.availability);
    if (next.sort && next.sort !== 'category') params.set('sort', next.sort);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, restaurantId, router]);

  const fetchPage = useCallback(async (queryOptions: MenuCatalogQuery, pageIndex: number, cursor: QueryDocumentSnapshot<DocumentData> | null) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((previous) => ({ ...previous, isLoading: pageIndex === 0, isLoadingPage: true, error: null }));
    try {
      const page = await FoodDeliveryService.getRestaurantMenuPaginated(restaurantId, { ...queryOptions, cursor });
      if (requestId !== requestIdRef.current) return;
      cursorByPageRef.current[pageIndex] = cursor;
      cursorByPageRef.current[pageIndex + 1] = page.lastDoc;
      setState((previous) => ({
        ...previous,
        items: page.items,
        totalCount: page.totalCount,
        availableCount: page.availableCount,
        pageIndex,
        hasNextPage: page.hasMore,
        hasPreviousPage: pageIndex > 0,
        isLoading: false,
        isLoadingPage: false,
        error: null,
        selectedIds: [],
      }));
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState((previous) => ({ ...previous, isLoading: false, isLoadingPage: false, error: 'Impossible de charger le catalogue.' }));
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const timeout = window.setTimeout(() => {
      cursorByPageRef.current = [null];
      void fetchPage(currentQuery, 0, null);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [currentQuery, fetchPage, restaurantId]);

  const setCriteria = useCallback((next: Partial<Pick<MenuCatalogQuery, 'search' | 'category' | 'availability' | 'sort'>>) => {
    const nextQuery = { search, category, availability, sort, ...next };
    setSearchState(nextQuery.search ?? '');
    setCategoryState(nextQuery.category ?? null);
    setAvailabilityState(nextQuery.availability ?? 'all');
    setSortState(nextQuery.sort ?? 'category');
    syncUrl(nextQuery);
  }, [availability, category, search, sort, syncUrl]);

  const clearFilters = useCallback(() => setCriteria({ search: '', category: null, availability: 'all', sort: 'category' }), [setCriteria]);

  const goNext = useCallback(() => {
    if (!state.hasNextPage || state.isLoadingPage) return;
    const nextPage = state.pageIndex + 1;
    void fetchPage(currentQuery, nextPage, cursorByPageRef.current[nextPage] ?? null);
  }, [currentQuery, fetchPage, state.hasNextPage, state.isLoadingPage, state.pageIndex]);

  const goPrevious = useCallback(() => {
    if (!state.hasPreviousPage || state.isLoadingPage) return;
    const previousPage = state.pageIndex - 1;
    void fetchPage(currentQuery, previousPage, cursorByPageRef.current[previousPage] ?? null);
  }, [currentQuery, fetchPage, state.hasPreviousPage, state.isLoadingPage, state.pageIndex]);

  const toggleSelected = useCallback((itemId: string) => {
    setState((previous) => ({ ...previous, selectedIds: previous.selectedIds.includes(itemId) ? previous.selectedIds.filter((id) => id !== itemId) : [...previous.selectedIds, itemId] }));
  }, []);

  const toggleAllVisible = useCallback(() => {
    setState((previous) => {
      const allSelected = previous.items.length > 0 && previous.items.every((item) => previous.selectedIds.includes(item.id));
      return { ...previous, selectedIds: allSelected ? [] : previous.items.map((item) => item.id) };
    });
  }, []);

  return {
    ...state,
    search,
    category,
    availability,
    sort,
    pageSize: PAGE_SIZE,
    setSearch: (value: string) => setCriteria({ search: value }),
    setCategory: (value: string | null) => setCriteria({ category: value }),
    setAvailability: (value: MenuCatalogAvailability) => setCriteria({ availability: value }),
    setSort: (value: MenuCatalogSort) => setCriteria({ sort: value }),
    clearFilters,
    goNext,
    goPrevious,
    toggleSelected,
    toggleAllVisible,
    clearSelection: () => setState((previous) => ({ ...previous, selectedIds: [] })),
    reload: () => fetchPage(currentQuery, state.pageIndex, cursorByPageRef.current[state.pageIndex] ?? null),
    retry: () => fetchPage(currentQuery, state.pageIndex, cursorByPageRef.current[state.pageIndex] ?? null),
  };
}
