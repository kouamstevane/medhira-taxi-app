import { render, screen } from '@testing-library/react';
import PersonalDriverPage from '../page';
import { DashboardServiceGrid } from '@/app/dashboard/components/DashboardServiceGrid';

describe('Personal Driver client entry', () => {
  it('adds the Personal Driver dashboard entry with the monthly transport CTA', () => {
    render(<DashboardServiceGrid />);

    expect(screen.getByRole('link', { name: /Personal Driver/i })).toHaveAttribute(
      'href',
      '/personal-driver',
    );
    expect(screen.getByText('Personal Driver')).toBeVisible();
    expect(
      screen.getByText(
        "Planifiez vos deplacements reguliers et connaissez votre cout mensuel a l'avance.",
      ),
    ).toBeVisible();
    expect(screen.getByText('Configurer mon transport mensuel')).toBeVisible();
    expect(screen.queryByText(
      /Commander un taxi|Reserver une course maintenant|Trouver un chauffeur/,
    )).not.toBeInTheDocument();
  });

  it('renders the available plans and their required labels', () => {
    render(<PersonalDriverPage />);

    expect(screen.getByRole('heading', { name: /MEDJIRA PERSONAL DRIVER/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Commencer/i })).toHaveAttribute('href', '#forfaits');
    expect(screen.getByRole('heading', { name: 'Basic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Classic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByText('LE PLUS POPULAIRE')).toBeInTheDocument();
    expect(screen.getByText('SERVICE PRIORITAIRE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comparer les forfaits/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aidez-moi à choisir/i })).toBeInTheDocument();
  });

  it('links each plan selection to its configuration route', () => {
    render(<PersonalDriverPage />);

    expect(screen.getByRole('link', { name: 'Choisir Basic' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=basic',
    );
    expect(screen.getByRole('link', { name: 'Choisir Classic' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=classic',
    );
    expect(screen.getByRole('link', { name: 'Choisir Premium' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=premium',
    );
  });
});
