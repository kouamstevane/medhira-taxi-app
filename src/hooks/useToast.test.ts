import { toast } from 'react-hot-toast';
import { renderHook, act } from '@testing-library/react';
import { useToast } from './useToast';

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    custom: jest.fn(),
    dismiss: jest.fn(),
  },
}));

describe('useToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends success feedback through the global toast system', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('Profil mis à jour'));

    expect(toast.custom).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ duration: 5000, id: expect.any(String) }));
  });

  it('sends error feedback through the global toast system', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showError('Une erreur est survenue'));

    expect(toast.custom).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ duration: 5000, id: expect.any(String) }));
  });
});
