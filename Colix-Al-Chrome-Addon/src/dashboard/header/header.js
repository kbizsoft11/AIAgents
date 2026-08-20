// =============================================
// HEADER MODULE
// Manages header interactions: profile dropdown, brand navigation
// =============================================

class HeaderModule {
  constructor() {
    this.profileData = null;
    this.profileDropdownOpen = false;
  }

  // First: Load header HTML file
  async loadHeaderHTML() {
    try {
      const headerPath = 'dashboard/header/header.html';
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
      workspace: 'dashboard/workspace/workspace.html',
      marketplace: 'dashboard/marketplace.html'
    };

    Object.entries(routes).forEach(([key, route]) => {
      const link = key === 'brandHome'
        ? container.querySelector('#brandHome')
        : container.querySelector(`[data-header-route="${key}"]`);
      if (link) link.href = chrome.runtime.getURL(route);
    });
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
  }

  bindEvents() {
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

    // Profile menu items
    if (this.headerProfileDropdown) {
      const profileMenuItems = this.headerProfileDropdown.querySelectorAll('.profile-menu-item');
      profileMenuItems.forEach((item, index) => {
        item.addEventListener('click', (e) => {
          if (index === 0) {
            this.closeProfileDropdown();
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          // Handle menu item based on position: 0=Profile, 1=Usage, 2=Trash, 3=Signout
          if (index === 1) {
            // Usage
            console.log('Usage clicked');
          } else if (index === 2) {
            // Trash
            console.log('Trash clicked');
          } else if (index === 3) {
            // Signout
            chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Logout failed:', chrome.runtime.lastError);
              }
              chrome.tabs.getCurrent((tab) => {
                chrome.tabs.remove(tab.id);
              });
            });
          }

          this.closeProfileDropdown();
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

    document.addEventListener('click', (e) => {
      if (this.profileDropdownOpen &&
        this.headerProfileBtn &&
        this.headerProfileDropdown &&
        !this.headerProfileBtn.contains(e.target) &&
        !this.headerProfileDropdown.contains(e.target)) {
        this.closeProfileDropdown();
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
    
    console.log('✨ Header initialization complete!');
  }

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
    // This method is called when the brand is clicked
    // The dashboard will listen for this and navigate to home
    window.dispatchEvent(new CustomEvent('headerBrandClick', {
      detail: { action: 'navigateToHome' }
    }));
  }
}

// Initialize header module when DOM is ready
console.log('📋 header.js loaded. DOM state:', document.readyState);

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