import { render, screen } from '@testing-library/react';
import Step3Vehicle from '../Step3Vehicle';

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showInfo: jest.fn(),
    showError: jest.fn(),
  }),
}));

describe('Step3Vehicle', () => {
  it('uses the shared upload empty-state styling', () => {
    render(<Step3Vehicle onNext={jest.fn()} onBack={jest.fn()} />);

    const uploadTile = screen.getByText(/Cliquez pour ajouter/i).closest('div');

    expect(uploadTile).toHaveClass('border-dashed');
    expect(uploadTile).toHaveClass('rounded-xl');
  });
});
