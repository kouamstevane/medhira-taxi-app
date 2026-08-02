# Driver/Livraison Invitation Registration

## Objective

Allow an approved chauffeur or livreur to continue registration from the email invitation inside the Medjira application. The user must manually enter the personal code received by email. The code must be associated with the invited email, valid for 48 hours, and usable only once.

## User Flow

1. The approval email links to `/auth/driver-invitation?invitationId=...` and never includes the code in the URL.
2. On mobile, the HTTPS app link opens the native application when available, with the web page as fallback.
3. The invitation screen asks for the authorized email and the code received by email.
4. The server validates the invitation status, email, hashed code, and expiration.
5. After validation, the user chooses Google or email/password.
6. Google authentication must return the same email as the invitation.
7. A second server transaction revalidates the invitation and authenticated email, creates or updates `users/{uid}` as `driver_onboarding`, and marks the invitation as used.
8. The user is redirected to `/driver/register`, where the existing onboarding wizard resumes.

## Access and Error Handling

- Normal flow: show the code field and ask the user to enter the code.
- Missing invitation context: show: `Pour créer un compte chauffeur/livreur, vous devez d’abord déposer votre candidature en cliquant sur « Vous souhaitez devenir chauffeur / livreur ». Après validation, Medjira vous enverra un lien et un code personnel par e-mail.`
- Empty code on submission: show: `Saisissez le code reçu par e-mail.`
- Invalid code or email mismatch: show: `Le code saisi est incorrect ou ne correspond pas à cette adresse e-mail.`
- Expired or already-used invitation: show a precise expiration/unavailability message.
- Google email mismatch: sign out the temporary Google session and show: `Ce compte Google ne correspond pas à l’adresse e-mail autorisée pour cette invitation.`
- Existing non-onboarding account: do not overwrite it; show that the account already exists and direct the user to the appropriate login/support path.

## Security

- The client never reads or writes invitation records directly.
- Code comparison and expiration checks happen in Cloud Functions.
- The stored invitation contains a salted hash, not the plaintext code.
- Completion revalidates all invitation data in a Firestore transaction to prevent reuse or race conditions.
- The invitation link contains only the invitation ID, not the code.

## Testing

- Invitation link contains only the invitation ID.
- Valid code and matching email pass.
- Wrong code, wrong email, expired invitation, used invitation, and missing invitation are rejected with the expected message.
- Google account with a different email is rejected and signed out.
- Successful Google and password flows create `driver_onboarding` state and route to the existing driver wizard.
- Android deep link opens the app and web fallback remains usable.
