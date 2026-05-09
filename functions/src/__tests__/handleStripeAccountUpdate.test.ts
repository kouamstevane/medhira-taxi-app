const mockFirestore = {
  collection: jest.fn(),
  doc: jest.fn(),
};

const mockFieldValue = { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') };
const firestoreFn = jest.fn(() => mockFirestore) as any;
firestoreFn.FieldValue = mockFieldValue;

jest.mock('firebase-admin', () => ({
  firestore: firestoreFn,
  apps: [],
  initializeApp: jest.fn(),
  FieldValue: mockFieldValue,
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeAccount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acct_123',
    metadata: {},
    charges_enabled: false,
    details_submitted: false,
    requirements: { disabled_reason: null },
    ...overrides,
  };
}

describe('handleStripeAccountUpdate — onAccountUpdated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets status to active when restaurant + charges_enabled + details_submitted', async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    const getFn = jest.fn().mockResolvedValue({ data: () => ({ stripeConnectStatus: 'in_progress' }) });
    mockFirestore.doc.mockReturnValue({ get: getFn, update: updateFn });

    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({
      metadata: { accountType: 'restaurant', restaurantId: 'rest1' },
      charges_enabled: true,
      details_submitted: true,
    }));

    expect(updateFn).toHaveBeenCalledWith({
      stripeConnectStatus: 'active',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('sets status to restricted when disabled_reason present', async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    const getFn = jest.fn().mockResolvedValue({ data: () => ({ stripeConnectStatus: 'in_progress' }) });
    mockFirestore.doc.mockReturnValue({ get: getFn, update: updateFn });

    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({
      metadata: { accountType: 'restaurant', restaurantId: 'rest1' },
      charges_enabled: false,
      details_submitted: false,
      requirements: { disabled_reason: 'rejected.fraud' },
    }));

    expect(updateFn).toHaveBeenCalledWith({
      stripeConnectStatus: 'restricted',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('sets status to in_progress when neither active nor restricted', async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    const getFn = jest.fn().mockResolvedValue({ data: () => ({ stripeConnectStatus: null }) });
    mockFirestore.doc.mockReturnValue({ get: getFn, update: updateFn });

    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({
      metadata: { accountType: 'restaurant', restaurantId: 'rest1' },
      charges_enabled: false,
      details_submitted: false,
      requirements: { disabled_reason: null },
    }));

    expect(updateFn).toHaveBeenCalledWith({
      stripeConnectStatus: 'in_progress',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('is idempotent (same status → no write)', async () => {
    const updateFn = jest.fn().mockResolvedValue(undefined);
    const getFn = jest.fn().mockResolvedValue({ data: () => ({ stripeConnectStatus: 'active' }) });
    mockFirestore.doc.mockReturnValue({ get: getFn, update: updateFn });

    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({
      metadata: { accountType: 'restaurant', restaurantId: 'rest1' },
      charges_enabled: true,
      details_submitted: true,
    }));

    expect(updateFn).not.toHaveBeenCalled();
  });

  it('does nothing for driver with metadata.driverId (logs only)', async () => {
    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({
      metadata: { accountType: 'driver', driverId: 'd1' },
    }));

    expect(mockFirestore.collection).not.toHaveBeenCalled();
  });

  it('queries drivers for legacy account (no accountType)', async () => {
    const snap = { empty: false, docs: [{ id: 'd1' }] };
    mockFirestore.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap),
    });

    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({ metadata: {} }));

    expect(mockFirestore.collection).toHaveBeenCalledWith('drivers');
  });

  it('handles no match for legacy account gracefully', async () => {
    const snap = { empty: true, docs: [] };
    mockFirestore.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap),
    });

    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await expect(onAccountUpdated(makeAccount({ metadata: {} }))).resolves.toBeUndefined();
  });

  it('does not write when restaurant account missing restaurantId metadata', async () => {
    const { onAccountUpdated } = await import('../stripe/handleStripeAccountUpdate.js');
    await onAccountUpdated(makeAccount({
      metadata: { accountType: 'restaurant' },
    }));

    expect(mockFirestore.doc).not.toHaveBeenCalled();
  });
});
