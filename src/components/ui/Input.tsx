'use client';
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = '', ...rest },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-stone-300">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100
          placeholder-stone-500 focus:border-indigo-500 focus:outline-none focus:ring-1
          focus:ring-indigo-500 ${error ? 'border-red-500' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
});
