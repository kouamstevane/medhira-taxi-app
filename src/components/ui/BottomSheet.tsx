'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { MaterialIcon } from './MaterialIcon';
import { cn } from '@/lib/utils';

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly canDismiss?: boolean;
  readonly className?: string;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.8;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  canDismiss = true,
  className,
}: BottomSheetProps) {
  const titleId = `bottom-sheet-title-${useId().replace(/:/g, '')}`;
  const startYRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (canDismiss && event.key === 'Escape') onOpenChange(false);
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [canDismiss, onOpenChange, open]);

  if (!open) return null;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canDismiss) return;

    startYRef.current = event.clientY;
    pointerIdRef.current = event.pointerId;
    startTimeRef.current = Date.now();
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null || (pointerIdRef.current !== null && pointerIdRef.current !== event.pointerId)) return;

    setDragOffset(Math.max(0, event.clientY - startYRef.current));
  };

  const finishPointerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null || (pointerIdRef.current !== null && pointerIdRef.current !== event.pointerId)) return;

    const displacement = Math.max(0, event.clientY - startYRef.current);
    const elapsed = Math.max(1, Date.now() - (startTimeRef.current ?? Date.now()));
    const velocity = displacement / elapsed;
    const shouldDismiss = displacement >= DISMISS_DISTANCE || (displacement >= 100 && velocity >= DISMISS_VELOCITY);

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    startYRef.current = null;
    pointerIdRef.current = null;
    startTimeRef.current = null;
    setIsDragging(false);
    setDragOffset(0);

    if (shouldDismiss) {
      onOpenChange(false);
    }
  };

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60"
        data-testid="bottom-sheet-backdrop"
        onClick={(event) => {
          if (canDismiss && event.target === event.currentTarget) onOpenChange(false);
        }}
      />
      <section
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl',
          'sm:max-w-lg sm:rounded-2xl',
          className,
        )}
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 250ms ease-out',
        }}
      >
        <div
          className="shrink-0 touch-none select-none px-4 pb-3 pt-3"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerGesture}
          onPointerCancel={finishPointerGesture}
        >
          <div
            aria-hidden="true"
            className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/40 sm:hidden"
            data-testid="bottom-sheet-handle"
          />
          <div className="mt-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold" id={titleId}>
              {title}
            </h2>
            <button
              aria-label="Fermer"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                if (canDismiss) onOpenChange(false);
              }}
              type="button"
            >
              <MaterialIcon name="close" size="md" />
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
      </section>
    </div>
  );
}
