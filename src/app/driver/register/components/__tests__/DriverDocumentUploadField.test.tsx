import { fireEvent, render, screen } from '@testing-library/react';
import { DriverDocumentUploadField } from '../DriverDocumentUploadField';

describe('DriverDocumentUploadField', () => {
  it('renders a shared upload empty state with consistent guidance', () => {
    render(
      <DriverDocumentUploadField
        label="Preuve d'admissibilite"
        inputId="work-eligibility"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/Cliquez pour ajouter/i)).toBeInTheDocument();
    expect(screen.getByText(/Image ou PDF \(Max 10Mo\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('work-eligibility-empty-state')).toHaveClass('h-24');
    expect(screen.getByTestId('work-eligibility-empty-state')).toHaveClass('md:h-36');
    expect(screen.getByTestId('work-eligibility-empty-state')).not.toHaveClass('aspect-video');
  });

  it('renders the loaded state through shared framing and allows removal', () => {
    const onRemove = jest.fn();

    render(
      <DriverDocumentUploadField
        label="Assurance Pro"
        inputId="insurance"
        onChange={jest.fn()}
        file={new File(['demo'], 'assurance.pdf', { type: 'application/pdf' })}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText('assurance.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
