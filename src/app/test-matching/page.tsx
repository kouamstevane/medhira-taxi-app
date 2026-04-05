"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/config/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp, limit } from 'firebase/firestore';
import { findAvailableDrivers } from '@/services/matching/findAvailableDrivers';
import { broadcastRideRequest } from '@/services/matching/broadcast';
import { logger } from '@/utils/logger';

interface TestResult {
  type: string;
  message: string;
  data: unknown;
}

interface DriverInfo {
  id: string;
  name: string;
  isAvailable: boolean;
  status: string;
  hasLocation: boolean;
  location: { lat: number; lng: number } | null;
}

export default function TestMatchingPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAdmin(false);
        router.push('/login');
        return;
      }
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists()) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        router.push('/login');
      }
    };
    checkAdmin();
  }, [router]);

  if (isAdmin === null) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Vérification des droits…</div>;
  }

  if (!isAdmin) return null;

  const testFindDrivers = async () => {
    setLoading(true);
    setResults([]);

    try {
      const testLocation = { lat: 4.0511, lng: 9.7674 }; // Douala
      const availableDrivers = await findAvailableDrivers({
        location: testLocation,
        rangeKm: 50, // Large range for test
        maxResults: 10,
        maxTravelMinutes: 30,
      });

      setResults([
        { type: 'success', message: `Trouvé ${availableDrivers.length} chauffeur(s) disponible(s)`, data: availableDrivers }
      ]);

      logger.info('Résultat test', { count: availableDrivers.length, drivers: availableDrivers });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResults([
        { type: 'error', message: `Erreur: ${message}`, data: error }
      ]);
      logger.error('Erreur test', { error: message });
    } finally {
      setLoading(false);
    }
  };

  const checkDrivers = async () => {
    setLoading(true);
    setDrivers([]);

    try {
      const driversRef = collection(db, 'drivers');
      // Règle Section 4.1 : limit() obligatoire sur chaque requête
      const q = query(
        driversRef,
        where('status', '==', 'approved'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      const driversList: DriverInfo[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        driversList.push({
          id: doc.id,
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          isAvailable: data.isAvailable || false,
          status: data.status,
          hasLocation: !!data.currentLocation,
          location: data.currentLocation,
        });
      });

      setDrivers(driversList);
      setResults([
        { type: 'info', message: `Total: ${driversList.length} chauffeur(s) approuvé(s)`, data: driversList }
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResults([
        { type: 'error', message: `Erreur: ${message}`, data: error }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const makeDriverAvailable = async (driverId: string) => {
    try {
      const driverRef = doc(db, 'drivers', driverId);
      await updateDoc(driverRef, {
        isAvailable: true,
        updatedAt: serverTimestamp(),
      });

      setResults(prev => [
        ...prev,
        { type: 'success', message: `Chauffeur ${driverId} mis à disponible`, data: null }
      ]);

      await checkDrivers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResults(prev => [
        ...prev,
        { type: 'error', message: `Erreur: ${message}`, data: error }
      ]);
    }
  };

  const testBroadcast = async () => {
    setLoading(true);
    setResults([]);

    try {
      // Créer un booking de test
      const testBooking = {
        rideId: 'test-' + Date.now(),
        pickupLocation: { lat: 4.0511, lng: 9.7674 },
        destination: 'Test destination',
        price: 5000,
        carType: 'Éco',
        rangeKm: 50,
        timeoutSeconds: 30,
      };

      logger.info('Test broadcast', testBooking);

      const driverIds = await broadcastRideRequest(testBooking);

      setResults([
        { type: 'success', message: `Broadcast réussi: ${driverIds.length} chauffeur(s) notifié(s)`, data: { driverIds, testBooking } }
      ]);

      logger.info('Résultat broadcast', { driverIds });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResults([
        { type: 'error', message: `Erreur broadcast: ${message}`, data: error }
      ]);
      logger.error('Erreur broadcast', { error: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Test du Système de Matching</h1>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Actions de Test</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <button
              onClick={checkDrivers}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              Vérifier chauffeurs
            </button>

            <button
              onClick={testFindDrivers}
              disabled={loading}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              Tester recherche
            </button>

            <button
              onClick={testBroadcast}
              disabled={loading}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              Tester broadcast
            </button>
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#f29200] mx-auto"></div>
            </div>
          )}
        </div>

        {drivers.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Chauffeurs approuvés ({drivers.length})</h2>
            <div className="space-y-2">
              {drivers.map((driver) => (
                <div key={driver.id} className="border rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{driver.name || driver.id}</p>
                    <p className="text-sm text-gray-600">
                      Disponible: {driver.isAvailable ? '✅ Oui' : '❌ Non'} |
                      Localisation: {driver.hasLocation ? '✅ Oui' : '❌ Non'}
                    </p>
                  </div>
                  {!driver.isAvailable && (
                    <button
                      onClick={() => makeDriverAvailable(driver.id)}
                      className="bg-[#f29200] hover:bg-[#e68600] text-white px-3 py-1 rounded text-sm transition"
                    >
                      Rendre disponible
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h2 className="text-xl font-semibold mb-4">Résultats</h2>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    result.type === 'success' ? 'bg-green-50 border border-green-200' :
                    result.type === 'error' ? 'bg-red-50 border border-red-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}
                >
                  <p className={`font-semibold ${
                    result.type === 'success' ? 'text-green-800' :
                    result.type === 'error' ? 'text-red-800' :
                    'text-blue-800'
                  }`}>
                    {result.message}
                  </p>
                  {result.data !== null && result.data !== undefined && (
                    <pre className="mt-2 text-xs overflow-auto bg-gray-100 p-2 rounded">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
