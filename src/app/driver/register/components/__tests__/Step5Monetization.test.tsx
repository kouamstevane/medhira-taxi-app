import { render, screen } from '@testing-library/react';
import Step5Monetization from '../Step5Monetization';

describe('Step5Monetization', () => {
  it('keeps navigation actions on the shared CTA contracts', () => {
    render(<Step5Monetization onSubmitFinal={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByRole('button', { name: /soumettre ma candidature/i })).toHaveClass('from-[#f29200]');
    expect(screen.getByRole('button', { name: /retour/i })).toHaveClass('border-white/10');
  });
});
