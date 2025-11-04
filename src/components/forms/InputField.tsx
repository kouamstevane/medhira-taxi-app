/**
 * Composant InputField
 * 
 * Champ de saisie réutilisable avec label, erreur et icône optionnelle.
 * 
 * @component
 */

'use client';

import React, { InputHTMLAttributes, ReactNode } from 'react';

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      rightIcon,
      className = '',
      containerClassName = '',
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseInputClasses = `
      w-full px-4 py-3 border rounded-lg outline-none transition-all duration-200
      bg-white text-gray-900 placeholder-gray-400
      focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]
      disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
    `;

    const errorClasses = error
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300';

    const iconPaddingClass = icon ? 'pl-11' : '';
    const rightIconPaddingClass = rightIcon ? 'pr-11' : '';

    return (
      <div className={`w-full ${containerClassName}`}>
        {/* Label */}
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            className={`${baseInputClasses} ${errorClasses} ${iconPaddingClass} ${rightIconPaddingClass} ${className}`}
            disabled={disabled}
            {...props}
          />

          {/* Right Icon */}
          {rightIcon && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <p className="mt-1 text-sm text-red-600 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {/* Helper Text */}
        {!error && helperText && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
