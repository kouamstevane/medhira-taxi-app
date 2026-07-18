/**
 * Composant InputField
 * 
 * Champ de saisie réutilisable avec label, erreur et icône optionnelle.
 * 
 * @component
 */

'use client';

import React, { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  driverFieldClassName,
  driverFieldErrorClassName,
  driverFieldHelperClassName,
  driverFieldLabelClassName,
} from '@/app/driver/register/components/driverOnboardingStyles';

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
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
      labelClassName = '',
      required,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    const errorClasses = error
      ? 'border-[#EF4444] focus:ring-[#EF4444] focus:border-[#EF4444]'
      : '';

    const sharedInputChromeClassName =
      'glass-input h-14 rounded-xl outline-none text-white placeholder:text-slate-500 transition-all';

    const iconPaddingClass = icon ? 'pl-11' : '';
    const rightIconPaddingClass = rightIcon ? 'pr-11' : '';

    return (
      <div className={`w-full ${containerClassName}`}>
        {/* Label */}
        {label && (
          <label htmlFor={inputId} className={cn(driverFieldLabelClassName, 'block', labelClassName)}>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#4B5563]">
              {icon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              driverFieldClassName,
              sharedInputChromeClassName,
              iconPaddingClass,
              rightIconPaddingClass,
              className,
              errorClasses,
            )}
            disabled={disabled}
            {...props}
          />

          {/* Right Icon */}
          {rightIcon && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#4B5563]">
              {rightIcon}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <p className={driverFieldErrorClassName}>
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
          <p className={driverFieldHelperClassName}>{helperText}</p>
        )}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
