/**
 * TwiML Webhook pour Twilio Voice
 *
 * Lorsqu'un client appelle `Device.connect({ params: { To: channel } })`,
 * Twilio invoque ce webhook (configuré comme URL Voice de la TwiML App).
 * Le paramètre `To` contient le nom du channel Firestore
 * (`call_<rideId>_<timestamp>`) qui sert également de nom de conférence.
 *
 * Le webhook retourne du TwiML qui place l'appelant dans une conférence
 * Twilio dont le nom = le channel. Le callee, en se connectant à son tour
 * avec le même `To`, rejoint la même conférence — réalisant ainsi un
 * appel app-to-app sans numéro de téléphone.
 */

import { onRequest } from 'firebase-functions/v2/https';

/**
 * Échappe les caractères XML spéciaux pour éviter toute injection dans
 * le TwiML retourné à Twilio.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const twimlWebhook = onRequest(
  { cors: true, region: 'europe-west1' },
  async (req, res) => {
    // Le SDK Twilio Voice envoie `To` en POST (form-encoded) lors de
    // `Device.connect({ params: { To: channel } })`. On accepte aussi
    // les paramètres en querystring pour faciliter le debug.
    const rawTo =
      (req.body && typeof req.body.To === 'string' ? req.body.To : undefined) ??
      (typeof req.query.To === 'string' ? req.query.To : undefined);

    const conferenceName = (rawTo ?? '').trim();

    res.type('text/xml');

    // Validation : si pas de channel, on raccroche proprement.
    if (!conferenceName) {
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
      return;
    }

    const safeName = escapeXml(conferenceName);

    // Conférence à 2 participants max, qui démarre dès qu'un participant
    // entre et se termine dès que l'un des deux raccroche.
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Dial>` +
      `<Conference maxParticipants="2" startConferenceOnEnter="true" endConferenceOnExit="true">` +
      `${safeName}` +
      `</Conference>` +
      `</Dial>` +
      `</Response>`;

    res.status(200).send(twiml);
  },
);
