import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NetworkErrorView } from '../NetworkErrorView';
import { Network } from '@capacitor/network';
import { Haptics } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

// Mock Capacitor plugins
jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
    isPluginAvailable: jest.fn(() => true),
  },
}));

jest.mock('@capacitor/network', () => ({
  Network: {
    addListener: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        remove: jest.fn(),
      });
    }),
  },
}));

jest.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: jest.fn().mockResolvedValue(undefined),
  },
  ImpactStyle: {
    Medium: 'MEDIUM',
  },
}));

describe('NetworkErrorView Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders default text, button and illustration properly', () => {
    render(<NetworkErrorView onRetry={jest.fn()} />);

    expect(screen.getByText('Oops!')).toBeInTheDocument();
    expect(
      screen.getByText('Échec du chargement des données. Veuillez vérifier votre connexion internet et réessayer.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.getByTestId('network-error-embedded')).toBeInTheDocument();
  });

  it('renders custom title, message and retryLabel', () => {
    render(
      <NetworkErrorView
        title="Connexion perdue"
        message="Vérifiez votre routeur ou votre forfait 4G."
        retryLabel="Relancer le chargement"
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Connexion perdue')).toBeInTheDocument();
    expect(screen.getByText('Vérifiez votre routeur ou votre forfait 4G.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /relancer le chargement/i })).toBeInTheDocument();
  });

  it('triggers onRetry callback and haptic feedback when clicking retry button', async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    const onRetryMock = jest.fn();

    render(<NetworkErrorView onRetry={onRetryMock} />);

    const retryButton = screen.getByRole('button', { name: /réessayer/i });
    fireEvent.click(retryButton);

    expect(onRetryMock).toHaveBeenCalledTimes(1);
    expect(Haptics.impact).toHaveBeenCalled();
  });

  it('renders fullscreen mode when fullScreen is true', () => {
    render(<NetworkErrorView fullScreen onRetry={jest.fn()} />);
    expect(screen.getByTestId('network-error-fullscreen')).toBeInTheDocument();
  });

  it('renders home button when showHomeButton is true', () => {
    render(<NetworkErrorView showHomeButton onRetry={jest.fn()} />);
    expect(screen.getByRole('link', { name: /retour à l'accueil/i })).toBeInTheDocument();
  });

  it('automatically triggers onRetry when the browser comes back online', async () => {
    const onRetryMock = jest.fn();

    render(<NetworkErrorView onRetry={onRetryMock} autoRetryOnReconnect={true} />);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });
  });

  it('registers Capacitor Network listener and cleans up on unmount', async () => {
    const removeMock = jest.fn();
    (Network.addListener as jest.Mock).mockResolvedValue({ remove: removeMock });

    const { unmount } = render(<NetworkErrorView onRetry={jest.fn()} autoRetryOnReconnect={true} />);

    await waitFor(() => {
      expect(Network.addListener).toHaveBeenCalledWith('networkStatusChange', expect.any(Function));
    });

    unmount();

    expect(removeMock).toHaveBeenCalled();
  });
});
