'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { MenuItemImage } from '@/components/food/MenuItemImage';
import type { MenuItem } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { useTranslation } from '@/hooks/useTranslation';

interface MenuCatalogRowProps {
  item: MenuItem;
  selected: boolean;
  onSelect: (itemId: string) => void;
  onToggleAvailability: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (itemId: string) => void;
}

export function MenuCatalogRow({ item, selected, onSelect, onToggleAvailability, onEdit, onDelete }: MenuCatalogRowProps) {
  const { t } = useTranslation('restaurant');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const [actionsPosition, setActionsPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!actionsOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    const updatePosition = () => {
      const button = actionButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 195;
      const menuHeight = menuRef.current?.offsetHeight || 135;
      const bottomNavHeight = 64;

      // Determine whether popup fits below the 3-dots button
      const spaceBelow = window.innerHeight - bottomNavHeight - rect.bottom;
      const opensUp = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 16;

      const top = opensUp
        ? Math.max(8, rect.top - menuHeight - 4)
        : Math.min(window.innerHeight - bottomNavHeight - menuHeight - 4, rect.bottom + 4);

      // Align right edge of popup flush with right edge of 3-dots button (with 8px viewport safety)
      const right = Math.min(rect.right, window.innerWidth - 8);
      const left = Math.max(8, right - width);

      setActionsPosition({ top, left, width });
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [actionsOpen]);

  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.06] px-2.5 py-2 transition md:grid-cols-[auto_minmax(0,1fr)_160px_120px_140px_auto] md:gap-4 md:px-4 md:py-3 ${selected ? 'bg-primary/[0.06]' : 'hover:bg-white/[0.025]'} ${!item.isAvailable ? 'opacity-65' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(item.id)}
        aria-label={t('selectDishNamed', { name: item.name })}
        className="size-4 accent-primary"
      />
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white/[0.06] md:size-12 md:rounded-xl">
          <MenuItemImage src={item.imageUrl} imageStoragePath={item.imageStoragePath} alt="" sizes="48px" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{item.name}</p>
          <p className="truncate text-xs text-slate-300 font-medium">{item.category}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-primary md:hidden">{formatCurrencyWithCode(item.price)}</p>
        </div>
      </div>
      <p className="hidden truncate text-sm text-slate-300 md:block">{item.category}</p>
      <p className="hidden text-sm font-bold text-primary md:block">{formatCurrencyWithCode(item.price)}</p>
      <button
        type="button"
        onClick={() => onToggleAvailability(item)}
        aria-pressed={item.isAvailable}
        aria-label={item.isAvailable ? t('makeUnavailableNamed', { name: item.name }) : t('makeAvailableNamed', { name: item.name })}
        className={`hidden min-h-11 rounded-xl px-3 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:block ${item.isAvailable ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]'}`}
      >
        {item.isAvailable ? t('available') : t('unavailable')}
      </button>
      <div className="hidden items-center gap-1 md:flex">
        <button
          type="button"
          onClick={() => onToggleAvailability(item)}
          aria-label={item.isAvailable ? t('makeUnavailableNamed', { name: item.name }) : t('makeAvailableNamed', { name: item.name })}
          className="flex size-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/[0.07] hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        >
          <MaterialIcon name={item.isAvailable ? 'visibility' : 'visibility_off'} size="sm" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(item)}
          aria-label={t('editItemNamed', { name: item.name })}
          className="flex size-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-blue-500/10 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MaterialIcon name="edit" size="sm" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          aria-label={t('deleteItemNamed', { name: item.name })}
          className="flex size-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MaterialIcon name="delete" size="sm" />
        </button>
      </div>
      <div ref={actionsRef} className="relative md:hidden">
        <button
          type="button"
          ref={actionButtonRef}
          onClick={() => setActionsOpen((open) => !open)}
          aria-expanded={actionsOpen}
          aria-label={`Actions pour ${item.name}`}
          className="flex size-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MaterialIcon name="more_vert" size="sm" />
        </button>
        {actionsOpen && actionsPosition && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            className="fixed z-40 overflow-hidden rounded-xl border border-white/10 bg-[#1b1d22] p-1 shadow-2xl backdrop-blur-xl"
            style={{ top: actionsPosition.top, left: actionsPosition.left, width: actionsPosition.width }}
          >
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                onToggleAvailability(item);
              }}
              aria-label={item.isAvailable ? t('makeUnavailableNamed', { name: item.name }) : t('makeAvailableNamed', { name: item.name })}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-white/[0.08] transition"
            >
              <MaterialIcon name={item.isAvailable ? 'visibility_off' : 'visibility'} size="sm" className="shrink-0 text-slate-400" />
              <span className="truncate">{item.isAvailable ? t('makeUnavailableAction') : t('makeAvailableAction')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                onEdit(item);
              }}
              aria-label={t('editItemNamed', { name: item.name })}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-white/[0.08] transition"
            >
              <MaterialIcon name="edit" size="sm" className="shrink-0 text-slate-400" />
              <span className="truncate">{t('editItemAction')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                onDelete(item.id);
              }}
              aria-label={t('deleteItemNamed', { name: item.name })}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-semibold text-red-300 hover:bg-red-500/10 transition"
            >
              <MaterialIcon name="delete" size="sm" className="shrink-0 text-red-300" />
              <span className="truncate">{t('deleteItemAction')}</span>
            </button>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
