import { fireEvent, render, screen } from '@testing-library/react';
import RestaurantRegisterPage from '../page';
import { useRestaurantRegistration } from '@/hooks/useRestaurantRegistration';

jest.mock('@/hooks/useRestaurantRegistration', () => ({
  useRestaurantRegistration: jest.fn(),
}));
jest.mock('../components/Step1Account', () => ({ Step1Account: () => null }));
jest.mock('../components/Step2EmailVerification', () => ({ Step2EmailVerification: () => null }));
jest.mock('../components/Step4Hours', () => ({ Step4Hours: () => null }));
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
});
