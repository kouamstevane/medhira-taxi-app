import { render, screen, fireEvent } from '@testing-library/react'
import ModeSwitch from '../ModeSwitch'

jest.mock('@/config/firebase', () => ({ db: {} }))
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  updateDoc: jest.fn().mockResolvedValue(undefined),
  serverTimestamp: jest.fn(),
}))
jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

describe('ModeSwitch', () => {
  it('affiche les deux modes', () => {
    render(<ModeSwitch uid="uid1" currentMode="taxi" onModeChange={jest.fn()} />)
    expect(screen.getByText('Taxi')).toBeInTheDocument()
    expect(screen.getByText('Livraison')).toBeInTheDocument()
  })

  it('le bouton taxi est actif quand currentMode=taxi', () => {
    render(<ModeSwitch uid="uid1" currentMode="taxi" onModeChange={jest.fn()} />)
    const taxiBtn = screen.getByText('Taxi').closest('button')
    expect(taxiBtn).toHaveClass('bg-primary')
  })

  it('disabled affiche le message', () => {
    render(<ModeSwitch uid="uid1" currentMode="taxi" onModeChange={jest.fn()} disabled />)
    expect(screen.getByText(/indisponible/i)).toBeInTheDocument()
  })

  it('ne change pas de mode si disabled', () => {
    const onModeChange = jest.fn()
    render(<ModeSwitch uid="uid1" currentMode="taxi" onModeChange={onModeChange} disabled />)
    fireEvent.click(screen.getByText('Livraison'))
    expect(onModeChange).not.toHaveBeenCalled()
  })
})
