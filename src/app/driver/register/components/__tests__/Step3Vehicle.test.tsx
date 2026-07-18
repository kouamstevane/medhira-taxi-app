import { render, screen } from '@testing-library/react';
import Step3Vehicle from '../Step3Vehicle';

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showInfo: jest.fn(),
    showError: jest.fn(),
  }),
}));

describe('Step3Vehicle', () => {
  it('keeps navigation actions on the shared CTA contracts', () => {
    render(<Step3Vehicle onNext={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByRole('button', { name: /retour/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /continuer/i })).toHaveClass('from-[#f29200]');
  });

  it('uses the shared upload empty-state styling', () => {
    render(<Step3Vehicle onNext={jest.fn()} onBack={jest.fn()} />);

    const uploadTile = screen.getByTestId('file-registration-empty-state');

    expect(uploadTile).toHaveClass('border-dashed');
    expect(uploadTile).toHaveClass('rounded-xl');
    expect(screen.getAllByText(/Image ou PDF \(Max 10Mo\)/i).length).toBeGreaterThan(0);
  });
});
