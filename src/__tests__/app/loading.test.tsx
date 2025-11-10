/**
 * Tests du composant Loading
 * 
 * Teste l'écran de chargement global de l'application.
 */

import { render, screen } from '@testing-library/react';
import Loading from '@/app/loading';

describe('Loading Component', () => {
  it('renders loading screen correctly', () => {
    render(<Loading />);
    
    expect(screen.getByText(/medjira/i)).toBeInTheDocument();
    expect(screen.getByText(/chargement en cours/i)).toBeInTheDocument();
  });

  it('displays animated elements', () => {
    const { container } = render(<Loading />);
    
    // Vérifier les animations
    const animatedElements = container.querySelectorAll('.animate-pulse, .animate-ping');
    expect(animatedElements.length).toBeGreaterThan(0);
  });

  it('has proper styling for loading state', () => {
    const { container } = render(<Loading />);
    
    const wrapper = container.querySelector('.min-h-screen');
    expect(wrapper).toHaveClass('bg-gradient-to-br');
  });
});





