import { render, screen } from '@testing-library/react';
import { RestaurantPortalPayoutBanner } from '../RestaurantPortalPayoutBanner';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

describe('RestaurantPortalPayoutBanner', () => {
  it.each([
    ['not_started', 'Configurer', '/restaurant/onboarding/payments'],
    ['in_progress', 'Reprendre', '/restaurant/onboarding/payments'],
    ['restricted', 'Réparer', '/restaurant/onboarding/payments?mode=update'],
  ] as const)('exposes the Stripe action for an approved restaurant in %s', (stripeConnectStatus, label, href) => {
    render(<RestaurantPortalPayoutBanner status="approved" stripeConnectStatus={stripeConnectStatus} />);

    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    expect(screen.getByText('Votre restaurant ne sera pas affiché aux clients tant que votre compte de paiement Stripe n\'est pas actif.')).toBeInTheDocument();
  });

  it('renders nothing for an active or non-approved restaurant', () => {
    const { container, rerender } = render(
      <RestaurantPortalPayoutBanner status="approved" stripeConnectStatus="active" />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <RestaurantPortalPayoutBanner status="pending_approval" stripeConnectStatus="not_started" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
