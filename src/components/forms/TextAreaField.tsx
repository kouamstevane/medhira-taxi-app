/**
 * Composant TextAreaField
 * 
 * Zone de texte multiligne réutilisable avec label et gestion d'erreurs.
 * 
 * @component
 */

'use client';

import React, { TextareaHTMLAttributes } from 'react';

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
      showCharCount,
      maxLength,
      value,
      ...props
    },
    ref
  ) => {
    const baseTextAreaClasses = `
      w-full px-4 py-3 border rounded-xl outline-none transition-all duration-200
      bg-white text-gray-900 placeholder-gray-400 resize-y
      focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]
      disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
      shadow-sm
    `;

    const errorClasses = error
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300';

    const charCount = value ? String(value).length : 0;

    return (
      <div className={`w-full ${containerClassName}`}>
        {/* Label */}
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* TextArea */}
        <textarea
          ref={ref}
          className={`${baseTextAreaClasses} ${errorClasses} ${className}`}
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
              <p className="text-sm text-red-600 flex items-center">
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
              <p className="text-sm text-gray-500">{helperText}</p>
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
