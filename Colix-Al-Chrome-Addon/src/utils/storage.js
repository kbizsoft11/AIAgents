const StorageHelper = {
  // Maximum shortcuts allowed
  MAX_SHORTCUTS: 10,
  DEFAULT_FREE_LIMIT: 10, // Fallback default limit

  // API endpoints
  API_BASE_URL: 'https://extensions.kbizsoft.com/magicaa-extension',
  API_CHECK_USER: 'check_user.php',
  API_GET_CREDIT_TOKEN: 'api_get_credit_token.php',
  API_GET_MEMBERSHIP_STATUS: 'api_get_membership_status.php',

  isEnabledFlag(value) {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    return ['1', 'true', 't', 'yes', 'on', 'active', 'premium', 'pro'].includes(value.trim().toLowerCase());
  },

  // Helper to normalize keys returned by the workspace API
  normalizeItem(item) {
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
    return normalized;
  },

  // Get all shortcuts
  async getAll() {
    return (await getSyncManager().getLocalShortcuts()).map(s => this.normalizeItem(s));
  },

  async getAllResources() {
    return (await getSyncManager().getLocalResources()).map(item => this.normalizeItem(item));
  },

  async getAllForms() {
    return (await getSyncManager().getLocalForms()).map(f => this.normalizeItem(f));
  },

  async getAllFolders() {
    return (await getSyncManager().getLocalFolders()).map(f => this.normalizeItem(f));
  },

  async saveAllFolders(folders) {
    await getSyncManager().saveLocalFolders(folders);
    return folders;
  },

  /**
   * Fetch the maximum free credit token limit from admin panel
   * @param {string} format - Response format ('json' or 'plain')
   * @returns {Promise<number>} - Maximum free credit token limit
   */
  async getMaxFreeCreditToken(format = 'json') {
    try {
      const url = `${this.API_BASE_URL}/${this.API_GET_CREDIT_TOKEN}?format=${format}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn('Failed to fetch free credit token limit, using default');
        return this.DEFAULT_FREE_LIMIT;
      }

      if (format === 'plain') {
        const text = await response.text();
        const limit = parseInt(text.trim(), 10);
        return isNaN(limit) ? this.DEFAULT_FREE_LIMIT : limit;
      } else {
        const data = await response.json();
        if (data.success && typeof data.max_free_credit_token === 'number') {
          return data.max_free_credit_token;
        } else {
          console.warn('Invalid API response format, using default limit');
          return this.DEFAULT_FREE_LIMIT;
        }
      }
    } catch (error) {
      console.error('Error fetching max free credit token:', error);
      return this.DEFAULT_FREE_LIMIT;
    }
  },

  /**
   * Fetch whether membership controls should be shown in the extension.
   * @returns {Promise<boolean>} - Whether membership controls are enabled
   */
  async getMembershipSectionEnabled() {
    try {
      const response = await fetch(`${this.API_BASE_URL}/${this.API_GET_MEMBERSHIP_STATUS}`);
      if (!response.ok) {
        throw new Error(`Membership status request failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && typeof data.membership_section_enabled === 'boolean') {
        this.membershipSectionEnabled = data.membership_section_enabled;
        return data.membership_section_enabled;
      }

      throw new Error('Invalid membership status API response');
    } catch (error) {
      console.error('Error fetching membership section setting:', error);
    }

    // Fail closed so membership controls never flash into view when the
    // feature-flag request is unavailable.
    return false;
  },

  /**
   * Check user status and set appropriate limits
   * Fetches both premium status and free credit token limit
   */
  async checkUser() {
    this.isPremiumUser = false;
    const profileUserInfo = await chrome.identity.getProfileUserInfo();
    const email = profileUserInfo.email || '';

    try {
      // Fetch both user status and free credit token limit in parallel
      const userStatusPromise = globalThis.colixUserStatusPromise;
      const [userResponse, freeLimitToken] = await Promise.all([
        userStatusPromise || fetch(`${this.API_BASE_URL}/${this.API_CHECK_USER}?email=${email}`),
        this.getMaxFreeCreditToken('json')
      ]);

      const userData = userResponse instanceof Response ? await userResponse.json() : userResponse;

      const premiumValue = userData.user?.is_premium ?? userData.is_premium;
      const isPremium = userData.success === true && this.isEnabledFlag(premiumValue);

      if (userData.success && isPremium) {
        // Premium users get unlimited shortcuts
        this.MAX_SHORTCUTS = 1000000000000;
        // console.log('✅ Premium user detected - Unlimited shortcuts');
      } else {
        // Free users get the limit from admin panel
        this.MAX_SHORTCUTS = freeLimitToken;
        // console.log(`✅ Free user detected - Limit set to ${freeLimitToken} shortcuts`);
      }

      this.isPremiumUser = isPremium;
      this.freeLimitToken = freeLimitToken;

    } catch (e) {
      console.error('Error checking user status:', e);
      this.isPremiumUser = false;
      this.MAX_SHORTCUTS = this.DEFAULT_FREE_LIMIT;
      console.warn(`⚠️ Using fallback limit: ${this.MAX_SHORTCUTS}`);
    }

    return this.MAX_SHORTCUTS;
  },

  // Save all shortcuts
  async saveAll(shortcuts) {
    const syncMgr = getSyncManager();
    if (shortcuts.length === 0) {
      const current = await this.getAll();
      await Promise.all(current.map(shortcut => syncMgr.queueSync('delete', 'shortcut', shortcut.id, null)));
    }
    await syncMgr.saveLocalShortcuts(shortcuts);
    return shortcuts;
  },

  async saveAllForms(forms) {
    const syncMgr = getSyncManager();
    if (forms.length === 0) {
      const current = await this.getAllForms();
      await Promise.all(current.map(form => syncMgr.queueSync('delete', 'form', form.id, null)));
    }
    await syncMgr.saveLocalForms(forms);
    return forms;
  },

  // Check if limit reached
  async isLimitReached() {
    const shortcuts = await this.getAll();
    return shortcuts.length >= this.MAX_SHORTCUTS;
  },

  async isFormLimitReached() {
    const forms = await this.getAllForms();
    return forms.length >= this.MAX_SHORTCUTS;
  },

  // Get remaining slots
  async getRemainingSlots() {
    const shortcuts = await this.getAll();
    return Math.max(0, this.MAX_SHORTCUTS - shortcuts.length);
  },

  // Add a new shortcut
  async add(shortcut) {
    const shortcuts = await this.getAll();

    // Check limit
    if (shortcuts.length >= this.MAX_SHORTCUTS) {
      throw new Error(`Limit reached. You can only create ${this.MAX_SHORTCUTS} shortcuts.`);
    }

    let targetFolderId = (shortcut.folderId === 'uncategorized' || !shortcut.folderId) ? null : shortcut.folderId;
    if (!targetFolderId) {
      const folders = await this.getAllFolders();
      if (folders && folders.length > 0) {
        targetFolderId = folders[0].id;
      }
    }

    const newShortcut = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      trigger: shortcut.trigger,
      expansion: shortcut.expansion,
      label: shortcut.label || '',
      folderId: targetFolderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    };
    shortcuts.push(newShortcut);
    await this.saveAll(shortcuts);
    void this.notifyContentScriptsOfUpdate({ shortcut: newShortcut });

    // Queue the remote write in the background so the local shortcut is
    // available immediately. The sync manager handles retries and errors.
    try {
      const syncMgr = getSyncManager();
      void syncMgr.queueSync('create', 'shortcut', newShortcut.id, newShortcut)
        .catch(error => console.warn('Could not sync shortcut:', error));
    } catch (error) {
      console.warn('Could not sync shortcut:', error);
    }

    return newShortcut;
  },

  // Update an existing shortcut
  async update(id, updates) {
    const shortcuts = await this.getAll();
    const index = shortcuts.findIndex(s => s.id === id);
    if (index === -1) return null;

    const nextUpdates = {
      ...updates,
      updatedAt: new Date().toISOString()
    };
    const updatedShortcut = { ...shortcuts[index], ...nextUpdates };
    await this.saveAll(shortcuts.map((shortcut, itemIndex) => itemIndex === index ? updatedShortcut : shortcut));
    void this.notifyContentScriptsOfUpdate({ shortcut: updatedShortcut });

    // Queue and sync to Supabase
    try {
      const syncMgr = getSyncManager();
      void syncMgr.queueSync('update', 'shortcut', id, nextUpdates)
        .catch(error => console.warn('Could not sync shortcut:', error));
    } catch (error) {
      console.warn('Could not queue sync:', error);
      throw error;
    }

    return updatedShortcut;
  },

  async updateForm(id, updates) {
    const forms = await this.getAllForms();
    const index = forms.findIndex(f => f.id === id);
    if (index === -1) return null;

    const nextUpdates = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    try {
      const syncMgr = getSyncManager();
      await syncMgr.queueSync('update', 'form', id, nextUpdates);
      // Don't call syncAll here - only queue. Caller will handle sync if needed.
    } catch (error) {
      console.warn('Could not sync:', error);
      throw error;
      throw error;
    }

    return { ...forms[index], ...nextUpdates };
  },

  // Delete a shortcut
  async delete(id) {
    const shortcuts = await this.getAll();
    const filtered = shortcuts.filter(s => s.id !== id);
    await this.saveAll(filtered);

    // Queue and sync to Supabase
    try {
      const syncMgr = getSyncManager();
      await syncMgr.queueSync('delete', 'shortcut', id, null);
      // Don't call syncAll here - only queue. Caller will handle sync if needed.
    } catch (error) {
      console.warn('Could not sync:', error);
      throw error;
    }

    return filtered;
  },

  // Helper to notify all content scripts when shortcuts are updated
  async notifyContentScriptsOfUpdate(changes = {}) {
    try {
      const shortcuts = await this.getAll();
      const forms = await this.getAllForms();

      // Use the just-saved item in the broadcast so a concurrent cache read or
      // background sync cannot send the previous expansion to content scripts.
      if (changes.shortcut?.id) {
        const index = shortcuts.findIndex(shortcut => String(shortcut.id) === String(changes.shortcut.id));
        if (index === -1) {
          shortcuts.push(this.normalizeItem(changes.shortcut));
        } else {
          shortcuts[index] = this.normalizeItem({ ...shortcuts[index], ...changes.shortcut });
        }
      }

      chrome.runtime.sendMessage({
        action: 'shortcutsUpdated',
        shortcuts,
        forms
      }).catch(() => {
        // Tab might not have content script loaded, that's okay
      });
    } catch (error) {
      console.warn('Could not notify content scripts:', error.message);
    }
  },

  // Search shortcuts
  search(shortcuts, query) {
    const q = query.toLowerCase().trim();
    if (!q) return shortcuts;
    return shortcuts.filter(s =>
      s.trigger.toLowerCase().includes(q) ||
      s.expansion.toLowerCase().includes(q) ||
      (s.label && s.label.toLowerCase().includes(q))
    );
  },

  // Increment usage count
  async incrementUsage(id) {
    const shortcuts = await this.getAll();
    const index = shortcuts.findIndex(s => s.id === id);
    if (index !== -1) {
      shortcuts[index].usageCount = (shortcuts[index].usageCount || 0) + 1;
      await this.saveAll(shortcuts);
    }
  },

  // Check if trigger already exists
  async triggerExists(trigger, excludeId = null) {
    const shortcuts = await this.getAll();
    if (shortcuts.some(s => s.trigger === trigger && s.id !== excludeId)) return true;
    const forms = await this.getAllForms();
    return forms.some(f => f.trigger === trigger && f.id !== excludeId);
  },

  async addForm(form) {
    const forms = await this.getAllForms();
    if (forms.length >= this.MAX_SHORTCUTS) {
      throw new Error(`Limit reached. You can only create ${this.MAX_SHORTCUTS} forms.`);
    }
    let targetFolderId = (form.folderId === 'uncategorized' || !form.folderId) ? null : form.folderId;
    if (!targetFolderId) {
      const folders = await this.getAllFolders();
      if (folders && folders.length > 0) {
        targetFolderId = folders[0].id;
      }
    }

    const newForm = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      trigger: form.trigger,
      label: form.label || '',
      template: form.template,
      fields: form.fields || [],
      folderId: targetFolderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    };
    forms.push(newForm);
    await this.saveAllForms(forms);

    // Queue and sync to Supabase
    try {
      const syncMgr = getSyncManager();
      await syncMgr.queueSync('create', 'form', newForm.id, newForm);
      // Don't call syncAll here - only queue. Caller will handle sync if needed.
    } catch (error) {
      console.warn('Could not sync:', error);
    }

    return newForm;
  },

  async addFolder(folder) {
    const folders = await this.getAllFolders();
    const newFolder = {
      id: folder.id || 'folder_' + Date.now(),
      name: folder.name || 'New Folder',
      isExpanded: folder.isExpanded !== false,
      isLocalOwned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    folders.push(newFolder);
    await this.saveAllFolders(folders);

    try {
      const syncMgr = getSyncManager();
      // Keep folder creation responsive; persist the remote write in the
      // background just like shortcut creation and updates.
      void syncMgr.queueSync('create', 'folder', newFolder.id, newFolder)
        .catch(error => console.warn('Could not sync folder:', error));
    } catch (error) {
      console.warn('Could not sync folder:', error);
    }

    return newFolder;
  },

  async updateFolder(id, updates) {
    const folders = await this.getAllFolders();
    const index = folders.findIndex(f => String(f.id) === String(id));
    if (index === -1) return null;

    const nextUpdates = {
      ...updates,
      updatedAt: new Date().toISOString()
    };
    const updatedFolder = { ...folders[index], ...nextUpdates };
    await this.saveAllFolders(folders.map((folder, itemIndex) => itemIndex === index ? updatedFolder : folder));

    try {
      const syncMgr = getSyncManager();
      void syncMgr.queueSync('update', 'folder', id, nextUpdates)
        .catch(error => console.warn('Could not sync folder update:', error));
    } catch (error) {
      console.warn('Could not sync folder update:', error);
      throw error;
    }

    return updatedFolder;
  },

  async deleteFolder(id) {
    const folders = await this.getAllFolders();
    const folder = folders.find(f => f.id === id);
    const filtered = folders.filter(f => f.id !== id);
    await this.saveAllFolders(filtered);

    try {
      const syncMgr = getSyncManager();
      void syncMgr.queueSync('delete', 'folder', id, folder?.workspace_id ? { workspace_id: folder.workspace_id } : null)
        .catch(error => console.warn('Could not sync folder delete:', error));
    } catch (error) {
      console.warn('Could not sync folder delete:', error);
      throw error;
    }

    return filtered;
  },

  async deleteForm(id) {
    const forms = await this.getAllForms();
    const filtered = forms.filter(f => f.id !== id);
    await this.saveAllForms(filtered);

    // Queue and sync to Supabase
    try {
      const syncMgr = getSyncManager();
      await syncMgr.queueSync('delete', 'form', id, null);
      // Don't call syncAll here - only queue. Caller will handle sync if needed.
    } catch (error) {
      console.warn('Could not sync:', error);
    }

    return filtered;
  }
};
