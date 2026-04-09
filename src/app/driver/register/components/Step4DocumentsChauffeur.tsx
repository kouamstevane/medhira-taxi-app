'use client'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

const CHAUFFEUR_DOCS = [
  { key: 'permitCommercial', label: 'Permis commercial' },
  { key: 'plaqueImmatriculationCommerciale', label: 'Plaque commerciale' },
  { key: 'visiteTechniqueCommerciale', label: 'Visite technique' },
  { key: 'certificatVille', label: 'Certificat ville' },
]

interface Props {
  onUpload: (key: string, file: File) => void
  uploadedKeys: string[]
}

export function Step4DocumentsChauffeur({ onUpload, uploadedKeys }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Documents chauffeur taxi</h3>
      {CHAUFFEUR_DOCS.map((doc) => (
        <div key={doc.key} className="flex items-center justify-between glass-card p-3 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <MaterialIcon
              name={uploadedKeys.includes(doc.key) ? 'check_circle' : 'upload_file'}
              className={uploadedKeys.includes(doc.key) ? 'text-green-400 text-[20px]' : 'text-slate-400 text-[20px]'}
            />
            <p className="text-sm text-white">{doc.label} *</p>
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
