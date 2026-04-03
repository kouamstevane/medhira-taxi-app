# Coding Conventions

_Last updated: 2026-04-03_

## Summary

This is a Next.js 15 app using TypeScript in strict mode, React functional components throughout, and Tailwind CSS v4 for all styling. The codebase mixes French and English — comments and user-facing strings are in French, while code identifiers (variables, functions, interfaces) use English camelCase. Shadcn/ui patterns coexist with custom Tailwind-only components.

---

## TypeScript Usage

**Strict mode is enabled** in `tsconfig.json` (`"strict": true`).

**Interface pattern** — local interfaces are declared inline at the top of the file, not exported unless shared:
```typescript
// src/app/driver/dashboard/page.tsx
interface DriverData {
  firstName?: string;
  lastName?: string;
  status?: string;
  isAvailable?: boolean;
}
```

**Type aliases for state machines** — union string literals typed as a named alias:
```typescript
// src/app/taxi/page.tsx
type Step = 'form' | 'searching' | 'driver_found' | 'completed' | 'failed';
const [step, setStep] = useState<Step>('form');
```

**`any` suppressions** — several pages suppress the lint rule with a file-level comment. This is a known pain point:
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
```
Files with suppression: `src/app/driver/dashboard/page.tsx`, `src/app/auth/register/RegisterContent.tsx`, `src/app/driver/dashboard/components/CurrentTripCard.tsx`, `src/app/driver/login/page.tsx`, `src/app/driver/verify-email/page.tsx`, `src/services/matching/retry.ts`, `src/app/wallet/historique/page.tsx`, `src/app/test-matching/page.tsx`, `src/services/taxi.service.ts`.

**Firestore timestamps** typed as `any` because the SDK timestamp type is awkward in cross-context usage:
```typescript
createdAt: any; // common workaround across multiple files
```

**Path alias** — all internal imports use `@/` resolved from `./src/`:
```typescript
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
```

---

## Component Patterns

**All components use React functional components** — no class components found.

**Client components** are marked explicitly with `'use client'` as the first line (before imports). Server components have no directive.

**Named exports** for most components, default exports for Next.js page files:
```typescript
// Components: named export
export function ActiveCallOverlay() { ... }
export const CartDrawer: React.FC = () => { ... };

// Pages: default export
export default function TaxiPage() { ... }
export default function FoodHomePage() { ... }
```

**Props interfaces** are always defined inline above the component:
```typescript
interface ChatModalProps {
  bookingId: string;
  driverName: string;
  driverId?: string;
  userType: 'client' | 'chauffeur';
  onClose: () => void;
}
export function ChatModal({ bookingId, driverName, driverId, userType, onClose }: ChatModalProps) {
```

**Hooks** live in `src/hooks/` and follow the `use` prefix convention. Custom hooks validate their context:
```typescript
// src/hooks/useAuth.ts
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

**Shadcn/ui Button** uses `cva` + `cn` for variant composition — this pattern applies only to the reusable primitive in `src/components/ui/Button.tsx`. App-level buttons use raw Tailwind classes directly.

---

## Styling Approach

**Tailwind CSS v4** is the primary styling tool, imported via `@import "tailwindcss"` in `src/app/globals.css`. No `tailwind.config.js` file — v4 uses CSS-native configuration.

**CSS custom properties** define the design system via `@theme inline` in `globals.css`. Semantic token names: `--color-primary`, `--color-background`, `--radius-lg`, etc.

**Dark mode** via `.dark` class selector (`@custom-variant dark (&:is(.dark *))`).

**Glass card pattern** is a recurring visual motif — used via the `glass-card` CSS class and the `GlassCard` component (`src/components/ui/GlassCard.tsx`). Typically combined with `border-white/10` and `backdrop-blur`.

**Tailwind utility composition** — classes are written inline, often long:
```tsx
className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-between py-16"
```

**Conditional classes** use template literals:
```tsx
className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
  isActive ? 'bg-primary text-white' : 'glass-card text-slate-300'
}`}
```

**`cn()` utility** (from `src/lib/utils`) is used only in shadcn primitive components, not in page-level code.

**Inline `<style jsx global>`** used in isolated cases for keyframe animations not possible in Tailwind:
```tsx
// src/components/ActiveCallOverlay.tsx
<style jsx global>{`
  @keyframes slideUp { ... }
`}</style>
```

**MaterialIcon component** (`src/components/ui/MaterialIcon.tsx`) wraps Google Material Symbols font — used throughout instead of icon libraries like lucide-react.

---

## Import Organization

Imports are not enforced by ESLint rules. The observed convention is:

1. React and framework imports (`react`, `next/navigation`, `next/link`)
2. Third-party packages (`firebase/firestore`, `@capacitor/*`)
3. Internal services (`@/services/...`)
4. Internal hooks (`@/hooks/...`)
5. Internal components (`@/components/...`)
6. Internal types (`@/types/...`)
7. Internal utilities (`@/utils/...`)

No barrel re-exports in pages. Service layers use `src/services/index.ts` as an optional export hub.

---

## Error Handling

**Async functions use try/catch** consistently:
```typescript
const handleSendMessage = async () => {
  setSending(true);
  try {
    await sendMessage(...);
    setNewMessage('');
  } catch (error) {
    console.error('Erreur envoi message:', error);
    setToast({ message: 'Erreur lors de l\'envoi du message', type: 'error' });
    setTimeout(() => setToast(null), 3000);
  } finally {
    setSending(false);
  }
};
```

**Error display** — local `toast` state is used inline in most components rather than a global toast system. Toast auto-dismisses via `setTimeout`.

**Firebase-specific errors** are caught by error code (e.g., `error.code === 'auth/too-many-requests'`).

**Graceful degradation** for native features — Capacitor haptics example:
```typescript
try {
  await Haptics.impact({ style });
} catch (error) {
  console.warn('Haptic feedback non disponible:', error);
}
```

**`console.error`** is the standard logging method in catch blocks — no structured logger in UI layer (a `logger` utility exists at `src/utils/logger.ts` but is not consistently used in components).

---

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `CartDrawer.tsx`, `AdminHeader.tsx`)
- Pages: `page.tsx` (Next.js App Router convention)
- Hooks: `camelCase.ts` with `use` prefix (e.g., `useAuth.ts`, `useVoipCall.ts`)
- Services: `kebab-case.service.ts` (e.g., `food-delivery.service.ts`, `auth.service.ts`)
- Utilities: `kebab-case.ts` (e.g., `driver.utils.ts`)

**Variables/Functions:** camelCase
**Types/Interfaces:** PascalCase
**Constants:** SCREAMING_SNAKE_CASE (e.g., `CURRENCY_CODE` in `src/utils/constants.ts`)

**Directories:**
- Feature-grouped under `src/app/` (Next.js route segments)
- `src/components/` with subdirectories by domain: `admin/`, `food/`, `forms/`, `layout/`, `stripe/`, `ui/`

---

## Comments & Documentation

**JSDoc** is used on hooks, services, and layout files — not on page components. Format:
```typescript
/**
 * Hook pour accéder à l'utilisateur authentifié.
 * @returns {AuthContextType} État d'authentification
 * @throws {Error} Si utilisé hors d'un AuthProvider
 */
```

**Inline comments** are in French and explain business rules or workarounds:
```typescript
// On retire orderBy pour éviter d'avoir à créer un index composite complexe
// Stocké dans un ref pour ne pas déclencher de re-render
```

**File-level doc blocks** appear at the top of service and layout files summarizing purpose and features.
