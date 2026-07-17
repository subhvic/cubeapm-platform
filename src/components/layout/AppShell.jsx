import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

/**
 * App shell: flex row - sidebar (fixed) + main (flex:1).
 * Main contains header (transparent, on canvas) and one surface-card
 * (the single large rounded card everything else lives inside).
 */
export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 mx-3 mb-3 overflow-hidden">
          <div className="h-full bg-card rounded-card border border-border-subtle overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
