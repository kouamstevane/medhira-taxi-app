import { render, screen } from '@testing-library/react';
import Level5_HeadingToClient from '../Level5_HeadingToClient';
import type { FoodDeliveryOrder } from '@/types/firestore-collections';

jest.mock('../DriverFoodContacts', () => ({
  __esModule: true,
  default: () => <div data-testid="driver-food-contacts" />,
}));

const baseOrder: FoodDeliveryOrder = {
  orderId: 'order-1',
  driverId: 'driver-1',
  restaurantId: 'restaurant-1',
  clientId: 'client-1',
  cityId: 'edmonton',
  status: 'picked_up',
  deliveryPreference: 'leave_at_door',
  restaurantAddress: { address: '1 Restaurant Street', lat: 53.54, lng: -113.49 },
  clientNeighbourhood: 'Downtown',
  clientAddress: {
    address: '100 Client Street, Edmonton',
    lat: 53.55,
    lng: -113.5,
    instructions: 'Side door',
  },
  orderItems: [],
  orderNumber: '#42',
  restaurantName: 'Le Test',
  restaurantPhone: '+14165550000',
  clientPhone: '+14165550111',
  totalAmount: 34,
  driverEarnings: 7.2,
  cancellationImpactOnStats: true,
  createdAt: new Date('2026-07-29T12:00:00.000Z'),
  updatedAt: new Date('2026-07-29T12:20:00.000Z'),
};

describe('Level5_HeadingToClient', () => {
  test('shows the full client address after pickup', () => {
    render(<Level5_HeadingToClient order={baseOrder} updateStatus={jest.fn()} />);

    expect(screen.getByText('100 Client Street, Edmonton')).toBeInTheDocument();
    expect(screen.getByText('Side door')).toBeInTheDocument();
  });
});
