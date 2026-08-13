import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartDrawer } from '../CartDrawer';
import { useCartStore } from '@/store/cartStore';

jest.mock('@/store/cartStore', () => ({
  useCartStore: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => <span aria-hidden="true" />,
}));

const mockUseCartStore = useCartStore as unknown as jest.Mock;

describe('CartDrawer', () => {
  beforeEach(() => {
    mockUseCartStore.mockReturnValue({
      items: [{ id: 'pizza', name: 'Pizza', price: 17, quantity: 1 }],
      restaurant: { id: 'restaurant-1', name: 'Billion Food' },
      updateQuantity: jest.fn(),
      getTotalItems: () => 1,
      getSubtotal: () => 17,
    });
  });

  it('keeps the floating cart action above the bottom navigation', () => {
    const { container } = render(<CartDrawer />);
    const floatingContainer = screen.getByRole('button', { name: /voir le panier/i }).parentElement;

    expect(floatingContainer).toBe(container.firstChild);
    expect(floatingContainer).toHaveClass('bottom-20');
  });

  it('keeps the checkout action above the bottom navigation when opened', async () => {
    const user = userEvent.setup();

    render(<CartDrawer />);
    await user.click(screen.getByRole('button', { name: /voir le panier/i }));

    const checkoutButton = screen.getByRole('button', { name: /passer la commande/i });
    const drawer = checkoutButton.closest('div.fixed');
    const backdrop = document.querySelector('div.fixed.inset-0');

    expect(checkoutButton).toBeVisible();
    expect(drawer).toHaveClass('z-[70]');
    expect(backdrop).toHaveClass('z-[60]');
  });
});
