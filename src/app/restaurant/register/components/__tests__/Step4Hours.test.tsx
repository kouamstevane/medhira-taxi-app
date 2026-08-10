import { fireEvent, render, screen } from '@testing-library/react';
import { Step4Hours } from '../Step4Hours';

describe('Step4Hours', () => {
  it('uses shared field and navigation styling', () => {
    render(<Step4Hours onSubmit={jest.fn()} onBack={jest.fn()} loading={false} />);

    expect(screen.getByLabelText('Lundi ouverture')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Lundi fermeture')).toHaveClass('rounded-xl');
    expect(screen.getByRole('button', { name: /Retour/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /Soumettre votre dossier/i })).toHaveClass('from-[#f29200]');
  });

  it('rejects a schedule with every day closed', () => {
    render(<Step4Hours onSubmit={jest.fn()} onBack={jest.fn()} loading={false} />);

    screen.getAllByRole('checkbox').forEach((checkbox) => {
      if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
    });
    fireEvent.click(screen.getByRole('button', { name: /Soumettre votre dossier/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Au moins un jour doit être ouvert.');
  });
});
