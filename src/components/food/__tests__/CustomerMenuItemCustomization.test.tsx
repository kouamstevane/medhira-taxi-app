import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerMenuItemCustomization } from '../CustomerMenuItemCustomization';
import type { CustomerMenuModifierGroup, CustomerMenuSupplement, MenuItem } from '@/types/food-delivery';

const item: MenuItem = {
  id: 'item-1',
  restaurantId: 'restaurant-1',
  name: 'Tacos maison',
  description: 'Servi chaud',
  price: 9.5,
  category: 'Plats',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const modifierGroups: CustomerMenuModifierGroup[] = [
  {
    id: 'size',
    label: 'Taille',
    selectionType: 'single',
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: 'small', label: 'Petit', priceDelta: 0, isAvailable: true },
      { id: 'large', label: 'Grand', priceDelta: 2, isAvailable: true },
    ],
  },
  {
    id: 'toppings',
    label: 'Garnitures',
    selectionType: 'multiple',
    required: false,
    minSelections: 0,
    maxSelections: 2,
    options: [
      { id: 'cheese', label: 'Fromage', priceDelta: 1, isAvailable: true },
      { id: 'bacon', label: 'Bacon', priceDelta: 1.5, isAvailable: true },
      { id: 'onion', label: 'Oignons', priceDelta: 0.5, isAvailable: true },
    ],
  },
];

const supplements: CustomerMenuSupplement[] = [
  { id: 'drink', label: 'Canette', price: 2, isAvailable: true },
  { id: 'dessert', label: 'Cookie', price: 2.5, isAvailable: true },
];

describe('CustomerMenuItemCustomization', () => {
  it('treats single-select groups as radios, multi-select groups as checkboxes, and emits a normalized payload with supplements', async () => {
    const user = userEvent.setup();
    const onAddToCart = jest.fn();

    render(
      <CustomerMenuItemCustomization
        item={item}
        modifierGroups={modifierGroups}
        supplements={supplements}
        onAddToCart={onAddToCart}
      />,
    );

    const small = screen.getByRole('radio', { name: 'Petit' });
    const large = screen.getByRole('radio', { name: 'Grand' });
    const cheese = screen.getByRole('checkbox', { name: 'Fromage' });
    const bacon = screen.getByRole('checkbox', { name: 'Bacon' });
    const drink = screen.getByRole('checkbox', { name: 'Canette' });

    await user.click(small);
    expect(small).toBeChecked();

    await user.click(large);
    expect(large).toBeChecked();
    expect(small).not.toBeChecked();

    await user.click(cheese);
    await user.click(bacon);
    await user.click(drink);
    await user.click(screen.getByRole('button', { name: 'Ajouter au panier' }));

    expect(onAddToCart).toHaveBeenCalledWith({
      itemId: item.id,
      quantity: 1,
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
        { groupId: 'toppings', selectionType: 'multiple', optionIds: ['cheese', 'bacon'] },
      ],
      supplementIds: ['drink'],
    });
  });

  it('shows validation copy when a required group is incomplete or a group maximum is exceeded', async () => {
    const user = userEvent.setup();
    const onAddToCart = jest.fn();

    render(
      <CustomerMenuItemCustomization
        item={item}
        modifierGroups={modifierGroups}
        supplements={supplements}
        onAddToCart={onAddToCart}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ajouter au panier' }));
    expect(screen.getByText('Sélectionnez au moins 1 option pour Taille.')).toBeInTheDocument();
    expect(onAddToCart).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'Petit' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fromage' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bacon' }));
    await user.click(screen.getByRole('checkbox', { name: 'Oignons' }));

    expect(screen.getByText('Vous pouvez choisir jusqu’à 2 options pour Garnitures.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Oignons' })).not.toBeChecked();
  });
});
