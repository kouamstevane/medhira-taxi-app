'use client'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

interface DocItem {
  key: string
  label: string
  required: boolean
}

const COMMUN_DOCS: DocItem[] = [
  { key: 'permitConduire', label: 'Permis de conduire', required: true },
  { key: 'casierJudiciaire', label: 'Casier judiciaire', required: true },
  { key: 'historiqueConduire', label: 'Historique chauffeur', required: true },
  { key: 'photoProfile', label: 'Photo de profil', required: true },
  { key: 'preuvePermitTravail', label: 'Permis de travail', required: true },
  { key: 'plaqueImmatriculation', label: "Plaque d'immatriculation", required: false },
]

interface Props {
  vehicleType?: string
  onUpload: (key: string, file: File) => void
  uploadedKeys: string[]
}

export function Step4DocumentsCommun({ vehicleType, onUpload, uploadedKeys }: Props) {
  const docs = vehicleType === 'velo'
    ? COMMUN_DOCS.filter(d => d.key !== 'plaqueImmatriculation')
    : COMMUN_DOCS

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Documents communs</h3>
      {docs.map((doc) => (
        <div key={doc.key} className="flex items-center justify-between glass-card p-3 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <MaterialIcon
              name={uploadedKeys.includes(doc.key) ? 'check_circle' : 'upload_file'}
              className={uploadedKeys.includes(doc.key) ? 'text-green-400 text-[20px]' : 'text-slate-400 text-[20px]'}
            />
            <p className="text-sm text-white">{doc.label}{doc.required ? ' *' : ''}</p>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(doc.key, e.target.files[0])}
            />
            <span className="text-xs text-primary border border-primary/30 rounded-lg px-2 py-1">
              {uploadedKeys.includes(doc.key) ? 'Remplacer' : 'Choisir'}
            </span>
          </label>
        </div>
      ))}
    </div>
  )
}
