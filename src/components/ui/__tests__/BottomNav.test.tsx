import { portalNavItems } from '@/components/ui/BottomNav';

describe('restaurant portal navigation', () => {
  it('adds Paramètres as the fourth portal destination', () => {
    expect(portalNavItems('restaurant-1').at(-1)).toEqual({
      href: '/food/portal/settings?restaurantId=restaurant-1',
      icon: 'settings',
      label: 'Paramètres',
    });
  });
});
