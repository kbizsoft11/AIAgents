// utils/sync-manager.js
// Handles syncing between the extension runtime and Supabase

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.pendingSyncQueue = [];
    this.lastSyncTime = null;
    this.userEmail = null;
    this.userId = null; // Cache user ID
    this.resources = [];
  }

  /**
   * Initialize sync manager with user email
   * Performs initial sync on first load
   */
  async init(userEmail) {
    this.userEmail = userEmail;

    // Set email on Supabase client for RLS policies
    const client = getSupabaseClient();
    client.setUserEmail(userEmail);

    // Fetch and cache user ID
    try {
      await this.fetchAndCacheUserId();
      await this.fetchAndCacheWorkspaceId();
    } catch (error) {
      console.warn('Could not fetch user ID:', error);
    }
    // Perform initial sync
    await this.syncAll();
  }

  async ensureStarterContent() {
    if (!this.workspaceId || this.resources.length > 0) return false;

    const now = new Date().toISOString();
    const folderId = `folder_${Date.now()}_starter`;
    const folder = {
      id: folderId,
      name: 'My Snippets',
      isExpanded: true,
      createdAt: now,
      updatedAt: now,
      workspace_id: this.workspaceId
    };
    const shortcuts = [
      {
        id: `shortcut_${Date.now()}_ty`,
        trigger: '-ty',
        expansion: 'Thank you so much! I really appreciate your help.',
        label: 'Thank You',
        folderId,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        workspace_id: this.workspaceId
      },
      {
        id: `shortcut_${Date.now()}_sig`,
        trigger: '/sig',
        expansion: 'Best regards,\n{{first_name}} {{last_name}}\n{{email}}',
        label: 'Email Signature',
        folderId,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        workspace_id: this.workspaceId
      }
    ];

    await this.queueSync('create', 'folder', folderId, folder);
    for (const shortcut of shortcuts) {
      await this.queueSync('create', 'shortcut', shortcut.id, shortcut);
    }
    await this.syncAll();
    return true;
  }

  /**
   * Fetch user ID by email and cache it
   */
  async fetchAndCacheUserId() {
    try {
      const client = getSupabaseClient();
      const result = await client.selectWithFilter('users', { email: this.userEmail });
      if (result && result.length > 0) {
        this.userId = result[0].id;
        // console.log('✅ User ID cached:', this.userId);
      }
    } catch (error) {
      console.warn('Could not fetch user ID:', error);
    }
  }

  async fetchAndCacheWorkspaceId() {
    try {
      if (!this.userId) return;
      const client = getSupabaseClient();
      const memberships = await client.selectWithFilter('workspace_members', { user_id: this.userId, status: 'active' });
      this.workspaceId = memberships?.[0]?.workspace_id || null;
      if (!this.workspaceId) {
        const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/workspace.php?tab=members&page=1&per_page=5', { headers: { 'X-User-Email': this.userEmail } });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.success) this.workspaceId = payload.membership?.workspace_id || null;
      }
    } catch (error) {
      console.warn('Could not fetch workspace ID:', error);
    }
  }

  /**
   * Load pending syncs from storage
   */
  async loadPendingSyncs() {
    this.pendingSyncQueue = [];
  }

  /**
   * Save pending syncs to storage
   */
  async savePendingSyncs() {
    return undefined;
  }

  /**
   * Add item to pending sync queue
   */
  async queueSync(action, entityType, entityId, data) {
    const syncItem = {
      id: `${Date.now()}-${Math.random()}`,
      action, // 'create', 'update', 'delete'
      entityType, // 'shortcut', 'form'
      entityId,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: 3,
      status: 'pending'
    };

    this.pendingSyncQueue.push(syncItem);
    await this.savePendingSyncs();

    // Complete the write before callers refresh their runtime data.
    await this.syncAll();
    const failedItem = this.pendingSyncQueue.find((item) => item.id === syncItem.id);
    if (failedItem) {
      throw new Error(failedItem.error || `Could not ${action} ${entityType} in Supabase.`);
    }
    return syncItem;
  }

  /**
   * Sync all pending items
   */
  async syncAll() {
    if (this.isSyncing || !this.userEmail) return;

    this.isSyncing = true;
    // console.log('Starting sync...');

    try {
      // First, sync pending local changes to Supabase (push)
      // This ensures deletes are sent before pulling
      await this.pushToSupabase();

      // Then sync from Supabase to local (pull)
      await this.pullFromSupabase();

      this.lastSyncTime = new Date();
      // console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pull latest data from Supabase and merge with local
   */
  async pullFromSupabase() {
    try {
      const workspaceResources = await this.getWorkspaceResources();
      this.resources = workspaceResources;

    } catch (error) {
      console.error('Pull from Supabase error:', error);
      // Don't throw - allow sync to continue
    }
  }

  async getWorkspaceResources() {
    const resources = [];
    const fetchWorkspaceResources = async (workspaceId = '') => {
      let page = 1;
      let pages = 1;
      let lastPayload = {};
      do {
        const params = new URLSearchParams({ tab: 'resources', page: String(page), per_page: '50' });
        if (workspaceId) params.set('workspace_id', workspaceId);
        const response = await fetch(`https://extensions.kbizsoft.com/magicaa-extension/workspace.php?${params}`, {
          headers: { 'X-User-Email': this.userEmail }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || `Could not load workspace resources (${response.status}).`);
        }
        resources.push(...(payload.items || []));
        pages = Number(payload.pagination?.pages) || 1;
        page += 1;
        lastPayload = payload;
      } while (page <= pages);
      return lastPayload;
    };

    const firstPayload = await fetchWorkspaceResources();
    const workspaceIds = (firstPayload.workspaces || [])
      .map((workspace) => workspace?.id)
      .filter((workspaceId) => workspaceId && workspaceId !== firstPayload.selected_workspace_id);
    await Promise.all(workspaceIds.map((workspaceId) => fetchWorkspaceResources(workspaceId)));

    return resources.map((item) => {
      return { ...item };
    });
  }

  /**
   * Push pending changes to Supabase
   */
  async pushToSupabase() {
    if (this.pendingSyncQueue.length === 0) return;

    const client = getSupabaseClient();
    const itemsToProcess = [...this.pendingSyncQueue];

    for (const item of itemsToProcess) {
      if (item.retries >= item.maxRetries) {
        console.warn(`Sync item ${item.id} max retries reached, skipping`);
        continue;
      }

      try {
        await this.syncItem(client, item);
        // Remove from queue
        this.pendingSyncQueue = this.pendingSyncQueue.filter(i => i.id !== item.id);
        await this.savePendingSyncs();

      } catch (error) {
        item.retries++;
        item.error = error.message || 'Supabase request failed.';
        console.warn(`Sync item ${item.id} retry ${item.retries}:`, error);
        await this.savePendingSyncs();
      }
    }
  }

  /**
   * Sync a single item
   */
  async syncItem(client, item) {
    const { action, entityType, entityId, data } = item;
    let result;
    const resource = this.resources.find((entry) => String(entry.id) === String(entityId) && entry.type === entityType);
    const resourceWorkspaceId = data?.workspace_id || resource?.workspace_id || this.workspaceId;

    if (action === 'create' && ['shortcut', 'form', 'folder'].includes(entityType) && !this.workspaceId) {
      throw new Error('Active workspace is not available yet.');
    }

    if (['shortcut', 'form', 'folder'].includes(entityType)) {
      const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/sync-resource.php', {
        method: 'POST',
        headers: { 'X-User-Email': this.userEmail, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, action, entity_id: entityId, workspace_id: resourceWorkspaceId, data: data || {} })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.details || payload.error || `Resource sync failed (${response.status}).`);
      return payload;
    }

    try {
      if (entityType === 'shortcut') {
        switch (action) {
          case 'create':
            result = await client.insert('shortcuts', {
              ...data,
              email: this.userEmail,
              user_id: this.userId,
              workspace_id: this.workspaceId
            });
            break;
          case 'update':
            result = await client.update('shortcuts', data, { id: entityId });
            break;
          case 'delete':
            result = await client.delete('shortcuts', { id: entityId });
            break;
        }

      } else if (entityType === 'form') {
        switch (action) {
          case 'create':
            result = await client.insert('forms', {
              ...data,
              email: this.userEmail,
              user_id: this.userId,
              workspace_id: this.workspaceId
            });
            break;
          case 'update':
            result = await client.update('forms', data, { id: entityId });
            break;
          case 'delete':
            result = await client.delete('forms', { id: entityId });
            break;
        }
      } else if (entityType === 'folder') {
        switch (action) {
          case 'create':
            result = await client.insert('folders', {
              ...data,
              email: this.userEmail,
              user_id: this.userId,
              workspace_id: this.workspaceId
            });
            break;
          case 'update':
            result = await client.update('folders', data, { id: entityId });
            break;
          case 'delete':
            result = await client.delete('folders', { id: entityId });
            break;
        }
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get local shortcuts
   */
  async getLocalShortcuts() {
    return this.resources.filter((item) => item.type === 'shortcut');
  }

  /**
   * Get local forms
   */
  async getLocalForms() {
    return this.resources.filter((item) => item.type === 'form');
  }

  async getLocalFolders() {
    return this.resources.filter((item) => item.type === 'folder');
  }

  /**
   * Save shortcuts to local storage
   */
  async saveLocalShortcuts(shortcuts) {
    this.resources = [...this.resources.filter((item) => item.type !== 'shortcut'), ...shortcuts];
  }

  /**
   * Save forms to local storage
   */
  async saveLocalForms(forms) {
    this.resources = [...this.resources.filter((item) => item.type !== 'form'), ...forms];
  }

  async saveLocalFolders(folders) {
    this.resources = [...this.resources.filter((item) => item.type !== 'folder'), ...folders];
  }

  normalizeItemKeys(item) {
    if (!item || typeof item !== 'object') return item;
    const normalized = { ...item };

    if (normalized.folder_id !== undefined && normalized.folderId === undefined) {
      normalized.folderId = normalized.folder_id;
    }
    if (normalized.updated_at !== undefined && normalized.updatedAt === undefined) {
      normalized.updatedAt = normalized.updated_at;
    }
    if (normalized.created_at !== undefined && normalized.createdAt === undefined) {
      normalized.createdAt = normalized.created_at;
    }
    if (normalized.usage_count !== undefined && normalized.usageCount === undefined) {
      normalized.usageCount = normalized.usage_count;
    }
    if (normalized.template_type !== undefined && normalized.template === undefined) {
      normalized.template = normalized.template_type;
    }
    if (normalized.is_expanded !== undefined && normalized.isExpanded === undefined) {
      normalized.isExpanded = normalized.is_expanded;
    }
    if (normalized.deleted_at !== undefined && normalized.deletedAt === undefined) {
      normalized.deletedAt = normalized.deleted_at;
    }
    if (normalized.user_id !== undefined && normalized.userId === undefined) {
      normalized.userId = normalized.user_id;
    }

    return normalized;
  }

  /**
   * Merge shortcuts (last-write-wins strategy)
   */
  async mergeShortcuts(local, remote) {
    const merged = new Map();

    // Add all remote shortcuts
    remote.forEach(rawItem => {
      const item = this.normalizeItemKeys(rawItem);
      merged.set(item.id, { ...item, source: 'remote' });
    });

    // Merge local shortcuts
    local.forEach(rawItem => {
      const item = this.normalizeItemKeys(rawItem);
      if (merged.has(item.id)) {
        // Item exists in both - use latest based on updatedAt
        const remoteItem = merged.get(item.id);
        const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
        const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();

        if (isNaN(remoteTime) || localTime > remoteTime) {
          // Local is newer, queue for sync
          merged.set(item.id, { ...item, source: 'local', needsSync: true });
        }
      } else {
        // Local only item - queue for sync
        merged.set(item.id, { ...item, source: 'local', needsSync: true });
      }
    });

    // Convert map to array and filter out deleted items
    const mergedArray = Array.from(merged.values())
      .filter(item => !item.deletedAt && !item.deleted_at)
      .map(({ source, needsSync, ...rest }) => rest);

    // Save merged result
    await this.saveLocalShortcuts(mergedArray);
  }

  /**
   * Merge forms (last-write-wins strategy)
   */
  async mergeForms(local, remote) {
    const merged = new Map();

    // Add all remote forms
    remote.forEach(rawItem => {
      const item = this.normalizeItemKeys(rawItem);
      merged.set(item.id, { ...item, source: 'remote' });
    });

    // Merge local forms
    local.forEach(rawItem => {
      const item = this.normalizeItemKeys(rawItem);
      if (merged.has(item.id)) {
        // Item exists in both - use latest based on updatedAt
        const remoteItem = merged.get(item.id);
        const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
        const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();

        if (isNaN(remoteTime) || localTime > remoteTime) {
          // Local is newer, queue for sync
          merged.set(item.id, { ...item, source: 'local', needsSync: true });
        }
      } else {
        // Local only item - queue for sync
        merged.set(item.id, { ...item, source: 'local', needsSync: true });
      }
    });

    // Convert map to array and filter out deleted items
    const mergedArray = Array.from(merged.values())
      .filter(item => !item.deletedAt && !item.deleted_at)
      .map(({ source, needsSync, ...rest }) => rest);

    // Save merged result
    await this.saveLocalForms(mergedArray);
  }

  async mergeFolders(local, remote) {
    const merged = new Map();

    remote.forEach(rawItem => {
      const item = this.normalizeItemKeys(rawItem);
      merged.set(item.id, { ...item, source: 'remote' });
    });

    local.forEach(rawItem => {
      const item = this.normalizeItemKeys(rawItem);
      if (merged.has(item.id)) {
        const remoteItem = merged.get(item.id);
        const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
        const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();

        if (isNaN(remoteTime) || localTime > remoteTime) {
          merged.set(item.id, { ...item, source: 'local', needsSync: true });
        }
      } else {
        merged.set(item.id, { ...item, source: 'local', needsSync: true });
      }
    });

    const mergedArray = Array.from(merged.values())
      .filter(item => !item.deletedAt && !item.deleted_at)
      .map(({ source, needsSync, ...rest }) => rest);

    await this.saveLocalFolders(mergedArray);
  }

  /**
   * Force full refresh from Supabase
   */
  async fullRefresh() {
    if (!this.userId) return;

    try {
      const resources = await this.getWorkspaceResources();
      await this.saveLocalShortcuts(resources.filter((item) => item.trigger && item.expansion));
      await this.saveLocalForms(resources.filter((item) => item.template_type || item.template));
      await this.saveLocalFolders(resources.filter((item) => item.name && !item.trigger));

      // console.log('Full refresh completed');
    } catch (error) {
      console.error('Full refresh error:', error);
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingItems: this.pendingSyncQueue.length
    };
  }

  /**
   * Clear all pending syncs (use with caution!)
   */
  async clearPendingSyncs() {
    this.pendingSyncQueue = [];
    await this.savePendingSyncs();
  }
}

// Initialize and export
let syncManager = null;

async function initSyncManager(userId) {
  syncManager = new SyncManager();
  await syncManager.init(userId);
  return syncManager;
}

function getSyncManager() {
  if (!syncManager) {
    throw new Error('Sync manager not initialized. Call initSyncManager() first.');
  }
  return syncManager;
}