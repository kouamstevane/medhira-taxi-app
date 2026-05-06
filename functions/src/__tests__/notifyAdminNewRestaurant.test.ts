jest.mock('../email-service', () => ({
  sendAdminRestaurantNotification: jest.fn(),
}));

import { sendAdminRestaurantNotification } from '../email-service';

const mockedSend = sendAdminRestaurantNotification as jest.MockedFunction<typeof sendAdminRestaurantNotification>;

async function runHandlerLogic(data: Record<string, unknown> | undefined, restaurantId: string) {
  if (!data) return;
  if (data.status !== 'pending_approval') return;
  try {
    await sendAdminRestaurantNotification({
      restaurantName: (data.name as string) ?? '(sans nom)',
      restaurantId,
      ownerEmail: (data.ownerEmail as string) ?? '',
    });
  } catch {
    // swallowed
  }
}

describe('notifyAdminNewRestaurant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends email when status === pending_approval', async () => {
    mockedSend.mockResolvedValue(undefined);
    await runHandlerLogic({ status: 'pending_approval', name: 'Pizza Plus', ownerEmail: 'o@t.com' }, 'r1');
    expect(mockedSend).toHaveBeenCalledWith({
      restaurantName: 'Pizza Plus',
      restaurantId: 'r1',
      ownerEmail: 'o@t.com',
    });
  });

  it('skips when status !== pending_approval', async () => {
    await runHandlerLogic({ status: 'approved', name: 'Pizza Plus', ownerEmail: 'o@t.com' }, 'r2');
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('skips when event has no data', async () => {
    await runHandlerLogic(undefined, 'r3');
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('does not throw when Resend fails', async () => {
    mockedSend.mockRejectedValueOnce(new Error('fail'));
    await expect(
      runHandlerLogic({ status: 'pending_approval', name: 'X', ownerEmail: 'y' }, 'r4')
    ).resolves.toBeUndefined();
  });

  it('uses fallback name when missing', async () => {
    mockedSend.mockResolvedValue(undefined);
    await runHandlerLogic({ status: 'pending_approval', ownerEmail: 'o@t.com' }, 'r5');
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantName: '(sans nom)' })
    );
  });

  it('uses fallback ownerEmail when missing', async () => {
    mockedSend.mockResolvedValue(undefined);
    await runHandlerLogic({ status: 'pending_approval', name: 'Test' }, 'r6');
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: '' })
    );
  });
});
