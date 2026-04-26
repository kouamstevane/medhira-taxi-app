'use client'
import { useState, useEffect } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder } from '@/types/firestore-collections'

const MAX_ATTEMPTS = 3

interface Props {
  order: FoodDeliveryOrder
  validatePin: (pin: string) => boolean
  confirmDelivery: (method: 'photo' | 'pin', payload: string) => Promise<void>
}

export default function Level7B_MeetOutside({ order, validatePin, confirmDelivery }: Props) {
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [supportPhone, setSupportPhone] = useState('+1-780-555-0199')

  useEffect(() => {
    import('firebase/firestore').then(({ doc, getDoc }) => {
      import('@/config/firebase').then(({ db }) => {
        getDoc(doc(db, 'config', 'support_phone')).then((snap) => {
          if (snap.exists()) setSupportPhone(snap.data().value)
        })
      })
    })
  }, [])

  const isBlocked = attempts >= MAX_ATTEMPTS

  const handlePinFailed = async () => {
    try {
      const logPinFailure = httpsCallable(functions, 'logPinFailure')
      await logPinFailure({ orderId: order.orderId, clientPhone: order.clientPhone })
    } catch { /* non-bloquant */ }
  }

  const handleConfirm = async () => {
    if (attempts >= MAX_ATTEMPTS) return
    if (!validatePin(pin)) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      const remaining = MAX_ATTEMPTS - newAttempts
      if (remaining === 0) {
        setError('Code PIN incorrect. Tentatives épuisées. Contactez le client ou le support.')
        await handlePinFailed()
      } else {
        setError(`Code incorrect. ${remaining} tentative(s) restante(s).`)
      }
      setPin('')
      return
    }
    setConfirming(true)
    try {
      await confirmDelivery('pin', pin)
    } catch {
      setError('Erreur lors de la validation. Réessayez.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="glass-card rounded-2xl border border-white/10 p-6 w-full max-w-sm space-y-6">
        <div className="text-center">
          <MaterialIcon name="person_pin" className="text-primary text-[48px]" />
          <h2 className="text-xl font-bold text-white mt-2">Rendez-vous à l&apos;extérieur</h2>
          <p className="text-slate-400 text-sm mt-1">Remettez le sac au client, puis saisissez le code PIN confirmé.</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400 mb-1">Code PIN client</p>
          <p className="text-4xl font-mono font-bold text-primary tracking-widest">{order.pinCode}</p>
        </div>
        {isBlocked ? (
          <div className="space-y-3">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <a href={`tel:${order.clientPhone}`}
              className="w-full h-12 flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-2xl text-sm font-medium">
              <MaterialIcon name="phone" className="text-[18px]" /> Appeler le client
            </a>
            <a href={`tel:${supportPhone}`}
              className="w-full h-12 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-slate-300 rounded-2xl text-sm font-medium">
              <MaterialIcon name="support_agent" className="text-[18px]" /> Appeler le support
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="number"
              inputMode="numeric"
              maxLength={4}
              placeholder="Entrez le code PIN"
              value={pin}
              onChange={(e) => { setPin(e.target.value.slice(0, 4)); setError(null) }}
              className="w-full h-14 text-center text-2xl font-mono bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-primary"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              onClick={handleConfirm}
              disabled={pin.length < 4 || confirming}
              className="w-full h-14 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
            >
              {confirming ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Valider la livraison'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
