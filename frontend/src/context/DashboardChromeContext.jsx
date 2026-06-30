import React, { createContext, useContext, useState, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────────
   DashboardChromeContext
   Lets a page (e.g. Dashboard) register an action — the Export PDF
   trigger — that lives in the page but is rendered in the topbar
   (Header). The page registers a { run, exporting } pair; the Header
   reads it to render the button. Cleared on unmount.
   ────────────────────────────────────────────────────────────────── */
const DashboardChromeContext = createContext(null)

export function DashboardChromeProvider({ children }) {
  // exportAction = { run: () => void } | null
  const [exportAction, setExportAction] = useState(null)
  const [exporting,    setExporting]    = useState(false)

  const registerExport = useCallback((action) => {
    setExportAction(action ? { run: action } : null)
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
