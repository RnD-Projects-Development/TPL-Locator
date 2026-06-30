import React, { createContext, useContext, useState, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────────
   DashboardChromeContext
   Lets the active page register a primary action (e.g. Export PDF on the
   dashboard, Export CSV on devices) that lives in the page but renders in
   the topbar (Header). The page registers { run, label, icon }; the Header
   reads it to render the button. Only the mounted page registers, and it
   clears on unmount, so the topbar always reflects the current page.
   ────────────────────────────────────────────────────────────────── */
const DashboardChromeContext = createContext(null)

export function DashboardChromeProvider({ children }) {
  // exportAction = { run: () => void, label: string, icon: Component } | null
  const [exportAction, setExportAction] = useState(null)
  const [exporting,    setExporting]    = useState(false)

  const registerExport = useCallback((action) => {
    setExportAction(
      action && action.run ? { run: action.run, label: action.label, icon: action.icon } : null
    )
  }, [])

  return (
    <DashboardChromeContext.Provider
      value={{ exportAction, registerExport, exporting, setExporting }}
    >
      {children}
    </DashboardChromeContext.Provider>
  )
}

export function useDashboardChrome() {
  return useContext(DashboardChromeContext)
}
