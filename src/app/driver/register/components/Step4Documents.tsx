'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { Step4DocumentsCommun } from './Step4DocumentsCommun'
import { Step4DocumentsChauffeur } from './Step4DocumentsChauffeur'
import type { DriverType } from '@/types/firestore-collections'

interface Props {
  driverType: DriverType
  vehicleType?: string
  onNext: (files: Record<string, File>) => void
  onBack: () => void
}

export default function Step4Documents({ driverType, vehicleType, onNext, onBack }: Props) {
  const [files, setFiles] = useState<Record<string, File>>({})

  const handleUpload = (key: string, file: File) => {
    setFiles(prev => ({ ...prev, [key]: file }))
  }

  const uploadedKeys = Object.keys(files)

  const requiredKeys = ['permitConduire', 'casierJudiciaire', 'historiqueConduire', 'photoProfile', 'preuvePermitTravail']
  if (vehicleType !== 'velo') requiredKeys.push('plaqueImmatriculation')
  if (driverType === 'chauffeur' || driverType === 'les_deux') {
    requiredKeys.push('permitCommercial', 'plaqueImmatriculationCommerciale', 'visiteTechniqueCommerciale', 'certificatVille')
  }

  const allRequiredUploaded = requiredKeys.every(k => uploadedKeys.includes(k))

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Documents requis</h2>
        <p className="text-slate-400 text-sm">Téléversez tous les documents marqués *</p>
      </div>

      <Step4DocumentsCommun vehicleType={vehicleType} onUpload={handleUpload} uploadedKeys={uploadedKeys} />

      {(driverType === 'chauffeur' || driverType === 'les_deux') && (
        <Step4DocumentsChauffeur onUpload={handleUpload} uploadedKeys={uploadedKeys} />
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 h-14 border border-white/10 text-slate-400 rounded-2xl font-medium">
          Retour
        </button>
        <button
          onClick={() => allRequiredUploaded && onNext(files)}
          disabled={!allRequiredUploaded}
          className="flex-2 flex-grow h-14 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuer
          <MaterialIcon name="arrow_forward" className="ml-2" />
        </button>
      </div>
    </div>
  )
}
