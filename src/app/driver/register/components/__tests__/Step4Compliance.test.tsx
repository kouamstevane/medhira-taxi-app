import { render, screen } from '@testing-library/react';
import Step4Compliance from '../Step4Compliance';

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showError: jest.fn(),
    showWarning: jest.fn(),
  }),
}));

describe('Step4Compliance', () => {
  it('uses a subdued shared information banner instead of a dominant custom treatment', () => {
    render(<Step4Compliance onNext={jest.fn()} onBack={jest.fn()} />);

    const banner = screen.getByText(/Vérifiez la lisibilité/i).parentElement;

    expect(banner).toHaveClass('rounded-xl');
    expect(banner).toHaveClass('border');
  });
});
