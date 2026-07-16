import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getSuggestions = jest.fn();
const clearSuggestions = jest.fn();
const resetSession = jest.fn();

jest.mock('@/hooks/usePlacesAutocomplete', () => ({
  usePlacesAutocomplete: () => ({
    suggestions: [
      { place_id: '1', description: 'Douala, Cameroun' },
      { place_id: '2', description: 'Akwa, Douala' },
    ],
    loading: false,
    getSuggestions,
    clearSuggestions,
    resetSession,
  }),
}));

const { AddressInput } = require('./AddressInput');

describe('AddressInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows helper text for GPS-based pickup precision', () => {
    render(
      <AddressInput
        label="Point de départ"
        value="Douala"
        onChange={jest.fn()}
        onSelect={jest.fn()}
        autocompleteService={null}
        helperText="Position GPS · ±8m · Très précis"
      />
    );

    expect(screen.getByText('Position GPS · ±8m · Très précis')).toBeInTheDocument();
  });

  it('lets the user correct the pickup manually and select a suggestion', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onSelect = jest.fn();

    render(
      <AddressInput
        label="Point de départ"
        value="Dou"
        onChange={onChange}
        onSelect={onSelect}
        autocompleteService={{} as never}
        helperText="Adresse corrigée manuellement."
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'ala');

    expect(getSuggestions).toHaveBeenCalled();
    expect(screen.getByText('Douala, Cameroun')).toBeInTheDocument();

    await user.click(screen.getByText('Douala, Cameroun'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      place_id: '1',
      description: 'Douala, Cameroun',
    }));
    expect(resetSession).toHaveBeenCalled();
  });
});
