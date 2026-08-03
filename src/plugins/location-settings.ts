import { registerPlugin } from '@capacitor/core';

export interface LocationSettingsPlugin {
  open(): Promise<void>;
}

export const LocationSettings = registerPlugin<LocationSettingsPlugin>('LocationSettings');
