import { render, screen } from '@testing-library/react';
import { TextAreaField } from '../TextAreaField';

describe('TextAreaField', () => {
  it('uses the shared dark field chrome and associates its label', () => {
    render(
      <TextAreaField
        id="description"
        label="Description"
        helperText="Helper copy"
        data-testid="description-field"
      />
    );

    expect(screen.getByLabelText('Description')).toBe(screen.getByTestId('description-field'));
    expect(screen.getByTestId('description-field')).toHaveClass('glass-input');
    expect(screen.getByTestId('description-field')).toHaveClass('autofill-dark');
    expect(screen.getByTestId('description-field')).toHaveClass('focus:ring-2');
    expect(screen.getByTestId('description-field')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByTestId('description-field')).toHaveClass('focus:border-[#f29200]');
    expect(screen.getByTestId('description-field')).toHaveClass('rounded-xl');
    expect(screen.getByText('Helper copy')).toHaveClass('text-slate-400');
  });
});
