/**
 * Composant TextAreaField
 * 
 * Zone de texte multiligne réutilisable avec label et gestion d'erreurs.
 * 
 * @component
 */

'use client';

import React, { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import {
  driverFieldErrorClassName,
  driverFieldHelperClassName,
  driverFieldLabelClassName,
} from '@/app/driver/register/components/driverOnboardingStyles';

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
  showCharCount?: boolean;
  maxLength?: number;
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  (
    {
      label,
      error,
      helperText,
      className = '',
      containerClassName = '',
      required,
      disabled,
      id,
      showCharCount,
      maxLength,
      value,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;

    const baseTextAreaClasses =
      'glass-input autofill-dark w-full min-h-28 rounded-xl border border-white/[0.08] bg-[#1A1A1A] px-4 py-3 font-sans text-base text-white placeholder:text-[#4B5563] outline-none resize-y shadow-sm transition-all duration-200 focus:border-[#f29200] focus:ring-2 focus:ring-[#f29200] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-[#4B5563]';

    const errorClasses = error
      ? 'border-[#EF4444] focus:ring-[#EF4444] focus:border-[#EF4444]'
      : 'border-white/[0.08]';

    const charCount = value ? String(value).length : 0;

    return (
      <div className={`w-full ${containerClassName}`}>
        {/* Label */}
        {label && (
          <label htmlFor={textareaId} className={cn(driverFieldLabelClassName, 'block')}>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* TextArea */}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(baseTextAreaClasses, errorClasses, className)}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          {...props}
        />

        {/* Footer: Error, Helper Text, or Char Count */}
        <div className="mt-1 flex justify-between items-start">
          {/* Error or Helper Text */}
          <div className="flex-1">
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

            {!error && helperText && (
              <p className={driverFieldHelperClassName}>{helperText}</p>
            )}
          </div>

          {/* Character Count */}
          {showCharCount && maxLength && (
            <p className={`text-sm ml-2 ${
              charCount > maxLength * 0.9 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

TextAreaField.displayName = 'TextAreaField';
