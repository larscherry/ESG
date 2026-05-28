import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { api, setToken, isAuthenticated } from './lib/api'
import type { DataSource, IngestionBatch, AuditLog, AuthUser } from './lib/api'
import {
  LayoutGrid,
  FileUp,
  ClipboardList,
  LogOut,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Bell,
  Building2,
  Layers,
  Activity,
  Zap,
  Trash2,
  Droplet,
  Wind,
  Trees,
  Building,
  BarChart3,
  User,
  Settings,
  HelpCircle,
  BellDot,
} from 'lucide-react'

export type LayoutContext = {
  esgTab: string
  categoryFilter: string
  sourceFilter: number | null
  pendingCount: number
}

const RAIL_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboard', path: '/' },
  { icon: FileUp, label: 'Upload', path: '/upload' },
  { icon: ClipboardList, label: 'Review', path: '/review' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
]

const NAV_TABS = [
  { label: 'DATA ENTRY', path: '/upload', icon: FileUp },
  { label: 'TRACKER', path: '/', icon: LayoutGrid },
  { label: 'ANALYTICS', path: '/analytics', icon: BarChart3 },
]

const ESG_TABS = ['Environment', 'Social', 'Governance']

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [esgTab, setEsgTab] = useState('Environment')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState<number | null>(null)
  const [sources, setSources] = useState<DataSource[]>([])
  const [batches, setBatches] = useState<IngestionBatch[]>([])
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bellDropdownOpen, setBellDropdownOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([])
  const sourceDropdownRef = useRef<HTMLDivElement>(null)
  const bellDropdownRef = useRef<HTMLDivElement>(null)
  const profileDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAuthenticated()) return
    api.getMe().then(setUser).catch(() => {})
    api.getSources().then((s) => setSources(s.results)).catch(() => {})
    api.getBatches().then((b) => setBatches(b.results)).catch(() => {})
    api.getAuditLogs().then((l) => setRecentLogs(l.results.slice(0, 5))).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target as Node)) {
        setSourceDropdownOpen(false)
      }
      if (bellDropdownRef.current && !bellDropdownRef.current.contains(e.target as Node)) {
        setBellDropdownOpen(false)
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pendingCount = batches.filter((b) => b.status === 'staged').length
  const currentSource = sources.find((s) => s.id === sourceFilter)
  const categoryItems = location.pathname === '/upload'
    ? [
        { icon: FileUp, label: 'Upload Data', active: true, action: () => {} },
        { icon: Layers, label: 'Ingestion History', active: false, action: () => navigate('/') },
      ]
    : location.pathname === '/review'
    ? [
        { icon: ClipboardList, label: 'Record Review', active: true, action: () => {} },
        { icon: Activity, label: 'Audit Trail', active: false, action: () => navigate('/') },
      ]
    : location.pathname === '/analytics'
    ? [
        { icon: BarChart3, label: 'Overview', active: true, action: () => {} },
        { icon: Activity, label: 'Trends', active: false, action: () => {} },
      ]
    : [
        { icon: Zap, label: 'Energy', count: 6, active: categoryFilter === 'Energy', action: () => setCategoryFilter(categoryFilter === 'Energy' ? '' : 'Energy') },
        { icon: Trash2, label: 'Waste', count: 8, active: categoryFilter === 'Waste', action: () => setCategoryFilter(categoryFilter === 'Waste' ? '' : 'Waste') },
        { icon: Droplet, label: 'Water', count: 14, active: categoryFilter === 'Water', action: () => setCategoryFilter(categoryFilter === 'Water' ? '' : 'Water') },
        { icon: Wind, label: 'Air', active: categoryFilter === 'Air', action: () => setCategoryFilter(categoryFilter === 'Air' ? '' : 'Air') },
        { icon: Trees, label: 'Biodiversity', active: categoryFilter === 'Biodiversity', action: () => setCategoryFilter(categoryFilter === 'Biodiversity' ? '' : 'Biodiversity') },
        { icon: Building, label: 'GHG Emissions', active: categoryFilter === 'GHG Emissions', action: () => setCategoryFilter(categoryFilter === 'GHG Emissions' ? '' : 'GHG Emissions') },
      ]

  const ctx: LayoutContext = { esgTab, categoryFilter, sourceFilter, pendingCount }

  return (
    <div className="min-h-screen bg-white flex font-['Inter',system-ui,sans-serif] text-[#1a1a1a] antialiased">
      {/* Left rail */}
      <aside className="w-[60px] bg-[#0d0d0d] flex flex-col items-center py-4 gap-1 relative flex-shrink-0">
        <div className="h-9 w-9 rounded-md flex items-center justify-center mb-3">
          <div className="h-7 w-7 rounded bg-[#1ea97c] flex items-center justify-center text-white font-bold text-sm">▷</div>
        </div>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-12 h-6 w-6 rounded-full bg-[#0d0d0d] border border-[#333] flex items-center justify-center text-white cursor-pointer hover:border-[#555] transition-colors z-10"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        <div className="mt-6 flex flex-col gap-1">
          {RAIL_ITEMS.map((item) => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`h-10 w-10 rounded-md flex items-center justify-center transition-colors ${
                  active ? 'text-[#1ea97c] bg-[#1ea97c]/10' : 'text-[#7a7a7a] hover:text-white hover:bg-white/5'
                }`}
                title={item.label}
              >
                <item.icon className="h-[18px] w-[18px]" />
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => { setToken(null); navigate('/login') }}
          className="h-10 w-10 rounded-md flex items-center justify-center text-[#e94e1b] hover:bg-[#e94e1b]/10 transition-colors"
          title="Logout"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-[70px] flex items-center justify-between px-6 border-b border-[#eef0f2] flex-shrink-0 bg-white">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded bg-[#1ea97c] flex items-center justify-center text-white font-bold text-sm">▷</div>
              <span className="font-bold text-[16px] text-[#1a1a1a]">Breathe ESG</span>
            </div>
            <div className="relative" ref={sourceDropdownRef}>
              <button
                onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
                className="flex items-center gap-2 h-9 px-3 rounded-md border border-[#d1d5db] text-sm font-semibold text-[#4b5563] hover:border-[#1ea97c] hover:text-[#1ea97c] transition-colors"
              >
                <Building2 className="h-4 w-4" />
                {currentSource ? currentSource.name : 'All Sources'}
                <ChevronDown className="h-4 w-4 ml-6" />
              </button>
              {sourceDropdownOpen && (
                <div className="absolute top-full mt-1 left-0 w-56 bg-white rounded-xl border border-[#d1d5db] shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => { setSourceFilter(null); setSourceDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${!currentSource ? 'bg-[#e8f6ef] text-[#1ea97c] font-semibold' : 'text-[#4b5563] hover:bg-[#f7f8fa]'}`}
                  >
                    All Sources
                  </button>
                  {sources.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSourceFilter(s.id); setSourceDropdownOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${sourceFilter === s.id ? 'bg-[#e8f6ef] text-[#1ea97c] font-semibold' : 'text-[#4b5563] hover:bg-[#f7f8fa]'}`}
                    >
                      <span className="text-xs text-[#9ca3af] mr-2 font-medium">{s.source_type.replace(/_/g, ' ')}</span>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5">
            {/* Notification bell */}
            <div className="relative" ref={bellDropdownRef}>
              <button
                onClick={() => setBellDropdownOpen(!bellDropdownOpen)}
                className={`relative p-1.5 rounded-lg transition-colors ${bellDropdownOpen ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                title="Notifications"
              >
                {pendingCount > 0 ? <BellDot className="h-5 w-5 text-[#1a1a1a]" /> : <Bell className="h-5 w-5 text-[#1a1a1a]" />}
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-[#e94e1b] text-white text-[9px] font-bold flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
              {bellDropdownOpen && (
                <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-xl border border-[#d1d5db] shadow-lg z-50 py-2">
                  <div className="px-4 py-2 border-b border-[#eef0f2]">
                    <p className="text-sm font-bold text-[#1a1a1a]">Notifications</p>
                  </div>
                  {pendingCount > 0 && (
                    <button
                      onClick={() => { setBellDropdownOpen(false); navigate('/review') }}
                      className="w-full text-left px-4 py-3 text-sm text-[#4b5563] hover:bg-[#f7f8fa] flex items-center gap-3 transition-colors"
                    >
                      <span className="h-2 w-2 rounded-full bg-[#e94e1b] flex-shrink-0" />
                      <span><strong>{pendingCount}</strong> batch{pendingCount > 1 ? 'es' : ''} pending review</span>
                    </button>
                  )}
                  {recentLogs.map((log) => (
                    <div key={log.id} className="px-4 py-3 text-sm text-[#6b7280] hover:bg-[#f7f8fa] transition-colors">
                      <div className="flex items-start gap-3">
                        <span className="h-2 w-2 rounded-full bg-[#1ea97c] mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-[#4b5563] font-medium">{log.action.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-[#9ca3af] mt-0.5">{log.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {pendingCount === 0 && recentLogs.length === 0 && (
                    <div className="px-4 py-6 text-sm text-[#9ca3af] text-center">No recent notifications</div>
                  )}
                  <div className="border-t border-[#eef0f2] mt-1">
                    <button
                      onClick={() => { setBellDropdownOpen(false); navigate('/review') }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-[#1ea97c] hover:bg-[#f7f8fa] transition-colors"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Profile section */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${profileDropdownOpen ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#1ea97c] to-[#14b8a6] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {(user?.username || '?')[0].toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-semibold text-[#1a1a1a]">{user?.username || 'User'}</p>
                  <p className="text-[11px] text-[#9ca3af] font-medium">{user?.email || ''}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
              </button>
              {profileDropdownOpen && (
                <div className="absolute top-full mt-2 right-0 w-56 bg-white rounded-xl border border-[#d1d5db] shadow-lg z-50 py-2">
                  <div className="px-4 py-3 border-b border-[#eef0f2]">
                    <p className="text-sm font-bold text-[#1a1a1a]">{user?.username || 'User'}</p>
                    <p className="text-xs text-[#9ca3af]">{user?.email || ''}</p>
                  </div>
                  <button className="w-full text-left px-4 py-2.5 text-sm text-[#4b5563] hover:bg-[#f7f8fa] flex items-center gap-3 transition-colors">
                    <User className="h-4 w-4 text-[#9ca3af]" />
                    My Profile
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm text-[#4b5563] hover:bg-[#f7f8fa] flex items-center gap-3 transition-colors">
                    <Settings className="h-4 w-4 text-[#9ca3af]" />
                    Settings
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm text-[#4b5563] hover:bg-[#f7f8fa] flex items-center gap-3 transition-colors">
                    <HelpCircle className="h-4 w-4 text-[#9ca3af]" />
                    Help & Support
                  </button>
                  <div className="border-t border-[#eef0f2] mt-1 pt-1">
                    <button
                      onClick={() => { setToken(null); navigate('/login') }}
                      className="w-full text-left px-4 py-2.5 text-sm text-[#e94e1b] hover:bg-red-50 flex items-center gap-3 transition-colors font-semibold"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Sub-nav */}
        <div className="flex items-center justify-between px-6 border-b border-[#eef0f2] flex-shrink-0 bg-white">
          <div className="flex items-center gap-8">
            {NAV_TABS.map((t) => {
              const active = location.pathname === t.path
              return (
                <button
                  key={t.label}
                  onClick={() => navigate(t.path)}
                  className={`flex items-center gap-2 text-sm font-bold pb-3 -mb-4 pt-3 transition-colors ${
                    active ? 'text-[#1ea97c] border-b-2 border-[#1ea97c]' : 'text-[#9ca3af] hover:text-[#6b7280]'
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ESG tabs */}
        <div className="flex items-center justify-between px-6 border-b border-[#eef0f2] flex-shrink-0 bg-white">
          <div className="flex items-center gap-8">
            {ESG_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setEsgTab(t)}
                className={`py-3 text-sm font-bold relative transition-colors ${
                  esgTab === t ? 'text-[#1ea97c]' : 'text-[#9ca3af] hover:text-[#6b7280]'
                }`}
              >
                {t}
                {esgTab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#1ea97c]" />}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#9ca3af] font-medium">
            Autosaved at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {!sidebarCollapsed && (
            <aside className="w-[220px] border-r border-[#eef0f2] p-4 flex flex-col gap-1 flex-shrink-0 overflow-y-auto">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-2 px-3">
                {location.pathname === '/upload' ? 'Data Entry' : location.pathname === '/review' ? 'Review' : location.pathname === '/analytics' ? 'Analytics' : 'Environment'}
              </p>
              {categoryItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    item.active ? 'bg-[#e8f6ef] text-[#1ea97c] font-bold' : 'text-[#4b5563] hover:bg-[#f0f9f4] hover:text-[#1ea97c]'
                  }`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {item.label}
                    {'count' in item && item.count !== undefined ? ` (${item.count})` : ''}
                  </span>
                </button>
              ))}
            </aside>
          )}
          <section className="flex-1 overflow-y-auto p-6">
            <Outlet context={ctx} />
          </section>
        </div>
      </div>
    </div>
  )
}
