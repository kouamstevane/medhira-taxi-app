import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('shows inline feedback when the production year is too old for chauffeur registration', async () => {
    render(
      <Step3Vehicle
        onNext={jest.fn()}
        onBack={jest.fn()}
        initialData={{ productionYear: '2015', hasFourDoors: true }}
        initialFiles={{
          registration: new File(['registration'], 'registration.pdf', { type: 'application/pdf' }),
          techControl: new File(['tech-control'], 'tech-control.pdf', { type: 'application/pdf' }),
          exteriorPhoto: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    await waitFor(() => {
      expect(screen.getByText(/Le véhicule doit être de l'année/i)).toBeInTheDocument();
    });
  });
});
