import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PersonalDriverPage from '../page';

describe('Personal Driver client entry', () => {
  it('adds the Personal Driver dashboard entry with the monthly transport CTA', () => {
    const dashboardSource = readFileSync(
      join(process.cwd(), 'src/app/dashboard/page.tsx'),
      'utf8',
    );

    expect(dashboardSource).toContain("label: 'Personal Driver'");
    expect(dashboardSource).toContain("route: '/personal-driver'");
    expect(dashboardSource).toContain(
      "Planifiez vos deplacements reguliers et connaissez votre cout mensuel a l'avance.",
    );
    expect(dashboardSource).toContain('Configurer mon transport mensuel');
    expect(dashboardSource).not.toMatch(
      /Commander un taxi|Reserver une course maintenant|Trouver un chauffeur/,
    );
  });

  it('renders the available plans and their required labels', () => {
    render(<PersonalDriverPage />);

    expect(screen.getByRole('heading', { name: 'Basic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Classic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByText('LE PLUS POPULAIRE')).toBeInTheDocument();
    expect(screen.getByText('SERVICE PRIORITAIRE')).toBeInTheDocument();
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
