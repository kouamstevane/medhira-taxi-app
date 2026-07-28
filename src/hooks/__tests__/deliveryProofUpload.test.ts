import { refreshDeliveryUploadClaims } from '../useDeliveryOrder';

describe('refreshDeliveryUploadClaims', () => {
  test('forces token refresh before uploading a proof photo', async () => {
    const user = { getIdToken: jest.fn().mockResolvedValue('token') };

    await refreshDeliveryUploadClaims(user);

    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  test('does nothing when no user is available', async () => {
    await expect(refreshDeliveryUploadClaims(null)).resolves.toBeUndefined();
  });
});
