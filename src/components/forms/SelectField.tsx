/**
 * Composant SelectField
 * 
 * Champ de sélection réutilisable avec label et gestion d'erreurs.
 * 
 * @component
 */

'use client';

import React, { SelectHTMLAttributes, ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  icon?: ReactNode;
  containerClassName?: string;
}

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder = 'Sélectionner...',
      icon,
      className = '',
      containerClassName = '',
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseSelectClasses = `
      w-full px-4 py-3 border rounded-xl outline-none transition-all duration-200
      bg-[#1A1A1A] text-white appearance-none cursor-pointer
      focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]
      disabled:bg-white/5 disabled:cursor-not-allowed disabled:text-[#4B5563]
      shadow-sm active:scale-[0.99]
    `;

    const errorClasses = error
      ? 'border-[#EF4444] focus:ring-[#EF4444] focus:border-[#EF4444]'
      : 'border-white/[0.08]';

    const iconPaddingClass = icon ? 'pl-11' : '';

    return (
      <div className={`w-full ${containerClassName}`}>
        {/* Label */}
        {label && (
          <label className="block text-sm font-medium text-[#9CA3AF] mb-2">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* Select Container */}
        <div className="relative">
          {/* Left Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#4B5563] pointer-events-none">
              {icon}
            </div>
          )}

          {/* Select */}
          <select
            ref={ref}
            className={`${baseSelectClasses} ${errorClasses} ${iconPaddingClass} ${className}`}
            disabled={disabled}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown Icon */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#4B5563] pointer-events-none">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
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

SelectField.displayName = 'SelectField';
