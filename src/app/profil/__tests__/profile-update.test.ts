import { buildProfileUpdate, persistProfileUpdate } from '../profile-update';

describe('buildProfileUpdate', () => {
  it('maps the profile form phone field to the Firestore phoneNumber field', () => {
    const update = buildProfileUpdate(
      {
        firstName: 'Bilion',
        lastName: 'Food',
        phone: '5141234567',
        address: '2PG7+7G Douala, Cameroun',
        city: 'Douala',
        country: 'Cameroun',
        bio: '',
      },
      'bilion@example.com',
      ''
    );

    expect(update).toMatchObject({ phoneNumber: '5141234567' });
    expect(update).not.toHaveProperty('phone');
  });

  it('refreshes the authenticated profile after saving the update', async () => {
    const saveProfile = jest.fn().mockResolvedValue(undefined);
    const reloadUser = jest.fn().mockResolvedValue(undefined);

    await persistProfileUpdate(saveProfile, reloadUser);

    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(reloadUser).toHaveBeenCalledTimes(1);
    expect(reloadUser.mock.invocationCallOrder[0]).toBeGreaterThan(saveProfile.mock.invocationCallOrder[0]);
  });
});
