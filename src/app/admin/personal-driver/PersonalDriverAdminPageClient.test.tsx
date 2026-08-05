import { fireEvent, render, screen } from '@testing-library/react';

const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: mockGetDocs,
  orderBy: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));

describe('PersonalDriverAdminPageClient', () => {
  it('shows a French alert and retries an operational refresh failure', async () => {
    mockGetDocs
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/service est momentanément indisponible/i);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucun trajet récent à afficher.')).toBeInTheDocument();
  });
});
