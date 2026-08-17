import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StoreConnectorModal } from '../StoreConnectorModal';
import * as MenuImportClientService from '@/services/menu-import-client.service';

jest.mock('@/services/menu-import-client.service');

describe('StoreConnectorModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    restaurantId: 'resto-999',
    onSyncCompleted: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders modal fields and security notice', () => {
    render(<StoreConnectorModal {...defaultProps} />);
    expect(screen.getByText(/Connecter une boutique WooCommerce/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://mon-restaurant.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ck_xxxxxxxxxxxxxxxx')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('cs_xxxxxxxxxxxxxxxx')).toBeInTheDocument();
    expect(screen.getByText(/Sécurité de niveau bancaire/i)).toBeInTheDocument();
  });

  test('validates inputs and executes testStoreConnection', async () => {
    (MenuImportClientService.testStoreConnection as jest.Mock).mockResolvedValueOnce({
      success: true,
      message: 'Connexion réussie',
    });

    render(<StoreConnectorModal {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('https://mon-restaurant.com'), {
      target: { value: 'https://myshop.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('ck_xxxxxxxxxxxxxxxx'), {
      target: { value: 'ck_valid_key' },
    });
    fireEvent.change(screen.getByPlaceholderText('cs_xxxxxxxxxxxxxxxx'), {
      target: { value: 'cs_valid_secret' },
    });

    const testBtn = screen.getByText('🔌 Tester la connexion');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(MenuImportClientService.testStoreConnection).toHaveBeenCalledWith({
        restaurantId: 'resto-999',
        siteUrl: 'https://myshop.com',
        consumerKey: 'ck_valid_key',
        consumerSecret: 'cs_valid_secret',
      });
      expect(screen.getByText('Connexion réussie')).toBeInTheDocument();
    });
  });

  test('triggers saveStoreIntegration and startRestaurantStoreSync', async () => {
    (MenuImportClientService.saveStoreIntegration as jest.Mock).mockResolvedValueOnce({
      success: true,
      message: 'Enregistré',
    });
    (MenuImportClientService.startRestaurantStoreSync as jest.Mock).mockResolvedValueOnce({
      importId: 'wc-sync-job-1',
    });
    (MenuImportClientService.listenToImportProgress as jest.Mock).mockImplementation(
      (restaurantId, importId, onJob) => {
        onJob({
          id: importId,
          restaurantId,
          type: 'woocommerce',
          status: 'completed',
          totalItems: 50,
          processedItems: 50,
          failedItems: 0,
          errors: [],
        });
        return jest.fn();
      }
    );

    render(<StoreConnectorModal {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('https://mon-restaurant.com'), {
      target: { value: 'https://myshop.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('ck_xxxxxxxxxxxxxxxx'), {
      target: { value: 'ck_valid_key' },
    });
    fireEvent.change(screen.getByPlaceholderText('cs_xxxxxxxxxxxxxxxx'), {
      target: { value: 'cs_valid_secret' },
    });

    const syncBtn = screen.getByText('Synchroniser maintenant');
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(MenuImportClientService.startRestaurantStoreSync).toHaveBeenCalledWith({
        restaurantId: 'resto-999',
        integrationId: 'woocommerce',
      });
      expect(defaultProps.onSyncCompleted).toHaveBeenCalled();
    });
  });
});
