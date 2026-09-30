import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Alert } from '../Alert';

describe('Alert component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders correctly with message and error type', () => {
    render(<Alert type="error" message="Une erreur est survenue" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
  });

  it('renders close button and closes on click', () => {
    const handleClose = jest.fn();
    render(<Alert type="warning" message="Attention requise" onClose={handleClose} />);

    const closeBtn = screen.getByLabelText('Fermer');
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);

    // Fast-forward fade-out animation
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('auto-dismisses after duration even without onClose prop', () => {
    render(<Alert type="info" message="Information importante" autoDismiss={true} duration={4000} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Advance to duration + fade-out
    act(() => {
      jest.advanceTimersByTime(4350);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss when autoDismiss is false', () => {
    render(<Alert type="success" message="Succès" autoDismiss={false} duration={3000} />);

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
