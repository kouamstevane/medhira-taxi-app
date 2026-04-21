import { useDriverStore, DriverCoreData } from '@/store/driverStore';

const baseDriver: DriverCoreData = {
  uid: 'uid-test',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@test.com',
  phone: '+15800000000',
  status: 'approved',
  isAvailable: true,
  car: { model: 'Civic', plate: 'ABC-123', color: 'Blanc' },
};

beforeEach(() => {
  useDriverStore.getState().clearDriver();
});

describe('driverStore — tests complets', () => {
  describe('état initial', () => {
    it('driver est null au démarrage', () => {
      expect(useDriverStore.getState().driver).toBeNull();
    });

    it('isLoaded est false au démarrage', () => {
      expect(useDriverStore.getState().isLoaded).toBe(false);
    });
  });

  describe('setDriver', () => {
    it('définit le driver et isLoaded à true', () => {
      useDriverStore.getState().setDriver(baseDriver);

      const state = useDriverStore.getState();
      expect(state.driver).toEqual(baseDriver);
      expect(state.isLoaded).toBe(true);
    });

    it('définit un driver avec tous les champs optionnels livreur', () => {
      const fullDriver: DriverCoreData = {
        ...baseDriver,
        driverType: 'les_deux',
        activeMode: 'livraison',
        cityId: 'edmonton',
        vehicleType: 'scooter',
        activeDeliveryOrderId: 'order-456',
        deliveriesCompleted: 150,
        deliveryEarnings: 5000,
        rating: 4.8,
        ratingsCount: 200,
        tripsCompleted: 300,
        earnings: 12000,
        fcmToken: 'token-fcm-123',
        profileImageUrl: 'https://example.com/photo.jpg',
        licenseNumber: 'LIC-98765',
      };

      useDriverStore.getState().setDriver(fullDriver);

      const driver = useDriverStore.getState().driver;
      expect(driver).not.toBeNull();
      expect(driver?.driverType).toBe('les_deux');
      expect(driver?.activeMode).toBe('livraison');
      expect(driver?.cityId).toBe('edmonton');
      expect(driver?.vehicleType).toBe('scooter');
      expect(driver?.activeDeliveryOrderId).toBe('order-456');
      expect(driver?.deliveriesCompleted).toBe(150);
      expect(driver?.deliveryEarnings).toBe(5000);
      expect(driver?.rating).toBe(4.8);
      expect(driver?.ratingsCount).toBe(200);
      expect(driver?.tripsCompleted).toBe(300);
      expect(driver?.earnings).toBe(12000);
      expect(driver?.fcmToken).toBe('token-fcm-123');
      expect(driver?.profileImageUrl).toBe('https://example.com/photo.jpg');
      expect(driver?.licenseNumber).toBe('LIC-98765');
    });

    it('remplace un driver existant par un nouveau', () => {
      useDriverStore.getState().setDriver(baseDriver);

      const newDriver: DriverCoreData = {
        ...baseDriver,
        uid: 'uid-nouveau',
        firstName: 'Bob',
        lastName: 'Durand',
      };
      useDriverStore.getState().setDriver(newDriver);

      const state = useDriverStore.getState();
      expect(state.driver?.uid).toBe('uid-nouveau');
      expect(state.driver?.firstName).toBe('Bob');
      expect(state.driver?.lastName).toBe('Durand');
    });
  });

  describe('updateDriver', () => {
    it('met à jour partiellement sans écraser les autres champs', () => {
      useDriverStore.getState().setDriver(baseDriver);
      useDriverStore.getState().updateDriver({ firstName: 'Marie' });

      const driver = useDriverStore.getState().driver;
      expect(driver?.firstName).toBe('Marie');
      expect(driver?.lastName).toBe('Martin');
      expect(driver?.email).toBe('alice@test.com');
      expect(driver?.uid).toBe('uid-test');
    });

    it('garde driver à null si aucun driver n\'est défini', () => {
      useDriverStore.getState().updateDriver({ firstName: 'Test' });

      expect(useDriverStore.getState().driver).toBeNull();
    });

    it('met à jour isAvailable', () => {
      useDriverStore.getState().setDriver(baseDriver);
      useDriverStore.getState().updateDriver({ isAvailable: false });

      expect(useDriverStore.getState().driver?.isAvailable).toBe(false);
    });

    it('met à jour les champs imbriqués (car)', () => {
      useDriverStore.getState().setDriver(baseDriver);
      useDriverStore.getState().updateDriver({
        car: { model: 'Corolla', plate: 'XYZ-789', color: 'Noir' },
      });

      const car = useDriverStore.getState().driver?.car;
      expect(car?.model).toBe('Corolla');
      expect(car?.plate).toBe('XYZ-789');
      expect(car?.color).toBe('Noir');
    });

    it('met à jour plusieurs champs en un seul appel', () => {
      useDriverStore.getState().setDriver(baseDriver);
      useDriverStore.getState().updateDriver({
        status: 'offline',
        isAvailable: false,
        rating: 4.9,
      });

      const driver = useDriverStore.getState().driver;
      expect(driver?.status).toBe('offline');
      expect(driver?.isAvailable).toBe(false);
      expect(driver?.rating).toBe(4.9);
      expect(driver?.firstName).toBe('Alice');
    });

    it('supporte les mises à jour séquentielles multiples', () => {
      useDriverStore.getState().setDriver(baseDriver);

      useDriverStore.getState().updateDriver({ firstName: 'Jean' });
      useDriverStore.getState().updateDriver({ lastName: 'Dupont' });
      useDriverStore.getState().updateDriver({ status: 'busy' });
      useDriverStore.getState().updateDriver({ activeMode: 'livraison' });

      const driver = useDriverStore.getState().driver;
      expect(driver?.firstName).toBe('Jean');
      expect(driver?.lastName).toBe('Dupont');
      expect(driver?.status).toBe('busy');
      expect(driver?.activeMode).toBe('livraison');
      expect(driver?.uid).toBe('uid-test');
      expect(driver?.email).toBe('alice@test.com');
    });

    it('met à jour activeDeliveryOrderId à null', () => {
      useDriverStore.getState().setDriver({
        ...baseDriver,
        activeDeliveryOrderId: 'order-123',
      });
      useDriverStore.getState().updateDriver({ activeDeliveryOrderId: null });

      expect(useDriverStore.getState().driver?.activeDeliveryOrderId).toBeNull();
    });

    it('met à jour les champs livreur sans affecter les champs chauffeur', () => {
      useDriverStore.getState().setDriver({
        ...baseDriver,
        driverType: 'chauffeur',
        tripsCompleted: 50,
      });
      useDriverStore.getState().updateDriver({
        activeMode: 'livraison',
        vehicleType: 'moto',
      });

      const driver = useDriverStore.getState().driver;
      expect(driver?.activeMode).toBe('livraison');
      expect(driver?.vehicleType).toBe('moto');
      expect(driver?.driverType).toBe('chauffeur');
      expect(driver?.tripsCompleted).toBe(50);
    });
  });

  describe('clearDriver', () => {
    it('remet driver à null et isLoaded à false', () => {
      useDriverStore.getState().setDriver(baseDriver);

      useDriverStore.getState().clearDriver();

      const state = useDriverStore.getState();
      expect(state.driver).toBeNull();
      expect(state.isLoaded).toBe(false);
    });

    it('fonctionne même si le driver est déjà null', () => {
      useDriverStore.getState().clearDriver();

      const state = useDriverStore.getState();
      expect(state.driver).toBeNull();
      expect(state.isLoaded).toBe(false);
    });

    it('efface un driver avec tous les champs optionnels', () => {
      useDriverStore.getState().setDriver({
        ...baseDriver,
        driverType: 'les_deux',
        activeMode: 'taxi',
        cityId: 'edmonton',
        vehicleType: 'voiture',
        rating: 4.5,
        fcmToken: 'token-abc',
      });

      useDriverStore.getState().clearDriver();

      expect(useDriverStore.getState().driver).toBeNull();
      expect(useDriverStore.getState().isLoaded).toBe(false);
    });
  });
});
