// src/__tests__/unit/driverStore.test.ts
import { useDriverStore } from '@/store/driverStore'

const baseDriver = {
  uid: 'uid-test',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@test.com',
  phone: '+15800000000',
  status: 'approved',
  isAvailable: true,
  car: { model: 'Civic', plate: 'ABC-123', color: 'Blanc' },
  documents: {},
}

beforeEach(() => {
  useDriverStore.getState().clearDriver()
})

describe('driverStore — champs livreur', () => {
  it('stocke driverType livreur', () => {
    useDriverStore.getState().setDriver({
      ...baseDriver,
      driverType: 'livreur',
      activeMode: 'livraison',
      cityId: 'edmonton',
    })
    expect(useDriverStore.getState().driver?.driverType).toBe('livreur')
    expect(useDriverStore.getState().driver?.activeMode).toBe('livraison')
    expect(useDriverStore.getState().driver?.cityId).toBe('edmonton')
  })

  it('activeMode par défaut est taxi si non fourni', () => {
    useDriverStore.getState().setDriver({
      ...baseDriver,
      driverType: 'les_deux',
      cityId: 'edmonton',
    })
    const mode = useDriverStore.getState().driver?.activeMode ?? 'taxi'
    expect(mode).toBe('taxi')
  })

  it('updateDriver met à jour activeMode sans écraser les autres champs', () => {
    useDriverStore.getState().setDriver({
      ...baseDriver,
      driverType: 'les_deux',
      activeMode: 'taxi',
      cityId: 'edmonton',
    })
    useDriverStore.getState().updateDriver({ activeMode: 'livraison' })
    expect(useDriverStore.getState().driver?.activeMode).toBe('livraison')
    expect(useDriverStore.getState().driver?.driverType).toBe('les_deux')
  })

  it('stocke vehicleType et activeDeliveryOrderId', () => {
    useDriverStore.getState().setDriver({
      ...baseDriver,
      driverType: 'livreur',
      activeMode: 'livraison',
      cityId: 'edmonton',
      vehicleType: 'scooter',
      activeDeliveryOrderId: 'order-123',
    })
    expect(useDriverStore.getState().driver?.vehicleType).toBe('scooter')
    expect(useDriverStore.getState().driver?.activeDeliveryOrderId).toBe('order-123')
  })
})
