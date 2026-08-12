export async function loadColisLocation(
  requestLocation: () => Promise<unknown>,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    await requestLocation();
  } catch (error) {
    onError(error);
  }
}
