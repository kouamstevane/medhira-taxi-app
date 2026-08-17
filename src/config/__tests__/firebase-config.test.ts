import { firestoreSettings } from '@/config/firestore-settings';

describe('Firestore browser transport settings', () => {
  it('forces long polling for unstable streaming transports', () => {
    expect(firestoreSettings.experimentalForceLongPolling).toBe(true);
    expect(firestoreSettings.experimentalAutoDetectLongPolling).toBe(false);
  });
});
