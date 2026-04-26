'use client'
import { useEffect, useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    const handleOffline = () => setIsOnline(false)
    const handleOnline = () => {
      setIsOnline(true)
      setShowReconnected(true)
      setTimeout(() => setShowReconnected(false), 3000)
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (isOnline && !showReconnected) return null

  return (
    <div className={[
      'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium',
      showReconnected
        ? 'bg-green-500/90 text-white'
        : 'bg-slate-800/95 text-amber-400',
    ].join(' ')}>
      <MaterialIcon name={showReconnected ? 'wifi' : 'wifi_off'} className="text-[18px]" />
      {showReconnected ? 'Reconnecté' : 'Hors connexion — vos actions sont sauvegardées'}
    </div>
  )
}
