"use client";

import { useState } from 'react';
import { db } from '@/config/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { findAvailableDrivers } from '@/services/matching/findAvailableDrivers';
import { broadcastRideRequest } from '@/services/matching/broadcast';
import { logger } from '@/utils/logger';
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function TestMatchingPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);

  const testFindDrivers = async () => {
    setLoading(true);
    setResults([]);
    
    try {
      // Test avec une localisation à Toronto
      const testLocation = { lat: 43.6532, lng: -79.3832 }; // Toronto
      
      logger.info('Test recherche de chauffeurs', { location: testLocation });
      
      const availableDrivers = await findAvailableDrivers({
        location: testLocation,
        rangeKm: 50, // Rayon large pour le test
        maxTravelMinutes: 30, // 30 minutes pour le test
        maxResults: 10,
      });

      setResults([
        { type: 'success', message: `Trouvé ${availableDrivers.length} chauffeur(s) disponible(s)`, data: availableDrivers }
      ]);

      logger.info('Résultat test', { count: availableDrivers.length, drivers: availableDrivers });
    } catch (error: any) {
      setResults([
        { type: 'error', message: `Erreur: ${error.message}`, data: error }
      ]);
      logger.error('Erreur test', { error });
    } finally {
      setLoading(false);
    }
  };

  const checkDrivers = async () => {
    setLoading(true);
    setDrivers([]);
    
    try {
      const driversRef = collection(db, 'drivers');
      const q = query(
        driversRef,
        where('status', '==', 'approved')
      );

      const snapshot = await getDocs(q);
      const driversList: any[] = [];

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
    } catch (error: any) {
      setResults([
        { type: 'error', message: `Erreur: ${error.message}`, data: error }
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
    } catch (error: any) {
      setResults(prev => [
        ...prev,
        { type: 'error', message: `Erreur: ${error.message}`, data: error }
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
        pickupLocation: { lat: 4.0511, lng: 9.7679 },
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
    } catch (error: any) {
      setResults([
        { type: 'error', message: `Erreur broadcast: ${error.message}`, data: error }
      ]);
      logger.error('Erreur broadcast', { error });
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
              Vérifier Chauffeurs
            </button>
            
            <button
              onClick={testFindDrivers}
              disabled={loading}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              Tester Recherche
            </button>
            
            <button
              onClick={testBroadcast}
              disabled={loading}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              Tester Broadcast
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
            <h2 className="text-xl font-semibold mb-4">Chauffeurs Approuvés ({drivers.length})</h2>
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
                      Rendre Disponible
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
                  {result.data && (
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

