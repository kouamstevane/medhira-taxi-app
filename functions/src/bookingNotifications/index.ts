/**
 * Notifications SMS pour les réservations taxi.
 *
 * Triggers Firestore qui envoient un SMS au passager (réel) lorsque la
 * réservation a été faite « pour quelqu'un d'autre » (`bookedForSomeoneElse`).
 *
 *   - status: pending → accepted        : infos chauffeur + véhicule
 *   - status: accepted → driver_arrived : chauffeur arrivé au point de RDV
 *
 * Si la réservation n'est pas pour un tiers, aucun SMS n'est envoyé
 * (le commanditaire reçoit déjà push + UI in-app).
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
  sendSms,
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
} from '../utils/smsService.js';

const TWILIO_SECRETS = [twilioAccountSid, twilioAuthToken, twilioFromNumber];

interface BookingDoc {
  status?: string;
  bookedForSomeoneElse?: boolean;
  passengerName?: string;
  passengerPhone?: string;
  passengerNotes?: string;
  driverName?: string;
  driverPhone?: string;
  carModel?: string;
  carColor?: string;
  carPlate?: string;
  pickup?: string;
  destination?: string;
}

/**
 * SMS au passager quand un chauffeur accepte la course.
 */
export const onTaxiBookingAccepted = onDocumentUpdated(
  {
    document: 'bookings/{bookingId}',
    region: 'europe-west1',
    secrets: TWILIO_SECRETS,
  },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data() as BookingDoc | undefined;
    const after = event.data.after.data() as BookingDoc | undefined;
    if (!before || !after) return;

    if (before.status === 'accepted' || after.status !== 'accepted') return;
    if (!after.bookedForSomeoneElse) return;
    if (!after.passengerPhone) {
      console.warn(`[TaxiBookingAccepted] ${event.params.bookingId}: passengerPhone manquant`);
      return;
    }

    const driverName = after.driverName || 'Votre chauffeur';
    const carParts = [after.carColor, after.carModel].filter(Boolean).join(' ');
    const plate = after.carPlate ? ` (${after.carPlate})` : '';
    const phone = after.driverPhone ? `\nTél : ${after.driverPhone}` : '';
    const greeting = after.passengerName ? `Bonjour ${after.passengerName}, ` : '';

    const body = `${greeting}votre taxi Medjira est en route.\n` +
      `Chauffeur : ${driverName}${phone}\n` +
      (carParts ? `Véhicule : ${carParts}${plate}\n` : '') +
      (after.pickup ? `Départ : ${after.pickup}` : '');

    const result = await sendSms({ to: after.passengerPhone, body });
    if (!result.success) {
      console.error(
        `[TaxiBookingAccepted] SMS échec ${event.params.bookingId}:`,
        result.error,
      );
    } else {
      console.log(`[TaxiBookingAccepted] SMS envoyé ${event.params.bookingId} sid=${result.sid}`);
    }
  },
);

/**
 * SMS au passager quand le chauffeur signale son arrivée.
 */
export const onTaxiBookingDriverArrived = onDocumentUpdated(
  {
    document: 'bookings/{bookingId}',
    region: 'europe-west1',
    secrets: TWILIO_SECRETS,
  },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data() as BookingDoc | undefined;
    const after = event.data.after.data() as BookingDoc | undefined;
    if (!before || !after) return;

    if (before.status === 'driver_arrived' || after.status !== 'driver_arrived') return;
    if (!after.bookedForSomeoneElse) return;
    if (!after.passengerPhone) return;

    const greeting = after.passengerName ? `${after.passengerName}, ` : '';
    const carParts = [after.carColor, after.carModel].filter(Boolean).join(' ');
    const plate = after.carPlate ? ` (${after.carPlate})` : '';

    const body = `${greeting}votre taxi Medjira est arrivé au point de rendez-vous.\n` +
      (carParts ? `Repérez : ${carParts}${plate}` : '');

    const result = await sendSms({ to: after.passengerPhone, body });
    if (!result.success) {
      console.error(
        `[TaxiBookingDriverArrived] SMS échec ${event.params.bookingId}:`,
        result.error,
      );
    }
  },
);
