import React, { createContext, useContext, useState, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────────
   DashboardChromeContext
   Lets the active page register chrome that lives in the page but renders
   in the topbar (Header):
     - exportAction — a primary action button (e.g. Export PDF / Export CSV)
     - tabSwitcher  — a pill tab switcher (e.g. All/Locators/Stickers on the
       Devices page), shown in place of the plain breadcrumb — same slot
       DashboardSwitcher occupies for /dashboard and /field-staff.
   Only the mounted page registers, and it clears on unmount, so the topbar
   always reflects the current page.
   ────────────────────────────────────────────────────────────────── */
const DashboardChromeContext = createContext(null)

export function DashboardChromeProvider({ children }) {
  // exportAction = { run: () => void, label: string, icon: Component } | null
  const [exportAction, setExportAction] = useState(null)
  const [exporting,    setExporting]    = useState(false)

  // tabSwitcher = { tabs: [{key,label,icon}], activeKey, onSelect } | null
  const [tabSwitcher, setTabSwitcher] = useState(null)

  const registerExport = useCallback((action) => {
    setExportAction(
      action && action.run ? { run: action.run, label: action.label, icon: action.icon } : null
    )
  }, [])

  const registerTabSwitcher = useCallback((config) => {
    setTabSwitcher(config && config.tabs?.length ? config : null)
  }, [])

  return (
    <DashboardChromeContext.Provider
      value={{ exportAction, registerExport, exporting, setExporting, tabSwitcher, registerTabSwitcher }}
    >
      {children}
    </DashboardChromeContext.Provider>
  )
}

export function useDashboardChrome() {
  return useContext(DashboardChromeContext)
}
