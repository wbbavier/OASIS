import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl bg-stone-900 shadow-sm border border-stone-700 p-6 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
