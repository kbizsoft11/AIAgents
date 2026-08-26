// =============================================
// HEADER MODULE
// Manages header interactions: profile dropdown, brand navigation
// =============================================

class HeaderModule {
  constructor() {
    this.profileData = null;
    this.profileDropdownOpen = false;
    this.notificationsOpen = false;
    this.notifications = [];
    this.notificationsLoaded = false;
    this.notificationsApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/notifications.php';
  }

  // First: Load header HTML file
  async loadHeaderHTML() {
    try {
      const headerPath = 'dashboard/header.html';
      const url = chrome.runtime.getURL(headerPath);
      
      console.log('🔄 Fetching header from:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`❌ Failed to load header: ${response.status}`);
        return false;
      }
      
      const html = await response.text();
      const container = document.getElementById('header-container');
      
      if (!container) {
        console.error('❌ header-container not found');
        return false;
      }

      // Inject HTML into container
      container.innerHTML = html;
      this.normalizeNavigationLinks(container);
      window.dispatchEvent(new CustomEvent('headerReady'));
      console.log('✅ Header HTML injected');
      return true;
    } catch (error) {
      console.error('❌ Error loading header:', error);
      return false;
    }
  }

  normalizeNavigationLinks(container) {
    const routes = {
      brandHome: 'dashboard/dashboard.html',
      docs: 'dashboard/docs.html',
      workspace: 'dashboard/workspace.html',
      'teams-plans': 'dashboard/teams_plans.html',
      'workspace-groups': 'dashboard/workspace_groups.html',
      marketplace: 'dashboard/marketplace.html'
    };

    Object.entries(routes).forEach(([key, route]) => {
      const link = key === 'brandHome'
        ? container.querySelector('#brandHome')
        : container.querySelector(`[data-header-route="${key}"]`);
      if (link) link.href = chrome.runtime.getURL(route);
    });

    const brandLogo = container.querySelector('.brand-logo');
    if (brandLogo) brandLogo.src = chrome.runtime.getURL('icons/icon128.png');
  }

  // Second: Bind HTML elements after they're loaded
  bindElements() {
    // Brand/Home button
    this.brandHome = document.getElementById('brandHome');
    this.headerFormsBtn = document.getElementById('headerFormsBtn');

    // Profile menu (header)
    this.headerProfileBtn = document.getElementById('headerProfileBtn');
    this.headerProfileDropdown = document.getElementById('headerProfileDropdown');

    // Small avatar shown on the topbar button
    this.profileAvatar = document.getElementById('profileAvatar');
    this.profileAvatarFallback = document.getElementById('profileAvatarFallback');

    // Larger avatar shown inside the dropdown identity card
    this.profileAvatarLarge = document.getElementById('profileAvatarLarge');
    this.profileAvatarLargeFallback = document.getElementById('profileAvatarLargeFallback');

    // Dropdown identity card text
    this.previewFullName = document.getElementById('previewFullName');
    this.previewEmail = document.getElementById('previewEmail');
    this.notificationsBtn = document.getElementById('headerNotificationsBtn');
    this.notificationsPanel = document.getElementById('headerNotificationsPanel');
    this.notificationsList = document.getElementById('headerNotificationsList');
    this.notificationCount = document.getElementById('headerNotificationCount');
    this.markAllNotificationsBtn = document.getElementById('headerNotificationsMarkAll');
  }

