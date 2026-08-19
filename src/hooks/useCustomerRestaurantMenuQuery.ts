'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  getCustomerRestaurantMenuCategories,
  getCustomerRestaurantMenuPage,
  type CustomerRestaurantMenuCategory,
} from '@/services/food-delivery.service';
import type { MenuItem } from '@/types';

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 250;

interface MenuCriteria {
  search: string;
  category: string | null;
}

interface MenuQueryState {
  items: MenuItem[];
  categories: CustomerRestaurantMenuCategory[];
  search: string;
  category: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
}

function readInitialCriteria(searchParams: { get: (name: string) => string | null }): MenuCriteria {
  return {
    search: searchParams.get('search') ?? '',
    category: searchParams.get('category'),
  };
}

export function useCustomerRestaurantMenuQuery(restaurantId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialCriteria = useMemo(() => readInitialCriteria(searchParams), [searchParams]);

  const [search, setSearchState] = useState(initialCriteria.search);
  const [category, setCategoryState] = useState<string | null>(initialCriteria.category);
  const [state, setState] = useState<MenuQueryState>({
    items: [],
    categories: [],
    search: initialCriteria.search,
    category: initialCriteria.category,
    isLoading: true,
    isLoadingMore: false,
    error: null,
    hasMore: false,
  });

  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const requestIdRef = useRef(0);
  const invalidateActiveRequest = useCallback(() => {
    requestIdRef.current += 1;
  }, []);

  const syncUrl = useCallback((nextSearch: string, nextCategory: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSearch) {
      params.set('search', nextSearch);
    } else {
      params.delete('search');
    }
    if (nextCategory) {
      params.set('category', nextCategory);
    } else {
      params.delete('category');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const runQuery = useCallback(async ({
    nextSearch,
    nextCategory,
    cursor = null,
    append = false,
  }: {
    nextSearch: string;
    nextCategory: string | null;
    cursor?: QueryDocumentSnapshot<DocumentData> | null;
    append?: boolean;
  }) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setState((previous) => ({
      ...previous,
      error: null,
      isLoading: append ? previous.isLoading : true,
      isLoadingMore: append,
    }));

    try {
      const page = await getCustomerRestaurantMenuPage({
        restaurantId,
        search: nextSearch,
        category: nextCategory,
        cursor,
        pageSize: PAGE_SIZE,
      });

      if (requestId !== requestIdRef.current) return;

      cursorRef.current = page.lastDoc;
      setState((previous) => ({
        ...previous,
        items: append ? [...previous.items, ...page.items] : page.items,
        search: nextSearch,
        category: nextCategory,
        isLoading: false,
        isLoadingMore: false,
        error: null,
        hasMore: page.hasMore,
      }));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState((previous) => ({
        ...previous,
        isLoading: false,
        isLoadingMore: false,
        error: error instanceof Error ? error.message : 'Impossible de charger le menu.',
        hasMore: false,
      }));
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    invalidateActiveRequest();
    setState((previous) => ({
      ...previous,
      items: [],
      error: null,
      isLoading: true,
      isLoadingMore: false,
      hasMore: false,
      search,
      category,
    }));
    cursorRef.current = null;

    const timeout = window.setTimeout(() => {
      void runQuery({ nextSearch: search, nextCategory: category, cursor: null, append: false });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [category, invalidateActiveRequest, restaurantId, runQuery, search]);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    void getCustomerRestaurantMenuCategories(restaurantId)
      .then((values) => {
        if (cancelled) return;
        setState((previous) => ({ ...previous, categories: values }));
      })
      .catch(() => {
        if (cancelled) return;
        setState((previous) => ({ ...previous, categories: [] }));
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const setSearch = useCallback((nextSearch: string) => {
    invalidateActiveRequest();
    setSearchState(nextSearch);
    syncUrl(nextSearch, category);
  }, [category, invalidateActiveRequest, syncUrl]);

  const setCategory = useCallback((nextCategory: string | null) => {
    invalidateActiveRequest();
    setCategoryState(nextCategory);
    syncUrl(search, nextCategory);
  }, [invalidateActiveRequest, search, syncUrl]);

  const clearFilters = useCallback(() => {
    invalidateActiveRequest();
    setSearchState('');
    setCategoryState(null);
    syncUrl('', null);
  }, [invalidateActiveRequest, syncUrl]);

  const loadMore = useCallback(() => {
    if (state.isLoading || state.isLoadingMore || !state.hasMore || !cursorRef.current) return;
    void runQuery({
      nextSearch: state.search,
      nextCategory: state.category,
      cursor: cursorRef.current,
      append: true,
    });
  }, [runQuery, state.category, state.hasMore, state.isLoading, state.isLoadingMore, state.search]);

  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, error: null, isLoading: true }));
    void runQuery({
      nextSearch: search,
      nextCategory: category,
      cursor: null,
      append: false,
    });
  }, [category, runQuery, search]);

  return {
    items: state.items,
    categories: state.categories,
    search,
    category,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    error: state.error,
    hasMore: state.hasMore,
    setSearch,
    setCategory,
    loadMore,
    retry,
    clearFilters,
  };
}
