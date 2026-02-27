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

interface Step3VehicleProps {
  onNext: (data: Step3FormData, files: { registration: File; insurance?: File; techControl: File; interiorPhoto: File; exteriorPhoto: File }) => void;
  onBack: () => void;
  initialData?: Partial<Step3FormData>;
  loading?: boolean;
}

export default function Step3Vehicle({ onNext, onBack, initialData, loading }: Step3VehicleProps) {
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
    registration: null,
    insurance: null,
    techControl: null,
    interiorPhoto: null,
    exteriorPhoto: null,
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
      alert("Veuillez fournir tous les documents obligatoires.");
      return;
    }
    onNext(data, files as { registration: File; insurance?: File; techControl: File; interiorPhoto: File; exteriorPhoto: File });
  };

  const renderFileInput = (label: string, key: keyof typeof files, required = true, accept = "image/*,application/pdf") => (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {files[key] ? (
        <div className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-gray-100">
           <div className="flex items-center space-x-3 overflow-hidden">
               <div className="bg-[#f29200]/10 p-2 rounded-lg text-[#f29200]">
                   <UploadCloud size={20} />
               </div>
               <div className="truncate">
                   <p className="text-sm font-medium text-gray-800 truncate">{files[key]?.name}</p>
                   <p className="text-xs text-gray-500">{(files[key]!.size / 1024 / 1024).toFixed(2)} Mo</p>
               </div>
           </div>
           <button type="button" onClick={() => removeFile(key)} className="text-gray-400 hover:text-red-500 p-1">
               <X size={18} />
           </button>
        </div>
      ) : (
        <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-100 transition-colors cursor-pointer">
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
             <div className="flex flex-col items-center text-gray-500">
                <UploadCloud size={24} className="mb-2 text-gray-400" />
                <span className="text-sm">Cliquez pour ajouter (Max 10Mo)</span>
             </div>
          )}
        </div>
      )}
      {fileErrors[key] && <p className="text-red-500 text-xs mt-1">{fileErrors[key]}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#101010]">Éligibilité Véhicule</h2>
        <p className="text-gray-500 mt-2">Veuillez renseigner les détails de votre véhicule.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Card 1: Vehicule Details */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Détails Véhicule</h3>
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
                  <label className="block text-sm font-medium text-gray-700">Couleur</label>
                  <div className="flex items-center space-x-2">
                      <input type="color" {...register('carColor')} className="h-11 w-16 p-1 border border-gray-300 rounded-lg cursor-pointer shadow-sm" />
                      <span className="text-sm font-mono text-gray-500 uppercase">{watch('carColor')}</span>
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
                    <label className="block text-sm font-medium text-gray-700">Places Passagers: {seats}</label>
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
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Documents Véhicule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderFileInput("Carte Grise (Recto/Verso)", "registration")}
                {renderFileInput("Contrôle Technique", "techControl")}
                {renderFileInput("Photo Extérieur (Plaque visible)", "exteriorPhoto", true, "image/*")}
                {renderFileInput("Photo Intérieur (Sièges arrière)", "interiorPhoto", true, "image/*")}
            </div>
            {renderFileInput("Assurance Pro", "insurance", false)}
        </div>

        <div className="flex gap-4 pt-4">
           <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-gray-200 text-[#101010] font-bold py-4 rounded-xl hover:bg-gray-300 transition-colors">
            Retour
          </button>
          <button type="submit" disabled={loading} className="w-2/3 bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors flex justify-center items-center">
             {loading ? <Loader2 className="animate-spin mr-2" /> : null} Continuer
          </button>
        </div>
      </form>
    </div>
  );
}
