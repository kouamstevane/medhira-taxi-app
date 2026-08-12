import { loadColisLocation } from '../location';

describe('loadColisLocation', () => {
  it('absorbe un refus de géolocalisation et transmet l’erreur au gestionnaire', async () => {
    const error = new Error('User denied Geolocation');
    const requestLocation = jest.fn().mockRejectedValue(error);
    const onError = jest.fn();

    await expect(loadColisLocation(requestLocation, onError)).resolves.toBeUndefined();

    expect(requestLocation).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
