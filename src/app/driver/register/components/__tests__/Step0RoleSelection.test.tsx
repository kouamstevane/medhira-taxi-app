import { render, screen, fireEvent } from '@testing-library/react'
import Step0RoleSelection from '../Step0RoleSelection'

// Mock MaterialIcon pour éviter les problèmes avec les fonts Material Symbols
jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className}>{name}</span>
  ),
}))

const onNext = jest.fn()

beforeEach(() => { onNext.mockClear() })

describe('Step0RoleSelection', () => {
  it('affiche les 3 cartes de rôle', () => {
    render(<Step0RoleSelection onNext={onNext} />)
    expect(screen.getByText(/Chauffeur taxi/i)).toBeInTheDocument()
    expect(screen.getByText(/Livreur de repas/i)).toBeInTheDocument()
    expect(screen.getByText(/Les deux/i)).toBeInTheDocument()
  })

  it('le bouton Continuer est désactivé si aucun rôle sélectionné', () => {
    render(<Step0RoleSelection onNext={onNext} />)
    const btn = screen.getByRole('button', { name: /continuer/i })
    expect(btn).toBeDisabled()
  })

  it('appelle onNext avec livreur après sélection', () => {
    render(<Step0RoleSelection onNext={onNext} />)
    fireEvent.click(screen.getByText(/Livreur de repas/i))
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }))
    expect(onNext).toHaveBeenCalledWith('livreur')
  })

  it('appelle onNext avec les_deux', () => {
    render(<Step0RoleSelection onNext={onNext} />)
    fireEvent.click(screen.getByText(/Les deux/i))
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }))
    expect(onNext).toHaveBeenCalledWith('les_deux')
  })
})
