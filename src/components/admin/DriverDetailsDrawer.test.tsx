import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Driver } from '@/app/admin/drivers/page';
import type { DriverPrivate } from '@/types/firestore-collections';
import { DriverDetailsDrawer, type DriverDetailsDrawerProps } from './DriverDetailsDrawer';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt} />,
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span aria-hidden="true">{name}</span>,
}));

const photoUrl = 'https://example.com/photo.jpg';
const licenseUrl = 'https://example.com/license.jpg';

const driver: Driver = {
  id: 'driver-12345678',
  firstName: 'Bilion',
  lastName: 'Mani',
  email: 'bilion2ok@gmail.com',
  phone: '+237682821031',
  status: 'pending',
  driverType: 'chauffeur',
  licenseNumber: 'LIC-123',
  city: 'Douala',
  zipCode: '00000',
  car: { model: 'Corolla', plate: 'LT-123', color: 'Noir' },
  createdAt: new Date('2026-08-03T12:00:00.000Z'),
};

const privateData: DriverPrivate = {
  licenseClass: 'Classe 4',
  documents: {
    biometricPhoto: { url: photoUrl, status: 'pending' },
    licenseFront: { url: licenseUrl, status: 'pending' },
  },
};

const makeProps = (overrides: Partial<DriverDetailsDrawerProps> = {}): DriverDetailsDrawerProps => ({
  driver,
  privateData,
  rejectionReason: '',
  processing: false,
  onClose: jest.fn(),
  onRejectionReasonChange: jest.fn(),
  onApprove: jest.fn(),
  onReject: jest.fn(),
  onSuspend: jest.fn(),
  onUnsuspend: jest.fn(),
  onDelete: jest.fn(),
  getStatusBadge: () => <span>En attente</span>,
  ...overrides,
});

describe('DriverDetailsDrawer', () => {
  it('renders a compact summary and all available document thumbnails', () => {
    render(<DriverDetailsDrawer {...makeProps()} />);

    expect(screen.getByText('Documents disponibles')).toBeInTheDocument();
    expect(screen.getByText('2 pièces')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Photo de profil Agrandir' })).toHaveAttribute('href', photoUrl);
    expect(screen.getByRole('link', { name: 'Permis (Recto) Agrandir' })).toHaveAttribute('href', licenseUrl);
  });

  it('keeps approval and rejection actions connected to their callbacks', async () => {
    const user = userEvent.setup();
    const onApprove = jest.fn();
    const onReject = jest.fn();
    const onRejectionReasonChange = jest.fn();

    const { rerender } = render(
      <DriverDetailsDrawer {...makeProps({ onApprove, onReject, onRejectionReasonChange })} />,
    );

    await user.click(screen.getByRole('button', { name: 'Approuver le profil' }));
    expect(onApprove).toHaveBeenCalledTimes(1);

    rerender(
      <DriverDetailsDrawer
        {...makeProps({
          rejectionReason: 'Document incomplet',
          onApprove,
          onReject,
          onRejectionReasonChange,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('shows the empty document state and an accessible close action', () => {
    render(<DriverDetailsDrawer {...makeProps({ privateData: null })} />);

    expect(screen.getByText('Aucun document numérique disponible.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer les détails du chauffeur' })).toBeInTheDocument();
  });
});
