'use client'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

export type StatusVariant = 'primary' | 'amber'

const STATUS_BADGE_CLASSES: Record<StatusVariant, string> = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/10 text-amber-400',
}

interface OrderCardLine {
  icon: string
  text: string
}

interface OrderCardProps {
  title: string
  badge?: string
  lines: OrderCardLine[]
  statusLabel: string
  statusVariant: StatusVariant
  priceLabel: string
  onClick: () => void
}

export function OrderCard({
  title,
  badge,
  lines,
  statusLabel,
  statusVariant,
  priceLabel,
  onClick,
}: OrderCardProps) {
  return (
    <button
      onClick={onClick}
      className="glass-card w-full p-4 rounded-2xl border border-white/10 text-left hover:border-primary/30 transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-bold text-white truncate min-w-0 flex-1">{title}</p>
        {badge && <span className="text-xs text-primary font-medium shrink-0">{badge}</span>}
      </div>
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-2 text-slate-400 text-xs ${idx < lines.length - 1 ? 'mb-1' : ''}`}
        >
          <MaterialIcon name={line.icon} className="text-[14px]" />
          <span className="truncate">{line.text}</span>
        </div>
      ))}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-lg ${STATUS_BADGE_CLASSES[statusVariant]}`}>
          {statusLabel}
        </span>
        <p className="text-white font-bold">{priceLabel}</p>
      </div>
    </button>
  )
}
