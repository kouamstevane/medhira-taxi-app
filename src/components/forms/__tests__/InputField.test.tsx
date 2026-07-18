import { render, screen } from '@testing-library/react'
import { InputField } from '../InputField'

describe('InputField', () => {
  it('renders the shared driver field styling hooks', () => {
    render(
      <InputField
        label="Email"
        helperText="Helper copy"
        data-testid="driver-field"
      />
    )

    expect(screen.getByText('Email')).toHaveClass('text-[#9CA3AF]')
    expect(screen.getByTestId('driver-field')).toHaveClass('glass-input')
    expect(screen.getByTestId('driver-field')).toHaveClass('focus:ring-2')
    expect(screen.getByTestId('driver-field')).toHaveClass('focus:ring-[#f29200]')
    expect(screen.getByTestId('driver-field')).toHaveClass('focus:border-[#f29200]')
    expect(screen.getByTestId('driver-field')).toHaveClass('rounded-xl')
    expect(screen.getByTestId('driver-field')).toHaveClass('border-white/[0.08]')
    expect(screen.getByTestId('driver-field')).not.toHaveClass('focus:border-primary')
    expect(screen.getByText('Helper copy')).toHaveClass('text-slate-400')
  })
})
