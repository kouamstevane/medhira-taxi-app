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
  onClearFilters: jest.fn(),
};

describe('MenuCatalogToolbar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the catalog summary and mobile filter controls', () => {
    render(<MenuCatalogToolbar {...props} />);
    expect(screen.getByText((text) => text.replace(/\s/g, '').includes('1842plats'))).toBeInTheDocument();
    expect(screen.getByText((text) => text.replace(/\s/g, '').includes('1706disponibles'))).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Rechercher un plat/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disponibles' })).toBeInTheDocument();
  });

  it('emits the search and availability changes', () => {
    render(<MenuCatalogToolbar {...props} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher un plat/i), { target: { value: 'burger' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disponibles' }));
    expect(props.onSearchChange).toHaveBeenCalledWith('burger');
    expect(props.onAvailabilityChange).toHaveBeenCalledWith('available');
  });

  it('clears the search through the visible clear action', () => {
    render(<MenuCatalogToolbar {...props} search="Limonade" />);

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));

    expect(props.onSearchChange).toHaveBeenCalledWith('');
  });
});
