import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ButtonVariants = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariants }
>(({ className, variant = 'primary', ...props }, ref) => {
  const variants: Record<ButtonVariants, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
  };

  // Ensure type defaults to 'button' if not specified
  const buttonType = (props.type as string) || 'button';

  return (
    <button
      ref={ref}
      type={buttonType as any}
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none hover:opacity-90 active:scale-[0.98]',
        variants[variant],
        className
      )}
      {...props}
    />
  );
});

Button.displayName = 'Button';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

Input.displayName = 'Input';

export const Card = ({ className, children, onClick, style }: { className?: string; children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) => (
  <div 
    onClick={onClick} 
    style={style}
    className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}
  >
    {children}
  </div>
);