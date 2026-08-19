import { fireEvent, render, screen } from '@testing-library/react';
import { RestaurantMenuNavigation } from '../RestaurantMenuNavigation';

const categories = [
  { name: 'Entrées', availableCount: 3 },
  { name: 'Plats', availableCount: 8 },
  { name: 'Desserts', availableCount: 2 },
];

describe('RestaurantMenuNavigation', () => {
  it('renders search and category controls with counts and reset behavior', () => {
    const onSearchChange = jest.fn();
    const onCategoryChange = jest.fn();
    const onClearFilters = jest.fn();

    render(
      <RestaurantMenuNavigation
        search=""
        category={null}
        categories={categories}
        onSearchChange={onSearchChange}
        onCategoryChange={onCategoryChange}
        onClearFilters={onClearFilters}
      />,
    );

    const searchbox = screen.getByRole('searchbox', { name: 'Rechercher un plat' });
    expect(searchbox).toHaveAttribute('placeholder', 'Rechercher un plat…');

    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Entrées 3' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Plats 8' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Desserts 2' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.change(searchbox, { target: { value: 'pizza' } });
    expect(onSearchChange).toHaveBeenCalledWith('pizza');

    fireEvent.click(screen.getByRole('button', { name: 'Desserts 2' }));
    expect(onCategoryChange).toHaveBeenCalledWith('Desserts');

    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    expect(onCategoryChange).toHaveBeenCalledWith(null);

    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument();
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('shows a reset button when filters are active', () => {
    const onSearchChange = jest.fn();
    const onCategoryChange = jest.fn();
    const onClearFilters = jest.fn();

    render(
      <RestaurantMenuNavigation
        search="pizza"
        category="Plats"
        categories={categories}
        onSearchChange={onSearchChange}
        onCategoryChange={onCategoryChange}
        onClearFilters={onClearFilters}
      />,
    );

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plats 8' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
