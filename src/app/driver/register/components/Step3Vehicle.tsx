"use client";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { imageCompressionService } from '@/services/image-compression.service';
import { useToast } from '@/hooks/useToast';
import { InputField } from '@/components/forms/InputField';
import { SelectField } from '@/components/forms/SelectField';

const step3Schema = z.object({
  carBrand: z.string().min(2, "Marque requise"),
  carModel: z.string().min(2, "Modèle requis"),
  productionYear: z.string().regex(/^(19|20)\d{2}$/, "Année invalide (ex: 2021)"),
  carColor: z.string().min(2, "Couleur requise"),
  passengerSeats: z.number().min(1).max(9),
  fuelType: z.enum(['Essence', 'Diesel', 'Électrique', 'Hybride']),
  mileage: z.number().min(0, "Kilométrage invalide"),
  techControlDate: z.string().min(1, "Date du contrôle technique requise"),
});

export type Step3FormData = z.infer<typeof step3Schema>;

type VehicleDeliveryType = 'velo' | 'scooter' | 'moto' | 'voiture';

export type Step3Files = {
  registration?: File;
  insurance?: File;
  techControl?: File;
  interiorPhoto?: File;
  exteriorPhoto?: File;
};

interface Step3VehicleProps {
  onNext: (data: Step3FormData, files: Step3Files) => void;
  onBack: () => void;
  initialData?: Partial<Step3FormData>;
  initialFiles?: Step3Files;
  loading?: boolean;
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
  onVehicleTypeChange?: (vehicleType: VehicleDeliveryType) => void;
}

const DELIVERY_VEHICLE_OPTIONS: { value: VehicleDeliveryType; label: string; icon: string }[] = [
  { value: 'velo', label: 'Vélo', icon: '🚲' },
  { value: 'scooter', label: 'Scooter', icon: '🛵' },
  { value: 'moto', label: 'Moto', icon: '🏍️' },
  { value: 'voiture', label: 'Voiture', icon: '🚗' },
]

