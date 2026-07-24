import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Drawer — the shadcn/vaul drawer pattern, rebuilt on this project's stack.
 * Neither shadcn nor vaul is installed here (same situation as ui/Alert.jsx),
 * so this is a plain portal + transform transition with the same composition:
 *
 *   <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
 *     <DrawerContent>
 *       <DrawerHeader><DrawerTitle/><DrawerDescription/></DrawerHeader>
 *       ...body...
 *       <DrawerFooter><DrawerClose/></DrawerFooter>
 *     </DrawerContent>
 *   </Drawer>
 *
 * Slides in from the right on desktop and up from the bottom on mobile, and
 * can be swiped away along that same axis.
 */

const DrawerCtx = createContext(null)

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return isMobile
}

export function Drawer({ open, onOpenChange, swipeDirection, showSwipeHandle, children }) {
  const isMobile = useIsMobile()
  const direction = swipeDirection || (isMobile ? 'down' : 'right')
  const handle = showSwipeHandle ?? isMobile

  // Keep the drawer mounted through its exit transition.
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Mount hidden, then flip on the next frame so the transform transitions.
      // rAF alone is not enough: a backgrounded or non-compositing tab never
      // runs it, and the drawer would stay parked off-screen forever.
      const raf = requestAnimationFrame(() => setShown(true))
      const fallback = setTimeout(() => setShown(true), 50)
      return () => { cancelAnimationFrame(raf); clearTimeout(fallback) }
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(t)
  }, [open])

  // Escape closes; the page behind must not scroll while it's open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onOpenChange?.(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onOpenChange])

  if (!mounted) return null

  return createPortal(
    <DrawerCtx.Provider value={{ open, shown, direction, handle, close: () => onOpenChange?.(false) }}>
      {children}
    </DrawerCtx.Provider>,
    document.body,
  )
}

export function DrawerContent({ className = '', children, ...props }) {
  const ctx = useContext(DrawerCtx)
  const panelRef = useRef(null)
  const [drag, setDrag] = useState(0)
  const dragRef = useRef(null)

  const { shown, direction, handle, close } = ctx
  const vertical = direction === 'down' || direction === 'up'

  const onPointerDown = useCallback((e) => {
    // Only the grab area starts a swipe — the body still scrolls normally.
    if (!e.currentTarget.dataset.grab) return
    dragRef.current = { start: vertical ? e.clientY : e.clientX }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [vertical])

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return
    const delta = (vertical ? e.clientY : e.clientX) - dragRef.current.start
    setDrag(Math.max(0, delta))         // only toward the closing edge
  }, [vertical])

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setDrag((d) => { if (d > 90) close(); return 0 })
  }, [close])

  const hiddenTransform = vertical ? 'translateY(100%)' : 'translateX(100%)'
  const shownTransform = drag
    ? (vertical ? `translateY(${drag}px)` : `translateX(${drag}px)`)
    : 'translate(0, 0)'

  const geometry = vertical
    ? 'inset-x-0 bottom-0 max-h-[88vh] w-full rounded-t-2xl border-t'
    : 'inset-y-0 right-0 h-full w-full max-w-[34rem] rounded-l-2xl border-l'

  return (
    <>
      <div
        onClick={close}
        className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-[2px] transition-opacity duration-200"
        style={{ opacity: shown ? 1 : 0 }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={
          `fixed z-[2001] flex flex-col overflow-hidden border-white/10 bg-[#141414] ` +
          `shadow-[0_0_60px_rgba(0,0,0,0.65)] ${geometry} ${className}`
        }
        style={{
          transform: shown ? shownTransform : hiddenTransform,
          transition: drag ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        {...props}
      >
        {handle && (
          <div
            data-grab="1"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
          >
            <div className="h-1.5 w-10 rounded-full bg-white/20" />
          </div>
        )}
        {children}
      </div>
    </>
  )
}

export function DrawerHeader({ className = '', children, ...props }) {
  return (
    <div className={`shrink-0 border-b border-white/10 px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function DrawerTitle({ className = '', children, ...props }) {
  return (
    <h2 className={`text-lg font-bold tracking-tight text-white ${className}`} {...props}>
      {children}
    </h2>
  )
}

export function DrawerDescription({ className = '', children, ...props }) {
  return (
    <p className={`mt-1 text-sm text-white/45 ${className}`} {...props}>
      {children}
    </p>
  )
}

export function DrawerBody({ className = '', children, ...props }) {
  return (
    <div className={`flex-1 overflow-y-auto px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function DrawerFooter({ className = '', children, ...props }) {
  return (
    <div className={`flex shrink-0 gap-2 border-t border-white/10 px-5 py-3 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function DrawerClose({ className = '', children = 'Close', ...props }) {
  const { close } = useContext(DrawerCtx)
  return (
    <button
      type="button"
      onClick={close}
      className={
        `rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold ` +
        `text-white/70 transition hover:bg-white/10 hover:text-white ${className}`
      }
      {...props}
    >
      {children}
    </button>
  )
}

export default Drawer
