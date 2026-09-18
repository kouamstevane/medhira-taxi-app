import { fireEvent, render, screen } from '@testing-library/react';
import { MenuCatalogRow } from '../MenuCatalogRow';

jest.mock('@/components/food/MenuItemImage', () => ({ MenuItemImage: () => <span data-testid="menu-image" /> }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => null }));

const item = {
  id: 'item-1', restaurantId: 'restaurant-1', name: 'Burger Maison', category: 'Plats', price: 5500,
  isAvailable: true,
} as any;

describe('MenuCatalogRow', () => {
  it('renders compact item content and accessible actions', () => {
    render(<MenuCatalogRow item={item} selected={false} onSelect={jest.fn()} onToggleAvailability={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getByText('Burger Maison')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions pour Burger Maison' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Burger Maison' }));
    expect(screen.getAllByRole('button', { name: 'Modifier Burger Maison' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Supprimer Burger Maison' })).toHaveLength(2);
    expect(screen.getByTestId('menu-image').parentElement).toHaveClass('relative', 'size-10', 'overflow-hidden');
  });

  it('toggles selection through the checkbox', () => {
    const onSelect = jest.fn();
    render(<MenuCatalogRow item={item} selected={false} onSelect={onSelect} onToggleAvailability={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Burger Maison' }));
    expect(onSelect).toHaveBeenCalledWith('item-1');
  });

  it('closes the mobile actions menu when clicking outside', () => {
    render(<MenuCatalogRow item={item} selected={false} onSelect={jest.fn()} onToggleAvailability={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Burger Maison' }));
    expect(screen.getAllByRole('button', { name: 'Modifier Burger Maison' })).toHaveLength(2);

    fireEvent.pointerDown(document.body);

    expect(screen.queryByText('Modifier Burger Maison')).not.toBeInTheDocument();
  });

  it('closes the mobile actions menu when an action is clicked', () => {
    const onEdit = jest.fn();
    render(
      <MenuCatalogRow
        item={item}
        selected={false}
        onSelect={jest.fn()}
        onToggleAvailability={jest.fn()}
        onEdit={onEdit}
        onDelete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Burger Maison' }));
    const editButtons = screen.getAllByRole('button', { name: 'Modifier Burger Maison' });
    expect(editButtons).toHaveLength(2);

    fireEvent.click(editButtons[1]);
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(screen.getAllByRole('button', { name: 'Modifier Burger Maison' })).toHaveLength(1);
  });
});
