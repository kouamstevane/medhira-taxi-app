import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaterialSwitch } from '../MaterialSwitch';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

jest.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: jest.fn().mockResolvedValue(undefined),
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY',
  },
}));

describe('MaterialSwitch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with role="switch" and correct aria-checked value', () => {
    const handleChange = jest.fn();
    const { rerender } = render(
      <MaterialSwitch
        checked={false}
        onChange={handleChange}
        ariaLabel="Activer le mode"
      />
    );

    const switchBtn = screen.getByRole('switch', { name: 'Activer le mode' });
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');

    rerender(
      <MaterialSwitch
        checked={true}
        onChange={handleChange}
        ariaLabel="Activer le mode"
      />
    );
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with toggled boolean value and triggers haptic feedback on click', async () => {
    const handleChange = jest.fn();
    render(
      <MaterialSwitch
        checked={false}
        onChange={handleChange}
        ariaLabel="Disponible à la vente"
      />
    );

    const switchBtn = screen.getByRole('switch', { name: 'Disponible à la vente' });
    fireEvent.click(switchBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
    });
  });

  it('toggles using Space and Enter keyboard keys', async () => {
    const handleChange = jest.fn();
    render(
      <MaterialSwitch
        checked={true}
        onChange={handleChange}
        ariaLabel="Disponible à la vente"
      />
    );

    const switchBtn = screen.getByRole('switch', { name: 'Disponible à la vente' });

    fireEvent.keyDown(switchBtn, { key: ' ' });
    expect(handleChange).toHaveBeenCalledWith(false);

    fireEvent.keyDown(switchBtn, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledTimes(2);
  });

  it('does not toggle or trigger haptics when disabled', () => {
    const handleChange = jest.fn();
    render(
      <MaterialSwitch
        checked={false}
        onChange={handleChange}
        disabled={true}
        ariaLabel="Option verrouillée"
      />
    );

    const switchBtn = screen.getByRole('switch', { name: 'Option verrouillée' });
    expect(switchBtn).toBeDisabled();

    fireEvent.click(switchBtn);
    expect(handleChange).not.toHaveBeenCalled();
    expect(Haptics.impact).not.toHaveBeenCalled();

    fireEvent.keyDown(switchBtn, { key: ' ' });
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('renders checkmark icon when checked and showThumbIcon is true', () => {
    const { container, rerender } = render(
      <MaterialSwitch
        checked={true}
        onChange={jest.fn()}
        showThumbIcon={true}
        ariaLabel="Avec icône"
      />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();

    rerender(
      <MaterialSwitch
        checked={false}
        onChange={jest.fn()}
        showThumbIcon={true}
        ariaLabel="Avec icône"
      />
    );
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
