# Medjira home screen visual refresh

## Goal

Make the mobile landing screen feel intentional, premium, and immediately scannable while preserving the current Medjira black-and-orange identity and all existing routes, translations, and authentication behavior.

## Current issues

- The hero occupies too much vertical space without communicating a clear action.
- The logo, tagline, service chips, and buttons use competing visual weights.
- Service options read like decorative pills instead of useful entry points.
- The language control is visually detached from the rest of the composition.
- The display typography is heavy and inconsistent with the app's otherwise restrained dark UI.

## Approaches considered

1. **Minimal polish** — Keep the current structure and only tune spacing, type sizes, and colors. Lowest risk, but it would not solve the weak composition.
2. **Premium service launcher (recommended)** — Replace the oversized hero with a compact branded header, a focused welcome block, and a three-column service selector with icon, label, and short supporting cue. Keep login as the dominant action and make account creation secondary. This gives the screen a clear product thesis without adding new behavior.
3. **Illustrated campaign screen** — Add a large taxi/delivery illustration or generated artwork. Stronger brand presence, but adds asset weight, localization/layout risk, and would make the first screen more promotional than functional.

## Chosen design

### Visual tokens

- Ink: `#0B0C0D` for the page background.
- Charcoal: `#151719` for service and secondary surfaces.
- Warm amber: `#F59A0B` for the primary action and active accents.
- Soft cream: `#FFF7E8` for the main display text.
- Muted sand: `#A9A49B` for supporting text.
- Hairline: `rgba(255,255,255,0.10)` for quiet structure.

Typography stays system/self-hosted and uses weight and tracking deliberately: a compact semibold wordmark, a large but restrained heading, and readable sentence-case controls.

### Layout

```text
┌──────────────────────────┐
│ Medjira                  FR│
│                          │
│       Bonjour.           │
│  Your mobility...        │
│  Available in ...        │
│                          │
│  [🚕]  [🍔]  [📦]         │
│  Taxi  Food  Colis       │
│                          │
│  ┌────────────────────┐  │
│  │       Log In       │  │
│  └────────────────────┘  │
│  Create an account       │
│                          │
│  Become a driver         │
└──────────────────────────┘
```

The distinctive element is a thin amber route line behind the service selector: a small map-like signal that connects taxi, food, and parcel without adding a large illustration or distracting animation.

### Behavior and accessibility

- Preserve current links, translations, loading state, and authenticated redirect logic.
- Keep every action at least 44px high and retain visible focus states.
- Keep the language selector functional, but visually integrate it into the compact header.
- Use `prefers-reduced-motion` for any entrance effect and avoid motion that is necessary to understand the page.
- Ensure the three service cards remain legible at 320px wide and expand gracefully on larger screens.

## Verification

- Run the relevant lint/type/build checks available in the repository.
- Verify the home page at the existing localhost URL in a real browser at the reported 412x915 viewport.
- Check language switching, login, account creation, and driver links remain reachable.
- Check browser console logs for newly introduced errors.
