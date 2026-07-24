import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Anchored popover rendered into <body>.
 *
 * Popovers that live inside a page's toolbar get clipped and out-ranked: the
 * playback/report topbars set `overflow-x: auto` (which forces the other axis
 * to clip too, per spec), and Leaflet's map panes sit high enough in the
 * stacking order to paint over an absolutely-positioned sibling. Portalling to
 * <body> with `position: fixed` escapes both — the popover is measured against
 * the anchor's viewport rect instead, and flips or clamps to stay on screen.
 *
 * Props:
 *   anchorRef  ref to the trigger element
 *   open       boolean
 *   onClose    () => void — fired on outside click and Escape
 *   align      'left' | 'right' — which trigger edge to line up with
 */
export default function PopoverPortal({ anchorRef, open, onClose, align = 'left', className = '', children }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Position against the anchor's viewport rect, re-running on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const el = popRef.current;
      if (!anchor || !el) return;

      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const gap = 6;
      const pad = 8;

      let top = anchor.bottom + gap;
      if (top + h > window.innerHeight - pad) {
        const above = anchor.top - gap - h;
        top = above >= pad ? above : Math.max(pad, window.innerHeight - h - pad);
      }

      let left = align === 'right' ? anchor.right - w : anchor.left;
      left = Math.min(Math.max(pad, left), Math.max(pad, window.innerWidth - w - pad));

      setPos({ top, left });
    };

    place();
    // Re-place once the content has laid out and its real size is known.
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => { if (!open) setPos(null); }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popRef}
      className={className}
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        zIndex: 9990,           // above Leaflet panes and page toolbars, below modals
        // Hidden for the single frame before measurement, so it never flashes
        // in the wrong corner.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
