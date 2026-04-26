// src/store/driverStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DriverCarData {
  model?: string;
  plate?: string;
  color?: string;
}

export interface DriverCoreData {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  isAvailable: boolean;
  profileImageUrl?: string;
  licenseNumber?: string;
  car?: DriverCarData;
  // NOTE RGPD #C2 : `documents` a été déplacé dans la sous-collection
  // `drivers/{uid}/private/personal` — voir useDriverPrivate / DriverPrivateData.
  rating?: number;
  tripsCompleted?: number;
  earnings?: number;
  // === Champs livreur (2026-04-07) ===
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
  activeMode?: 'taxi' | 'livraison';
  cityId?: string;
  vehicleType?: 'velo' | 'scooter' | 'moto' | 'voiture';
  activeDeliveryOrderId?: string | null;
  deliveriesCompleted?: number;
  deliveryEarnings?: number;
  ratingsCount?: number;
  fcmToken?: string;
}

/**
 * RGPD #C2 — Données privées du driver (sous-collection private/personal).
 * Hydratée par un fetch séparé (voir useDriverProfile / pages admin).
 */
export interface DriverPrivateData {
  dob?: string;
  nationality?: string;
  address?: string;
  documents?: {
    licensePhoto?: string | { url: string | null; status: string; rejectionReason?: string };
    carRegistration?: string | { url: string | null; status: string; rejectionReason?: string };
    [key: string]: string | { url: string | null; status: string; rejectionReason?: string } | undefined;
  };
}

interface DriverState {
  driver: DriverCoreData | null;
  isLoaded: boolean;
  setDriver: (driver: DriverCoreData) => void;
  updateDriver: (partial: Partial<DriverCoreData>) => void;
  clearDriver: () => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      driver: null,
      isLoaded: false,

      setDriver: (driver) => set({ driver, isLoaded: true }),

      updateDriver: (partial) =>
        set((state) => ({
          driver: state.driver ? { ...state.driver, ...partial } : null,
        })),

      clearDriver: () => set({ driver: null, isLoaded: false }),
    }),
    {
      name: 'medjira-driver-store',
      partialize: (state) => ({
        driver: state.driver
          ? {
              isAvailable: state.driver.isAvailable,
              activeDeliveryOrderId: state.driver.activeDeliveryOrderId,
              activeMode: state.driver.activeMode,
            }
          : null,
      }),
    }
  )
);
