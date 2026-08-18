// utils/sync-manager.js
// Handles syncing between Chrome localStorage and Supabase

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.pendingSyncQueue = [];
    this.lastSyncTime = null;
    this.userEmail = null;
    this.userId = null; // Cache user ID
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
    } catch (error) {
      console.warn('Could not fetch user ID:', error);
    }

    // Load pending syncs
    await this.loadPendingSyncs();

    // Perform initial sync
    await this.syncAll();
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

  /**
   * Load pending syncs from storage
   */
  async loadPendingSyncs() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['pendingSyncs'], (result) => {
        this.pendingSyncQueue = result.pendingSyncs || [];
        resolve();
      });
    });
  }

  /**
   * Save pending syncs to storage
   */
  async savePendingSyncs() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ pendingSyncs: this.pendingSyncQueue }, resolve);
    });
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

    // Try to sync immediately
    this.syncAll().catch(console.error);

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
      const client = getSupabaseClient();

      // Fetch shortcuts from Supabase (by email)
      const remoteShortcuts = await client.getShortcuts(this.userEmail);
      const localShortcuts = await this.getLocalShortcuts();

      // Merge shortcuts
      await this.mergeShortcuts(localShortcuts, remoteShortcuts);

      // Fetch forms from Supabase (by email)
      const remoteForms = await client.getForms(this.userEmail);
      const localForms = await this.getLocalForms();

      // Merge forms
      await this.mergeForms(localForms, remoteForms);

      // Fetch folders from Supabase (by email)
      const remoteFolders = await client.getFolders(this.userEmail);
      const localFolders = await this.getLocalFolders();

      // Merge folders
      await this.mergeFolders(localFolders, remoteFolders);

    } catch (error) {
      console.error('Pull from Supabase error:', error);
      // Don't throw - allow sync to continue
    }
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

    try {
      if (entityType === 'shortcut') {
        switch (action) {
          case 'create':
            result = await client.insert('shortcuts', {
              ...data,
              email: this.userEmail,
              user_id: this.userId
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
              user_id: this.userId
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
              user_id: this.userId
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
    return new Promise((resolve) => {
      chrome.storage.local.get(['shortcuts'], (result) => {
        resolve(result.shortcuts || []);
      });
    });
  }

  /**
   * Get local forms
   */
  async getLocalForms() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['forms'], (result) => {
        resolve(result.forms || []);
      });
    });
  }

  async getLocalFolders() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['folders'], (result) => {
        resolve(result.folders || []);
      });
    });
  }

  /**
   * Save shortcuts to local storage
   */
  async saveLocalShortcuts(shortcuts) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ shortcuts }, resolve);
    });
  }

  /**
   * Save forms to local storage
   */
  async saveLocalForms(forms) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ forms }, resolve);
    });
  }

  async saveLocalFolders(folders) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ folders }, resolve);
    });
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
      const client = getSupabaseClient();

      const shortcuts = await client.getShortcuts(this.userId);
      const forms = await client.getForms(this.userId);

      await this.saveLocalShortcuts(shortcuts);
      await this.saveLocalForms(forms);

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