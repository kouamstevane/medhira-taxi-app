// src/store/driverStore.ts
import { create } from 'zustand';

export interface DriverCarData {
  model: string;
  plate: string;
  color: string;
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
  car: DriverCarData;
  documents: {
    licensePhoto: string;
    carRegistration: string;
  };
  rating?: number;
  tripsCompleted?: number;
  earnings?: number;
}

interface DriverState {
  driver: DriverCoreData | null;
  isLoaded: boolean;
  setDriver: (driver: DriverCoreData) => void;
  updateDriver: (partial: Partial<DriverCoreData>) => void;
  clearDriver: () => void;
}

export const useDriverStore = create<DriverState>()((set) => ({
  driver: null,
  isLoaded: false,

  setDriver: (driver) => set({ driver, isLoaded: true }),

  updateDriver: (partial) =>
    set((state) => ({
      driver: state.driver ? { ...state.driver, ...partial } : null,
    })),

  clearDriver: () => set({ driver: null, isLoaded: false }),
}));
