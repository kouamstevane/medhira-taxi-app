import { renderHook, act } from '@testing-library/react';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { SUPPORTED_COUNTRIES } from '@/utils/constants';

describe('usePlacesAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('applique la restriction pays par défaut sur tous les pays supportés si non fournie', () => {
    const mockGetPlacePredictions = jest.fn();
    const mockService = {
      getPlacePredictions: mockGetPlacePredictions,
    } as unknown as google.maps.places.AutocompleteService;

    const { result } = renderHook(() =>
      usePlacesAutocomplete({
        autocompleteService: mockService,
      })
    );

    act(() => {
      result.current.getSuggestions('March');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockGetPlacePredictions).toHaveBeenCalledTimes(1);
    expect(mockGetPlacePredictions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'March',
        componentRestrictions: {
          country: SUPPORTED_COUNTRIES.map((c) => c.code.toLowerCase()),
        },
      }),
      expect.any(Function)
    );
  });

  it('respecte la restriction pays sur-mesure si fournie', () => {
    const mockGetPlacePredictions = jest.fn();
    const mockService = {
      getPlacePredictions: mockGetPlacePredictions,
    } as unknown as google.maps.places.AutocompleteService;

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

    expect(mockGetPlacePredictions).toHaveBeenCalledTimes(1);
    expect(mockGetPlacePredictions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Douala',
        componentRestrictions: {
          country: ['cm'],
        },
      }),
      expect.any(Function)
    );
  });
});
