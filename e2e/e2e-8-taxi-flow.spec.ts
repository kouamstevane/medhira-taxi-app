import { test, expect } from '@playwright/test';
import { clearFirestoreEmulator } from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import { seedClientOnly, seedDriverApprovedOnline } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-8 — Taxi booking and complete flow (Client & Driver)', async ({
  browser,
}) => {
  // Set high timeout for end-to-end multi-device workflow
  test.setTimeout(120_000);

  // 1. Seed test users
  const clientUser = await seedClientOnly();
  const driverUser = await seedDriverApprovedOnline();

  // 2. Setup mock for Google Maps script injection to make the test fully offline-resilient & deterministic
  const injectGoogleMapsMock = async (page: any) => {
    await page.addInitScript(() => {
      // Create google maps structure
      const googleMock = {
        maps: {
          places: {
            AutocompleteService: class {
              getPlacePredictions(request: any, callback: any) {
                callback(
                  [
                    { place_id: 'pickup_id', description: request.input },
                    { place_id: 'dest_id', description: 'Downtown' },
                  ],
                  'OK'
                );
              }
            },
            AutocompleteSessionToken: class {},
            PlacesServiceStatus: { OK: 'OK' },
          },
          Geocoder: class {
            geocode(request: any, callback: any) {
              if (request.placeId === 'pickup_id') {
                callback(
                  [
                    {
                      geometry: {
                        location: {
                          lat: () => 43.6532,
                          lng: () => -79.3832,
                        },
                      },
                    },
                  ],
                  'OK'
                );
              } else {
                callback(
                  [
                    {
                      geometry: {
                        location: {
                          lat: () => 43.66,
                          lng: () => -79.39,
                        },
                      },
                    },
                  ],
                  'OK'
                );
              }
            }
          },
          GeocoderStatus: { OK: 'OK' },
          DirectionsService: class {
            route(request: any, callback: any) {
              callback(
                {
                  routes: [
                    {
                      legs: [
                        {
                          distance: { value: 1500, text: '1.5 km' },
                          duration: { value: 300, text: '5 min' },
                        },
                      ],
                    },
                  ],
                },
                'OK'
              );
            }
          },
          TravelMode: { DRIVING: 'DRIVING' },
          SymbolPath: { FORWARD_CLOSED_ARROW: 1 },
          Circle: class {},
          Map: class {
            setCenter() {}
            setZoom() {}
          },
        },
      };

      // Assign to window
      (window as any).google = googleMock;
    });
  };

  // 3. Initialize Client Context & Page with Toronto Location
  const clientCtx = await browser.newContext({
    geolocation: { latitude: 43.6532, longitude: -79.3832 },
    permissions: ['geolocation'],
  });
  const clientPage = await clientCtx.newPage();
  
  // Listen for console and page errors
  clientPage.on('pageerror', (err) => console.log('Client Page Error:', err));
  clientPage.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`Client Console [${msg.type()}]:`, msg.text());
    }
  });

  await injectGoogleMapsMock(clientPage);

  // 4. Initialize Driver Context & Page with Toronto Location
  const driverCtx = await browser.newContext({
    geolocation: { latitude: 43.6532, longitude: -79.3832 },
    permissions: ['geolocation'],
  });
  const driverPage = await driverCtx.newPage();

  // Listen for console and page errors
  driverPage.on('pageerror', (err) => console.log('Driver Page Error:', err));
  driverPage.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`Driver Console [${msg.type()}]:`, msg.text());
    }
  });

  await injectGoogleMapsMock(driverPage);

  // 5. Connect Driver first and put him online/ready on dashboard
  console.log('[E2E-8] Connecting driver...');
  await driverPage.goto('/login');
  await driverPage.getByPlaceholder(/votre email/i).fill(driverUser.email);
  await driverPage.getByPlaceholder(/mot de passe/i).fill(driverUser.password);
  await driverPage.getByRole('button', { name: /se connecter/i }).click();

  // Assert redirection to driver dashboard
  await expect(driverPage).toHaveURL(/\/driver\/dashboard/, { timeout: 15000 });
  console.log('[E2E-8] Driver dashboard loaded.');

  // Verify driver availability status (should be "En ligne" / online by default based on Firestore seed)
  const isOnlineToggle = driverPage.locator('button:has-text("En ligne")');
  const isOfflineToggle = driverPage.locator('button:has-text("Hors ligne")');
  if (await isOfflineToggle.isVisible()) {
    console.log('[E2E-8] Driver is offline, toggling online...');
    await isOfflineToggle.click();
  }
  await expect(driverPage.locator('button:has-text("En ligne")')).toBeVisible({ timeout: 10000 });
  console.log('[E2E-8] Driver is online.');

  // 6. Connect Client and initiate the booking
  console.log('[E2E-8] Connecting client...');
  await clientPage.goto('/login');
  await clientPage.getByPlaceholder(/votre email/i).fill(clientUser.email);
  await clientPage.getByPlaceholder(/mot de passe/i).fill(clientUser.password);
  await clientPage.getByRole('button', { name: /se connecter/i }).click();

  // Assert redirection to dashboard
  await expect(clientPage).toHaveURL(/\/dashboard/, { timeout: 15000 });
  console.log('[E2E-8] Client dashboard loaded.');

  // Go to /taxi (Booking Form)
  await clientPage.goto('/taxi');
  await expect(clientPage).toHaveURL(/\/taxi/);

  // Wait for GPS geolocation loading or enter pickup address
  console.log('[E2E-8] Filling booking addresses...');
  const pickupInput = clientPage.getByPlaceholder(/où êtes-vous/i);
  await expect(pickupInput).toBeVisible({ timeout: 15000 });
  
  // Fill starting point
  await pickupInput.fill('Toronto');
  // Click on the first autocomplete suggestion
  await clientPage.locator('ul >> li').first().click();

  // Fill destination address
  const destinationInput = clientPage.getByPlaceholder(/où allez-vous/i);
  await destinationInput.fill('Downtown');
  // Click on the autocomplete suggestion "Downtown"
  await clientPage.locator('ul >> li').first().click();

  // Verify that Car Option "Eco" is selected
  const ecoVehicle = clientPage.locator('div:has-text("Eco")').first();
  await expect(ecoVehicle).toBeVisible();

  // Wait for the price/fare estimate summary to appear
  const fareSummary = clientPage.locator('text=/CAD/i').first();
  await expect(fareSummary).toBeVisible({ timeout: 15000 });
  console.log('[E2E-8] Price estimation visible.');

  // Click on submit "Demander une course"
  await clientPage.getByRole('button', { name: /demander une course/i }).click();
  console.log('[E2E-8] Opened confirmation modal.');

  // Confirmation modal step 1: Click "Continuer"
  await clientPage.getByRole('button', { name: /continuer/i }).click();

  // Confirmation modal step 2: Click "Confirmer (Wallet)" since we pre-seeded 1000 CAD balance
  console.log('[E2E-8] Selecting Wallet payment and confirming...');
  await clientPage.getByRole('button', { name: /confirmer \(wallet\)/i }).click();

  // Verify search screen
  await expect(clientPage.getByText(/recherche de chauffeur/i)).toBeVisible({ timeout: 15000 });
  console.log('[E2E-8] Client is searching for a driver.');

  // 7. Driver accepts the ride
  console.log('[E2E-8] Waiting for driver to receive the ride request...');
  const driverAcceptBtn = driverPage.getByRole('button', { name: /accepter/i });
  await expect(driverAcceptBtn).toBeVisible({ timeout: 25000 });
  console.log('[E2E-8] Ride request visible on driver dashboard, clicking accept.');
  await driverAcceptBtn.click();

  // Verify current trip card loaded on driver side
  await expect(driverPage.getByText(/course en cours/i)).toBeVisible({ timeout: 15000 });

  // 8. Client sees driver details & "Chauffeur en route"
  console.log('[E2E-8] Verifying client UI update to "Chauffeur en route"...');
  await expect(clientPage.getByText(/chauffeur en route/i)).toBeVisible({ timeout: 15000 });
  
  // Verify driver's name on client UI
  await expect(clientPage.getByText(/Driver Approved/i)).toBeVisible();

  // 9. Step: Driver marks arrived
  console.log('[E2E-8] Driver clicks "Je suis arrivé"...');
  const arrivedBtn = driverPage.getByRole('button', { name: /je suis arrivé/i });
  await expect(arrivedBtn).toBeVisible({ timeout: 10000 });
  await arrivedBtn.click();

  // Client sees update "Chauffeur arrivé !"
  console.log('[E2E-8] Verifying client UI update to "Chauffeur arrivé !"...');
  await expect(clientPage.getByText(/chauffeur arrivé !/i)).toBeVisible({ timeout: 15000 });

  // 10. Step: Driver starts the trip
  console.log('[E2E-8] Driver clicks "Démarrer"...');
  const startBtn = driverPage.getByRole('button', { name: /démarrer/i });
  await expect(startBtn).toBeVisible({ timeout: 10000 });
  await startBtn.click();

  // Client sees update "En route vers destination"
  console.log('[E2E-8] Verifying client UI update to "En route vers destination"...');
  await expect(clientPage.getByText(/en route vers destination/i)).toBeVisible({ timeout: 15000 });

  // 11. Step: Driver completes the trip
  console.log('[E2E-8] Driver clicks "Terminer"...');
  const completeBtn = driverPage.getByRole('button', { name: /terminer/i });
  await expect(completeBtn).toBeVisible({ timeout: 10000 });
  await completeBtn.click();

  // 12. Client sees final invoice modal
  console.log('[E2E-8] Verifying client final invoice modal...');
  await expect(clientPage.getByText(/course terminée !/i)).toBeVisible({ timeout: 15000 });
  
  // Verify details in invoice
  await expect(clientPage.getByText(/détail de la facturation/i)).toBeVisible();
  await expect(clientPage.getByText(/Driver Approved/i)).toBeVisible();

  // Client clicks "Fermer" on the invoice modal
  console.log('[E2E-8] Client closes invoice modal...');
  await clientPage.getByRole('button', { name: /fermer/i }).click();

  // Client is on the final step screen, clicks "Nouvelle course"
  console.log('[E2E-8] Client completes workflow and clicks "Nouvelle course"...');
  await clientPage.getByRole('button', { name: /nouvelle course/i }).click();

  // Assert redirection back to the empty booking form
  await expect(pickupInput).toBeVisible({ timeout: 10000 });
  console.log('[E2E-8] ✓ Flow complete! Redirection to initial form successful.');

  // Clean up contexts
  await clientCtx.close();
  await driverCtx.close();
});
