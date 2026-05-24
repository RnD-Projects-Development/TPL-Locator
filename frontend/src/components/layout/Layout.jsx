import React from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import { HomePageCacheProvider } from '../../context/HomePageCacheContext.jsx'
import { BindCacheProvider } from '../../context/BindCacheContext.jsx'

const MAP_ROUTES = ['/map', '/trajectory', '/playback', '/fence', '/field-staff', '/reports']

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const isMapPage = MAP_ROUTES.some(r => pathname.startsWith(r))

  return (
    <BindCacheProvider>
      <HomePageCacheProvider>
        <div className="flex h-screen overflow-hidden" style={{ background: '#0d0d0d' }}>
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            <main
              className={`flex-1 ${isMapPage ? 'overflow-hidden p-0' : 'overflow-y-auto p-5'}`}
              style={isMapPage ? undefined : { background: '#0d0d0d' }}
            >
              {children}
            </main>
          </div>
        </div>
      </HomePageCacheProvider>
    </BindCacheProvider>
  )
}
