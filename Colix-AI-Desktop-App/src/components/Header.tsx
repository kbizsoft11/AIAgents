import logo from '../assets/logo.png'
import Icon from './Icon'

export interface HeaderProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  email: string | undefined
  onLogout: () => void | Promise<void>
  onHome: () => void
  onProfile: () => void
  onMarketplace: () => void
  onWorkspace?: () => void
  onTeams: () => void
  onGroups: () => void
}

export default function Header({ searchQuery, setSearchQuery, email, onLogout, onHome, onProfile, onMarketplace, onWorkspace, onTeams, onGroups }: HeaderProps) {
  const initial = email?.trim().charAt(0).toUpperCase() || 'U'
  return <header className="top-header">
    <button className="brand-mark" onClick={onHome} aria-label="Go to shortcuts home">
      <div className="flex justify-center items-center gap-3"><img className="w-12 h-12 rounded-full" src={logo} alt="ColixAI" /><span className="tracking-wide leading-0 text-white">ColixAI</span></div>
    </button>
    <div className="flex justify-center items-center"><button onClick={onMarketplace} className="text-white hover:opacity-78 bg-transparent border-0 cursor-pointer">Marketplace</button></div>
    {onWorkspace && <div className="flex justify-center items-center"><button onClick={onWorkspace} className="text-white hover:opacity-78 bg-transparent border-0 cursor-pointer">Workspace</button></div>}
    <div className="flex justify-center items-center"><button onClick={onTeams} className="text-white hover:opacity-78 bg-transparent border-0 cursor-pointer">Teams</button></div>
    <div className="flex justify-center items-center"><button onClick={onGroups} className="text-white hover:opacity-78 bg-transparent border-0 cursor-pointer">Groups</button></div>
    <div className="header-actions">
      <div className="header-search"><Icon name="search" size={16} /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search shortcuts..." /></div>
      <div className="profile-menu-wrap">
        <button className="profile-icon" aria-label="Open profile menu">{initial}</button>
        <div className="profile-menu">
          <div className="profile-menu-email">{email || 'Signed-in user'}</div>
          <button className="profile-menu-link" onClick={onProfile}><Icon name="user" size={15} /> Profile</button>
          <button className="profile-menu-link" onClick={() => { window.location.hash = '/app-controls' }}><Icon name="grid" size={15} /> App controls</button>
          <button onClick={() => void onLogout()}><Icon name="logout" size={15} /> Logout</button>
        </div>
      </div>
    </div>
  </header>
}
