'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { DriverType } from '@/types/firestore-collections'

interface Props {
  onNext: (driverType: DriverType) => void
}

const ROLES: { value: DriverType; label: string; desc: string; icon: string }[] = [
  { value: 'chauffeur', label: 'Chauffeur taxi', desc: 'Transportez des passagers avec votre véhicule', icon: 'directions_car' },
  { value: 'livreur', label: 'Livreur de repas', desc: 'Livrez des commandes depuis les restaurants', icon: 'delivery_dining' },
  { value: 'les_deux', label: 'Les deux', desc: 'Chauffeur et livreur selon la demande', icon: 'sync_alt' },
]

export default function Step0RoleSelection({ onNext }: Props) {
  const [selected, setSelected] = useState<DriverType | null>(null)

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-white mb-2 text-center">Quel est votre rôle ?</h2>
      <p className="text-slate-400 text-center mb-8">Choisissez comment vous souhaitez utiliser l&apos;application.</p>

      <div className="space-y-4 mb-8">
        {ROLES.map((role) => (
          <button
            key={role.value}
            onClick={() => setSelected(role.value)}
            className={[
              'glass-card w-full p-5 rounded-2xl border text-left flex items-center gap-4 transition-all active:scale-[0.99]',
              selected === role.value ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/20',
            ].join(' ')}
          >
            <div className={['h-12 w-12 rounded-xl flex items-center justify-center shrink-0',
              selected === role.value ? 'bg-primary/20' : 'bg-white/5'].join(' ')}>
              <MaterialIcon name={role.icon}
                className={selected === role.value ? 'text-primary text-[24px]' : 'text-slate-400 text-[24px]'} />
            </div>
            <div>
              <p className="font-bold text-white">{role.label}</p>
              <p className="text-sm text-slate-400">{role.desc}</p>
            </div>
            {selected === role.value && (
              <MaterialIcon name="check_circle" className="text-primary text-[24px] ml-auto" />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={() => selected && onNext(selected)}
        disabled={!selected}
        className="w-full h-14 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continuer
        <MaterialIcon name="arrow_forward" size="md" className="ml-2" />
      </button>
    </div>
  )
}
