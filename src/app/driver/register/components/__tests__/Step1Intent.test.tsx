import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('keeps primary and alternate actions visually distinct', () => {
    render(<Step1Intent onNext={jest.fn()} onGoogleSignIn={jest.fn()} />);

    expect(screen.getByTestId('step1-submit-btn')).toHaveClass('from-[#f29200]');
    expect(screen.getByTestId('google-signin-btn')).toHaveClass('border-white/10');
  });

  it('renders the Google button as a compact action row instead of a content card', () => {
    render(<Step1Intent onNext={jest.fn()} onGoogleSignIn={jest.fn()} />);

    const googleButton = screen.getByTestId('google-signin-btn');

    expect(googleButton).toHaveClass('h-14');
    expect(googleButton).toHaveClass('relative');
    expect(googleButton).not.toHaveClass('space-y-4');
    expect(screen.getByTestId('google-signin-icon')).toBeInTheDocument();
  });

  it('keeps OTP inside the shared wizard presentation', async () => {
    render(<Step1Intent onNext={jest.fn()} onGoogleSignIn={jest.fn()} sendVerificationCode={jest.fn().mockResolvedValue({ success: true })} verifyCode={jest.fn()} />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'driver@example.com' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByTestId('step1-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification-screen')).toHaveClass('rounded-xl');
    });
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