export default function Step3Vehicle({ onNext, onBack, initialData, initialFiles, loading, driverType = 'chauffeur', onVehicleTypeChange }: Step3VehicleProps) {
  const [selectedDeliveryVehicle, setSelectedDeliveryVehicle] = React.useState<VehicleDeliveryType>('scooter');
  const { showInfo, showError } = useToast();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Step3FormData>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      carBrand: initialData?.carBrand || '',
      carModel: initialData?.carModel || '',
      productionYear: initialData?.productionYear || '',
      carColor: initialData?.carColor || '#FFFFFF',
      passengerSeats: initialData?.passengerSeats || 4,
      fuelType: initialData?.fuelType || 'Essence',
      mileage: initialData?.mileage || 0,
      techControlDate: initialData?.techControlDate || '',
    }
  });

  const [files, setFiles] = useState<{
    registration: File | null;
    insurance: File | null;
    techControl: File | null;
    interiorPhoto: File | null;
    exteriorPhoto: File | null;
  }>({
    registration: initialFiles?.registration || null,
    insurance: initialFiles?.insurance || null,
    techControl: initialFiles?.techControl || null,
    interiorPhoto: initialFiles?.interiorPhoto || null,
    exteriorPhoto: initialFiles?.exteriorPhoto || null,
  });

  const [compressionLoading, setCompressionLoading] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  const seats = watch('passengerSeats');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, key: keyof typeof files) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation du type MIME (JPG, PNG, PDF uniquement)
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf'
    ];
    
    if (!allowedMimeTypes.includes(file.type)) {
      setFileErrors(prev => ({
        ...prev,
        [key]: `Type de fichier non autorisé. Seuls les fichiers JPG, PNG et PDF sont acceptés.`
      }));
      return;
    }

    // Limite 10MB coté client
    if (file.size > 10 * 1024 * 1024) {
      setFileErrors(prev => ({ ...prev, [key]: "Fichier trop lourd (Max 10Mo)" }));
      return;
    }

    setFileErrors(prev => ({ ...prev, [key]: "" }));
    setCompressionLoading(key);

    try {
      // Compress if it's an image using the new async service
      let finalFile = file;
      if (file.type.startsWith('image/')) {
        const result = await imageCompressionService.compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.7,
          outputFormat: 'image/webp',
        });
        
        finalFile = result.file;
        
        // Show compression info if significant
        if (result.compressionRatio > 20) {
          showInfo(`${file.name} compressé de ${result.compressionRatio.toFixed(0)}%`);
        }
        
        console.log(`Compressed ${file.name}: ${(result.originalSize / 1024 / 1024).toFixed(2)}MB → ${(result.compressedSize / 1024 / 1024).toFixed(2)}MB`);
      }
      
      setFiles(prev => ({ ...prev, [key]: finalFile }));
    } catch (error) {
      console.error("Compression err:", error);
      // Fallback avec feedback utilisateur
      setFiles(prev => ({ ...prev, [key]: file }));
      setFileErrors(prev => ({
        ...prev,
        [key]: "La compression a échoué. Le fichier original sera utilisé (plus lourd)."
      }));
      showError("La compression a échoué pour " + file.name);
    } finally {
      setCompressionLoading(null);
    }
  };

  const removeFile = (key: keyof typeof files) => {
    setFiles(prev => ({ ...prev, [key]: null }));
    const fileInput = document.getElementById(`file-${key}`) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const onSubmit = (data: Step3FormData) => {
    if (!files.registration || !files.techControl || !files.interiorPhoto || !files.exteriorPhoto) {
      showError("Veuillez fournir tous les documents obligatoires (Carte grise, Contrôle technique, Photos intérieur et extérieur).");
      return;
    }
    onNext(data, {
      registration: files.registration,
      insurance: files.insurance || undefined,
      techControl: files.techControl,
      interiorPhoto: files.interiorPhoto,
      exteriorPhoto: files.exteriorPhoto,
    });
  };

  const renderFileInput = (label: string, key: keyof typeof files, required = true, accept = "image/*,application/pdf") => (
    <div className="border border-white/[0.06] rounded-xl p-4 bg-[#1A1A1A] relative">
      <label className="block text-sm font-medium text-[#9CA3AF] mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {files[key] ? (
        <div className="flex items-center justify-between bg-[#242424] p-3 rounded-lg border border-white/[0.06]">
           <div className="flex items-center space-x-3 overflow-hidden">
               <div className="bg-[#f29200]/10 p-2 rounded-lg text-[#f29200]">
                   <UploadCloud size={20} />
               </div>
               <div className="truncate">
                    <p className="text-sm font-medium text-white truncate">{files[key]?.name}</p>
                    <p className="text-xs text-[#9CA3AF]">{(files[key]!.size / 1024 / 1024).toFixed(2)} Mo</p>
               </div>
           </div>
           <button type="button" onClick={() => removeFile(key)} className="text-gray-400 hover:text-red-500 p-1">
               <X size={18} />
           </button>
        </div>
      ) : (
        <div className="relative border-2 border-dashed border-white/[0.15] rounded-lg p-4 text-center hover:bg-white/5 transition-colors cursor-pointer">
          <input 
            type="file" 
            id={`file-${key}`}
            accept={accept} 
            onChange={(e) => handleFileChange(e, key)} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
          />
          {compressionLoading === key ? (
             <div className="flex flex-col items-center text-[#f29200]">
                 <Loader2 className="animate-spin mb-2" size={24} />
                 <span className="text-sm">Optimisation en cours...</span>
             </div>
          ) : (
             <div className="flex flex-col items-center text-[#9CA3AF]">
                 <UploadCloud size={24} className="mb-2 text-[#4B5563]" />
                <span className="text-sm">Cliquez pour ajouter (Max 10Mo)</span>
             </div>
          )}
        </div>
      )}
      {fileErrors[key] && <p className="text-red-500 text-xs mt-1">{fileErrors[key]}</p>}
    </div>
  );

  // Rendu pour livreur uniquement
  if (driverType === 'livreur') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white">Type de véhicule</h2>
          <p className="text-[#9CA3AF] mt-2">Sélectionnez votre véhicule de livraison.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {DELIVERY_VEHICLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setSelectedDeliveryVehicle(opt.value);
                onVehicleTypeChange?.(opt.value);
              }}
              className={[
                'p-6 rounded-xl border-2 flex flex-col items-center gap-2 transition-all',
                selectedDeliveryVehicle === opt.value
                  ? 'border-[#f29200] bg-[#f29200]/10'
                   : 'border-white/[0.08] bg-[#1A1A1A] hover:border-[#f29200]/50',
              ].join(' ')}
            >
              <span className="text-3xl">{opt.icon}</span>
              <span className={['font-semibold', selectedDeliveryVehicle === opt.value ? 'text-[#f29200]' : 'text-[#9CA3AF]'].join(' ')}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-4 pt-4">
          <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-[#1A1A1A] border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/5 transition-colors">
            Retour
          </button>
          <button
            type="button"
            onClick={() => {
              onVehicleTypeChange?.(selectedDeliveryVehicle);
              // Livreur : seuls permis + pièce d'identité (Step4) sont requis
              // côté KYC. Les documents véhicule (carte grise, contrôle technique,
              // assurance pro, photos intérieur/extérieur) ne s'appliquent pas
              // aux livreurs. On transmet donc un objet files vide — le handler
              // parent conditionnera les uploads sur vehicleType.
              onNext(
                { carBrand: '-', carModel: '-', productionYear: '2024', carColor: '#FFFFFF', passengerSeats: 1, fuelType: 'Essence' as const, mileage: 0, techControlDate: '2099-12-31' },
                {}
              );
            }}
            disabled={loading}
            className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-[28px] shadow-[0_0_20px_rgba(242,146,0,0.4)] hover:bg-[#e68600] transition-colors"
          >
            Continuer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Éligibilité Véhicule</h2>
        <p className="text-[#9CA3AF] mt-2">Veuillez renseigner les détails de votre véhicule.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Card 1: Vehicule Details */}
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/[0.08] pb-2">Détails Véhicule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField 
                    {...register('carBrand')} 
                    label="Marque"
                    placeholder="ex: Toyota" 
                    error={errors.carBrand?.message}
                    required
                />
                <InputField 
                    {...register('carModel')} 
                    label="Modèle"
                    placeholder="ex: Prius" 
                    error={errors.carModel?.message}
                    required
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField 
                    type="number" 
                    {...register('productionYear')} 
                    label="Année"
                    placeholder="YYYY" 
                    error={errors.productionYear?.message}
                    required
                />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-[#9CA3AF]">Couleur</label>
                  <div className="flex items-center space-x-2">
                      <input type="color" {...register('carColor')} className="h-11 w-16 p-1 border border-white/[0.1] rounded-lg cursor-pointer shadow-sm" />
                      <span className="text-sm font-mono text-[#9CA3AF] uppercase">{watch('carColor')}</span>
                  </div>
                </div>
                <SelectField 
                    {...register('fuelType')} 
                    label="Carburant"
                    options={[
                        { value: 'Essence', label: 'Essence' },
                        { value: 'Diesel', label: 'Diesel' },
                        { value: 'Électrique', label: 'Électrique' },
                        { value: 'Hybride', label: 'Hybride' },
                    ]}
                    required
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                     <label className="block text-sm font-medium text-[#9CA3AF]">Places Passagers: {seats}</label>
                    <input type="range" min="1" max="9" step="1" {...register('passengerSeats', { valueAsNumber: true })} className="w-full accent-[#f29200]" />
                     {errors.passengerSeats && <p className="text-red-500 text-xs mt-1">{errors.passengerSeats.message}</p>}
                </div>
                <InputField 
                    type="number" 
                    {...register('mileage', { valueAsNumber: true })} 
                    label="Kilométrage"
                    placeholder="ex: 50000" 
                    error={errors.mileage?.message}
                    required
                />
            </div>
            <InputField 
                type="date" 
                {...register('techControlDate')} 
                label="Date prochain contrôle technique"
                error={errors.techControlDate?.message}
                required
            />
        </div>

        {/* Card 2: Documents */}
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/[0.08] pb-2">Documents Véhicule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderFileInput("Carte Grise (Recto/Verso)", "registration")}
                {renderFileInput("Contrôle Technique", "techControl")}
                {renderFileInput("Photo Extérieur (Plaque visible)", "exteriorPhoto", true, "image/*")}
                {renderFileInput("Photo Intérieur (Sièges arrière)", "interiorPhoto", true, "image/*")}
            </div>
            {renderFileInput("Assurance Pro", "insurance", false)}
        </div>

        <div className="flex gap-4 pt-4">
           <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-[#1A1A1A] border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/5 transition-colors">
            Retour
           </button>
           <button type="submit" disabled={loading} className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-[28px] shadow-[0_0_20px_rgba(242,146,0,0.4)] hover:bg-[#e68600] transition-colors flex justify-center items-center">
             {loading ? <Loader2 className="animate-spin mr-2" /> : null} Continuer
          </button>
        </div>
      </form>
    </div>
  );
}