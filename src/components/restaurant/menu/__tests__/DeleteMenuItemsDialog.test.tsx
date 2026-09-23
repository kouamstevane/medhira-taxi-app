import { fireEvent, render, screen } from '@testing-library/react';
import { DeleteMenuItemsDialog } from '../DeleteMenuItemsDialog';

describe('DeleteMenuItemsDialog', () => {
  it('requires explicit confirmation for deleting multiple dishes', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();

    render(<DeleteMenuItemsDialog count={3} onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: 'Supprimer des plats ?' })).toBeInTheDocument();
    expect(screen.getByText(/3 plat/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms the bulk deletion only after the confirmation action', () => {
    const onConfirm = jest.fn();

    render(<DeleteMenuItemsDialog count={2} onCancel={jest.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while processing', () => {
    render(<DeleteMenuItemsDialog count={2} onCancel={jest.fn()} onConfirm={jest.fn()} isProcessing />);

    expect(screen.getByRole('button', { name: 'Suppression en cours…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  });
});
