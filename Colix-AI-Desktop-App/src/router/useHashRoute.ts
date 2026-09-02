import { useCallback, useEffect, useState } from 'react'

export type AppRoute = '/' | '/profile' | '/marketplace' | '/workspace' | '/app-controls' | '/teams' | '/groups' | '/shortcut/new' | `/shortcut/${string}`

const readRoute = (): AppRoute => {
  const value = window.location.hash.replace(/^#/, '') || '/'
  if (value === '/profile' || value === '/marketplace' || value === '/workspace' || value === '/app-controls' || value === '/teams' || value === '/groups' || value === '/shortcut/new' || value.startsWith('/shortcut/')) return value as AppRoute
  return '/'
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(readRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((nextRoute: AppRoute) => {
    if (window.location.hash !== `#${nextRoute}`) window.location.hash = nextRoute
    setRoute(nextRoute)
  }, [])

  return { route, navigate }
}
