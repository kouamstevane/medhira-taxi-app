import { renderHook, waitFor } from '@testing-library/react';
import { useGoogleMaps } from '../useGoogleMaps';

describe('useGoogleMaps', () => {
  it('initializes Places without constructing the deprecated DirectionsService', async () => {
    const directionsService = jest.fn();
    const fetchAutocompleteSuggestions = jest.fn();

    window.google = {
      maps: {
        places: {},
        DirectionsService: directionsService,
        importLibrary: jest.fn().mockResolvedValue({
          AutocompleteSuggestion: { fetchAutocompleteSuggestions },
        }),
      },
    } as unknown as typeof window.google;

    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(directionsService).not.toHaveBeenCalled();
    expect(result.current.autocompleteService).not.toBeNull();
  });
});