  bindEvents() {
    const premiumButton = document.querySelector('.topbar-premium-btn');
    if (premiumButton) {
      premiumButton.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('headerPremiumClick'));
      });
    }

    // Brand/Home button - Navigate to home (shortcuts section)
    if (this.brandHome) {
      this.brandHome.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleBrandClick();
      });
    }

    if (this.headerFormsBtn) {
      this.headerFormsBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('headerFormsClick'));
      });
    }

    // Profile menu items — dispatched by data-menu-action rather than position,
    // so re-ordering or adding menu items later can't silently break routing.
    if (this.headerProfileDropdown) {
      this.headerProfileDropdown.querySelectorAll('.profile-menu-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const action = item.dataset.menuAction;

          if (action === 'profile') {
            this.closeProfileDropdown();
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          if (action === 'usage') {
            console.log('Usage clicked');
            this.closeProfileDropdown();
          } else if (action === 'trash') {
            window.location.assign(chrome.runtime.getURL('dashboard/trash.html'));
            this.closeProfileDropdown();
          } else if (action === 'signout') {
            this.handleSignOut(item);
          } else {
            this.closeProfileDropdown();
          }
        });
      });
    }

    // Profile button (header)
    if (this.headerProfileBtn) {
      this.headerProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleProfileDropdown();
      });
    }

    this.notificationsBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleNotifications();
    });
    this.markAllNotificationsBtn?.addEventListener('click', () => this.markAllNotificationsRead());

    document.addEventListener('click', (e) => {
      if (this.profileDropdownOpen &&
        this.headerProfileBtn &&
        this.headerProfileDropdown &&
        !this.headerProfileBtn.contains(e.target) &&
        !this.headerProfileDropdown.contains(e.target)) {
        this.closeProfileDropdown();
      }
      if (this.notificationsOpen && this.notificationsPanel && !this.notificationsPanel.contains(e.target) && !this.notificationsBtn?.contains(e.target)) {
        this.closeNotifications();
      }
    });

    // Close on Escape for keyboard users
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.profileDropdownOpen) {
        this.closeProfileDropdown();
        this.headerProfileBtn.focus();
      }
    });
  }

  handleSignOut(item) {
    if (item.disabled) return;
    const label = item.querySelector('.profile-menu-item-label');
    item.disabled = true;
    this.headerProfileDropdown?.querySelectorAll('.profile-menu-item').forEach((el) => { if (el !== item) el.disabled = true; });
    if (label) label.textContent = 'Signing out…';
    item.insertAdjacentHTML('beforeend', '<span class="profile-menu-item-spinner" aria-hidden="true"></span>');

    chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Logout failed:', chrome.runtime.lastError);
      }
      chrome.tabs.getCurrent((tab) => {
        chrome.tabs.remove(tab.id);
      });
    });
  }

  // Main initialization - orchestrates the loading sequence
  async init() {
    console.log('🚀 Starting header initialization...');
    
    // Step 1: Load header HTML from file
    const loaded = await this.loadHeaderHTML();
    if (!loaded) {
      console.error('❌ Failed to load header HTML');
      return;
    }

    // Step 2: Bind elements after HTML is in DOM
    console.log('🔗 Binding elements...');
    this.bindElements();
    
    // Step 3: Attach event listeners
    console.log('⚡ Binding events...');
    this.bindEvents();
    
    // Step 4: Load and display profile data
    console.log('👤 Loading profile data...');
    await this.loadProfileData();
    await this.loadNotifications();
    this.notificationsTimer = window.setInterval(() => this.loadNotifications(), 30000);
    
    console.log('✨ Header initialization complete!');
  }

  async loadNotifications() {
    const email = this.profileData?.email;
    if (!email || !this.notificationsList) return;
    try {
      const response = await fetch(this.notificationsApiUrl, { headers: { 'X-User-Email': email } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load notifications.');
      this.notifications = payload.notifications || [];
      this.notificationsLoaded = true;
      this.renderNotifications(payload.unread || 0);
    } catch (error) {
      console.warn('Could not load notifications:', error);
      // Only replace the skeleton with an error state on the very first load;
      // a background refresh failure shouldn't wipe out notifications already on screen.
      if (!this.notificationsLoaded && this.notificationsList) {
        this.notificationsList.innerHTML = '<p class="header-notifications-empty">Could not load notifications.</p>';
      }
    }
  }

  renderNotifications(unread = this.notifications.filter((item) => !item.read_at).length) {
    if (this.notificationCount) {
      this.notificationCount.hidden = unread === 0;
      this.notificationCount.textContent = unread > 9 ? '9+' : String(unread);
    }
    if (this.markAllNotificationsBtn) this.markAllNotificationsBtn.hidden = unread === 0;
    if (!this.notificationsList) return;
    this.notificationsList.innerHTML = this.notifications.length ? this.notifications.map((notification) => {
      return `<article class="header-notification${notification.read_at ? '' : ' unread'}"><strong>${this.escapeHtml(notification.title)}</strong><span>${this.escapeHtml(notification.message)}</span><small>${this.formatNotificationDate(notification.created_at)}</small><button type="button" data-notification-id="${this.escapeAttribute(notification.id)}">${notification.read_at ? 'View folder' : 'Enable folder'}</button></article>`;
    }).join('') : '<p class="header-notifications-empty">No notifications</p>';
    this.notificationsList.querySelectorAll('[data-notification-id]').forEach((button) => button.addEventListener('click', () => {
      const notification = this.notifications.find((item) => item.id === button.dataset.notificationId);
      if (notification?.read_at) this.viewNotification(notification);
      else this.markNotificationRead(button.dataset.notificationId, button);
    }));
  }

  toggleNotifications() { this.notificationsOpen ? this.closeNotifications() : this.openNotifications(); }
  openNotifications() { this.notificationsOpen = true; this.notificationsPanel.hidden = false; this.notificationsBtn?.setAttribute('aria-expanded', 'true'); }
  closeNotifications() { this.notificationsOpen = false; if (this.notificationsPanel) this.notificationsPanel.hidden = true; this.notificationsBtn?.setAttribute('aria-expanded', 'false'); }

  async markNotificationRead(id, triggerButton) {
    const notification = this.notifications.find((item) => item.id === id);
    if (!notification || notification.read_at) return;
    if (triggerButton) { triggerButton.disabled = true; triggerButton.textContent = 'Enabling…'; }
    try {
      const response = await fetch(this.notificationsApiUrl, { method: 'POST', headers: { 'X-User-Email': this.profileData.email, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not enable folder.');
      notification.read_at = new Date().toISOString();
      this.renderNotifications();
      const detail = { ...notification, folder: payload.folder, shortcuts: payload.shortcuts || [] };
      window.dispatchEvent(new CustomEvent('sharedFolderNotification', { detail }));
      if (payload.folder?.id) this.openFolderInDashboard(payload.folder.id);
    } catch (error) {
      console.warn('Could not mark notification read:', error);
      if (triggerButton) { triggerButton.disabled = false; triggerButton.textContent = 'Enable folder'; }
    }
  }

  viewNotification(notification) {
    if (notification?.resource_id) this.openFolderInDashboard(notification.resource_id);
  }

  openFolderInDashboard(folderId) {
    const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
    const url = new URL(dashboardUrl);
    url.searchParams.set('folder_id', folderId);
    if (window.location.href === url.toString()) {
      window.dispatchEvent(new CustomEvent('openFolder', { detail: { folderId } }));
    } else {
      window.location.assign(url.toString());
    }
  }

  async markAllNotificationsRead() {
    if (!this.markAllNotificationsBtn || this.markAllNotificationsBtn.disabled) return;
    const originalLabel = this.markAllNotificationsBtn.textContent;
    this.markAllNotificationsBtn.disabled = true;
    this.markAllNotificationsBtn.textContent = 'Marking…';
    try {
      await Promise.all(this.notifications.filter((item) => !item.read_at).map((item) => this.markNotificationRead(item.id)));
    } finally {
      this.markAllNotificationsBtn.disabled = false;
      this.markAllNotificationsBtn.textContent = originalLabel;
    }
  }

  formatNotificationDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Just now'; }
  escapeHtml(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
  escapeAttribute(value) { return this.escapeHtml(value).replace(/"/g, '&quot;'); }

  // =============================================
  // PROFILE DATA
  // =============================================
  async loadProfileData() {
    try {
      this.profileData = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getProfileInfo' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ firstName: '', lastName: '', email: '', photoUrl: '' });
            return;
          }
          resolve(response || { firstName: '', lastName: '', email: '', photoUrl: '' });
        });
      });
    } catch (e) {
      this.profileData = { firstName: '', lastName: '', email: '', photoUrl: '' };
    }
    this.generateAvatar();
    this.updateDropdownPreviews();
  }

  generateAvatar() {
    const data = this.profileData;
    const photoUrl = data && (data.avatarUrl || data.photoUrl);

    if (photoUrl && /^https?:\/\//i.test(photoUrl)) {
      if (this.profileAvatar && this.profileAvatarFallback) {
        this.profileAvatar.src = photoUrl;
        this.profileAvatar.style.display = 'block';
        this.profileAvatarFallback.style.display = 'none';
      }
      if (this.profileAvatarLarge && this.profileAvatarLargeFallback) {
        this.profileAvatarLarge.src = photoUrl;
        this.profileAvatarLarge.style.display = 'block';
        this.profileAvatarLargeFallback.style.display = 'none';
      }
      return;
    }

    const email = (data && data.email) ? data.email.trim() : '';
    const firstName = (data && data.firstName) ? data.firstName.trim() : '';
    const lastName = (data && data.lastName) ? data.lastName.trim() : '';
    const initials = this.getInitials(firstName, lastName, email);

    const colors = [
      '#1a1a2e', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6',
      '#e67e22', '#1abc9c', '#34495e', '#e91e63', '#00bcd4',
      '#ff5722', '#795548', '#607d8b', '#8bc34a', '#ff9800'
    ];
    const seed = email || firstName || lastName || 'textblitz';
    const colorIndex = this.hashString(seed) % colors.length;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colors[colorIndex];
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    const fontSize = initials.length === 1 ? 28 : 22;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2 + 1);

    const dataUrl = canvas.toDataURL('image/png');

    // Small avatar on the topbar button
    if (this.profileAvatar && this.profileAvatarFallback) {
      this.profileAvatar.src = dataUrl;
      this.profileAvatar.style.display = 'block';
      this.profileAvatarFallback.style.display = 'none';
    }

    // Larger avatar inside the dropdown identity card
    if (this.profileAvatarLarge && this.profileAvatarLargeFallback) {
      this.profileAvatarLarge.src = dataUrl;
      this.profileAvatarLarge.style.display = 'block';
      this.profileAvatarLargeFallback.style.display = 'none';
    }
  }

  updateDropdownPreviews() {
    const data = this.profileData || {};
    const firstName = (data.firstName || '').trim();
    const lastName = (data.lastName || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    if (this.previewFullName) {
      this.previewFullName.textContent = fullName || 'Not available';
    }
    if (this.previewEmail) {
      this.previewEmail.textContent = data.email || 'Not available';
    }
  }

  getInitials(firstName, lastName, email) {
    if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
    if (firstName) return firstName.length >= 2 ? firstName.substring(0, 2).toUpperCase() : firstName[0].toUpperCase();
    if (email) {
      const local = email.split('@')[0].replace(/[0-9]/g, '');
      const parts = local.split(/[._\-+]/);
      if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
      if (local.length >= 2) return local.substring(0, 2).toUpperCase();
      if (local.length === 1) return local[0].toUpperCase();
    }
    return 'TB';
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // =============================================
  // PROFILE DROPDOWN
  // =============================================
  toggleProfileDropdown() {
    if (this.profileDropdownOpen) this.closeProfileDropdown();
    else this.openProfileDropdown();
  }

  openProfileDropdown() {
    if (this.headerProfileDropdown) {
      this.headerProfileDropdown.classList.add('open');
      this.profileDropdownOpen = true;
      this.headerProfileBtn.setAttribute('aria-expanded', 'true');
    }
  }

  closeProfileDropdown() {
    if (this.headerProfileDropdown) {
      this.headerProfileDropdown.classList.remove('open');
      this.profileDropdownOpen = false;
      if (this.headerProfileBtn) this.headerProfileBtn.setAttribute('aria-expanded', 'false');
    }
  }

  // =============================================
  // BRAND/HOME NAVIGATION
  // =============================================
  handleBrandClick() {
    // Keep the dashboard-specific event for in-page navigation, but also
    // navigate directly in pages like Workspace/Docs that do not listen for it.
    window.dispatchEvent(new CustomEvent('headerBrandClick', {
      detail: { action: 'navigateToHome' }
    }));

    const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
    if (window.location.href !== dashboardUrl) {
      window.location.assign(dashboardUrl);
    }
  }
}


async function initHeader() {
  console.log('🎬 Initializing header...');
  window.headerModule = new HeaderModule();
  await window.headerModule.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeader);
} else {
  initHeader();
}