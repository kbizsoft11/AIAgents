import React, { useEffect, useMemo, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import './App.css'
import LoginScreen from './components/LoginScreen'
import ShortcutForm from './components/ShortcutForm'
import { supabase } from './services/authService'
import { ipcService } from './services/ipcService'
import { shortcutService } from './services/shortcutService'
import { storageManager } from './utils/storageManager'
import { Shortcut, ShortcutFolder, ShortcutInput } from './types/shortcut'
import logo from "./assets/logo.png"
import { richTextToPlainText } from './utils/richText'
import supportReply from "./assets/marketplace/support-reply.png";
import costEstimate from "./assets/marketplace/cost-estimate.png";
import jobApplication from "./assets/marketplace/job-application.png";
import meetingNotes from "./assets/marketplace/meeting-notes.png";
import projectHandover from "./assets/marketplace/project-handover.png";
import medicalForm from "./assets/marketplace/medical-form.png";
import { groupService, type Group } from "./services/groupService";
import Icon, { type IconName } from './components/Icon'
import Header from './components/Header'
import { useHashRoute } from './router/useHashRoute'
import { workspaceService, type WorkspaceInvitation, type WorkspaceMember } from './services/workspaceService'

const shortcutDisplayName = (shortcut: Shortcut) => shortcut.label.trim() || shortcut.name

function App() {
  const { route, navigate } = useHashRoute()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [folders, setFolders] = useState<ShortcutFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<ShortcutInput | undefined>()
  const [searchQuery, setSearchQuery] = useState('')
  const [testText, setTestText] = useState('')
  const [isHookActive, setIsHookActive] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [draggedShortcutId, setDraggedShortcutId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; shortcut: Shortcut } | null>(null)
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename'; folderId?: string; name: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void | Promise<void> } | null>(null)
  const [isPasteEnabled, setIsPasteEnabled] = useState(true)
  // Groups state
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupDialog, setGroupDialog] = useState<{ mode: 'create' | 'edit'; groupId?: string; name: string; description: string } | null>(null)

  useEffect(() => {
    try {
      const storedControls = window.localStorage.getItem('colixai-app-controls')
      if (storedControls) void ipcService.setAppControls(JSON.parse(storedControls) as Record<string, boolean>)
    } catch (error) {
      console.error('Unable to restore application controls:', error)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const notify = (message: string) => {
    setNotification(message)
    window.setTimeout(() => setNotification(null), 2800)
  }

  useEffect(() => {
    if (!session) return
    const loadedFolders = storageManager.getAllFolders()
    setFolders(loadedFolders)
    setActiveFolderId(loadedFolders[0]?.id || '')

    let cancelled = false
    const loadShortcuts = async () => {
      if (!supabase) return
      try {
        const customUserId = await shortcutService.getProfileUserId(supabase, session.user.email)
        if (cancelled) return
        setProfileUserId(customUserId)
        const loadedShortcuts = await shortcutService.getAll(supabase, customUserId)
        if (cancelled) return
        setShortcuts(loadedShortcuts)
        window.setTimeout(() => startKeyboardHook(loadedShortcuts), 500)
      } catch (error) {
        console.error('Error loading shortcuts from Supabase:', error)
        const details = error as { message?: string; code?: string }
        notify(details.code ? `Unable to load records (${details.code})` : `Unable to load records: ${details.message || 'Supabase request failed'}`)
      }
    }
    void loadShortcuts()
    ipcService.onKeyboardHookReady(setIsHookActive)
    ipcService.onShortcutTriggered(trigger => notify(`Triggered ${trigger}`))
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null)
    window.addEventListener('click', closeContextMenu)
    window.addEventListener('blur', closeContextMenu)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('blur', closeContextMenu)
    }
  }, [])

  // Load groups when Groups view is shown
  useEffect(() => {
    if (route !== '/groups') return
    const workspaceId = 'be0df420-f9f7-4ad2-a716-48ea4355175e'
    void (async () => {
      try {
        setGroupsLoading(true)
        const data = await groupService.getAll(workspaceId)
        setGroups(data)
        setSelectedGroupId(current => current && data.some(group => group.id === current) ? current : data[0]?.id || null)
      } catch (e) {
        console.error('Failed to load groups', e)
        notify && notify('Unable to load groups')
      } finally {
        setGroupsLoading(false)
      }
    })()
  }, [route])

  useEffect(() => {
    if (route === '/shortcut/new') {
      setEditingId(null)
      setEditingData(undefined)
      return
    }
    if (!route.startsWith('/shortcut/')) return
    const shortcut = shortcuts.find(item => item.id === route.slice('/shortcut/'.length))
    if (shortcut) {
      setEditingId(shortcut.id)
      setEditingData({ name: shortcut.name, label: shortcut.label, content: shortcut.content })
    }
  }, [route, shortcuts])

  const startKeyboardHook = async (items: Shortcut[]) => {
    const result = await ipcService.startKeyboardHook(items)
    if (result.success) setIsHookActive(true)
  }

  const activeFolder = folders.find(folder => folder.id === activeFolderId)
  const visibleShortcuts = useMemo(() => shortcuts.filter(shortcut => {
    const inFolder = shortcut.folderId === activeFolderId || (!shortcut.folderId && activeFolderId === folders[0]?.id)
    const query = searchQuery.toLowerCase()
    return inFolder && (!query || shortcut.name.toLowerCase().includes(query) || shortcut.label.toLowerCase().includes(query) || richTextToPlainText(shortcut.content).toLowerCase().includes(query))
  }), [activeFolderId, folders, searchQuery, shortcuts])

  const openCreate = () => {
    setEditingId(null)
    setEditingData(undefined)
    navigate('/shortcut/new')
  }

  const openEdit = (shortcut: Shortcut) => {
    setEditingId(shortcut.id)
    setEditingData({ name: shortcut.name, label: shortcut.label, content: shortcut.content })
    navigate(`/shortcut/${shortcut.id}`)
  }

  const finishEditor = () => {
    navigate('/')
    setEditingId(null)
    setEditingData(undefined)
  }

  const handleSave = async (data: ShortcutInput) => {
    if (!supabase || !session || !profileUserId) return
    try {
      if (editingId) {
        const updated = await shortcutService.update(supabase, profileUserId, editingId, data)
        const next = shortcuts.map(shortcut => shortcut.id === editingId ? updated : shortcut)
        setShortcuts(next)
        void ipcService.updateShortcuts(next)
        notify('Shortcut updated')
      } else {
        const created = await shortcutService.create(supabase, profileUserId, session.user.email, data, activeFolderId || folders[0]?.id)
        const next = [...shortcuts, created]
        setShortcuts(next)
        void ipcService.updateShortcuts(next)
        void startKeyboardHook(next)
        notify('Shortcut created')
      }
      finishEditor()
    } catch (error) {
      console.error('Error saving shortcut to Supabase:', error)
      const details = error as { message?: string; code?: string }
      notify(details.code ? `Unable to save shortcut (${details.code})` : `Unable to save shortcut: ${details.message || 'Supabase request failed'}`)
    }
  }

  const deleteShortcut = async (id: string) => {
    if (!supabase || !session || !profileUserId) return
    try {
      await shortcutService.remove(supabase, profileUserId, id)
      const next = shortcuts.filter(shortcut => shortcut.id !== id)
      setShortcuts(next)
      void ipcService.updateShortcuts(next)
      if (editingId === id) finishEditor()
      notify('Shortcut deleted')
    } catch (error) {
      console.error('Error deleting shortcut from Supabase:', error)
      notify('Unable to delete shortcut')
    }
  }

  const deleteVisibleShortcuts = async () => {
    if (!visibleShortcuts.length) return
    if (!supabase || !session || !profileUserId) return
    try {
      await Promise.all(visibleShortcuts.map(shortcut => shortcutService.remove(supabase!, profileUserId, shortcut.id)))
    } catch (error) {
      console.error('Error deleting shortcuts from Supabase:', error)
      notify('Unable to delete all shortcuts')
      return
    }
    const deletedIds = new Set(visibleShortcuts.map(shortcut => shortcut.id))
    const next = shortcuts.filter(shortcut => !deletedIds.has(shortcut.id))
    setShortcuts(next)
    void ipcService.updateShortcuts(next)
    notify('Shortcuts deleted')
  }

  const requestDeleteShortcut = (shortcut: Shortcut) => {
    setConfirmDialog({
      title: 'Delete shortcut?',
      message: `This will permanently remove "${shortcutDisplayName(shortcut)}" from your shortcuts.`,
      confirmLabel: 'Delete shortcut',
      onConfirm: () => deleteShortcut(shortcut.id),
    })
  }

  const requestDeleteVisibleShortcuts = () => {
    if (!visibleShortcuts.length) return
    setConfirmDialog({
      title: 'Delete all visible shortcuts?',
      message: `This will remove ${visibleShortcuts.length} shortcut${visibleShortcuts.length === 1 ? '' : 's'} from this folder.`,
      confirmLabel: 'Delete all',
      onConfirm: deleteVisibleShortcuts,
    })
  }

  const createFolder = () => {
    setFolderDialog({ mode: 'create', name: '' })
  }

  const renameFolder = (folder: ShortcutFolder) => {
    setFolderDialog({ mode: 'rename', folderId: folder.id, name: folder.name })
  }

  const saveFolder = () => {
    const name = folderDialog?.name.trim()
    if (!folderDialog || !name) return
    if (folderDialog.mode === 'create') {
      const folder = storageManager.addFolder(name)
      setFolders(previous => [...previous, folder])
      setActiveFolderId(folder.id)
      notify('Folder created')
    } else if (folderDialog.folderId && storageManager.renameFolder(folderDialog.folderId, name)) {
      setFolders(previous => previous.map(item => item.id === folderDialog.folderId ? { ...item, name } : item))
      notify('Folder renamed')
    }
    setFolderDialog(null)
  }

  const deleteFolder = async (folder: ShortcutFolder) => {
    if (folders.length <= 1 || !window.confirm(`Delete the ${folder.name} folder?`)) return
    const fallback = folders.find(item => item.id !== folder.id)
    if (!fallback) return
    if (supabase && session && profileUserId) {
      try {
        await Promise.all(shortcuts.filter(shortcut => shortcut.folderId === folder.id).map(shortcut => shortcutService.move(supabase!, profileUserId, shortcut.id, fallback.id)))
      } catch (error) {
        console.error('Error moving shortcuts while deleting folder:', error)
        notify('Unable to delete folder')
        return
      }
    }
    storageManager.deleteFolder(folder.id)
    setShortcuts(previous => previous.map(shortcut => shortcut.folderId === folder.id ? { ...shortcut, folderId: fallback.id } : shortcut))
    setFolders(previous => previous.filter(item => item.id !== folder.id))
    setActiveFolderId(fallback.id)
  }

  const moveShortcut = async (folderId: string) => {
    if (!draggedShortcutId || draggedShortcutId === folderId) return
    if (!supabase || !session || !profileUserId) return
    try {
      await shortcutService.move(supabase, profileUserId, draggedShortcutId, folderId)
      setShortcuts(previous => previous.map(shortcut => shortcut.id === draggedShortcutId ? { ...shortcut, folderId } : shortcut))
      notify('Shortcut moved')
    } catch (error) {
      console.error('Error moving shortcut in Supabase:', error)
      notify('Unable to move shortcut')
    }
    setDraggedShortcutId(null)
  }

  const showShortcutContextMenu = (x: number, y: number, shortcut: Shortcut) => {
    setContextMenu({ x, y, shortcut })
  }

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
    setProfileUserId(null)
  }

  if (authLoading) {
    return <main className="auth-screen">
      <div className="auth-loading">
        <img className="w-26 h-26 rounded-full" src={logo} alt="ColixAI" />
      </div>
    </main>
  }

  if (!session) return <LoginScreen />

  if (route === '/marketplace') {
    return <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
      <MarketplaceView onBack={() => navigate('/')} shortcuts={shortcuts} folders={folders} onSetFolders={setFolders} onAddTemplate={async (data, folderId) => {
        if (!supabase || !session || !profileUserId) return
        try {
          const created = await shortcutService.create(supabase, profileUserId, session.user.email, data, folderId || activeFolderId || folders[0]?.id)
          const next = [...shortcuts, created]
          setShortcuts(next)
          void ipcService.updateShortcuts(next)
          void startKeyboardHook(next)
        } catch (error) {
          console.error('Error adding template:', error)
          throw error
        }
      }} notify={notify} />
      {notification && <div className="toast">{notification}</div>}
    </div>
  }

  if (route === '/profile') {
    return <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
      <ProfileView session={session} onBack={() => navigate('/')} onSaved={updatedSession => setSession(updatedSession)} notify={notify} />
      {notification && <div className="toast">{notification}</div>}
    </div>
  }

  if (route === '/teams') {
    return <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
      <TeamsView onBack={() => navigate('/')} />
      {notification && <div className="toast">{notification}</div>}
    </div>
  }

  if (route === '/workspace') {
    return <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
      <WorkspaceView email={session.user.email || 'abhishekkumarphp.kbizsoft@gmail.com'} onBack={() => navigate('/')} />
      {notification && <div className="toast">{notification}</div>}
    </div>
  }

  if (route === '/app-controls') {
    return <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
      <AppControlsView onBack={() => navigate('/')} />
      {notification && <div className="toast">{notification}</div>}
    </div>
  }

  if (route === '/groups') {
    return (
      <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
        <GroupsView
          onBack={() => navigate('/')}
          groups={groups}
          groupsLoading={groupsLoading}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          openCreateGroup={() => setGroupDialog({ mode: 'create', name: '', description: '' })}
          openEditGroup={group => setGroupDialog({ mode: 'edit', groupId: group.id, name: group.name, description: group.description })}
          onDeleteGroup={async group => {
            if (!window.confirm(`Delete the ${group.name} group?`)) return
            try {
              await groupService.remove('be0df420-f9f7-4ad2-a716-48ea435517e5', group.id)
              const refreshed = await groupService.getAll('be0df420-f9f7-4ad2-a716-48ea435517e5')
              setGroups(refreshed)
              setSelectedGroupId(refreshed[0]?.id || null)
              notify('Group deleted')
            } catch (error) {
              console.error('Error deleting group', error)
              notify('Unable to delete group')
            }
          }}
        />
        <GroupDialog
          dialog={groupDialog}
          setDialog={setGroupDialog}
          onCreated={async () => {
            const refreshed = await groupService.getAll('be0df420-f9f7-4ad2-a716-48ea4355175e')
            setGroups(refreshed)
            setSelectedGroupId(current => current || refreshed[0]?.id || null)
            notify('Group created')
          }}
        />
        {notification && <div className="toast">{notification}</div>}
      </div>
    );
  }

  if (route === '/shortcut/new' || route.startsWith('/shortcut/')) {
    return (
      <div className="app-shell">
        <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={finishEditor} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
        <div className="workspace editor-workspace">
          <Sidebar folders={folders} shortcuts={shortcuts} activeFolderId={activeFolderId} setActiveFolderId={setActiveFolderId} onCreateFolder={createFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} onCreateShortcut={openCreate} onEdit={openEdit} onDragStart={setDraggedShortcutId} onDrop={moveShortcut} onContextMenu={showShortcutContextMenu} />
          <main className="editor-main"><ShortcutForm key={editingId || 'new'} isEditing={Boolean(editingId)} initialData={editingData} availableShortcuts={shortcuts} currentShortcutId={editingId} onSubmit={handleSave} onCancel={finishEditor} /></main>
        </div>
        {notification && <div className="toast">{notification}</div>}
        {folderDialog && <FolderDialog dialog={folderDialog} setDialog={setFolderDialog} onSave={saveFolder} />}
        {contextMenu && <div className="shortcut-context-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 190), top: Math.min(contextMenu.y, window.innerHeight - 125) }} onClick={event => event.stopPropagation()}><div className="context-menu-title">{shortcutDisplayName(contextMenu.shortcut)}</div><button onClick={() => { openEdit(contextMenu.shortcut); setContextMenu(null) }}><Icon name="edit" size={15} /> Edit shortcut</button><button onClick={() => { void ipcService.copyRichText(contextMenu.shortcut.content); notify('Copied to clipboard'); setContextMenu(null) }}><Icon name="copy" size={15} /> Copy content</button><button className="context-delete" onClick={() => { requestDeleteShortcut(contextMenu.shortcut); setContextMenu(null) }}><Icon name="trash" size={15} /> Delete shortcut</button></div>}
        {confirmDialog && <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} email={session.user.email} onLogout={handleLogout} onHome={() => navigate('/')} onProfile={() => navigate('/profile')} onMarketplace={() => navigate('/marketplace')} onWorkspace={() => navigate('/workspace')} onTeams={() => navigate('/teams')} onGroups={() => navigate('/groups')} />
      <div className="workspace">
        <Sidebar folders={folders} shortcuts={shortcuts} activeFolderId={activeFolderId} setActiveFolderId={setActiveFolderId} onCreateFolder={createFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} onCreateShortcut={openCreate} onEdit={openEdit} onDragStart={setDraggedShortcutId} onDrop={moveShortcut} onContextMenu={showShortcutContextMenu} />
        <main className="dashboard-main">
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: '24px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontWeight: 500, color: '#142033', fontSize: '14px' }}>Active</label>
              <button
                onClick={() => {
                  setIsPasteEnabled(!isPasteEnabled)
                  void ipcService.togglePaste(!isPasteEnabled)
                }}
                style={{
                  width: '60px',
                  height: '34px',
                  borderRadius: '17px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isPasteEnabled ? '#10b981' : '#d1d5db',
                  transition: 'background-color 0.2s',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: isPasteEnabled ? '29px' : '3px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '14px',
                    backgroundColor: 'white',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                />
              </button>
              <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '4px' }}>
                {isPasteEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
          <div className="page-heading"><div><h1>{activeFolder?.name || 'My Shortcuts'} <span>{visibleShortcuts.length}</span></h1><p>Type a shortcut below to test it before using it anywhere on your computer.</p></div><button className="button button-danger" onClick={requestDeleteVisibleShortcuts}><Icon name="trash" size={15} /> Delete all</button></div>
          <section className="welcome-card">
            <h2 className="font-mono font-semibold">Welcome to ColixAI</h2>
            <p>Type a shortcut trigger below, such as <code>-ty</code> or <code>@email</code>. It will instantly expand into text.</p>
            <textarea className="test-area" value={testText} onFocus={() => ipcService.setShortcutTestFocused(true)} onBlur={() => ipcService.setShortcutTestFocused(false)} onChange={event => setTestText(event.target.value)} placeholder="Type here to test your shortcuts live... (e.g. -ty)" />
            <p className="helper-text">Your shortcuts work in Notepad, browsers, editors, and other apps while the hook is <strong className={isHookActive ? 'status-online' : 'status-offline'}>{isHookActive ? 'active' : 'inactive'}</strong>.</p>
          </section>
          <section className="quick-actions"><strong>Quick actions:</strong><button className="button button-primary" onClick={openCreate}><Icon name="plus" size={15} /> New shortcut</button><button className="button button-light" onClick={createFolder}><Icon name="folder" size={15} /> New folder</button></section>
          <section className="shortcut-grid">
            {visibleShortcuts.map(shortcut => <article className="shortcut-card" key={shortcut.id} draggable onDragStart={() => setDraggedShortcutId(shortcut.id)}><div className="shortcut-card-top"><span className="bolt"><Icon name="bolt" size={16} /></span><div><h3>{shortcutDisplayName(shortcut)}</h3><code>{shortcut.name}</code></div><button className="icon-button" onClick={() => openEdit(shortcut)} aria-label="Edit shortcut"><Icon name="edit" size={16} /></button></div><p>{richTextToPlainText(shortcut.content)}</p><div className="card-actions"><button onClick={() => ipcService.copyRichText(shortcut.content).then(() => notify('Copied to clipboard'))}><Icon name="copy" size={14} /> Copy</button><button className="delete-link" onClick={() => requestDeleteShortcut(shortcut)}><Icon name="trash" size={14} /> Delete</button></div></article>)}
            {!visibleShortcuts.length && <div className="empty-state"><div className="empty-icon"><Icon name="bolt" /></div><h3>No shortcuts in this folder</h3><p>Create a shortcut or drag one here from another folder.</p><button className="button button-primary" onClick={openCreate}><Icon name="plus" size={15} /> Create shortcut</button></div>}
          </section>
        </main>
        <DocsPanel />
      </div>
      {notification && <div className="toast">{notification}</div>}
      {folderDialog && <FolderDialog dialog={folderDialog} setDialog={setFolderDialog} onSave={saveFolder} />}
      {contextMenu && <div className="shortcut-context-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 190), top: Math.min(contextMenu.y, window.innerHeight - 125) }} onClick={event => event.stopPropagation()}><div className="context-menu-title">{shortcutDisplayName(contextMenu.shortcut)}</div><button onClick={() => { openEdit(contextMenu.shortcut); setContextMenu(null) }}><Icon name="edit" size={15} /> Edit shortcut</button><button onClick={() => { void ipcService.copyRichText(contextMenu.shortcut.content); notify('Copied to clipboard'); setContextMenu(null) }}><Icon name="copy" size={15} /> Copy content</button><button className="context-delete" onClick={() => { requestDeleteShortcut(contextMenu.shortcut); setContextMenu(null) }}><Icon name="trash" size={15} /> Delete shortcut</button></div>}
      {confirmDialog && <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />}
    </div>
  )
}

function ProfileView({ session, onBack, onSaved, notify }: { session: Session; onBack: () => void; onSaved: (session: Session) => void; notify: (message: string) => void }) {
  const metadata = session.user.user_metadata as { first_name?: string; last_name?: string }
  const [firstName, setFirstName] = useState(metadata.first_name || '')
  const [lastName, setLastName] = useState(metadata.last_name || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password && password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!supabase) return
    setIsSaving(true)
    const update: { data: { first_name: string; last_name: string }; password?: string } = { data: { first_name: firstName.trim(), last_name: lastName.trim() } }
    if (password) update.password = password
    const { data, error: updateError } = await supabase.auth.updateUser(update)
    setIsSaving(false)
    if (updateError || !data.user) {
      setError(updateError?.message || 'Unable to update profile.')
      return
    }
    onSaved({ ...session, user: data.user })
    setPassword('')
    setConfirmPassword('')
    notify('Profile updated')
  }

  return <main className="profile-main">
    <section className="profile-card">
      <div className="profile-heading"><div><button type="button" className="back-button" onClick={onBack}>← Back</button><h1>Profile</h1><p>Update your name and password.</p></div><div className="profile-avatar">{(firstName || session.user.email || 'U').charAt(0).toUpperCase()}</div></div>
      <form className="profile-form" onSubmit={saveProfile}>
        <div className="profile-section"><h2>Personal details</h2><label>First name<input value={firstName} onChange={event => setFirstName(event.target.value)} placeholder="First name" /></label><label>Last name<input value={lastName} onChange={event => setLastName(event.target.value)} placeholder="Last name" /></label><label>Email<input value={session.user.email || ''} readOnly /></label></div>
        <div className="profile-section"><h2>Change password</h2><p className="profile-muted">Leave these fields empty to keep your current password.</p><label>New password<input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="New password" autoComplete="new-password" /></label><label>Confirm password<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirm new password" autoComplete="new-password" /></label></div>
        {error && <p className="profile-error" role="alert">{error}</p>}
        <div className="profile-actions"><button type="button" className="button button-light" onClick={onBack}>Cancel</button><button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save changes'}</button></div>
      </form>
    </section>
  </main>
}

function GroupsView({ onBack, groups, groupsLoading, selectedGroupId, onSelectGroup, openCreateGroup, openEditGroup, onDeleteGroup }: { onBack: () => void; groups: Group[]; groupsLoading: boolean; selectedGroupId: string | null; onSelectGroup: (id: string) => void; openCreateGroup: () => void; openEditGroup: (group: Group) => void; onDeleteGroup: (group: Group) => void | Promise<void> }) {
  const selectedGroup = groups.find(group => group.id === selectedGroupId) || groups[0]

  return (
    <main className="groups-main">
      <section className="groups-container">
        <div className="groups-header">
          <div>
            <h2 className="groups-header-label">WORKSPACE GROUPS</h2>
            <h1 className="groups-title">Organize access by team.</h1>
            <p className="groups-subtitle">Create focused groups for HR, IT, Sales, and the people behind each one.</p>
          </div>
          <div className="groups-workspace-selector">
            <label className="groups-workspace-label">Workspace</label>
            <select className="groups-workspace-dropdown">
              <option>Workspace</option>
            </select>
          </div>
        </div>

        <div className="groups-content">
          {/* Left Panel - Groups List */}
          <div className="groups-left-panel">
            <div className="groups-list-header">
              <h3 className="groups-list-title">Your groups</h3>
              <p className="groups-count">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</p>
              <button className="groups-new-button" onClick={openCreateGroup}>+ New</button>
            </div>
            {groupsLoading ? (
              <div className="groups-skeleton-list" aria-label="Loading groups"><div className="group-skeleton group-skeleton-selected" /><div className="group-skeleton" /><div className="group-skeleton" /></div>
            ) : groups.length === 0 ? (
              <div className="groups-empty-state">
                <p className="groups-empty-title">No groups yet</p>
                <p className="groups-empty-message">Create your first group to start organizing access.</p>
              </div>
            ) : (
              <ul className="groups-list">
                {groups.map(g => (
                  <li key={g.id} className={`group-item ${selectedGroup?.id === g.id ? 'group-item-selected' : ''}`} onClick={() => onSelectGroup(g.id)}>
                    <h4 className="group-name">{g.name}</h4>
                    <p className="group-description">{g.description}</p>
                    <span className="group-members-count">{g.members?.length || 0} members</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right Panel - Group Details */}
          <div className="groups-right-panel">
            {groupsLoading ? <div className="group-detail-skeleton" aria-label="Loading group details"><div className="skeleton-line skeleton-title" /><div className="skeleton-line skeleton-subtitle" /><div className="skeleton-tabs" /><div className="skeleton-line skeleton-members" /></div> : selectedGroup ? <>
              <div className="group-detail-header">
                <div><h2>{selectedGroup.name}</h2><p>{selectedGroup.description}</p></div>
                <div className="group-detail-actions"><button className="group-action-button" onClick={() => openEditGroup(selectedGroup)}>Edit group</button><button className="group-action-button">Add member</button><button className="group-action-button group-delete-button" onClick={() => void onDeleteGroup(selectedGroup)}>Delete group</button></div>
              </div>
              <div className="group-tabs"><button className="group-tab group-tab-active">Members</button><button className="group-tab">Shared folders</button></div>
              <div className="group-members-panel"><p className="group-members-heading">{selectedGroup.members?.length || 0} MEMBERS</p><div className="group-members-empty">No members assigned yet.</div></div>
            </> : <div className="groups-detail-empty"><p className="groups-detail-title">Select a group to view details</p></div>}
          </div>
        </div>

        <button className="groups-back-button" onClick={onBack}>
          <Icon name="back" size={15} /> Back
        </button>
      </section>
    </main>
  )
}

function AppControlsView({ onBack }: { onBack: () => void }) {
  const applications = [{ name: 'Google Chrome', process: 'chrome.exe' }, { name: 'Microsoft Edge', process: 'msedge.exe' }, { name: 'Mozilla Firefox', process: 'firefox.exe' }, { name: 'Brave Browser', process: 'brave.exe' }, { name: 'Opera', process: 'opera.exe' }, { name: 'Notepad', process: 'notepad.exe' }, { name: 'Notepad++', process: 'notepad++.exe' }, { name: 'Microsoft Outlook', process: 'outlook.exe' }, { name: 'Microsoft Word', process: 'winword.exe' }, { name: 'Microsoft Excel', process: 'excel.exe' }, { name: 'Microsoft PowerPoint', process: 'powerpnt.exe' }, { name: 'Microsoft Teams', process: 'ms-teams.exe' }]
  const [appIcons, setAppIcons] = useState<Record<string, string>>({})
  const [installedApplications, setInstalledApplications] = useState<typeof applications>([])
  const [enabledApps, setEnabledApps] = useState<Record<string, boolean>>(() => {
    try {
      const stored = window.localStorage.getItem('colixai-app-controls')
      return stored ? { ...Object.fromEntries(applications.map(app => [app.process, true])), ...JSON.parse(stored) as Record<string, boolean> } : Object.fromEntries(applications.map(app => [app.process, true]))
    } catch { return Object.fromEntries(applications.map(app => [app.process, true])) }
  })

  useEffect(() => {
    window.localStorage.setItem('colixai-app-controls', JSON.stringify(enabledApps))
    void ipcService.setAppControls(enabledApps)
  }, [enabledApps])

  useEffect(() => {
    void ipcService.getAppIcons(applications.map(application => application.process)).then(icons => {
      setAppIcons(icons)
      setInstalledApplications(applications.filter(application => Boolean(icons[application.process])))
    })
  }, [])

  return <main className="app-controls-main"><section className="app-controls-container"><div className="app-controls-heading"><div><p className="workspace-page-label">SHORTCUT SETTINGS</p><h1>App controls</h1><p>Choose which applications can use your shortcuts.</p></div><div className="app-controls-note"><Icon name="grid" size={18} /> Global toggle has priority</div></div><section className="app-controls-card"><div className="app-controls-card-header"><div><h2>Application access</h2><p>Shortcuts are enabled for these apps by default.</p></div><span>{installedApplications.length} apps detected</span></div><div className="app-controls-table"><div className="app-controls-row app-controls-header"><span>APPLICATION</span><span>PROCESS</span><span>SHORTCUTS</span></div>{installedApplications.length ? installedApplications.map(application => <div className="app-controls-row" key={application.process}><span className="app-name"><span className="app-icon"><img src={appIcons[application.process]} alt="" /></span>{application.name}</span><code>{application.process}</code><label className="app-toggle"><input type="checkbox" checked={enabledApps[application.process] !== false} onChange={() => setEnabledApps(previous => ({ ...previous, [application.process]: previous[application.process] === false }))} /><span /></label></div>) : <div className="app-controls-empty">Detecting installed applications...</div>}</div></section><button className="groups-back-button" onClick={onBack}><Icon name="back" size={15} /> Back</button></section></main>
}

function WorkspaceView({ email, onBack }: { email: string; onBack: () => void }) {
  const [workspaceName, setWorkspaceName] = useState("abhishekkumarphp.kbizsoft's Workspace")
  const [nameDialog, setNameDialog] = useState<string | null>(null)
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameError, setNameError] = useState('')
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'members' | 'invitations'>('members')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')
  const [inviteDialog, setInviteDialog] = useState<{ email: string; role: 'viewer' | 'editor' | 'admin' } | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [isSendingInvite, setIsSendingInvite] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadWorkspaceTab = async () => {
      try {
        setWorkspaceLoading(true)
        setWorkspaceError('')
        const result = activeWorkspaceTab === 'members' ? await workspaceService.getMembers() : await workspaceService.getInvitations()
        if (cancelled) return
        if (activeWorkspaceTab === 'members') setMembers(result.items as WorkspaceMember[])
        else setInvitations(result.items as WorkspaceInvitation[])
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : 'Unable to load workspace records')
      } finally {
        if (!cancelled) setWorkspaceLoading(false)
      }
    }
    void loadWorkspaceTab()
    return () => { cancelled = true }
  }, [activeWorkspaceTab])

  const inviteLimitReached = members.length >= 2 || invitations.length >= 1

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!inviteDialog || inviteLimitReached) return
    try {
      setIsSendingInvite(true)
      setInviteError('')
      await workspaceService.sendInvitation(inviteDialog.email.trim(), inviteDialog.role)
      const refreshedInvitations = await workspaceService.getInvitations()
      setInvitations(refreshedInvitations.items)
      setInviteDialog(null)
      setActiveWorkspaceTab('invitations')
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Unable to send invitation')
    } finally {
      setIsSendingInvite(false)
    }
  }

  const saveWorkspaceName = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = nameDialog?.trim()
    if (!name) return
    try {
      setIsSavingName(true)
      setNameError('')
      setWorkspaceName(await workspaceService.updateName(name))
      setNameDialog(null)
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Unable to update workspace name')
    } finally {
      setIsSavingName(false)
    }
  }

  return <main className="workspace-page-main">
    <section className="workspace-page-container">
      <div className="workspace-page-heading"><div><p className="workspace-page-label">WORKSPACE</p><h1>Members and<br />access</h1><p>Invite people to collaborate on shared snippets, forms, and folders.</p></div><div className="workspace-page-actions"><label>Workspace<select><option>{workspaceName}</option></select></label><button className="workspace-invite-button" disabled={inviteLimitReached} onClick={() => { setInviteError(''); setInviteDialog({ email: '', role: 'viewer' }) }}>+ <span>Invite user</span></button></div></div>
      <section className="workspace-summary-card"><div className="workspace-summary-top"><div><h2>{workspaceName} <button type="button" className="workspace-edit-mark" onClick={() => setNameDialog(workspaceName)} aria-label="Edit workspace name"><Icon name="edit" size={12} /></button></h2><p>{email} · owner</p><strong>Free plan · {Math.min(2, members.length + 1)} of 2 seats used</strong></div><span className="workspace-personal-badge">Personal workspace</span></div><div className="workspace-tabs"><button className={activeWorkspaceTab === 'members' ? 'workspace-tab-active' : ''} onClick={() => setActiveWorkspaceTab('members')}>Members</button><button className={activeWorkspaceTab === 'invitations' ? 'workspace-tab-active' : ''} onClick={() => setActiveWorkspaceTab('invitations')}>Pending invitations</button><button>Shared resources</button></div></section>
      <section className="members-table-card"><div className="members-table-heading"><label>Search<input placeholder="Search this view..." /></label><label>Role<select><option>All roles</option></select></label><label>Status<select><option>All statuses</option></select></label><label>Type<select><option>All resources</option></select></label><button>Clear</button></div><h2>{activeWorkspaceTab === 'members' ? 'Members' : 'Pending invitations'}</h2><p className="members-result-count">{workspaceLoading ? 'Loading...' : `${activeWorkspaceTab === 'members' ? members.length : invitations.length} result${(activeWorkspaceTab === 'members' ? members.length : invitations.length) === 1 ? '' : 's'}`}</p>{workspaceError ? <p className="workspace-data-error">{workspaceError}</p> : <table><thead><tr><th>MEMBER</th><th>ROLE</th><th>STATUS</th><th>{activeWorkspaceTab === 'members' ? 'JOINED' : 'SENT'}</th></tr></thead><tbody>{activeWorkspaceTab === 'members' ? members.map(member => { const memberEmail = member.user?.email || member.email || 'Unknown member'; const memberName = [member.user?.first_name, member.user?.last_name].filter(Boolean).join(' ') || memberEmail; return <tr key={member.user_id || member.user?.id || memberEmail}><td><strong>{memberName}</strong><small>{memberEmail}</small></td><td>{member.role || 'member'}</td><td><span className="member-active-badge">{member.status || 'Active'}</span></td><td>{member.created_at || member.joined_at || member.joined || '—'}</td></tr> }) : invitations.map(invitation => <tr key={invitation.id || invitation.email}><td><strong>{invitation.email}</strong></td><td>{invitation.role || 'viewer'}</td><td><span className="member-active-badge">{invitation.status || 'Pending'}</span></td><td>{invitation.created_at || invitation.sent_at || '—'}</td></tr>)}</tbody></table>}<div className="members-pagination"><button disabled>← Previous</button><span>Page 1 of 1</span><button disabled>Next →</button></div></section>
      <button className="groups-back-button" onClick={onBack}><Icon name="back" size={15} /> Back</button>
      {nameDialog !== null && <div className="dialog-backdrop" onMouseDown={() => setNameDialog(null)}><form className="workspace-name-dialog" onSubmit={saveWorkspaceName} onMouseDown={event => event.stopPropagation()}><button type="button" className="workspace-dialog-close" onClick={() => setNameDialog(null)} aria-label="Close">×</button><p className="workspace-page-label">WORKSPACE</p><h2>Edit workspace name</h2><p>Choose a name for your workspace.</p><input autoFocus value={nameDialog} onChange={event => setNameDialog(event.target.value)} placeholder="Workspace name" />{nameError && <p className="workspace-name-error" role="alert">{nameError}</p>}<div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setNameDialog(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={isSavingName}>{isSavingName ? 'Saving...' : 'Save changes'}</button></div></form></div>}
      {inviteDialog && <div className="dialog-backdrop" onMouseDown={() => setInviteDialog(null)}><form className="workspace-name-dialog invite-dialog" onSubmit={sendInvite} onMouseDown={event => event.stopPropagation()}><button type="button" className="workspace-dialog-close" onClick={() => setInviteDialog(null)} aria-label="Close">×</button><p className="workspace-page-label">WORKSPACE</p><h2>Invite a member</h2><p>Send an invitation to collaborate in this workspace.</p><label className="invite-field-label">Email<input autoFocus type="email" required value={inviteDialog.email} onChange={event => setInviteDialog({ ...inviteDialog, email: event.target.value })} placeholder="person@example.com" /></label><label className="invite-field-label">Role<select value={inviteDialog.role} onChange={event => setInviteDialog({ ...inviteDialog, role: event.target.value as 'viewer' | 'editor' | 'admin' })}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select></label>{inviteError && <p className="workspace-name-error" role="alert">{inviteError}</p>}<div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setInviteDialog(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={isSendingInvite}>{isSendingInvite ? 'Sending...' : 'Send invitation'}</button></div></form></div>}
    </section>
  </main>
}

interface TeamPlan {
  plan_code: string
  name: string
  max_members: number
  monthly_price: number
}

function TeamsView({ onBack }: { onBack: () => void }) {
  const [plans, setPlans] = useState<TeamPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const loadPlans = async () => {
      try {
        setPlansLoading(true)
        setPlansError('')
        const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/teams-plans.php', {
          headers: { 'X-User-Email': 'abhishekkumarphp.kbizsoft@gmail.com' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const result = await response.json() as { success?: boolean; plans?: TeamPlan[]; message?: string }
        if (!result.success || !Array.isArray(result.plans)) throw new Error(result.message || 'Invalid plans response')
        setPlans(result.plans)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load team plans', error)
        setPlansError(error instanceof Error ? error.message : 'Unable to load team plans')
      } finally {
        if (!controller.signal.aborted) setPlansLoading(false)
      }
    }
    void loadPlans()
    return () => controller.abort()
  }, [])

  const formatPrice = (price: number) => price === 0 ? 'Free' : `$${price.toFixed(2)}`
  const formatMemberLimit = (limit: number) => limit >= 2147483647 ? 'Unlimited members' : `Up to ${limit} member${limit === 1 ? '' : 's'}`
  const orderedPlans = [...plans].sort((a, b) => Number(a.plan_code === 'custom') - Number(b.plan_code === 'custom'))
  const openCheckout = (planCode: string) => {
    const checkoutUrl = new URL('https://extensions.kbizsoft.com/magicaa-extension/paypal-checkout.html')
    checkoutUrl.searchParams.set('workspace_id', '3894f28c-8f53-4624-8132-7ec4320c5a0b')
    checkoutUrl.searchParams.set('plan_code', planCode)
    checkoutUrl.searchParams.set('user_email', 'abhishekkumarphp.kbizsoft@gmail.com')
    void ipcService.openExternalUrl(checkoutUrl.toString())
  }

  return <main className="teams-main">
    <section className="teams-container">
      <div className="teams-header">
        <div>
          <h1 className="teams-title">Space to grow, together</h1>
          <p className="teams-subtitle">Bring your snippets, forms, and folders together in one shared workspace</p>
        </div>
        <div className="teams-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3" />
          </svg>
        </div>
      </div>

      {/* Workspace Subscription */}
      <div className="teams-section">
        <h2 className="teams-section-label">WORKSPACE SUBSCRIPTION</h2>
        <div className="workspace-card">
          <div className="workspace-content">
            <h3>abhishekkumarphp.kbizsoft's Workspace</h3>
            <p className="workspace-plan">Free plan · Admin</p>
          </div>
          <div className="workspace-selector">
            <select className="workspace-dropdown">
              <option>Workspace</option>
            </select>
          </div>
        </div>
      </div>

      {/* Plans Section */}
      <div className="teams-section plans-section">
        <div className="plans-header">
          <div><h2 className="teams-section-label">PLANS</h2><h3 className="plans-title">Choose the room your team needs</h3></div>
          <span className="access-badge">30-day access</span>
        </div>

        {plansLoading && <div className="plans-message">Loading plans...</div>}
        {!plansLoading && plansError && <div className="plans-message plans-error">Unable to load plans: {plansError}</div>}
        {!plansLoading && !plansError && <div className="plans-grid">
          {orderedPlans.map(plan => {
            const isFree = plan.plan_code === 'free'
            const isCustom = plan.plan_code === 'custom'
            return <div className={`plan-card ${isFree ? 'free-active' : ''}`} key={plan.plan_code}>
              {isFree && <div className="plan-badge">Current plan</div>}
              <h4 className="plan-name">{plan.name}</h4>
              <div className="plan-price">{formatPrice(plan.monthly_price)}{plan.monthly_price > 0 && <span className="plan-period">/month</span>}</div>
              <p className="plan-members">{formatMemberLimit(plan.max_members)}</p>
              {isFree && <div className="plan-status">Active</div>}
              <button className={`plan-button ${isFree ? 'current' : isCustom ? 'contact' : 'upgrade'}`} disabled={isFree} onClick={() => { if (!isFree && !isCustom) openCheckout(plan.plan_code) }}>{isFree ? 'Current plan' : isCustom ? 'Contact us' : 'Upgrade for 30 days'}</button>
            </div>
          })}
        </div>}
      </div>

      {/* Need Help Section */}
      <div className="teams-help-section">
        <div className="help-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="help-content">
          <h3>Need a tailored setup?</h3>
          <p>Custom member limits and workspace arrangements are available for growing teams</p>
        </div>
        <button className="help-contact-button">Contact us</button>
      </div>

      <button className="teams-back-button" onClick={onBack}>
        <Icon name="back" size={15} /> Back
      </button>
    </section>
  </main>
}

function Sidebar({ folders, shortcuts, activeFolderId, setActiveFolderId, onCreateFolder, onRenameFolder, onDeleteFolder, onCreateShortcut, onEdit, onDragStart, onDrop, onContextMenu }: { folders: ShortcutFolder[]; shortcuts: Shortcut[]; activeFolderId: string; setActiveFolderId: (id: string) => void; onCreateFolder: () => void; onRenameFolder: (folder: ShortcutFolder) => void; onDeleteFolder: (folder: ShortcutFolder) => void; onCreateShortcut: () => void; onEdit: (shortcut: Shortcut) => void; onDragStart: (id: string) => void; onDrop: (folderId: string) => void; onContextMenu: (x: number, y: number, shortcut: Shortcut) => void }) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!activeFolderId) return
    setExpandedFolders(previous => new Set(previous).add(activeFolderId))
  }, [activeFolderId])

  const toggleFolder = (folderId: string) => {
    if (activeFolderId !== folderId) {
      setActiveFolderId(folderId)
      setExpandedFolders(previous => new Set(previous).add(folderId))
      return
    }
    setExpandedFolders(previous => {
      const next = new Set(previous)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  return <aside className="sidebar">
    <div className="sidebar-brand">
      <span className="sidebar-logo">
        <img className="rounded-full" src={logo} alt="ColixAI" />
      </span>
      <strong>ColixAI</strong>
      <div className="sidebar-buttons">
        <button onClick={onCreateShortcut} title="New shortcut">
          <Icon name="plus" />
        </button>
        <button onClick={onCreateFolder} title="New folder">
          <Icon name="folder" size={17} />
        </button>
      </div>
    </div>
    <div className="folder-list">{folders.map(folder => <div key={folder.id} className={`folder-block ${activeFolderId === folder.id ? 'folder-active' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onDrop(folder.id) }}>
      <div className="folder-row-wrap">
        <button className="folder-row" onClick={() => toggleFolder(folder.id)} aria-expanded={expandedFolders.has(folder.id)}>
          <Icon name="chevron" size={15} />
          <span className="folder-icon">
            <Icon name="folder" size={17} />
          </span>
          <strong>{folder.name}</strong>
          <small>{shortcuts.filter(shortcut => shortcut.folderId === folder.id || (!shortcut.folderId && folder === folders[0])).length}</small>
        </button>
        <button className="folder-edit" onClick={() => onRenameFolder(folder)} aria-label="Rename folder">
          <Icon name="edit" size={13} />
        </button>{folders.length > 1 && folder.id !== 'default-folder' && <button className="folder-delete" onClick={() => onDeleteFolder(folder)} aria-label="Delete folder">
          <Icon name="trash" size={13} />
        </button>}
      </div>{expandedFolders.has(folder.id) && <div className="folder-shortcuts">{shortcuts.filter(shortcut => shortcut.folderId === folder.id || (!shortcut.folderId && folder === folders[0])).map(shortcut => <button key={shortcut.id} className="sidebar-shortcut" draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', shortcut.id); onDragStart(shortcut.id) }} onClick={() => onEdit(shortcut)} onContextMenu={event => { event.preventDefault(); onContextMenu(event.clientX, event.clientY, shortcut) }}>
        <span className="shortcut-bolt"><Icon name="bolt" size={14} />
        </span>
        <span className="sidebar-shortcut-label">{shortcutDisplayName(shortcut)}</span>
        <code>{shortcut.name}</code>
      </button>)}
        <div className="drop-hint">Drop here</div>
      </div>}</div>)}
    </div>
    <div className="sidebar-footer"><span className={`hook-dot ${activeFolderId ? 'online' : ''}`}>
    </span>{activeFolderId ? 'Shortcuts ready' : 'Loading shortcuts'}
    </div>
  </aside>
}

function DocsPanel() {
  return <aside className="docs-panel">
    <h2>Want to learn more?</h2>
    <a href="#documentation">
      <span><Icon name="book" /></span>
      <div>
        <strong>ColixAI Documentation</strong>
        <small>Guides and references</small>
      </div>
    </a>
    <a href="#faq">
      <span><Icon name="search" /></span>
      <div>
        <strong>ColixAI FAQ</strong>
        <small>Frequently asked questions</small>
      </div>
    </a>
    <a href="#community">
      <span><Icon name="grid" /></span>
      <div>
        <strong>Community Forums</strong>
        <small>Ask questions and suggest features</small>
      </div>
    </a>
    <a href="#email">
      <span><Icon name="copy" /></span>
      <div>
        <strong>Email the team</strong>
        <small>support@colixai.com</small>
      </div>
    </a>
    <div className="docs-logo">
      <img className="rounded-full" src={logo} alt="ColixAI" />
    </div>
  </aside>
}

function FolderDialog({ dialog, setDialog, onSave }: { dialog: { mode: 'create' | 'rename'; folderId?: string; name: string }; setDialog: (dialog: { mode: 'create' | 'rename'; folderId?: string; name: string } | null) => void; onSave: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={() => setDialog(null)}>
      <form className="folder-dialog" onSubmit={event => { event.preventDefault(); onSave() }} onMouseDown={event => event.stopPropagation()}>
        <h2>{dialog.mode === 'create' ? 'Create folder' : 'Rename folder'}</h2>
        <p>{dialog.mode === 'create' ? 'Organize your shortcuts into a new folder.' : 'Choose a new name for this folder.'}</p>
        <input autoFocus value={dialog.name} onChange={event => setDialog({ ...dialog, name: event.target.value })} placeholder="Folder name" />
        <div className="dialog-actions">
          <button type="button" className="button button-light" onClick={() => setDialog(null)}>Cancel</button>
          <button type="submit" className="button button-primary">{dialog.mode === 'create' ? 'Create folder' : 'Save name'}</button>
        </div>
      </form>
    </div>
  )
}

// Group creation dialog
function GroupDialog({ dialog, setDialog, onCreated }: { dialog: { mode: 'create' | 'edit'; groupId?: string; name: string; description: string } | null; setDialog: (d: { mode: 'create' | 'edit'; groupId?: string; name: string; description: string } | null) => void; onCreated: () => void | Promise<void> }) {
  const handleSubmit = async () => {
    if (!dialog) return
    const workspaceId = 'be0df420-f9f7-4ad2-a716-48ea4355175e'
    try {
      if (dialog.mode === 'edit' && dialog.groupId) await groupService.update(workspaceId, dialog.groupId, dialog.name.trim(), dialog.description.trim())
      else await groupService.create(workspaceId, dialog.name.trim(), dialog.description.trim())
      setDialog(null)
      await onCreated()
    } catch (e) {
      console.error('Error creating group', e)
    }
  }
  if (!dialog) return null
  return (
    <div className="dialog-backdrop" onMouseDown={() => setDialog(null)}>
      <form className="group-dialog" onSubmit={event => { event.preventDefault(); handleSubmit() }} onMouseDown={event => event.stopPropagation()}>
        <h2>{dialog.mode === 'edit' ? 'Edit group' : 'Create group'}</h2>
        <p>{dialog.mode === 'edit' ? 'Update the name and description for this group.' : 'Enter the name and description for the new workspace group.'}</p>
        <input autoFocus placeholder="Group name" value={dialog.name} onChange={e => setDialog({ ...dialog, name: e.target.value })} />
        <textarea placeholder="Description" value={dialog.description} onChange={e => setDialog({ ...dialog, description: e.target.value })} />
        <div className="dialog-actions">
          <button type="button" className="button button-light" onClick={() => setDialog(null)}>Cancel</button>
          <button type="submit" className="button button-primary">{dialog.mode === 'edit' ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDialog({ dialog, onClose }: { dialog: { title: string; message: string; confirmLabel: string; onConfirm: () => void | Promise<void> }; onClose: () => void }) {
  const confirm = async () => {
    await dialog.onConfirm()
    onClose()
  }

  return <div className="dialog-backdrop" onMouseDown={onClose}>
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={event => event.stopPropagation()}>
      <div className="confirm-icon"><Icon name="trash" size={19} /></div>
      <h2 id="confirm-title">{dialog.title}</h2>
      <p>{dialog.message}</p>
      <div className="dialog-actions">
        <button type="button" className="button button-light" onClick={onClose}>Cancel</button>
        <button type="button" className="button button-danger confirm-delete" onClick={() => void confirm()}>{dialog.confirmLabel}</button>
      </div>
    </section>
  </div>
}

interface MarketplaceTemplate {
  id: string
  img: string
  label: string
  trigger: string
  category: string
  description: string
  icon: IconName
  content: string
  preview: string[]
}

function MarketplaceView({ onBack, shortcuts, folders, onSetFolders, onAddTemplate, notify }: { onBack: () => void; shortcuts: Shortcut[]; folders: ShortcutFolder[]; onSetFolders: (folders: ShortcutFolder[]) => void; onAddTemplate: (template: ShortcutInput, folderId?: string) => Promise<void>; notify: (message: string) => void }) {
  const templates: MarketplaceTemplate[] = [
    {
      id: 'medical-form',
      img: medicalForm,
      label: 'Medical Intake Form',
      trigger: '-medical-form',
      category: 'HEALTHCARE',
      description: 'Patient intake form with fields for patient name, concerns, visit type, and consent.',
      icon: 'bolt',
      preview: ['Patient: [Full Name]', 'Age: [Dropdown: 18-30 / 30-50 / 50+]', 'Concern: [Describe your main concern]', 'Visit type: [Dropdown: New patient / Follow-up / Annual checkup]', 'Insurance: [Radio: Yes / No]', 'Consent: [Radio: Agree / Decline]'],
      content: '<p><strong>Patient:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Patient" data-field-default="[Full Name]">Patient</span></p><p><strong>Age Group:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Age Group" data-field-options="%5B%2218-30%22%2C%2230-50%22%2C%2250%2B%22%5D">Age Group</span></p><p><strong>Concern:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Concern" data-field-default="[Describe your main concern]">Concern</span></p><p><strong>Visit type:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Visit type" data-field-options="%5B%22New%20patient%22%2C%22Follow-up%22%2C%22Annual%20checkup%22%5D">Visit type</span></p><p><strong>Has Insurance:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="Insurance" data-field-options="%5B%22Yes%22%2C%22No%22%5D">Insurance</span></p><p><strong>Consent:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="Consent" data-field-options="%5B%22I%20agree%22%2C%22I%20decline%22%5D">Consent</span></p>',
    },
    {
      id: 'support-reply',
      img: supportReply,
      label: 'Customer Support Reply',
      trigger: '-support-reply',
      category: 'SUPPORT',
      description: 'Professional customer support response template with issue summary and resolution.',
      icon: 'book',
      preview: ['Customer Name: [Name]', 'Issue Type: [Dropdown: Bug / Feature Request / General]', 'Issue Summary: [Describe the issue]', 'Resolution: [Provide solution]', 'Priority: [Dropdown: Low / Medium / High / Urgent]', 'Resolved: [Radio: Yes / No]'],
      content: '<p>Hi <span class="dynamic-field" contenteditable="false" data-field-label="Customer Name" data-field-default="[Name]">Customer Name</span>,</p><p>Thank you for contacting us. <strong>Issue Type:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Issue Type" data-field-options="%5B%22Bug%22%2C%22Feature%20Request%22%2C%22General%20Inquiry%22%5D">Issue Type</span></p><p><strong>Summary:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Issue Summary" data-field-default="[Describe the issue]">Issue Summary</span></p><p><strong>Resolution:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Resolution" data-field-default="[Provide solution]">Resolution</span></p><p><strong>Priority:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Priority" data-field-options="%5B%22Low%22%2C%22Medium%22%2C%22High%22%2C%22Urgent%22%5D">Priority</span></p><p><strong>Status:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="Resolved" data-field-options="%5B%22Resolved%22%2C%22Pending%22%5D">Resolved</span></p><p>Best regards,<br>Support Team</p>',
    },
    {
      id: 'meeting-notes',
      img: meetingNotes,
      label: 'Meeting Notes',
      trigger: '-meeting-notes',
      category: 'PRODUCTIVITY',
      description: 'Structured meeting notes template with attendees, agenda, and action items.',
      icon: 'book',
      preview: ['Meeting Date: [Date]', 'Meeting Type: [Dropdown: Standup / Planning / Review / Other]', 'Attendees: [Names]', 'Agenda: [Topics discussed]', 'Key Decisions: [Decisions made]', 'Follow-up Required: [Radio: Yes / No]', 'Action Items: [Who does what by when]'],
      content: '<p><strong>Meeting Date:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Date" data-field-default="[Date]">Date</span></p><p><strong>Meeting Type:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Meeting Type" data-field-options="%5B%22Standup%22%2C%22Planning%22%2C%22Review%22%2C%22Other%22%5D">Meeting Type</span></p><p><strong>Attendees:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Attendees" data-field-default="[Names]">Attendees</span></p><p><strong>Agenda:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Agenda" data-field-default="[Topics discussed]">Agenda</span></p><p><strong>Key Decisions:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Decisions" data-field-default="[Decisions made]">Decisions</span></p><p><strong>Follow-up Required:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="Follow-up" data-field-options="%5B%22Yes%22%2C%22No%22%5D">Follow-up</span></p><p><strong>Action Items:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Action Items" data-field-default="[Who does what by when]">Action Items</span></p>',
    },
    {
      id: 'project-handover',
      img: projectHandover,
      label: 'Project Handover',
      trigger: '-project-handover',
      category: 'PROJECTS',
      description: 'Project handover checklist with deliverables, documentation, and next steps.',
      icon: 'grid',
      preview: ['Project Name: [Project title]', 'Status: [Complete / 90% Complete / In Progress]', 'Deliverables: [List of deliverables]', 'Documentation: [Links or descriptions]', 'Next Steps: [Future work]', 'Owner: [Name]'],
      content: '<p><strong>Project Name:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Project Name" data-field-default="[Project title]">Project Name</span></p><p><strong>Completion Status:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Status" data-field-options="%5B%22Complete%22%2C%2290%25%20Complete%22%2C%22In Progress%22%5D">Status</span></p><p><strong>Deliverables:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Deliverables" data-field-default="[List of deliverables]">Deliverables</span></p><p><strong>Documentation:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Documentation" data-field-default="[Links or descriptions]">Documentation</span></p><p><strong>Next Steps:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Next Steps" data-field-default="[Future work]">Next Steps</span></p><p><strong>Handover Owner:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Owner" data-field-default="[Name]">Owner</span></p>',
    },
    {
      id: 'cost-estimate',
      img: costEstimate,
      label: 'Simple Cost Estimate',
      trigger: '-cost-estimate',
      category: 'BUSINESS',
      description: 'Quick cost estimate template for projects or services with line items and totals.',
      icon: 'copy',
      preview: ['Client: [Client]', 'Project: [Project description]', 'Currency: [Dropdown: USD / EUR / GBP]', 'Line Items: [Item 1: $X, Item 2: $Y]', 'Subtotal: $[Amount]', 'Tax Rate: [%]', 'Total: $[Amount]', 'Payment Terms: [Radio: Net 30 / Net 60 / Upfront]', 'Valid Until: [Date]'],
      content: '<p><strong>Client:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Client Name" data-field-default="[Client]">Client Name</span></p><p><strong>Project:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Project" data-field-default="[Project description]">Project</span></p><p><strong>Currency:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Currency" data-field-options="%5B%22USD%22%2C%22EUR%22%2C%22GBP%22%5D">Currency</span></p><p><strong>Items:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Line Items" data-field-default="[Item 1: $X, Item 2: $Y]">Line Items</span></p><p><strong>Subtotal:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Subtotal" data-field-default="[Amount]">Subtotal</span></p><p><strong>Tax (%):</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Tax Rate" data-field-default="[%]">Tax Rate</span></p><p><strong>Total:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Total" data-field-default="[Amount]">Total</span></p><p><strong>Payment Terms:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="Payment Terms" data-field-options="%5B%22Net%2030%22%2C%22Net%2060%22%2C%22Upfront%22%5D">Payment Terms</span></p><p><strong>Valid Until:</strong> <span class="dynamic-field" contenteditable="false" data-field-label="Expiration" data-field-default="[Date]">Expiration</span></p>',
    },
    {
      id: 'job-application',
      img: jobApplication,
      label: 'Job Application Response',
      trigger: '-job-application',
      category: 'HR',
      description: 'Professional response template for job applications and recruitment inquiries.',
      icon: 'book',
      preview: ['Candidate Name: [Full Name]', 'Position: [Job Title]', 'Experience Level: [Dropdown: Entry / Mid / Senior]', 'Application Status: [Dropdown: Accepted / Under Review / Rejected]', 'Strengths: [Describe key strengths]', 'Interview Type: [Radio: Phone / Video / In-Person]', 'Next Steps: [What happens next]', 'Feedback: [Any feedback for candidate]'],
      content: '<p>Dear <span class="dynamic-field" contenteditable="false" data-field-label="Candidate Name" data-field-default="[Full Name]">Candidate Name</span>,</p><p>Thank you for applying for the <span class="dynamic-field" contenteditable="false" data-field-label="Position" data-field-default="[Job Title]">Position</span> role.</p><p><strong>Experience Level:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Experience Level" data-field-options="%5B%22Entry%20Level%22%2C%22Mid%20Level%22%2C%22Senior%20Level%22%5D">Experience Level</span></p><p><strong>Application Status:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="Status" data-field-options="%5B%22Accepted%20-%20Interview%20Scheduled%22%2C%22Under%20Review%22%2C%22Not%20Selected%22%5D">Status</span></p><p><strong>Your Strengths:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Strengths" data-field-default="[Key skills and qualities]">Strengths</span></p><p><strong>Interview Format:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="Interview Type" data-field-options="%5B%22Phone%20Call%22%2C%22Video%20Call%22%2C%22In-Person%22%5D">Interview Type</span></p><p><strong>Next Steps:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Next Steps" data-field-default="[Timeline and details]">Next Steps</span></p><p><strong>Additional Feedback:</strong> <span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="Feedback" data-field-default="[Optional feedback]">Feedback</span></p><p>Best regards,<br>HR Team</p>',
    },
  ]

  const handleCopyTemplate = async (template: MarketplaceTemplate) => {
    const alreadyOwns = shortcuts.some(s => s.name === template.trigger)

    if (alreadyOwns) {
      notify('You already own this template')
      return
    }

    try {
      // Get or create "Imported" folder
      let importedFolder = folders.find(f => f.name === 'Imported')
      if (!importedFolder) {
        importedFolder = storageManager.addFolder('Imported')
        const updatedFolders = storageManager.getAllFolders()
        onSetFolders(updatedFolders)
      }

      // Add template to Imported folder
      await onAddTemplate({
        name: template.trigger,
        label: template.label,
        content: template.content,
      }, importedFolder.id)

      notify(`${template.label} added to Imported folder`)
      setTimeout(() => onBack(), 1500)
    } catch (error) {
      console.error('Error adding template:', error)
      notify('Failed to add template')
    }
  }

  return <main className="marketplace-main">
    <div className="marketplace-header">
      <div>
        <button type="button" className="back-button" onClick={onBack}>← Back</button>
        <h1>Marketplace</h1>
        <p>Discover and copy pre-built templates to your shortcuts.</p>
      </div>
    </div>

    <section className="marketplace-grid">
      {templates.map(template => (
        <article key={template.id} className="marketplace-card">
          <div className='w-full h-50 overflow-hidden mb-4'>
            <img className='w-full h-full rounded-lg' src={template.img} alt="medical-foem" />
          </div>
          {/* <div className="marketplace-badge">{template.category}</div> */}
          {/* <div className="marketplace-icon"><Icon name={template.icon} size={32} /></div> */}
          <h3 className='pl-1'>{template.label}</h3>
          {/* <p>{template.description}</p> */}
          <div className="marketplace-trigger">
            <code>{template.trigger}</code>
          </div>
          <div className="marketplace-preview">
            {template.preview.map((line, index) => (
              <div key={index} className="preview-line">{line}</div>
            ))}
          </div>
          <button
            className="button button-primary marketplace-btn"
            onClick={() => handleCopyTemplate(template)}
          >
            Import template
          </button>
        </article>
      ))}
    </section>
  </main>
}

export default App
