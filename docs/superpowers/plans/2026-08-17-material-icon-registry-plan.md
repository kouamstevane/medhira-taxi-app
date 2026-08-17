# Shared Material Icon Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every currently unresolved `MaterialIcon` fallback with a local Lucide SVG equivalent across the application.

**Architecture:** Keep `MaterialIcon` as the single compatibility layer for the existing Material-style string names. Expand its private Lucide registry with the missing names, preserve the current props and fallback behavior, and add a regression test for the complete set of names currently referenced by application code.

**Tech Stack:** Next.js 16, TypeScript, React 19, `lucide-react` 0.577, Jest, Testing Library.

## Global Constraints

- Use local Lucide SVG components; do not restore or add a remote icon-font dependency.
- Preserve the `MaterialIcon` props: `name`, `className`, `filled`, and `size`.
- Keep code and comments in English; do not add comments unless needed.
- Keep UI text unchanged.

---

### Task 1: Complete the shared icon registry and regression coverage

**Files:**
- Modify: `src/components/ui/MaterialIcon.tsx`
- Modify: `src/components/ui/__tests__/MaterialIcon.test.tsx`

**Interfaces:**
- Consumes: Existing Material-style icon names passed by pages and components.
- Produces: The same `MaterialIcon` component with concrete Lucide SVG output for every currently referenced icon name.

- [ ] **Step 1: Write the failing regression test**

Extend the existing test with the names currently found by the repository scan: `address`, `arrow_outward`, `bar_chart`, `bolt`, `calendar_month`, `calendar_today`, `chat`, `compare_arrows`, `delete`, `description`, `directions`, `directions_bike`, `done_all`, `door_front`, `drive_eta`, `event_available`, `favorite`, `filter_list`, `folder_open`, `grid_view`, `group`, `help_outline`, `home`, `inventory_2`, `list_alt`, `local_florist`, `local_shipping`, `lunch_dining`, `mark_email_read`, `medical_services`, `mic`, `mic_off`, `note`, `notifications_off`, `open_in_new`, `package_2`, `people`, `person_pin`, `photo_camera`, `psychology`, `receipt`, `replay`, `settings`, `shopping_cart`, `support_agent`, `swap_vert`, `sync_alt`, `timer`, `today`, `trending_up`, `upload_file`, `viewport`, `volume_off`, `volume_up`, `weekend`, and `work`. Render each name and assert its SVG is not the fallback `circle-help` icon.

Use the existing test style and query the rendered SVG’s `data-lucide` attribute so the test verifies the concrete component rather than visible text.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx jest src/components/ui/__tests__/MaterialIcon.test.tsx --runInBand
```

Expected: FAIL because the unresolved names currently render `CircleHelp`.

- [ ] **Step 3: Add the missing Lucide imports and mappings**

Add the corresponding imports and entries to `iconMap` in `MaterialIcon.tsx`. Use these exact mappings:

```ts
address: MapPin,
arrow_outward: ArrowUpRight,
bar_chart: ChartNoAxesColumnIncreasing,
bolt: Zap,
calendar_month: CalendarDays,
calendar_today: Calendar,
chat: MessageCircle,
compare_arrows: ArrowLeftRight,
delete: Trash2,
description: FileText,
directions: Navigation,
directions_bike: Bike,
done_all: CheckCheck,
door_front: DoorOpen,
drive_eta: CarFront,
event_available: CalendarCheck,
favorite: Heart,
filter_list: ListFilter,
folder_open: FolderOpen,
grid_view: LayoutGrid,
group: UsersRound,
help_outline: HelpCircle,
home: Home,
inventory_2: Package,
list_alt: List,
local_florist: Flower2,
local_shipping: Truck,
lunch_dining: Utensils,
mark_email_read: MailCheck,
medical_services: Stethoscope,
mic: Mic,
mic_off: MicOff,
note: StickyNote,
notifications_off: BellOff,
open_in_new: ExternalLink,
package_2: Box,
people: UsersRound,
person_pin: MapPin,
photo_camera: Camera,
psychology: Brain,
receipt: Receipt,
replay: RotateCcw,
settings: Settings,
shopping_cart: ShoppingCart,
support_agent: Headphones,
swap_vert: ArrowDownUp,
sync_alt: ArrowLeftRight,
timer: Timer,
today: CalendarDays,
trending_up: TrendingUp,
upload_file: Upload,
viewport: ScanEye,
volume_off: VolumeX,
volume_up: Volume2,
weekend: CalendarDays,
work: BriefcaseBusiness,
```

Keep the existing fallback `CircleHelp` for genuinely unknown future names and preserve the existing `filled` behavior.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npx jest src/components/ui/__tests__/MaterialIcon.test.tsx --runInBand
```

Expected: PASS, including the existing local-SVG test and the complete-name regression test.

- [ ] **Step 5: Run repository verification**

Run:

```powershell
npm run lint
npm run typecheck
```

Expected: both commands exit successfully with no new diagnostics.

- [ ] **Step 6: Commit the implementation**

```powershell
git add src/components/ui/MaterialIcon.tsx src/components/ui/__tests__/MaterialIcon.test.tsx
git commit -m "fix: restore missing application icons"
```

### Task 2: Browser verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: The completed `MaterialIcon` registry from Task 1.
- Produces: Visual confirmation that the dashboard service cards and bottom navigation show concrete icons.

- [ ] **Step 1: Open `/dashboard/` in the running local app**
- [ ] **Step 2: Confirm Taxi, Personal Driver, Commander, Transporter un colis, Favoris, and bottom navigation icons are SVG icons rather than question marks**
- [ ] **Step 3: Check browser console logs for JavaScript errors**
- [ ] **Step 4: Close the verification browser session and record the result**
