import { render, screen } from '@testing-library/react';
import { RestaurantVisualPicker } from '../RestaurantVisualPicker';

describe('RestaurantVisualPicker', () => {
  it('uses the same compact frame while fitting logos and covers appropriately', () => {
    render(
      <>
        <RestaurantVisualPicker kind="logo" currentUrl="/logo.png" onChange={jest.fn()} />
        <RestaurantVisualPicker kind="cover" currentUrl="/cover.png" onChange={jest.fn()} />
      </>
    );

    expect(screen.getByLabelText('Choisir le logo').closest('label')).toHaveClass('aspect-video');
    expect(screen.getByLabelText('Choisir la photo de couverture').closest('label')).toHaveClass('aspect-video');
    expect(screen.getByAltText('Logo du restaurant')).toHaveClass('object-contain');
    expect(screen.getByAltText('Photo de couverture')).toHaveClass('object-cover');
  });
});
