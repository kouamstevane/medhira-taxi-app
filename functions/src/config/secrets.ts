import { defineSecret } from 'firebase-functions/params';

export const encryptionMasterKey = defineSecret('ENCRYPTION_MASTER_KEY');
