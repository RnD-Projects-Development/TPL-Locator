import React from 'react'

/**
 * Alert / AlertTitle / AlertDescription — the shadcn alert pattern, rebuilt on
 * this project's Tailwind setup (shadcn itself isn't installed here, so there's
 * no cva or @/components/ui to import from).
 *
 * Theming note: `darkMode: 'class'` is configured but nothing in this app ever
 * puts `dark` on <html>, so `dark:` variants would be dead code. The app themes
 * pages by putting `page-theme-dark` / `page-theme-light` on <main> instead, so
 * the dark treatment is the base here and the light one is an ancestor variant.
 */

const VARIANTS = {
  warning:
    'border-amber-900 bg-amber-950 text-amber-50 ' +
    '[.page-theme-light_&]:border-amber-200 [.page-theme-light_&]:bg-amber-50 [.page-theme-light_&]:text-amber-900',
  destructive:
    'border-red-900 bg-red-950 text-red-50 ' +
    '[.page-theme-light_&]:border-red-200 [.page-theme-light_&]:bg-red-50 [.page-theme-light_&]:text-red-900',
  success:
    'border-emerald-900 bg-emerald-950 text-emerald-50 ' +
    '[.page-theme-light_&]:border-emerald-200 [.page-theme-light_&]:bg-emerald-50 [.page-theme-light_&]:text-emerald-900',
  info:
    'border-sky-900 bg-sky-950 text-sky-50 ' +
    '[.page-theme-light_&]:border-sky-200 [.page-theme-light_&]:bg-sky-50 [.page-theme-light_&]:text-sky-900',
}

export function Alert({ variant = 'warning', className = '', children, ...props }) {
  return (
    <div
      role="alert"
      className={
        'relative grid w-full grid-cols-[1.25rem_1fr] items-start gap-x-3 gap-y-0.5 ' +
        'rounded-lg border px-4 py-3 text-sm ' +
        '[&>svg]:h-4 [&>svg]:w-4 [&>svg]:translate-y-0.5 ' +
        `${VARIANTS[variant] ?? VARIANTS.warning} ${className}`
      }
      {...props}
    >
      {children}
    </div>
  )
}

export function AlertTitle({ className = '', children, ...props }) {
  return (
    <div className={`col-start-2 min-h-4 font-medium tracking-tight ${className}`} {...props}>
      {children}
    </div>
  )
}

export function AlertDescription({ className = '', children, ...props }) {
  return (
    <div className={`col-start-2 text-sm opacity-80 [&_p]:leading-relaxed ${className}`} {...props}>
      {children}
    </div>
  )
}

export default Alert
