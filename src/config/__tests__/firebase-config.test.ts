import { firestoreSettings } from '@/config/firestore-settings';

describe('Firestore browser transport settings', () => {
  it('lets Firestore detect the most reliable browser transport', () => {
    expect('experimentalForceLongPolling' in firestoreSettings).toBe(false);
    expect(firestoreSettings.experimentalAutoDetectLongPolling).toBe(true);
  });
});
