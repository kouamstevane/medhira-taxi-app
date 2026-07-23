import { render, screen } from '@testing-library/react';
import Step4Compliance from '../Step4Compliance';

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showError: jest.fn(),
    showWarning: jest.fn(),
  }),
}));

describe('Step4Compliance', () => {
  it('keeps navigation actions on the shared CTA contracts', () => {
    render(<Step4Compliance onNext={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByRole('button', { name: /retour/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /Continuer/i })).toHaveClass('from-[#f29200]');
  });

  it('uses a subdued shared information banner instead of a dominant custom treatment', () => {
    render(<Step4Compliance onNext={jest.fn()} onBack={jest.fn()} />);

    const banner = screen.getByText(/lisibilit/i).closest('div.rounded-xl');

    expect(banner).toHaveClass('rounded-xl');
    expect(banner).toHaveClass('border');
  });

  it('uses the shared upload guidance for legal document fields', () => {
    render(<Step4Compliance onNext={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getAllByText(/Image ou PDF \(Max 10Mo\)/i).length).toBeGreaterThan(0);
  });
});
