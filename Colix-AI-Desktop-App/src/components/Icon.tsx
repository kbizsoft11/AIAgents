export type IconName = 'plus' | 'folder' | 'bolt' | 'search' | 'user' | 'edit' | 'trash' | 'copy' | 'back' | 'grid' | 'book' | 'chevron' | 'logout'

export default function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string[]> = {
    plus: ['M12 5v14M5 12h14'],
    folder: ['M3 7.5A2.5 2.5 0 015.5 5H10l2 2h6.5A2.5 2.5 0 0121 9.5v7A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5z'],
    bolt: ['m13 2-9 11h7l-1 9 9-12h-7z'],
    search: ['m21 21-4.35-4.35', 'M11 18a7 7 0 110-14 7 7 0 010 14z'],
    user: ['M20 21a8 8 0 00-16 0', 'M12 13a4 4 0 100-8 4 4 0 000 8z'],
    edit: ['m4 16.5-.8 3.3 3.3-.8L18 7.5 15.5 5z', 'm14.5 6 2.5 2.5'],
    trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14'],
    copy: ['M8 8V5.5A2.5 2.5 0 0110.5 3h8A2.5 2.5 0 0121 5.5v8a2.5 2.5 0 01-2.5 2.5H16', 'M5.5 8h8A2.5 2.5 0 0116 10.5v8a2.5 2.5 0 01-2.5 2.5h-8A2.5 2.5 0 013 18.5v-8A2.5 2.5 0 015.5 8z'],
    back: ['m15 18-6-6 6-6', 'M9 12h11'],
    grid: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
    book: ['M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5z', 'M4 16.5A2.5 2.5 0 016.5 14H20'],
    chevron: ['m8 10 4 4 4-4'],
    logout: ['M10 17l5-5-5-5', 'M15 12H3', 'M21 19V5a2 2 0 00-2-2h-5'],
  }
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name].map((path, index) => <path key={index} d={path} />)}</svg>
}
