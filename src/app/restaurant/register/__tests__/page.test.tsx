import { fireEvent, render, screen } from '@testing-library/react';
import RestaurantRegisterPage from '../page';
import { useRestaurantRegistration } from '@/hooks/useRestaurantRegistration';

jest.mock('@/hooks/useRestaurantRegistration', () => ({
  useRestaurantRegistration: jest.fn(),
}));
jest.mock('../components/Step1Account', () => ({ Step1Account: () => null }));
jest.mock('../components/Step2EmailVerification', () => ({ Step2EmailVerification: () => null }));
jest.mock('../components/Step4Hours', () => ({
  Step4Hours: ({ error }: { error?: string | null }) => error ? <div role="alert">{error}</div> : null,
}));
jest.mock('../components/Step3Restaurant', () => ({
  Step3Restaurant: ({ onNext }: { onNext: (data: unknown) => void }) => (
    <button type="button" onClick={() => onNext({ name: 'Le Bistrot', location: { lat: 1, lng: 2 } })}>
      continue
    </button>
  ),
}));
jest.mock('@/components/ui/LoadingSpinner', () => ({ LoadingSpinner: () => <span /> }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));

const mockUseRestaurantRegistration = useRestaurantRegistration as jest.Mock;

describe('RestaurantRegisterPage', () => {
  it('passes submission errors to the hours step', () => {
    mockUseRestaurantRegistration.mockReturnValue({
      currentStep: 4,
      loading: false,
      error: 'Données de restaurant invalides.',
      isSubmitting: false,
      fromBecomePro: false,
      restoringDraft: false,
      step1Data: {},
      step3Data: {},
      step4Data: {},
      setStepData: jest.fn(),
      goToStep: jest.fn(),
      handleStep1Submit: jest.fn(),
      handleGoogleSignIn: jest.fn(),
      handleStep2Verified: jest.fn(),
      handleDraftSave: jest.fn(),
      saveDraftDebounced: jest.fn(),
      handleSubmit: jest.fn(),
    });

    render(<RestaurantRegisterPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Données de restaurant invalides.');
  });

  it('stores step 3 data before moving to the hours step', () => {
    const setStepData = jest.fn();
    const goToStep = jest.fn();

    mockUseRestaurantRegistration.mockReturnValue({
      currentStep: 3,
      loading: false,
      error: null,
      isSubmitting: false,
      fromBecomePro: false,
      restoringDraft: false,
      alreadyHasRestaurant: false,
      step1Data: {},
      step3Data: {},
      step4Data: {},
      setStepData,
      goToStep,
      handleStep1Submit: jest.fn(),
      handleGoogleSignIn: jest.fn(),
      handleStep2Verified: jest.fn(),
      handleDraftSave: jest.fn(),
      saveDraftDebounced: jest.fn(),
      handleSubmit: jest.fn(),
    });

    render(<RestaurantRegisterPage />);
    fireEvent.click(screen.getByRole('button', { name: 'continue' }));

    expect(setStepData).toHaveBeenCalledWith(3, { name: 'Le Bistrot', location: { lat: 1, lng: 2 } });
    expect(goToStep).toHaveBeenCalledWith(4);
  });

  it('allows a signed-in owner to register another restaurant', () => {
    mockUseRestaurantRegistration.mockReturnValue({
      currentStep: 3,
      loading: false,
      error: null,
      isSubmitting: false,
      fromBecomePro: true,
      restoringDraft: false,
      alreadyHasRestaurant: true,
      step1Data: {},
      step3Data: {},
      step4Data: {},
      setStepData: jest.fn(),
      goToStep: jest.fn(),
      handleStep1Submit: jest.fn(),
      handleGoogleSignIn: jest.fn(),
      handleStep2Verified: jest.fn(),
      handleDraftSave: jest.fn(),
      saveDraftDebounced: jest.fn(),
      handleSubmit: jest.fn(),
    });

    render(<RestaurantRegisterPage />);

    expect(screen.getByRole('button', { name: 'continue' })).toBeInTheDocument();
    expect(screen.queryByText('Vous avez déjà un restaurant')).not.toBeInTheDocument();
  });

  it('offers a safe way to leave the registration for the home or login page', () => {
    const leaveRegistration = jest.fn();

    mockUseRestaurantRegistration.mockReturnValue({
      currentStep: 3,
      loading: false,
      error: null,
      isSubmitting: false,
      isLeaving: false,
      fromBecomePro: true,
      restoringDraft: false,
      step1Data: {},
      step3Data: {},
      step4Data: {},
      setStepData: jest.fn(),
      goToStep: jest.fn(),
      handleStep1Submit: jest.fn(),
      handleGoogleSignIn: jest.fn(),
      handleStep2Verified: jest.fn(),
      handleDraftSave: jest.fn(),
      saveDraftDebounced: jest.fn(),
      handleSubmit: jest.fn(),
      leaveRegistration,
    });

    render(<RestaurantRegisterPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Accueil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }));

    expect(leaveRegistration).toHaveBeenNthCalledWith(1, '/');
    expect(leaveRegistration).toHaveBeenNthCalledWith(2, '/login');
  });
});
