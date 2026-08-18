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
    expect(screen.getByText('1 842 plats')).toBeInTheDocument();
    expect(screen.getByText('1 706 disponibles')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Rechercher un plat/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disponibles' })).toBeInTheDocument();
  });

  it('emits the search and availability changes', () => {
    render(<MenuCatalogToolbar {...props} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'burger' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disponibles' }));
    expect(props.onSearchChange).toHaveBeenCalledWith('burger');
    expect(props.onAvailabilityChange).toHaveBeenCalledWith('available');
  });
});
