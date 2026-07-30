jest.mock('@/config/firebase', () => ({
  auth: { name: 'mock-auth' },
  db: { name: 'mock-db' },
}));

jest.mock('firebase/auth', () => ({
  PhoneAuthProvider: {
    credential: jest.fn(),
  },
  signInWithCredential: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
}));

import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  confirmPhoneSignIn,
  upsertPhoneClientUserDocument,
} from '@/services/auth.service';
import { auth, db } from '@/config/firebase';

describe('phone passwordless auth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue({ path: 'users/phone-user-1' });
  });

  it('confirms a phone OTP with Firebase Auth and returns the signed-in user', async () => {
    const user = { uid: 'phone-user-1', phoneNumber: '+237655744484' };
    (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('phone-credential');
    (signInWithCredential as jest.Mock).mockResolvedValue({ user });

    const result = await confirmPhoneSignIn('verification-id', '123456');

    expect(PhoneAuthProvider.credential).toHaveBeenCalledWith('verification-id', '123456');
    expect(signInWithCredential).toHaveBeenCalledWith(auth, 'phone-credential');
    expect(result).toBe(user);
  });

  it('creates a client profile for a new phone-auth user without password data', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await upsertPhoneClientUserDocument(
      { uid: 'phone-user-1', phoneNumber: '+237655744484' },
      { firstName: 'Jean', lastName: 'Dupont', country: 'CM' },
    );

    expect(doc).toHaveBeenCalledWith(db, 'users', 'phone-user-1');
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/phone-user-1' },
      expect.objectContaining({
        uid: 'phone-user-1',
        email: null,
        phoneNumber: '+237655744484',
        firstName: 'Jean',
        lastName: 'Dupont',
        emailVerified: false,
        profileImageUrl: '',
        country: 'CM',
        activeRole: 'client',
        roles: {
          client: {
            enabled: true,
            joinedAt: 'server-timestamp',
          },
        },
        createdAt: 'server-timestamp',
        updatedAt: 'server-timestamp',
      }),
    );
    expect(setDoc).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        password: expect.anything(),
      }),
    );
  });

  it('updates profile details for an existing phone-auth user without overwriting roles', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => true });

    await upsertPhoneClientUserDocument(
      { uid: 'phone-user-1', phoneNumber: '+237655744484' },
      { firstName: 'Jeanne', lastName: 'Martin', country: 'FR' },
    );

    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'users/phone-user-1' },
      {
        phoneNumber: '+237655744484',
        firstName: 'Jeanne',
        lastName: 'Martin',
        country: 'FR',
        updatedAt: 'server-timestamp',
      },
    );
    expect(setDoc).not.toHaveBeenCalled();
  });
});
