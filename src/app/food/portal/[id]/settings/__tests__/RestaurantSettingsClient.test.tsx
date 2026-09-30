import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Restaurant } from '@/types/food-delivery';
import RestaurantSettingsClient from '../RestaurantSettingsClient';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGetRestaurantById = FoodDeliveryService.getRestaurantById as jest.Mock;
const mockUpdateRestaurantOpeningHours = FoodDeliveryService.updateRestaurantOpeningHours as jest.Mock;
const mockDeleteRestaurant = FoodDeliveryService.deleteRestaurant as jest.Mock;
const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('restaurantId=restaurant-1'),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: { uid: string }) => void) => {
    callback({ uid: 'owner-1' });
    return jest.fn();
  },
}));

jest.mock('@/config/firebase', () => ({ auth: { currentUser: null }, db: {} }));

jest.mock('@/services', () => ({
  AuthService: {
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getRestaurantById: jest.fn(),
    updateRestaurantOpeningHours: jest.fn(),
    updateRestaurantVisuals: jest.fn(),
    deleteRestaurant: jest.fn(),
  },
}));

jest.mock('@/services/restaurant-image.service', () => ({
  deleteRestaurantImage: jest.fn(),
  getRestaurantImageStorageErrorMessage: jest.fn(() => 'Erreur visuelle'),
  uploadRestaurantImage: jest.fn(),
}));

jest.mock('@/utils/restaurant-image', () => ({
  ...jest.requireActual('@/utils/restaurant-image'),
  prepareRestaurantImage: jest.fn(),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    removeToast: jest.fn(),
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span role="progressbar" />,
}));

jest.mock('@/components/ui/Toast', () => ({
  ToastContainer: () => null,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => null,
  portalNavItems: () => [],
}));

jest.mock('@/app/food/portal/[id]/RestaurantPortalHeader', () => ({
  RestaurantPortalHeader: ({ restaurantName }: { restaurantName: string }) => (
    <div>{restaurantName}</div>
  ),
}));

const mockUpdateRestaurantVisuals = FoodDeliveryService.updateRestaurantVisuals as jest.Mock;
const { prepareRestaurantImage: mockPrepareRestaurantImage } = require('@/utils/restaurant-image');
const {
  deleteRestaurantImage: mockDeleteRestaurantImage,
  uploadRestaurantImage: mockUploadRestaurantImage,
} = require('@/services/restaurant-image.service');

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'restaurant-1',
    ownerId: 'owner-1',
    name: 'Chez Medjira',
    description: 'Restaurant partenaire',
    address: '1 rue de Medjira',
    phone: '+33123456789',
    email: 'chez@example.com',
    cuisineType: ['Africaine'],
    avgPricePerPerson: 20,
    commissionRate: 10,
    status: 'approved',
    rating: 4.5,
    totalReviews: 10,
    stripeConnectStatus: 'active',
    createdAt: {} as Restaurant['createdAt'],
    updatedAt: {} as Restaurant['updatedAt'],
    ...overrides,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockSignOut.mockClear();
  mockGetRestaurantById.mockReset();
  mockUpdateRestaurantOpeningHours.mockReset().mockResolvedValue(undefined);
  mockUpdateRestaurantVisuals.mockReset().mockResolvedValue(undefined);
  mockDeleteRestaurant.mockReset().mockResolvedValue(undefined);
  mockPrepareRestaurantImage.mockReset().mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  mockUploadRestaurantImage.mockReset().mockResolvedValue({
    path: 'restaurant-images/restaurant-1/cover-upload-1.webp',
    url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/restaurant-images%2Frestaurant-1%2Fcover-upload-1.webp',
  });
  mockDeleteRestaurantImage.mockReset().mockResolvedValue(undefined);
  mockShowError.mockClear();
  mockShowSuccess.mockClear();
  mockGetRestaurantById.mockResolvedValue(makeRestaurant({
    openingHours: {
      monday: { open: '10:00', close: '20:00', closed: false },
      tuesday: null,
    },
  }));
});

