import { foodDeliveryService, MenuImageUpdate } from '../food-delivery.service';
import { setDoc, updateDoc, deleteField } from 'firebase/firestore';

jest.mock('../../config/firebase', () => ({
  db: { mockDb: true },
}));

jest.mock('firebase/firestore', () => {
  const original = jest.requireActual('firebase/firestore');
  return {
    ...original,
    collection: jest.fn(() => ({ id: 'mock-collection' })),
    doc: jest.fn(() => ({ id: 'mock-item-id' })),
    setDoc: jest.fn(async () => {}),
    updateDoc: jest.fn(async () => {}),
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'),
    serverTimestamp: jest.fn(() => 'TIMESTAMP_SENTINEL'),
  };
});

describe('foodDeliveryService - Menu Image Updates & Availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('omits image fields for image-none and image-unchanged', async () => {
    await foodDeliveryService.upsertMenuItem(
      'rest1',
      { name: 'Pizza', price: 10, category: 'Plats' },
      { state: 'image-none' }
    );

    const callArg = (setDoc as jest.Mock).mock.calls[0][1];
    expect(callArg.imageUrl).toBeUndefined();
    expect(callArg.imageStoragePath).toBeUndefined();

    await foodDeliveryService.upsertMenuItem(
      'rest1',
      { id: 'item1', name: 'Pizza', price: 10, category: 'Plats' },
      { state: 'image-unchanged' }
    );

    const callArg2 = (setDoc as jest.Mock).mock.calls[1][1];
    expect(callArg2.imageUrl).toBeUndefined();
    expect(callArg2.imageStoragePath).toBeUndefined();
  });

  it('uses deleteField for imageStoragePath when state is external-url', async () => {
    await foodDeliveryService.upsertMenuItem(
      'rest1',
      { id: 'item1', name: 'Pizza', price: 10, category: 'Plats' },
      { state: 'external-url', imageUrl: 'https://example.com/pizza.jpg' }
    );

    const callArg = (setDoc as jest.Mock).mock.calls[0][1];
    expect(callArg.imageUrl).toBe('https://example.com/pizza.jpg');
    expect(callArg.imageStoragePath).toBe('DELETE_FIELD_SENTINEL');
  });

  it('writes imageUrl and imageStoragePath when state is upload', async () => {
    await foodDeliveryService.upsertMenuItem(
      'rest1',
      { id: 'item1', name: 'Pizza', price: 10, category: 'Plats' },
      {
        state: 'upload',
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/app/o/item.webp',
        imageStoragePath: 'menu-images/rest1/item1/up1.webp',
      }
    );

    const callArg = (setDoc as jest.Mock).mock.calls[0][1];
    expect(callArg.imageUrl).toBe('https://firebasestorage.googleapis.com/v0/b/app/o/item.webp');
    expect(callArg.imageStoragePath).toBe('menu-images/rest1/item1/up1.webp');
  });

  it('uses deleteField for both imageUrl and imageStoragePath when state is remove', async () => {
    await foodDeliveryService.upsertMenuItem(
      'rest1',
      { id: 'item1', name: 'Pizza', price: 10, category: 'Plats' },
      { state: 'remove' }
    );

    const callArg = (setDoc as jest.Mock).mock.calls[0][1];
    expect(callArg.imageUrl).toBe('DELETE_FIELD_SENTINEL');
    expect(callArg.imageStoragePath).toBe('DELETE_FIELD_SENTINEL');
  });

  it('updateMenuItemAvailability sends only isAvailable and updatedAt', async () => {
    await foodDeliveryService.updateMenuItemAvailability('rest1', 'item1', false);

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const callArg = (updateDoc as jest.Mock).mock.calls[0][1];
    expect(callArg).toEqual({
      isAvailable: false,
      updatedAt: 'TIMESTAMP_SENTINEL',
    });
    expect(callArg.imageUrl).toBeUndefined();
    expect(callArg.imageStoragePath).toBeUndefined();
  });
});
