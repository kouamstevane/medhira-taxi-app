// functions/src/__tests__/bookingNotifications.test.ts

jest.mock('../utils/smsService.js', () => ({
  sendSms: jest.fn().mockResolvedValue({ success: true, sid: 'mock_sid_123' }),
  twilioAccountSid: { value: jest.fn(() => 'mock_sid') },
  twilioAuthToken: { value: jest.fn(() => 'mock_token') },
  twilioFromNumber: { value: jest.fn(() => '+14155551234') },
}));

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_opts: any, handler: any) => handler,
}));

import { sendSms } from '../utils/smsService.js';
import { onTaxiBookingAccepted, onTaxiBookingDriverArrived } from '../bookingNotifications/index.js';

const mockedSendSms = sendSms as jest.MockedFunction<typeof sendSms>;

describe('bookingNotifications triggers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onTaxiBookingAccepted', () => {
    it('does nothing if status is not accepted', async () => {
      const event = {
        params: { bookingId: 'b1' },
        data: {
          before: { data: () => ({ status: 'pending', bookedForSomeoneElse: true, passengerPhone: '+15141234567' }) },
          after: { data: () => ({ status: 'pending', bookedForSomeoneElse: true, passengerPhone: '+15141234567' }) },
        },
      } as any;

      await onTaxiBookingAccepted(event);
      expect(mockedSendSms).not.toHaveBeenCalled();
    });

    it('does nothing if status did not change to accepted', async () => {
      const event = {
        params: { bookingId: 'b1' },
        data: {
          before: { data: () => ({ status: 'accepted', bookedForSomeoneElse: true, passengerPhone: '+15141234567' }) },
          after: { data: () => ({ status: 'accepted', bookedForSomeoneElse: true, passengerPhone: '+15141234567' }) },
        },
      } as any;

      await onTaxiBookingAccepted(event);
      expect(mockedSendSms).not.toHaveBeenCalled();
    });

    it('does nothing if bookedForSomeoneElse is false or undefined', async () => {
      const event = {
        params: { bookingId: 'b1' },
        data: {
          before: { data: () => ({ status: 'pending', bookedForSomeoneElse: false, passengerPhone: '+15141234567' }) },
          after: { data: () => ({ status: 'accepted', bookedForSomeoneElse: false, passengerPhone: '+15141234567' }) },
        },
      } as any;

      await onTaxiBookingAccepted(event);
      expect(mockedSendSms).not.toHaveBeenCalled();
    });

    it('sends SMS to passenger when bookedForSomeoneElse is true and status transitions to accepted', async () => {
      const event = {
        params: { bookingId: 'b1' },
        data: {
          before: { data: () => ({ status: 'pending', bookedForSomeoneElse: true }) },
          after: {
            data: () => ({
              status: 'accepted',
              bookedForSomeoneElse: true,
              passengerPhone: '+15141234567',
              passengerName: 'Jean Dupont',
              driverName: 'Marc',
              driverPhone: '+15149876543',
              carColor: 'Noir',
              carModel: 'Tesla Model 3',
              carPlate: 'ABC 123',
              pickup: '123 Rue de la Montagne',
            }),
          },
        },
      } as any;

      await onTaxiBookingAccepted(event);

      expect(mockedSendSms).toHaveBeenCalledTimes(1);
      expect(mockedSendSms).toHaveBeenCalledWith({
        to: '+15141234567',
        body: 'Bonjour Jean Dupont, votre taxi Medjira est en route.\n' +
          'Chauffeur : Marc\nTél : +15149876543\n' +
          'Véhicule : Noir Tesla Model 3 (ABC 123)\n' +
          'Départ : 123 Rue de la Montagne',
      });
    });

    it('uses fallbacks when optional passenger/driver fields are missing', async () => {
      const event = {
        params: { bookingId: 'b1' },
        data: {
          before: { data: () => ({ status: 'pending', bookedForSomeoneElse: true }) },
          after: {
            data: () => ({
              status: 'accepted',
              bookedForSomeoneElse: true,
              passengerPhone: '+15141234567',
            }),
          },
        },
      } as any;

      await onTaxiBookingAccepted(event);

      expect(mockedSendSms).toHaveBeenCalledTimes(1);
      expect(mockedSendSms).toHaveBeenCalledWith({
        to: '+15141234567',
        body: 'votre taxi Medjira est en route.\n' +
          'Chauffeur : Votre chauffeur\n',
      });
    });
  });

  describe('onTaxiBookingDriverArrived', () => {
    it('sends SMS to passenger when bookedForSomeoneElse is true and status transitions to driver_arrived', async () => {
      const event = {
        params: { bookingId: 'b1' },
        data: {
          before: { data: () => ({ status: 'accepted', bookedForSomeoneElse: true }) },
          after: {
            data: () => ({
              status: 'driver_arrived',
              bookedForSomeoneElse: true,
              passengerPhone: '+15141234567',
              passengerName: 'Jean Dupont',
              carColor: 'Noir',
              carModel: 'Tesla Model 3',
              carPlate: 'ABC 123',
            }),
          },
        },
      } as any;

      await onTaxiBookingDriverArrived(event);

      expect(mockedSendSms).toHaveBeenCalledTimes(1);
      expect(mockedSendSms).toHaveBeenCalledWith({
        to: '+15141234567',
        body: 'Jean Dupont, votre taxi Medjira est arrivé au point de rendez-vous.\n' +
          'Repérez : Noir Tesla Model 3 (ABC 123)',
      });
    });
  });
});
