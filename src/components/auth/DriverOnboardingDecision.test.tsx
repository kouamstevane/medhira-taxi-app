import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DriverOnboardingDecision } from './DriverOnboardingDecision';

describe('DriverOnboardingDecision', () => {
  it('renders exactly the three requested actions initially', () => {
    render(
      <DriverOnboardingDecision
        onResume={jest.fn()}
        onLater={jest.fn()}
        onAbandon={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reprendre l’inscription' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abandonner cette inscription' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('calls resume and later handlers from their actions', async () => {
    const onResume = jest.fn();
    const onLater = jest.fn().mockResolvedValue(undefined);

    render(
      <DriverOnboardingDecision
        onResume={onResume}
        onLater={onLater}
        onAbandon={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’inscription' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));

    expect(onResume).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onLater).toHaveBeenCalledTimes(1));
  });

  it('requires confirmation before abandoning', async () => {
    const onAbandon = jest.fn().mockResolvedValue(undefined);

    render(
      <DriverOnboardingDecision
        onResume={jest.fn()}
        onLater={jest.fn()}
        onAbandon={onAbandon}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner cette inscription' }));

    expect(onAbandon).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));
    await waitFor(() => expect(onAbandon).toHaveBeenCalledTimes(1));
  });

  it('keeps the decision view visible when an action fails', async () => {
    const onAbandon = jest.fn().mockRejectedValue(new Error('Suppression impossible'));

    render(
      <DriverOnboardingDecision
        onResume={jest.fn()}
        onLater={jest.fn()}
        onAbandon={onAbandon}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner cette inscription' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Suppression impossible');
    expect(screen.getByRole('button', { name: 'Reprendre l’inscription' })).toBeInTheDocument();
  });
});
