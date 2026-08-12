import { renderHook, act } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { SUPPORTED_COUNTRIES } from '@/utils/constants';

describe('usePlacesAutocomplete', () => {
  const strictModeWrapper = ({ children }: { children: ReactNode }) =>
    createElement(StrictMode, null, children);

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('applique la restriction pays par défaut sur tous les pays supportés si non fournie', async () => {
    const mockFetchAutocompleteSuggestions = jest.fn().mockResolvedValue({
      suggestions: [
        {
          placePrediction: {
            placeId: 'place-1',
            text: { toString: () => 'Marché central, Douala' },
          },
        },
      ],
    });
    const mockService = {
      fetchAutocompleteSuggestions: mockFetchAutocompleteSuggestions,
    };

    const { result } = renderHook(() =>
      usePlacesAutocomplete({
        autocompleteService: mockService,
      })
    , { wrapper: strictModeWrapper });

    act(() => {
      result.current.getSuggestions('March');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'March',
        includedRegionCodes: SUPPORTED_COUNTRIES.map((c) => c.code.toLowerCase()),
      }),
    );
    expect(result.current.suggestions).toEqual([
      { place_id: 'place-1', description: 'Marché central, Douala' },
    ]);
  });

  it('respecte la restriction pays sur-mesure si fournie', () => {
    const mockFetchAutocompleteSuggestions = jest.fn().mockResolvedValue({ suggestions: [] });
    const mockService = {
      fetchAutocompleteSuggestions: mockFetchAutocompleteSuggestions,
    };

    const { result } = renderHook(() =>
      usePlacesAutocomplete({
        autocompleteService: mockService,
        countryRestriction: ['cm'],
      })
    );

    act(() => {
      result.current.getSuggestions('Douala');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Douala',
        includedRegionCodes: ['cm'],
      }),
    );
  });

  it('arrête le chargement lorsque la requête Places échoue', async () => {
    const mockFetchAutocompleteSuggestions = jest.fn().mockRejectedValue(new Error('Places indisponible'));
    const mockService = {
      fetchAutocompleteSuggestions: mockFetchAutocompleteSuggestions,
    };

    const { result } = renderHook(() =>
      usePlacesAutocomplete({
        autocompleteService: mockService,
      })
    );

    act(() => {
      result.current.getSuggestions('Douala');
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });
});
