/**
 * Composant FloatingActionButton (FAB)
 * 
 * Bouton d'action flottant avec design moderne et animations.
 * Utilisé pour les actions principales comme "Demander une course".
 * 
 * @component
 */

'use client';

import React from 'react';

interface FloatingActionButtonProps {
  /** Texte du bouton */
  label: string;
  /** Callback quand le bouton est cliqué */
  onClick: () => void;
  /** Icône à afficher (SVG ou emoji) */
  icon?: React.ReactNode;
  /** Position du bouton */
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  /** Couleur du bouton */
  color?: 'primary' | 'secondary' | 'success' | 'danger';
  /** Taille du bouton */
  size?: 'small' | 'medium' | 'large';
  /** Désactiver le bouton */
  disabled?: boolean;
  /** Classe CSS personnalisée */
  className?: string;
}

/**
 * FloatingActionButton - Bouton d'action flottant
 * 
 * Affiche un bouton flottant au-dessus du contenu avec animations
 * et effets visuels modernes.
 */
export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  label,
  onClick,
  icon,
  position = 'bottom-center',
  color = 'primary',
  size = 'large',
  disabled = false,
  className = '',
}) => {
  // Classes de position
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2',
    'bottom-left': 'bottom-6 left-6',
  };

  // Classes de couleur
  const colorClasses = {
    primary: 'bg-[#f29200] hover:bg-[#e68600] text-white shadow-[#f29200]/50',
    secondary: 'bg-gray-700 hover:bg-gray-800 text-white shadow-gray-700/50',
    success: 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/50',
    danger: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/50',
  };

  // Classes de taille
  const sizeClasses = {
    small: 'px-4 py-2 text-sm',
    medium: 'px-6 py-3 text-base',
    large: 'px-8 py-4 text-lg',
  };

  const iconSizeClasses = {
    small: 'h-4 w-4',
    medium: 'h-5 w-5',
    large: 'h-6 w-6',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        fixed ${positionClasses[position]}
        ${colorClasses[color]}
        ${sizeClasses[size]}
        font-bold rounded-full
        shadow-xl hover:shadow-2xl
        transition-all duration-300
        transform hover:scale-105 active:scale-95
        flex items-center justify-center gap-3
        z-40
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
        ${className}
      `}
      aria-label={label}
    >
      {/* Icône par défaut (taxi) si aucune icône n'est fournie */}
      {icon || (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={iconSizeClasses[size]}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
        </svg>
      )}
      
      <span className="font-semibold hidden sm:inline">{label}</span>
      
      {/* Version mobile (icône seulement) */}
      <span className="font-semibold sm:hidden">
        {label.split(' ')[0]}
      </span>

      {/* Animation de pulsation */}
      {!disabled && (
        <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-current" />
      )}
    </button>
  );
};





