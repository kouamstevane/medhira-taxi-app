/**
 * Tests du composant LoadingSpinner
 * 
 * Teste l'affichage et les différentes tailles du spinner.
 */

import { render } from '@testing-library/react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('renders correctly', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('applies size classes correctly', () => {
    const { container: smallContainer } = render(<LoadingSpinner size="small" />);
    const smallSpinner = smallContainer.querySelector('.animate-spin');
    expect(smallSpinner).toHaveClass('h-4');

    const { container: largeContainer } = render(<LoadingSpinner size="large" />);
    const largeSpinner = largeContainer.querySelector('.animate-spin');
    expect(largeSpinner).toHaveClass('h-12');
  });

  it('displays text when provided', () => {
    const { getByText } = render(<LoadingSpinner text="Loading data..." />);
    expect(getByText('Loading data...')).toBeInTheDocument();
  });
});