describe('RestaurantSettingsClient', () => {
  const openHoursSheet = async () => {
    const items = await screen.findAllByRole('button', { name: /Horaires d'ouverture/i });
    fireEvent.click(items[0]);
  };

  const openVisualsSheet = async () => {
    const items = await screen.findAllByRole('button', { name: /Identité visuelle/i });
    fireEvent.click(items[0]);
  };

  it('renders existing hours in BottomSheet and hides controls for a closed day', async () => {
    render(<RestaurantSettingsClient />);
    await openHoursSheet();

    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi ouverture')).toHaveValue('10:00');
    expect(screen.queryByLabelText('Mardi ouverture')).not.toBeInTheDocument();
  });

  it('prevents saving when every day is closed', async () => {
    render(<RestaurantSettingsClient />);
    await openHoursSheet();

    const toggles = await screen.findAllByRole('checkbox');
    toggles.forEach((toggle) => {
      if ((toggle as HTMLInputElement).checked) fireEvent.click(toggle);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Au moins un jour doit être ouvert.');
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockUpdateRestaurantOpeningHours).not.toHaveBeenCalled();
  });

  it('saves valid changes and confirms success', async () => {
    render(<RestaurantSettingsClient />);
    await openHoursSheet();
    fireEvent.change(await screen.findByLabelText('Lundi ouverture'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    await waitFor(() => expect(mockUpdateRestaurantOpeningHours).toHaveBeenCalled());
    expect(mockShowSuccess).toHaveBeenCalledWith('Horaires enregistrés.');
  });

  it('allows expanding a day and duplicating hours to other open days', async () => {
    render(<RestaurantSettingsClient />);
    await openHoursSheet();

    // Click on Lundi to expand it
    const expandButton = await screen.findByLabelText('Modifier les horaires Lundi');
    fireEvent.click(expandButton);

    // Change Monday hours
    fireEvent.change(screen.getByLabelText('Lundi ouverture'), { target: { value: '07:30' } });
    fireEvent.change(screen.getByLabelText('Lundi fermeture'), { target: { value: '23:00' } });

    // Click "Appliquer à tous les jours ouverts"
    const applyButtons = screen.getAllByRole('button', { name: /Appliquer à tous les jours ouverts/i });
    fireEvent.click(applyButtons[0]);

    expect(mockShowSuccess).toHaveBeenCalledWith('Horaires appliqués aux autres jours ouverts');
    expect(screen.getByLabelText('Mercredi ouverture')).toHaveValue('07:30');
    expect(screen.getByLabelText('Mercredi fermeture')).toHaveValue('23:00');
  });

  it('saves a replacement cover without touching the logo', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:cover') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });

    try {
      render(<RestaurantSettingsClient />);
      await openVisualsSheet();
      const input = await screen.findByLabelText('Choisir la photo de couverture');
      fireEvent.change(input, {
        target: { files: [new File(['cover'], 'cover.png', { type: 'image/png' })] },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les visuels' }));

      await waitFor(() => expect(mockUpdateRestaurantVisuals).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({ coverImageUrl: expect.stringContaining('restaurant-images') }),
      ));
      expect(mockShowSuccess).toHaveBeenCalledWith('Visuels enregistrés.');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it('redirects a non-owner away from the settings page', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(makeRestaurant({ ownerId: 'another-owner' }));
    render(<RestaurantSettingsClient />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockShowError).toHaveBeenCalledWith('Accès non autorisé.');
  });

  it('keeps an inline error when saving fails', async () => {
    mockUpdateRestaurantOpeningHours.mockRejectedValueOnce(new Error('network'));
    render(<RestaurantSettingsClient />);
    await openHoursSheet();
    fireEvent.change(await screen.findByLabelText('Lundi ouverture'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Impossible d\u2019enregistrer les horaires. Réessayez.",
    );
  });

  it('renders a recoverable error state when loading fails', async () => {
    mockGetRestaurantById.mockReset().mockRejectedValue(new Error('network'));
    render(<RestaurantSettingsClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Erreur lors du chargement des paramètres.',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('deletes the restaurant only after the explicit confirmation step', async () => {
    render(<RestaurantSettingsClient />);

    expect(screen.queryByText(/suppression définitive/i)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer ce restaurant/i }));

    expect(screen.getByText(/suppression définitive/i)).toBeInTheDocument();
    const deleteBtn = screen.getByRole('button', { name: 'Supprimer définitivement' });
    expect(deleteBtn).toBeDisabled();

    const confirmInput = screen.getByRole('textbox');
    fireEvent.change(confirmInput, { target: { value: 'supprimer' } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.click(deleteBtn);

    await waitFor(() => expect(mockDeleteRestaurant).toHaveBeenCalledWith('restaurant-1'));
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('renders sign out and delete items at the bottom like /profil', async () => {
    render(<RestaurantSettingsClient />);

    expect(await screen.findByText(/Se déconnecter/i)).toBeInTheDocument();
    expect(screen.getByText(/Supprimer ce restaurant/i)).toBeInTheDocument();
  });

  it('signs out when clicking the sign out menu item', async () => {
    render(<RestaurantSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: /Se déconnecter/i }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
