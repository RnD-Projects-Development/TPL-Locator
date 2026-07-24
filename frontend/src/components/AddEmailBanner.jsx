import React from 'react'

/**
 * Persistent prompt for phone-only accounts to add an email address.
 *
 * Floats over the topbar rather than docking under it, bobbing gently via the
 * shared `animate-float` utility (tailwind.config.js: 4s ease-in-out, -8px).
 *
 * Two nested elements on purpose: `animate-float` animates `transform`, so any
 * `-translate-x-1/2` on the same element would be clobbered mid-animation. The
 * outer strip centres with flexbox instead and is `pointer-events-none` so it
 * never swallows clicks meant for the topbar behind it.
 *
 * zIndex 400 sits above the h-[60px] topbar but below the Header's own dropdowns
 * (500) and its modals (9999), so both correctly draw over this.
 */
export default function AddEmailBanner({ onOpenProfile }) {
  return (
    <div
      className="fixed top-3 left-0 right-0 flex justify-center pointer-events-none animate-fade-in"
      style={{ zIndex: 400 }}
    >
      <div
        role="alert"
        className={
          'pointer-events-auto animate-float shadow-xl ' +
          'w-[440px] max-w-[calc(100vw-2rem)] ' +
          'bg-yellow-50 border-l-4 border-yellow-400 rounded-md p-4'
        }
      >
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              aria-hidden="true"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-yellow-400"
            >
              <path
                clipRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                fillRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Add an email address to your account so you can reset your password
              and sign in with a code.
            </p>
            <button
              type="button"
              onClick={onOpenProfile}
              className="mt-2 text-sm font-medium underline hover:text-yellow-600 transition-colors"
              style={{ color: 'rgb(141, 56, 0)' }}
            >
              go to profile settings now &rsaquo;
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
