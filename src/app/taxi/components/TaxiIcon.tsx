/**
 * TaxiIcon — illustration SVG d'une berline vue de 3/4.
 *
 * Le coloris correspond au mapping catégorie ↔ couleur :
 *   - Eco      → blanc
 *   - Confort  → jaune
 *   - Confort+ → noir
 *
 * Le composant est purement présentationnel : pas d'état, pas d'événement.
 */

import type { VehicleColor } from '@/app/taxi/data/vehicleCatalog';

const PALETTE: Record<VehicleColor, { body: string; bodyDark: string; windows: string; outline: string }> = {
  white: { body: '#F4F4F5', bodyDark: '#D4D4D8', windows: '#1F2937', outline: '#27272A' },
  yellow: { body: '#FACC15', bodyDark: '#CA8A04', windows: '#1F2937', outline: '#713F12' },
  black: { body: '#1F1F23', bodyDark: '#09090B', windows: '#374151', outline: '#000000' },
};

interface TaxiIconProps {
  color: VehicleColor;
  className?: string;
}

export function TaxiIcon({ color, className }: TaxiIconProps) {
  const palette = PALETTE[color];

  return (
    <svg
      viewBox="0 0 96 56"
      className={className}
      aria-hidden="true"
      role="img"
    >
      {/* Ombre */}
      <ellipse cx="48" cy="50" rx="34" ry="3" fill="#000" opacity="0.25" />

      {/* Carrosserie basse */}
      <path
        d="M10 38 L14 30 C18 22 24 18 32 17 L60 17 C68 17 74 20 80 26 L86 32 L88 38 Z"
        fill={palette.body}
        stroke={palette.outline}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Toit / cabine */}
      <path
        d="M26 18 C30 11 38 8 46 8 L56 8 C62 8 68 11 72 18 Z"
        fill={palette.bodyDark}
        stroke={palette.outline}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Vitres */}
      <path
        d="M30 18 C33 13 39 11 46 11 L48 11 L48 18 Z"
        fill={palette.windows}
      />
      <path
        d="M50 11 L56 11 C61 11 66 13 69 18 L50 18 Z"
        fill={palette.windows}
      />
      <rect x="48" y="11" width="2" height="7" fill={palette.outline} opacity="0.6" />

      {/* Bandeau taxi sur le toit */}
      <rect x="40" y="3" width="16" height="5" rx="1" fill="#F4F4F5" stroke={palette.outline} strokeWidth="0.8" />
      <text x="48" y="7.3" fontSize="3.6" fontWeight="700" textAnchor="middle" fill="#111827" fontFamily="system-ui, sans-serif">TAXI</text>

      {/* Phare avant */}
      <rect x="82" y="30" width="5" height="3" rx="1" fill="#FDE68A" />

      {/* Poignées / ligne latérale */}
      <line x1="20" y1="30" x2="78" y2="30" stroke={palette.outline} strokeWidth="0.6" opacity="0.4" />

      {/* Roues */}
      <circle cx="28" cy="40" r="6.5" fill="#18181B" stroke={palette.outline} strokeWidth="0.8" />
      <circle cx="28" cy="40" r="2.5" fill="#52525B" />
      <circle cx="70" cy="40" r="6.5" fill="#18181B" stroke={palette.outline} strokeWidth="0.8" />
      <circle cx="70" cy="40" r="2.5" fill="#52525B" />
    </svg>
  );
}
