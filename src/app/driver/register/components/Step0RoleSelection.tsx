'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { cn } from '@/lib/utils'
import type { DriverType } from '@/types/firestore-collections'
import { useTranslation } from '@/hooks/useTranslation'
import { driverPrimaryButtonClassName, driverSectionCardClassName } from './driverOnboardingStyles'

interface Props {
  onNext: (driverType: DriverType) => void
}

export default function Step0RoleSelection({ onNext }: Props) {
  const [selected, setSelected] = useState<DriverType | null>(null)
  const { t } = useTranslation()

  const roles: { value: DriverType; label: string; desc: string; icon: string }[] = [
    { value: 'chauffeur', label: t('driver.roleChauffeur'), desc: t('driver.roleChauffeurDesc'), icon: 'directions_car' },
    { value: 'livreur', label: t('driver.roleLivreur'), desc: t('driver.roleLivreurDesc'), icon: 'delivery_dining' },
    { value: 'les_deux', label: t('driver.roleBoth'), desc: t('driver.roleBothDesc'), icon: 'sync_alt' },
  ]

  return (
    <div className={cn(driverSectionCardClassName, 'w-full max-w-lg mx-auto')} data-testid="step0-role-selection">
      <h2 className="text-2xl font-bold text-white mb-2 text-center">{t('driver.roleSelectionTitle')}</h2>
      <p className="text-slate-400 text-center mb-8">{t('driver.roleSelectionSubtitle')}</p>

      <div className="space-y-4 mb-8">
        {roles.map((role) => (
          <button
            key={role.value}
            onClick={() => setSelected(role.value)}
            data-testid={`role-btn-${role.value}`}
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
        data-testid="step0-continue-btn"
        className={cn(driverPrimaryButtonClassName)}
      >
        {t('common.next')}
        <MaterialIcon name="arrow_forward" size="md" className="ml-2" />
      </button>
    </div>
  )
}
