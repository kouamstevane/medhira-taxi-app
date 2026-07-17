import { render, screen, waitFor } from '@testing-library/react';
import Step1Intent from '../Step1Intent';

jest.mock('@/components/forms/InputField', () => ({
  InputField: ({ label, ...props }: { label?: string }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));

jest.mock('@/components/ui/OTPInput', () => ({
  __esModule: true,
  default: () => <div>otp</div>,
}));

describe('Step1Intent', () => {
  it('keeps OTP inside the shared wizard presentation', async () => {
    render(<Step1Intent onNext={jest.fn()} onGoogleSignIn={jest.fn()} sendVerificationCode={jest.fn().mockResolvedValue({ success: true })} verifyCode={jest.fn()} />)
    expect(screen.getByRole('button', { name: /continuer avec google/i })).toHaveClass('rounded-xl')
  });

  it('does not auto-advance when autoAdvanceOnMount is disabled', async () => {
    const onVerified = jest.fn();

    render(
      <Step1Intent
        onNext={jest.fn()}
        onGoogleSignIn={jest.fn()}
        onVerified={onVerified}
        emailPreVerified
        autoAdvanceOnMount={false}
      />
    );

    await waitFor(() => {
      expect(onVerified).not.toHaveBeenCalled();
    });
  });

  it('auto-advances when email is pre-verified and autoAdvanceOnMount is enabled', async () => {
    const onVerified = jest.fn();

    render(
      <Step1Intent
        onNext={jest.fn()}
        onGoogleSignIn={jest.fn()}
        onVerified={onVerified}
        emailPreVerified
      />
    );

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledTimes(1);
    });
  });
});
