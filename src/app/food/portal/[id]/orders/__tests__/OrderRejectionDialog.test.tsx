import { fireEvent, render, screen } from '@testing-library/react';
import { OrderRejectionDialog } from '../OrderRejectionDialog';

const order = {
  id: 'order-12345',
  customerName: 'Bilion steve',
  totalOrderPrice: 34,
};

describe('OrderRejectionDialog', () => {
  test('requires an explicit confirmation before rejecting an order', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();

    render(
      <OrderRejectionDialog
        order={order}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Confirmer le refus' })).toBeInTheDocument();
    expect(screen.getByText(/Voulez-vous vraiment refuser la commande #12345/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('confirms the rejection only after the confirmation action', () => {
    const onConfirm = jest.fn();

    render(
      <OrderRejectionDialog
        order={order}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le refus' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('disables confirmation while the rejection is processing', () => {
    render(
      <OrderRejectionDialog
        order={order}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        isProcessing
      />,
    );

    expect(screen.getByRole('button', { name: 'Refus en cours…' })).toBeDisabled();
  });
});
