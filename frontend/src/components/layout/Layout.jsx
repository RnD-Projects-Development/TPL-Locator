import React from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import { HomePageCacheProvider } from '../../context/HomePageCacheContext.jsx'
import { BindCacheProvider } from '../../context/BindCacheContext.jsx'
import { DashboardChromeProvider } from '../../context/DashboardChromeContext.jsx'
import '../../styles/light-theme.css'

export const ThemeContext = React.createContext(null)

const MAP_ROUTES       = ['/map', '/trajectory', '/playback', '/fence', '/field-staff', '/reports']
const DARK_ONLY_ROUTES = ['/dashboard', '/map', '/trajectory', '/playback', '/fence', '/field-staff', '/reports']

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const isMapPage      = MAP_ROUTES.some(r => pathname.startsWith(r))
  const isDarkOnlyPage = DARK_ONLY_ROUTES.some(r => pathname.startsWith(r))
  const isDevicesPage  = pathname.startsWith('/devices')

  // global theme state (persists across all pages)
  const [pageTheme, setPageTheme] = React.useState(() => {
    try {
      const v = sessionStorage.getItem('app-theme')
      return v || null
    } catch (e) { return null }
  })

  React.useEffect(() => {
    // save theme to sessionStorage whenever it changes (persists across navigation)
    try {
      if (pageTheme) {
        sessionStorage.setItem('app-theme', pageTheme)
      } else {
        sessionStorage.removeItem('app-theme')
      }
    } catch (e) { /* ignore */ }
  }, [pageTheme])

  return (
    <BindCacheProvider>
      <HomePageCacheProvider>
        <DashboardChromeProvider>
          <div className="flex h-screen overflow-hidden" style={{ background: '#000000' }}>
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <Header pageTheme={pageTheme} setPageTheme={setPageTheme} />
              <main
                key={pathname}
                className={`page-anim flex-1 ${isMapPage ? 'overflow-hidden p-0' : 'overflow-hidden p-5'} ${pageTheme === 'light' && !isDarkOnlyPage ? 'page-theme-light' : 'page-theme-dark'}`}
              style={{ borderTopLeftRadius: 0 }}
              >
                <ThemeContext.Provider value={pageTheme}>
                  {children}
                </ThemeContext.Provider>
              </main>
            </div>
          </div>
        </DashboardChromeProvider>
      </HomePageCacheProvider>
    </BindCacheProvider>
  )
}
