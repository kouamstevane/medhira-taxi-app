import { render, screen } from '@testing-library/react';
import { AddressInput } from '../AddressInput';

describe('AddressInput', () => {
  it('uses the shared driver field contract', () => {
    render(
      <AddressInput
        label="Adresse"
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        autocompleteService={null}
        error="Adresse requise"
      />
    );

    expect(screen.getByLabelText('Adresse')).toHaveClass('rounded-xl');
    expect(screen.getByText('Adresse')).toHaveClass('text-[#9CA3AF]');
    expect(screen.getByText('Adresse requise')).toHaveClass('text-red-500');
  });
});
