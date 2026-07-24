import React from 'react'

/**
 * The circular sliding-arrow back button used on the device detail pages.
 *
 * Styles live in styles.css as `.btn-uiverse` (imported globally from
 * main.jsx), so this is markup-only. The artwork points right and the two
 * stacked arrows are what produce the slide-on-hover effect — `scaleX(-1)`
 * flips the whole control for "back"; pass `flip={false}` for a forward one.
 *
 * Extracted because the same two-SVG block was already copy-pasted across
 * LocatorDetail, StickerDetail, Fencepage and ZoneDetailSidebar.
 */
const ARROW = (
  <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z" />
  </svg>
)

export default function BackButton({ label = 'Back', onClick, flip = true, style, ...props }) {
  return (
    <button
      type="button"
      className="btn-uiverse"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{ transform: flip ? 'scaleX(-1)' : undefined, ...style }}
      {...props}
    >
      <div className="btn-uiverse-box">
        <span className="btn-uiverse-elem">{ARROW}</span>
        <span className="btn-uiverse-elem">{ARROW}</span>
      </div>
    </button>
  )
}
