import React, { createContext, useContext, useReducer, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { DeviceCacheProvider } from './context/DeviceCacheContext.jsx'
import { ZoneCacheProvider } from './context/ZoneCacheContext.jsx'
import { UserCacheProvider } from './context/Usercachecontext.jsx'
import { ProfileCacheProvider } from './context/ProfileCacheContext.jsx'
import { AlertsProvider, useAlerts } from './context/AlertsContext.jsx'
import { FieldStaffCacheProvider } from './context/FieldStaffCacheContext.jsx'
import { SidebarDevicesProvider } from './context/SidebarDevicesContext.jsx'
import Login from './pages/Login.jsx'
import Layout from './components/layout/Layout.jsx'
import AppCachePrefetch from './components/AppCachePrefetch.jsx'
import { detectionEvents } from './data/mockData.js'

import Dashboard        from './pages/Dashboard.jsx'
import Devices          from './pages/Devices.jsx'
import LocatorDetail    from './pages/LocatorDetail.jsx'
import StickerDetail    from './pages/StickerDetail.jsx'
import MapViewPage      from './pages/MapViewPage.jsx'
import Alerts           from './pages/Alerts.jsx'
import Reports          from './pages/Reports.jsx'
import PlaybackPage     from './pages/PlaybackPage.jsx'
import FencePage        from './pages/Fencepage.jsx'
import FieldStaffDashboard from './pages/FieldStaffDashboard.jsx'
import UsersPage           from './pages/UsersPage.jsx'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

function reducer(state, action) {
  switch (action.type) {
    default: return state
  }
}

// ── AppShell: reads AlertsContext for unreadCount, then provides AppCtx ───────
// Must live inside AlertsProvider so useAlerts() is available.

function AppShell({ state, dispatch, sidebarOpen, setSidebarOpen, user, isAdmin, logout }) {
  const { unreadCount } = useAlerts()

  const appUser = {
    name:    user?.name    || user?.email || 'User',
    role:    isAdmin ? 'admin' : (user?.role || 'user'),
    company: user?.company || '',
    email:   user?.email   || '',
  }

  return (
    <AppCtx.Provider value={{
      user: appUser,
      setUser: () => logout(),
      isAdmin,
      sidebarOpen,
      setSidebarOpen,
      state,
      dispatch,
      unreadAlerts: unreadCount,
    }}>
      <DeviceCacheProvider>
      <UserCacheProvider>
      <ProfileCacheProvider>
      <ZoneCacheProvider>
      <FieldStaffCacheProvider>
      <SidebarDevicesProvider>
      <AppCachePrefetch />
      <Layout>
        <Routes>
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/search"       element={<Navigate to="/dashboard" replace />} />
          <Route path="/locators"     element={<Navigate to="/devices?tab=locator" replace />} />
          <Route path="/locators/:id" element={<LocatorDetail />} />
          <Route path="/stickers"     element={<Navigate to="/devices?tab=sticker" replace />} />
          <Route path="/stickers/:id" element={<StickerDetail />} />
          <Route path="/missing"      element={<Navigate to="/devices" replace />} />
          <Route path="/map"          element={<MapViewPage />} />
          <Route path="/trajectory"   element={<Navigate to="/dashboard" replace />} />
          <Route path="/playback"     element={<PlaybackPage />} />
          <Route path="/fence"        element={<FencePage />} />
          <Route path="/users"        element={isAdmin ? <UsersPage /> : <Navigate to="/dashboard" replace />} />
          <Route path="/field-staff"  element={<FieldStaffDashboard />} />
          <Route path="/alerts"       element={<Alerts />} />
          <Route path="/reports"      element={<Reports />} />
          {/* Unified devices view (Locators / Stickers / Offline tabs) */}
          <Route path="/devices"      element={<Devices />} />
          {/* Legacy redirects */}
          <Route path="/Homepage"     element={<Navigate to="/dashboard" replace />} />
          <Route path="/geofence"     element={<Navigate to="/fence" replace />} />
          <Route path="*"             element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
      </SidebarDevicesProvider>
      </FieldStaffCacheProvider>
      </ZoneCacheProvider>
      </ProfileCacheProvider>
      </UserCacheProvider>
      </DeviceCacheProvider>
    </AppCtx.Provider>
  )
}

// ── AppInner: handles auth gate, then delegates to AppShell ──────────────────
// Device loading is now done per-page via usePaginatedDevices (server-side).

function AppInner() {
  const { accessToken, user, isAdmin, logout } = useAuth()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [state, dispatch] = useReducer(reducer, {
    // locators/stickers are now empty — pages use usePaginatedDevices (server-side)
    // These empty arrays prevent crashes in secondary pages not yet migrated
    locators:   [],
    stickers:   [],
    detections: detectionEvents,
  })

  if (!accessToken) return <Login />

  // AlertsProvider wraps AppShell so AppShell can call useAlerts()
  return (
    <AlertsProvider>
      <AppShell
        state={state}
        dispatch={dispatch}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        user={user}
        isAdmin={isAdmin}
        logout={logout}
      />
    </AlertsProvider>
  )
}

export default function App() {
  return <AppInner />
}
