import { render, screen } from '@testing-library/react';
import { CarType } from '@/types';

jest.mock('lucide-react', () => ({
  Info: () => <span data-testid="info-icon" />,
}));

const { VehicleOption } = require('./VehicleOption');

const carType: CarType = {
  id: 'eco',
  name: 'Eco',
  basePrice: 0,
  pricePerKm: 0,
  pricePerMinute: 1,
  image: '',
  seats: 4,
  time: '2-4 min',
  order: 1,
};

describe('VehicleOption', () => {
  it('shows only quick selection details in the compact card', () => {
    render(
      <VehicleOption
        carType={carType}
        selected={false}
        onSelect={jest.fn()}
        onShowDetails={jest.fn()}
      />
    );

    expect(screen.getByText('Eco')).toBeInTheDocument();
    expect(screen.getByText('4 places • 2-4 min d\'attente')).toBeInTheDocument();
    expect(screen.queryByText('Base', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('/km', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('/min', { exact: false })).not.toBeInTheDocument();
  });
});
