"use client";

/**
 * Composant InvoiceModal
 * 
 * Modal de facture qui s'affiche à la fin d'une course
 * Permet de voir le détail et télécharger la facture en PDF
 */

import { useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { Booking } from '@/types/booking';
import { downloadInvoiceFromBooking, extractInvoiceData } from '@/services/invoice.service';
import { DEFAULT_LOCALE, CURRENCY_CODE } from '@/utils/constants';

interface InvoiceModalProps {
  booking: Booking;
  onClose: () => void;
}

export function InvoiceModal({ booking, onClose }: InvoiceModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  
  const invoiceData = extractInvoiceData(booking);
  
  const handleDownload = () => {
    setDownloading(true);
    try {
      downloadInvoiceFromBooking(booking);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (error) {
      console.error('Erreur téléchargement facture:', error);
      alert('Erreur lors du téléchargement de la facture');
    } finally {
      setDownloading(false);
    }
  };
  
  const formatPrice = (price: number): string => {
    return price.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="glass-card rounded-2xl border border-white/10 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* En-tête avec gradient */}
        <div className="bg-gradient-to-r from-primary to-[#ffae33] text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <MaterialIcon name="check_circle" className="text-[40px]" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center">Course terminée !</h2>
          <p className="text-white/80 text-center mt-1">Voici le récapitulatif de votre trajet</p>
        </div>
        
        {/* Contenu */}
        <div className="p-6">
          {/* Trajet */}
          <div className="mb-6">
            <div className="flex items-start space-x-3 mb-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <div className="w-0.5 h-8 bg-slate-700"></div>
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Départ</p>
                  <p className="text-sm text-white font-medium truncate">{invoiceData.pickup}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Destination</p>
                  <p className="text-sm text-white font-medium truncate">{invoiceData.destination}</p>
                </div>
              </div>
            </div>
            
            {/* Stats */}
            <div className="flex justify-around glass-card rounded-lg p-3 mt-4 border border-white/5">
              <div className="text-center">
                <MaterialIcon name="navigation" size="sm" className="text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{invoiceData.distance.toFixed(1)}</p>
                <p className="text-xs text-slate-500">km</p>
              </div>
              <div className="w-px bg-white/10"></div>
              <div className="text-center">
                <MaterialIcon name="schedule" size="sm" className="text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{invoiceData.duration}</p>
                <p className="text-xs text-slate-500">min</p>
              </div>
              <div className="w-px bg-white/10"></div>
              <div className="text-center">
                <MaterialIcon name="directions_car" size="sm" className="text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-white mt-1">{invoiceData.carType}</p>
                <p className="text-xs text-slate-500">véhicule</p>
              </div>
            </div>
          </div>
          
          {/* Détail facturation */}
          <div className="border-t border-white/5 pt-4 mb-6">
            <h3 className="text-sm font-bold text-white mb-3">Détail de la facturation</h3>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Tarif de base</span>
                <span className="font-medium text-slate-200">{formatPrice(invoiceData.basePrice)} {CURRENCY_CODE}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Distance ({invoiceData.distance.toFixed(2)} km)</span>
                <span className="font-medium text-slate-200">{formatPrice(invoiceData.distancePrice)} {CURRENCY_CODE}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durée ({invoiceData.duration} min)</span>
                <span className="font-medium text-slate-200">{formatPrice(invoiceData.durationPrice)} {CURRENCY_CODE}</span>
              </div>
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-white">Total</span>
                <span className="text-2xl font-bold text-primary">
                  {formatPrice(invoiceData.finalPrice)} {CURRENCY_CODE}
                </span>
              </div>
            </div>
          </div>
          
          {/* Chauffeur */}
          {invoiceData.driverName && (
            <div className="glass-card rounded-lg p-4 mb-6 border border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-xl">
                  👨‍✈️
                </div>
                <div>
                  <p className="font-medium text-white">{invoiceData.driverName}</p>
                  <p className="text-sm text-slate-400">
                    {invoiceData.carModel} • {invoiceData.carPlate}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold py-4 px-4 rounded-xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  <span>Génération...</span>
                </>
              ) : downloaded ? (
                <>
                  <MaterialIcon name="check" size="md" />
                  <span>Téléchargé !</span>
                </>
              ) : (
                <>
                  <MaterialIcon name="download" size="md" />
                  <span>Télécharger la facture PDF</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="w-full glass-card hover:bg-white/5 text-slate-300 font-medium py-4 px-4 rounded-xl transition border border-white/10"
            >
              Fermer
            </button>
          </div>
          
          {/* Note */}
          <p className="text-xs text-center text-slate-500 mt-4">
            Vous pouvez retrouver vos factures dans l'historique de vos courses
          </p>
        </div>
      </div>
    </div>
  );
}
