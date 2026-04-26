// src/app/driver/dashboard/components/ModeSwitch.tsx
'use client'
import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

interface Props {
  uid: string
  currentMode: 'taxi' | 'livraison'
  onModeChange: (mode: 'taxi' | 'livraison') => void
  disabled?: boolean
}

export default function ModeSwitch({ uid, currentMode, onModeChange, disabled = false }: Props) {
  const [switching, setSwitching] = useState(false)

  const handleSwitch = async (newMode: 'taxi' | 'livraison') => {
    if (newMode === currentMode || disabled || switching) return
    setSwitching(true)
    try {
      await updateDoc(doc(db, 'drivers', uid), {
        activeMode: newMode,
        updatedAt: serverTimestamp(),
      })
      onModeChange(newMode)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="glass-card rounded-2xl border border-white/10 p-4">
      <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Mode actif</p>
      <div className="flex gap-2">
        {(['taxi', 'livraison'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => handleSwitch(mode)}
            disabled={disabled || switching}
            className={[
              'flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-medium text-sm transition-all',
              currentMode === mode
                ? 'bg-primary text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10',
              disabled ? 'opacity-40 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <MaterialIcon
              name={mode === 'taxi' ? 'directions_car' : 'delivery_dining'}
              className="text-[18px]"
            />
            {mode === 'taxi' ? 'Taxi' : 'Livraison'}
          </button>
        ))}
      </div>
      {disabled && (
        <p className="text-xs text-amber-400 mt-2 text-center">Changement de mode indisponible pendant une livraison</p>
      )}
    </div>
  )
}
