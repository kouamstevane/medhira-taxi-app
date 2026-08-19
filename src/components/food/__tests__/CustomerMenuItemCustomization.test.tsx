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
      checkoutRules: undefined,
      customizationPrice: 6.5,
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

  it('resets previous selections and validation when the active item changes', async () => {
    const user = userEvent.setup();
    const onAddToCart = jest.fn();
    const nextItem: MenuItem = {
      ...item,
      id: 'item-2',
      name: 'Wrap du chef',
    };

    const { rerender } = render(
      <CustomerMenuItemCustomization
        item={item}
        modifierGroups={modifierGroups}
        supplements={supplements}
        onAddToCart={onAddToCart}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ajouter au panier' }));
    expect(screen.getByText('Sélectionnez au moins 1 option pour Taille.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Grand' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fromage' }));
    expect(screen.getByRole('radio', { name: 'Grand' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fromage' })).toBeChecked();

    rerender(
      <CustomerMenuItemCustomization
        item={nextItem}
        modifierGroups={modifierGroups}
        supplements={supplements}
        onAddToCart={onAddToCart}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Grand' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fromage' })).not.toBeChecked();
  });

  it('enforces checkout quantity rules and includes them in the add-to-cart payload', async () => {
    const user = userEvent.setup();
    const onAddToCart = jest.fn();

    render(
      <CustomerMenuItemCustomization
        item={item}
        modifierGroups={modifierGroups}
        supplements={supplements}
        checkoutRules={{ maxQuantity: 2 }}
        onAddToCart={onAddToCart}
      />,
    );

    expect(screen.getByText('Quantité maximale : 2')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Petit' }));
    await user.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    expect(screen.getByText('Vous pouvez ajouter jusqu’à 2 exemplaires pour ce plat.')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajouter au panier' }));

    expect(onAddToCart).toHaveBeenCalledWith({
      itemId: item.id,
      quantity: 2,
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['small'] },
      ],
      supplementIds: [],
      checkoutRules: {
        maxQuantity: 2,
      },
      customizationPrice: 0,
    });
  });
});
