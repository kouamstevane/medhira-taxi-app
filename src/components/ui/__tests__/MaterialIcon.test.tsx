import { render, screen } from '@testing-library/react';
import { MaterialIcon } from '../MaterialIcon';

describe('MaterialIcon', () => {
  test('renders a local SVG icon instead of exposing the Material icon name as text', () => {
    const { container } = render(<MaterialIcon name="send" />);

    expect(container.querySelector('[data-testid$="-icon"]')).toBeInTheDocument();
    expect(screen.queryByText('send')).not.toBeInTheDocument();
  });
});
