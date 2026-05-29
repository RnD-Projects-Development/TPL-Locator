import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into a dedicated node appended to <body>, escaping any
 * transformed ancestor (e.g. the page-entrance animation on <main>, which
 * otherwise makes position:fixed resolve against <main> instead of the
 * viewport — clipping modals at the top and leaving the backdrop short of
 * covering the full page). Also locks body scroll while mounted.
 */
export default function ModalPortal({ children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return createPortal(children, document.body)
}
