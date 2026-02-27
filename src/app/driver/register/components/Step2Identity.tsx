"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Loader2, Camera } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

// Validation de l'âge minimum (18 ans)
const minDate = new Date();
minDate.setFullYear(minDate.getFullYear() - 18);

const step2Schema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  dob: z.string().refine((val) => {
    const date = new Date(val);
    return date <= minDate;
  }, "Vous devez avoir au moins 18 ans"),
  nationality: z.string().min(2, "Nationalité requise"),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Numéro de téléphone invalide"),
  ssn: z.string().min(5, "Numéro de sécurité sociale requis"), // Modèle simplifié
  address: z.string().min(5, "Adresse requise"),
  city: z.string().min(2, "Ville requise"),
  zipCode: z.string().min(2, "Code postal requis"),
});

export type Step2FormData = z.infer<typeof step2Schema>;

interface Step2IdentityProps {
  onNext: (data: Step2FormData, biometricsPhoto: File | null) => void;
  onBack: () => void;
  initialData?: Partial<Step2FormData>;
  loading?: boolean;
}

export default function Step2Identity({ onNext, onBack, initialData, loading }: Step2IdentityProps) {
  const { showError, showWarning } = useToast();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Step2FormData>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      dob: initialData?.dob || '',
      nationality: initialData?.nationality || 'FR',
      phone: initialData?.phone || '',
      ssn: initialData?.ssn || '',
      address: initialData?.address || '',
      city: initialData?.city || '',
      zipCode: initialData?.zipCode || '',
    }
  });

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState(initialData?.address || '');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const dummyDivRef = useRef<HTMLDivElement | null>(null);

  // Initialisation de Google Places API
  useEffect(() => {
    // Vérifier que l'API Google est disponible
    if (typeof window === 'undefined' || !window.google) {
      console.warn('Google Places API non disponible');
      return;
    }

    // Initialiser les services Google Places
    autocompleteService.current = new window.google.maps.places.AutocompleteService();
    sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
    
    // On a besoin d'un élément DOM factice pour PlacesService
    // Note: Cet élément ne sera jamais ajouté au DOM réel
    dummyDivRef.current = document.createElement('div');
    placesService.current = new window.google.maps.places.PlacesService(dummyDivRef.current);

    // Cleanup des services Google Places pour éviter les memory leaks
    return () => {
      // IMPORTANT: Google Places API n'a pas de méthode de cleanup explicite
      // Mettre à null permet au garbage collector de faire son travail
      
      // Annuler les références aux services
      autocompleteService.current = null;
      
      // Nettoyer le token de session
      sessionToken.current = null;
      
      // Nettoyer le service Places
      placesService.current = null;
      
      // Nettoyer l'élément DOM factice
      if (dummyDivRef.current) {
        dummyDivRef.current.remove();
        dummyDivRef.current = null;
      }
      
      // Vider les prédictions pour éviter les fuites de mémoire
      setPredictions([]);
    };
  }, []);

  // Debounce pour l'autocomplétion
  useEffect(() => {
    const fetchPredictions = async () => {
      if (!addressInput || addressInput.length < 3 || !autocompleteService.current || !sessionToken.current) {
        setPredictions([]);
        return;
      }

      autocompleteService.current.getPlacePredictions({
        input: addressInput,
        sessionToken: sessionToken.current,
        // Limiter potentiellement à la France ou aux pays cibles
        componentRestrictions: { country: "fr" }
      }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results);
        } else {
          setPredictions([]);
        }
      });
    };

    const debounceTimer = setTimeout(fetchPredictions, 300);
    return () => clearTimeout(debounceTimer);
  }, [addressInput]);

  const handlePlaceSelect = (placeId: string, description: string) => {
    setAddressInput(description);
    setValue('address', description, { shouldValidate: true });
    setPredictions([]);

    if (placesService.current && sessionToken.current) {
      placesService.current.getDetails({
        placeId,
        sessionToken: sessionToken.current,
        fields: ['address_components']
      }, (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.address_components) {
          let city = '';
          let zipCode = '';

          place.address_components.forEach(component => {
            if (component.types.includes('locality')) {
              city = component.long_name;
            }
            if (component.types.includes('postal_code')) {
              zipCode = component.long_name;
            }
          });

          setValue('city', city, { shouldValidate: true });
          setValue('zipCode', zipCode, { shouldValidate: true });
        }
        
        // Renouveler le token après une sélection réussie
        if (window.google) {
             sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      });
    }
  };


  const takePhoto = async () => {
    setPhotoError(null); // Réinitialiser l'erreur
    try {
      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera, // Force la caméra, bloque la galerie
      });

      if (image.dataUrl) {
         setPhotoDataUrl(image.dataUrl);
         // Convert DataUrl to File
         const res = await fetch(image.dataUrl);
         const blob = await res.blob();
         const file = new File([blob], "biophoto.jpeg", { type: "image/jpeg" });
         setPhotoFile(file);
      }
    } catch (error: any) {
      console.error("Erreur lors de la prise de photo:", error);
      
      // Gestion contextuelle des erreurs
      if (error?.message?.includes('User cancelled') || error?.message?.includes('cancelled')) {
        // L'utilisateur a annulé, ce n'est pas une erreur critique
        setPhotoError(null);
      } else if (error?.message?.includes('Permission') || error?.message?.includes('permission')) {
        setPhotoError("Permission caméra refusée. Veuillez autoriser l'accès à la caméra dans les paramètres de votre appareil.");
      } else if (error?.message?.includes('Camera') || error?.message?.includes('Unavailable')) {
        setPhotoError("Caméra non disponible. Vérifiez que votre appareil dispose d'une caméra fonctionnelle.");
      } else {
        setPhotoError("Impossible de prendre la photo. Veuillez réessayer ou utiliser un autre appareil.");
      }
    }
  };

  const onSubmit = (data: Step2FormData) => {
    if (!photoFile) {
      // La photo biométrique est obligatoire sur toutes les plateformes
      showError("La photo biométrique est obligatoire pour finaliser votre inscription.");
      return;
    }
    onNext(data, photoFile);
  };

  const handleNameInput = (e: React.FormEvent<HTMLInputElement>) => {
      // Auto-capitalize first letter of each word
      const target = e.target as HTMLInputElement;
      target.value = target.value.replace(/\b\w/g, l => l.toUpperCase());
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#101010]">Votre Profil Chauffeur</h2>
        <p className="text-gray-500 mt-2">Ces informations sont requises pour votre vérification légale.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Card 1: Identité */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Identité</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <input {...register('firstName')} onInput={handleNameInput} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" />
                {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input {...register('lastName')} onInput={handleNameInput} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" />
                {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
                <input type="date" {...register('dob')} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" />
                {errors.dob && <p className="text-red-500 text-xs mt-1">{errors.dob.message}</p>}
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nationalité</label>
                <select {...register('nationality')} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none">
                    <option value="FR">France</option>
                    <option value="BE">Belgique</option>
                    <option value="CH">Suisse</option>
                    {/* Add more ISO codes here */}
                </select>
                {errors.nationality && <p className="text-red-500 text-xs mt-1">{errors.nationality.message}</p>}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de Téléphone</label>
                <input 
                  type="tel" 
                  placeholder="+33 6 00 00 00 00" 
                  {...register('phone')} 
                  className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" 
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>

             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de Sécurité Sociale (NIR)</label>
                {/* Masked input concept: in a real app, use a dedicated lib or simple format like 1-22-33-44-555-666 77 */}
                <input type="password" placeholder="Masqué par défaut" {...register('ssn')} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" />
                {errors.ssn && <p className="text-red-500 text-xs mt-1">{errors.ssn.message}</p>}
            </div>
        </div>

        {/* Card 2: Adresse */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Adresse Postale</h3>
            
            <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Recherche d'adresse</label>
                <input 
                    type="text" 
                    value={addressInput} 
                    onChange={(e) => {
                      setAddressInput(e.target.value);
                      setValue('address', e.target.value, { shouldValidate: true });
                    }} 
                    placeholder="Commencez à taper votre adresse..."
                    className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" 
                />
                {/* Predictions Dropdown */}
                {predictions.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md shadow-lg max-h-60 overflow-auto">
                        {predictions.map(prediction => (
                            <li 
                                key={prediction.place_id} 
                                onClick={() => handlePlaceSelect(prediction.place_id, prediction.description)}
                                className="p-3 hover:bg-gray-100 cursor-pointer text-sm"
                            >
                                {prediction.description}
                            </li>
                        ))}
                    </ul>
                )}
                {/* Hidden field for react-hook-form validation */}
                <input type="hidden" {...register('address')} />
                 {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                    <input type="text" {...register('city')} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Code Postal</label>
                    <input type="text" {...register('zipCode')} className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] focus:ring-2 focus:ring-[#f29200] outline-none" />
                </div>
            </div>
        </div>

        {/* Card 3: Biométrie */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
             <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Photo de profil</h3>
             <p className="text-sm text-gray-500">Prenez un selfie sur le vif. Assurez-vous d'être bien éclairé et de cadrer votre visage et cou dans l'ovale virtuel.</p>
             
             <div className="flex flex-col items-center justify-center py-4">
                 {photoDataUrl ? (
                     <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-[#f29200]">
                         <img src={photoDataUrl} alt="Biometric" className="w-full h-full object-cover" />
                     </div>
                 ) : (
                     <div className="w-48 h-48 rounded-full bg-gray-200 flex items-center justify-center border-4 border-dashed border-gray-400">
                         <Camera className="w-12 h-12 text-gray-400" />
                     </div>
                 )}
                 <button
                    type="button"
                    onClick={takePhoto}
                    className="mt-4 px-6 py-2 bg-gray-100 text-[#101010] font-medium rounded-full hover:bg-gray-200 transition-colors"
                >
                    {photoDataUrl ? 'Reprendre la photo' : 'Ouvrir la caméra'}
                </button>
                
                {/* Affichage de l'erreur de photo */}
                {photoError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-600 text-sm text-center">{photoError}</p>
                    </div>
                )}
             </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="w-1/3 bg-gray-200 text-[#101010] font-bold py-4 rounded-xl hover:bg-gray-300 transition-colors"
          >
            Retour
          </button>
          <button
            type="submit"
            disabled={loading}
            className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            Enregistrer le brouillon & Continuer
          </button>
        </div>
      </form>
    </div>
  );
}
