import {
  calculateTripWaitTimeFee,
  cancelTripByClient,
  WAIT_TIME_RULES,
} from './wait-time.service';
import type { PersonalDriverTrip } from '@/types/personal-driver';

describe('wait-time.service', () => {
  describe('calculateTripWaitTimeFee', () => {
    it('applies 3 min included wait time for Basic plan regular trip', () => {
      const withinQuota = calculateTripWaitTimeFee('basic', 2, false);
      expect(withinQuota.overageMinutes).toBe(0);
      expect(withinQuota.feeAmount).toBe(0);

      const overQuota = calculateTripWaitTimeFee('basic', 10, false);
      expect(overQuota.includedMinutes).toBe(3);
      expect(overQuota.overageMinutes).toBe(7);
      expect(overQuota.feeAmount).toBe(5.6); // 7 min * 0.80$
    });

    it('applies 5 min included wait time for Classic plan regular trip', () => {
      const overQuota = calculateTripWaitTimeFee('classic', 12, false);
      expect(overQuota.includedMinutes).toBe(5);
      expect(overQuota.overageMinutes).toBe(7);
      expect(overQuota.feeAmount).toBe(3.5); // 7 min * 0.50$
    });

    it('applies 10 min included wait time for Premium plan regular trip', () => {
      const overQuota = calculateTripWaitTimeFee('premium', 20, false);
      expect(overQuota.includedMinutes).toBe(10);
      expect(overQuota.overageMinutes).toBe(10);
      expect(overQuota.feeAmount).toBe(4.0); // 10 min * 0.40$
    });

    it('handles special trips wait time allowances according to plan', () => {
      const classicSpecial = calculateTripWaitTimeFee('classic', 20, true);
      expect(classicSpecial.includedMinutes).toBe(15);
      expect(classicSpecial.overageMinutes).toBe(5);
      expect(classicSpecial.feeAmount).toBe(2.0); // 5 min * 0.40$

      const premiumSpecial = calculateTripWaitTimeFee('premium', 45, true);
      expect(premiumSpecial.includedMinutes).toBe(30);
      expect(premiumSpecial.overageMinutes).toBe(15);
      expect(premiumSpecial.feeAmount).toBe(4.5); // 15 min * 0.30$
    });
  });

  describe('cancelTripByClient', () => {
    it('marks trip as cancelled by client with lost km flag', () => {
      const mockTrip: PersonalDriverTrip = {
        id: 'trip-1',
        subscriptionId: 'sub-1',
        userId: 'user-1',
        planId: 'classic',
        direction: 'outbound',
        status: 'scheduled',
        scheduledAtIso: '2026-08-03T07:30:00',
        pickupAddress: 'A',
        destinationAddress: 'B',
        assignedDriverId: 'driver-1',
        assignedVehicleId: 'veh-1',
      };

      const cancelled = cancelTripByClient(mockTrip);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledBy).toBe('client');
      expect(cancelled.clientCancelledLostKm).toBe(true);
    });
  });
});
