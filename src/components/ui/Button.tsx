/**
 * Composant Button réutilisable
 * 
 * Bouton personnalisé avec différentes variantes et états.
 * Utilisé dans toute l'application pour maintenir la cohérence du design.
 * 
 * @component
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

/**
 * Composant Button avec support des variantes, tailles et état de chargement
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  // Styles de base
  const baseStyles = 'inline-flex items-center justify-center font-bold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

  // Styles par variante
  const variantStyles: Record<ButtonVariant, string> = {
    primary: 'bg-[#f29200] hover:bg-[#e68600] text-white focus:ring-[#f29200] shadow-md hover:shadow-lg',
    secondary: 'bg-[#101010] hover:bg-[#000000] text-white focus:ring-[#101010] shadow-md hover:shadow-lg',
    outline: 'border-2 border-[#f29200] text-[#f29200] hover:bg-[#f29200] hover:text-white focus:ring-[#f29200]',
    ghost: 'text-[#101010] hover:bg-gray-100 focus:ring-gray-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-md hover:shadow-lg',
  };

  // Styles par taille
  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  // Styles de largeur
  const widthStyles = fullWidth ? 'w-full' : '';

  // Styles pour l'état désactivé
  const disabledStyles = (disabled || isLoading) ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${disabledStyles} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Chargement...
        </>
      ) : (
        children
      )}
    </button>
  );
};
