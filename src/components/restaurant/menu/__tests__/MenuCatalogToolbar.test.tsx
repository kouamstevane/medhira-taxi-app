import { fireEvent, render, screen } from '@testing-library/react';
import { MenuCatalogToolbar } from '../MenuCatalogToolbar';

const props = {
  search: '',
  category: null,
  categories: ['Boissons', 'Plats'],
  availability: 'all' as const,
  sort: 'category' as const,
  totalCount: 1842,
  availableCount: 1706,
  onSearchChange: jest.fn(),
  onCategoryChange: jest.fn(),
  onAvailabilityChange: jest.fn(),
  onSortChange: jest.fn(),
};

describe('MenuCatalogToolbar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the catalog summary and mobile filter controls', () => {
    render(<MenuCatalogToolbar {...props} />);
    expect(screen.getByRole('button', { name: /^Tous/i })).toHaveTextContent(/1\D*842/);
    expect(screen.getByRole('button', { name: /^Disponibles/i })).toHaveTextContent(/1\D*706/);
    expect(screen.getByRole('button', { name: /^Indisponibles/i })).toHaveTextContent('136');
    expect(screen.queryByText(/1842 plats/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1706 disponibles/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réinitialiser/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Rechercher un plat/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Disponibles/i })).toBeInTheDocument();
  });

  it('emits the search and availability changes', () => {
    render(<MenuCatalogToolbar {...props} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher un plat/i), { target: { value: 'burger' } });
    fireEvent.click(screen.getByRole('button', { name: /^Disponibles/i }));
    expect(props.onSearchChange).toHaveBeenCalledWith('burger');
    expect(props.onAvailabilityChange).toHaveBeenCalledWith('available');
  });

  it('clears the search through the visible clear action', () => {
    render(<MenuCatalogToolbar {...props} search="Limonade" />);

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));

    expect(props.onSearchChange).toHaveBeenCalledWith('');
  });

  it('opens category bottom sheet and selects a category', () => {
    render(<MenuCatalogToolbar {...props} />);
    const categoryButton = screen.getByRole('button', { name: 'Catégorie' });
    fireEvent.click(categoryButton);

    const drinksOption = screen.getByRole('button', { name: 'Boissons' });
    fireEvent.click(drinksOption);

    expect(props.onCategoryChange).toHaveBeenCalledWith('Boissons');
  });

  it('opens sort bottom sheet and selects a sort option', () => {
    render(<MenuCatalogToolbar {...props} />);
    const sortButton = screen.getByRole('button', { name: 'Trier par' });
    fireEvent.click(sortButton);

    const priceAscOption = screen.getByRole('button', { name: 'Prix croissant' });
    fireEvent.click(priceAscOption);

    expect(props.onSortChange).toHaveBeenCalledWith('price-asc');
  });
});
