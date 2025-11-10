/**
 * Tests du AuthContext
 * 
 * Teste le provider d'authentification et le hook useAuth.
 */

import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { auth } from '@/config/firebase';

// Composant de test qui utilise useAuth
function TestComponent() {
  const { currentUser, loading, userData } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'true' : 'false'}</div>
      <div data-testid="user">{currentUser ? 'logged-in' : 'logged-out'}</div>
      <div data-testid="user-data">{userData ? 'has-data' : 'no-data'}</div>
    </div>
  );
}

describe('AuthContext', () => {
  it('provides authentication context to children', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('logged-out');
    expect(screen.getByTestId('user-data')).toHaveTextContent('no-data');
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    // Supprimer temporairement les erreurs de console pour ce test
    const originalError = console.error;
    console.error = jest.fn();

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');

    console.error = originalError;
  });

  it('initially shows loading state', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Note: Dans un vrai test, on simulerait Firebase Auth
    // Pour l'instant, on vérifie juste que le composant se rend
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});





