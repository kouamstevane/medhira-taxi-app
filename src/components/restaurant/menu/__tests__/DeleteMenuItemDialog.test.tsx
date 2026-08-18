import { fireEvent, render, screen } from '@testing-library/react';
import { DeleteMenuItemDialog } from '../DeleteMenuItemDialog';

const item = { name: 'Limonade Maison Menthe Citron' };

describe('DeleteMenuItemDialog', () => {
  it('requires explicit confirmation before deleting a menu item', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();

    render(<DeleteMenuItemDialog item={item} onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: 'Supprimer un plat ?' })).toBeInTheDocument();
    expect(screen.getByText(/Limonade Maison Menthe Citron/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms deletion only after the confirmation action', () => {
    const onConfirm = jest.fn();

    render(<DeleteMenuItemDialog item={item} onCancel={jest.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables dialog actions while deletion is processing', () => {
    render(<DeleteMenuItemDialog item={item} onCancel={jest.fn()} onConfirm={jest.fn()} isProcessing />);

    expect(screen.getByRole('button', { name: 'Suppression en cours…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  });
});
