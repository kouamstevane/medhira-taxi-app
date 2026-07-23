import { render, screen } from '@testing-library/react';
import Step5Monetization from '../Step5Monetization';

describe('Step5Monetization', () => {
  it('keeps navigation actions on the shared CTA contracts', () => {
    render(<Step5Monetization onSubmitFinal={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByRole('button', { name: /soumettre ma candidature/i })).toHaveClass('from-[#f29200]');
    expect(screen.getByRole('button', { name: /retour/i })).toHaveClass('border-white/10');
  });

  it('explains the Stripe redirect without rendering the redundant PCI DSS badge', () => {
    render(<Step5Monetization onSubmitFinal={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByText(/vous serez redirigé vers le formulaire sécurisé de Stripe pour renseigner vos informations bancaires après la soumission de votre candidature/i)).toBeInTheDocument();
    expect(screen.queryByText('Certifié')).not.toBeInTheDocument();
  });
});
