import { NavLink, Outlet } from 'react-router'
import { strings } from '../strings'

/** The frame around every screen once first run is done. */
export function Layout() {
  return (
    <div className="layout">
      <header className="app-header">
        <span className="app-name">{strings.app.name}</span>
        <nav>
          <NavLink to="/" end>
            {strings.nav.home}
          </NavLink>
          <NavLink to="/materias">{strings.nav.subjects}</NavLink>
          <NavLink to="/ajustes">{strings.nav.settings}</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
