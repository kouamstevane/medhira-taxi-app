// src/__tests__/unit/firestore-types.test.ts
import { Timestamp } from 'firebase/firestore'
import type {
  FoodDeliveryOrder,
  DocumentEntry,
  DriverType,
  VehicleType,
  DeliveryStatus,
  DeliveryPreference,
  DriverRating,
  CityDocument,
} from '@/types/firestore-collections'

describe('FoodDeliveryOrder type', () => {
  it('accepte tous les statuts valides', () => {
    const statuses: DeliveryStatus[] = [
      'assigned', 'refused', 'heading_to_restaurant', 'arrived_restaurant',
      'waiting', 'picked_up', 'heading_to_client', 'arrived_client',
      'delivered', 'cancelled',
    ]
    expect(statuses).toHaveLength(10)
  })

  it('DocumentEntry a les champs attendus', () => {
    const entry: DocumentEntry = {
      url: 'https://example.com/doc.pdf',
      status: 'pending',
    }
    expect(entry.status).toBe('pending')
    expect(entry.url).toBeDefined()
  })

  it('DriverType union est correct', () => {
    const types: DriverType[] = ['chauffeur', 'livreur', 'les_deux']
    expect(types).toHaveLength(3)
  })

  it('VehicleType union couvre les 4 véhicules', () => {
    const vehicles: VehicleType[] = ['velo', 'scooter', 'moto', 'voiture']
    expect(vehicles).toHaveLength(4)
  })

  it('DeliveryPreference union couvre les 3 modes', () => {
    const prefs: DeliveryPreference[] = ['leave_at_door', 'meet_outside', 'meet_at_door']
    expect(prefs).toHaveLength(3)
  })
})
