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
  readonly onCloseRequest?: () => void;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly showCloseButton?: boolean;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.8;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  canDismiss = true,
  onCloseRequest,
  className,
  contentClassName,
  showCloseButton = false,
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
      if (event.key === 'Escape') {
        if (canDismiss) {
          onOpenChange(false);
        } else if (onCloseRequest) {
          onCloseRequest();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [canDismiss, onCloseRequest, onOpenChange, open]);

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

  const resetPointerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null || (pointerIdRef.current !== null && pointerIdRef.current !== event.pointerId)) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    startYRef.current = null;
    pointerIdRef.current = null;
    startTimeRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  const finishPointerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null || (pointerIdRef.current !== null && pointerIdRef.current !== event.pointerId)) return;

    const displacement = Math.max(0, event.clientY - startYRef.current);
    const elapsed = Math.max(1, Date.now() - (startTimeRef.current ?? Date.now()));
    const velocity = displacement / elapsed;
    const shouldDismiss = displacement >= DISMISS_DISTANCE || (displacement >= 100 && velocity >= DISMISS_VELOCITY);

    resetPointerGesture(event);

    if (shouldDismiss && canDismiss) {
      onOpenChange(false);
    }
  };

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center overscroll-none"
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60"
        data-testid="bottom-sheet-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            if (canDismiss) {
              onOpenChange(false);
            } else if (onCloseRequest) {
              onCloseRequest();
            }
          }
        }}
      />
      <section
        className={cn(
          'relative z-10 flex max-h-[90vh] max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#18181b] text-foreground border-t border-white/10 pb-[env(safe-area-inset-bottom)] shadow-2xl overscroll-contain',
          'sm:max-w-lg sm:rounded-2xl sm:border',
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
          onPointerCancel={resetPointerGesture}
        >
          <div
            aria-hidden="true"
            className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/40 sm:hidden"
            data-testid="bottom-sheet-handle"
          />
          <div className="mt-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-white tracking-tight" id={titleId}>
              {title}
            </h2>
            {showCloseButton && (
              <button
                aria-label="Fermer"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (onCloseRequest) {
                    onCloseRequest();
                  } else if (canDismiss) {
                    onOpenChange(false);
                  }
                }}
                type="button"
              >
                <MaterialIcon name="close" size="md" />
              </button>
            )}
          </div>
        </div>
        <div className={cn('min-h-0 overflow-y-auto px-4 pb-4', contentClassName)}>{children}</div>
      </section>
    </div>
  );
}
