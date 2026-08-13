const StorageHelper = {
  // Maximum shortcuts allowed
  MAX_SHORTCUTS: 5,

  // Get all shortcuts
  async getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ shortcuts: [] }, (result) => {
        resolve(result.shortcuts);
      });
    });
  },

  async checkUser() {
    const profileUserInfo = await chrome.identity.getProfileUserInfo();
    const email = profileUserInfo.email || '';

    try {
      const response = await fetch(`https://extensions.kbizsoft.com/magicaa-extension/check_user.php?email=${email}`);
      const data = await response.json();

      if (data.success && data.user?.is_premium) {
        this.MAX_SHORTCUTS = 1000000000000;
      } else {
        this.MAX_SHORTCUTS = 5;
      }
    } catch (e) {
      console.error(e);
      this.MAX_SHORTCUTS = 5;
    }

    return this.MAX_SHORTCUTS;
  },

  // Save all shortcuts
  async saveAll(shortcuts) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ shortcuts }, resolve);
    });
  },

  // Check if limit reached
  async isLimitReached() {
    const shortcuts = await this.getAll();
    return shortcuts.length >= this.MAX_SHORTCUTS;
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

    const newShortcut = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      trigger: shortcut.trigger,
      expansion: shortcut.expansion,
      label: shortcut.label || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    };
    shortcuts.push(newShortcut);
    await this.saveAll(shortcuts);
    return newShortcut;
  },

  // Update an existing shortcut
  async update(id, updates) {
    const shortcuts = await this.getAll();
    const index = shortcuts.findIndex(s => s.id === id);
    if (index === -1) return null;

    shortcuts[index] = {
      ...shortcuts[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await this.saveAll(shortcuts);
    return shortcuts[index];
  },

  // Delete a shortcut
  async delete(id) {
    const shortcuts = await this.getAll();
    const filtered = shortcuts.filter(s => s.id !== id);
    await this.saveAll(filtered);
    return filtered;
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
    return shortcuts.some(s => s.trigger === trigger && s.id !== excludeId);
  }
};