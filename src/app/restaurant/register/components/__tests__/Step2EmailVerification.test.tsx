import { render, waitFor } from '@testing-library/react';
import { Step2EmailVerification } from '../Step2EmailVerification';

const sendVerificationCode = jest.fn();

jest.mock('@/config/firebase', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => sendVerificationCode),
}));
jest.mock('@/components/ui/OTPInput', () => ({
  __esModule: true,
  default: () => <div data-testid="otp-input" />,
}));
jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => <span />,
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

describe('Step2EmailVerification', () => {
  beforeEach(() => {
    sendVerificationCode.mockResolvedValue({ data: { success: true } });
  });

  it('sends the first verification code when the step opens', async () => {
    render(
      <Step2EmailVerification
        email="owner@test.fr"
        onVerified={jest.fn()}
        loading={false}
        error={null}
      />,
    );

    await waitFor(() => {
      expect(sendVerificationCode).toHaveBeenCalledWith({ email: 'owner@test.fr' });
    });
  });
});
