import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutGrid, Users } from 'lucide-react'
import PillTabSwitcher from './PillTabSwitcher.jsx'

const TABS = [
  { key: '/dashboard',   label: 'Dashboard',             icon: LayoutGrid },
  { key: '/field-staff', label: 'Field Staff Analytics', icon: Users      },
]

export default function DashboardSwitcher() {
  const { pathname } = useLocation()
  const navigate     = useNavigate()

  if (!TABS.some(t => t.key === pathname)) return null

  return <PillTabSwitcher tabs={TABS} activeKey={pathname} onSelect={navigate} />
}
