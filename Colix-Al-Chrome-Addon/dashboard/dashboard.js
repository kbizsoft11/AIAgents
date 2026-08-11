// dashboard/dashboard.js
class TextBlitzDashboard {
  constructor() {
    this.editingId = null;
    this.shortcuts = [];
    this.currentSection = 'shortcuts';
    this.profileData = null;
    this.profileDropdownOpen = false;
    this.isYearly = false;
    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.loadShortcuts();
    await this.loadProfileData();
    await StorageHelper.checkUser();
    this.render();
  }

  bindElements() {
    this.navItems = document.querySelectorAll('.nav-item');
    this.sectionShortcuts = document.getElementById('sectionShortcuts');
    this.sectionHelp = document.getElementById('sectionHelp');

    // Premium feature section
    this.premiumBox = document.querySelector(".premium-cta");
    this.premiumBoxMember = document.querySelector(".premium-cta-member");

    this.fmtBold = document.getElementById('fmtBold');
    this.fmtItalic = document.getElementById('fmtItalic');
    this.fmtUnderline = document.getElementById('fmtUnderline');
    this.fmtEmoji = document.getElementById('fmtEmoji');
    this.emojiPicker = document.getElementById('emojiPicker');
    this.expansionInput = document.getElementById('expansionInput');

    this.addNewBtn = document.getElementById('addNewBtn');
    this.bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    this.searchInput = document.getElementById('searchInput');
    this.shortcutCount = document.getElementById('shortcutCount');

    this.formOverlay = document.getElementById('formOverlay');
    this.formTitle = document.getElementById('formTitle');
    this.triggerInput = document.getElementById('triggerInput');
    this.labelInput = document.getElementById('labelInput');
    this.expansionInput = document.getElementById('expansionInput');
    this.formError = document.getElementById('formError');
    this.saveBtn = document.getElementById('saveBtn');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.closeFormBtn = document.getElementById('closeFormBtn');

    this.bulkDeleteOverlay = document.getElementById('bulkDeleteOverlay');
    this.bulkDeleteCount = document.getElementById('bulkDeleteCount');
    this.bulkDeleteCancelBtn = document.getElementById('bulkDeleteCancelBtn');
    this.bulkDeleteConfirmBtn = document.getElementById('bulkDeleteConfirmBtn');

    // Profile token
    this.profileTokenBtn = document.getElementById('profileTokenBtn');
    this.profileDropdown = document.getElementById('profileDropdown');
    this.profileAvatar = document.getElementById('profileAvatar');
    this.profileAvatarFallback = document.getElementById('profileAvatarFallback');
    this.previewFirstName = document.getElementById('previewFirstName');
    this.previewLastName = document.getElementById('previewLastName');
    this.previewEmail = document.getElementById('previewEmail');
    this.previewFullName = document.getElementById('previewFullName');

    // Upgrade box

    // Premium
    this.upgradeBtn = document.getElementById('upgradeBtn');
    this.upgradeLink = document.getElementById('magicaa-upgrade-link');
    this.upgradeCotainer = document.querySelector(".magicaa-notification-bar");
    this.premiumOverlay = document.getElementById('premiumOverlay');
    this.closePremiumBtn = document.getElementById('closePremiumBtn');
    this.billingToggle = document.getElementById('billingToggle');
    this.billingMonthlyLabel = document.getElementById('billingMonthlyLabel');
    this.billingYearlyLabel = document.getElementById('billingYearlyLabel');
    this.pricingPrice = document.getElementById('pricingPrice');
    this.pricingPeriod = document.getElementById('pricingPeriod');
    // this.pricingOriginal = document.getElementById('pricingOriginal');
    // this.pricingStrikethrough = document.getElementById('pricingStrikethrough');
    this.premiumBuyBtn = document.getElementById('premiumBuyBtn');

    this.shortcutsList = document.getElementById('shortcutsList');
    this.emptyState = document.getElementById('emptyState');
    this.emptyAddBtn = document.getElementById('emptyAddBtn');
    this.noResults = document.getElementById('noResults');

    this.limitFill = document.getElementById('limitFill');
    this.limitText = document.getElementById('limitText');

    this.toastContainer = document.getElementById('toastContainer');
  }

  bindEvents() {

    this.checkUser();

    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add-shortcut') {
      window.history.replaceState({}, '', window.location.pathname);
      this.handleAddNew();
    }

    // Navigation
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchSection(item.dataset.section);
      });
    });

    // Add new
    this.addNewBtn.addEventListener('click', () => this.handleAddNew());
    if (this.emptyAddBtn) {
      this.emptyAddBtn.addEventListener('click', () => this.handleAddNew());
    }

    // Form
    this.saveBtn.addEventListener('click', () => this.handleSave());
    this.cancelBtn.addEventListener('click', () => this.hideForm());
    this.closeFormBtn.addEventListener('click', () => this.hideForm());
    this.formOverlay.addEventListener('click', (e) => {
      if (e.target === this.formOverlay) this.hideForm();
    });

    this.fmtBold.addEventListener('click', () => this.applyFormat('bold'));
    this.fmtItalic.addEventListener('click', () => this.applyFormat('italic'));
    this.fmtUnderline.addEventListener('click', () => this.applyFormat('underline'));

    this.fmtEmoji.addEventListener('click', (e) => { e.stopPropagation(); this.closeProfileDropdown(); this.toggleEmojiPicker(); });
    document.addEventListener('click', (e) => {
      if (!this.emojiPicker.contains(e.target) && e.target !== this.fmtEmoji) {
        this.emojiPicker.classList.remove('open');
      }
    });

    // Update button active states whenever selection/cursor moves inside editor
    document.addEventListener('selectionchange', () => this.updateFormatBtns());
    this.expansionInput.addEventListener('blur', () => this.updateFormatBtns());

    // Bulk delete
    this.bulkDeleteBtn.addEventListener('click', () => this.showBulkDeleteConfirm());
    this.bulkDeleteCancelBtn.addEventListener('click', () => this.hideBulkDeleteConfirm());
    this.bulkDeleteConfirmBtn.addEventListener('click', () => this.handleBulkDelete());
    this.bulkDeleteOverlay.addEventListener('click', (e) => {
      if (e.target === this.bulkDeleteOverlay) this.hideBulkDeleteConfirm();
    });

    // Profile token
    this.profileTokenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.emojiPicker.classList.remove('open');
      this.toggleProfileDropdown();
    });

    this.profileDropdown.querySelectorAll('.profile-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.insertToken(item.dataset.token);
      });
    });

    document.addEventListener('click', (e) => {
      if (this.profileDropdownOpen &&
        !this.profileTokenBtn.contains(e.target) &&
        !this.profileDropdown.contains(e.target)) {
        this.closeProfileDropdown();
      }
    });

    // Premium modal
    this.upgradeBtn.addEventListener('click', () => this.showPremiumModal());
    this.upgradeLink.addEventListener('click', () => this.showPremiumModal());
    this.closePremiumBtn.addEventListener('click', () => this.hidePremiumModal());
    this.premiumOverlay.addEventListener('click', (e) => {
      if (e.target === this.premiumOverlay) this.hidePremiumModal();
    });

    // Billing toggle
    this.billingToggle.addEventListener('change', () => {
      this.isYearly = this.billingToggle.checked;
      this.updatePricing();
    });

    // Premium buy button
    this.premiumBuyBtn.addEventListener('click', async () => {
      try {
        const profileUserInfo = await chrome.identity.getProfileUserInfo();

        const email = profileUserInfo.email || '';

        const monthlyPrice = 5.99;
        // const yearlyTotal = (monthlyPrice * 12 * 0.85).toFixed(2);
        const yearlyTotal = 4.99;

        const billing = this.isYearly ? 'yearly' : 'monthly';
        const price = this.isYearly ? yearlyTotal : monthlyPrice;

        const token = btoa(JSON.stringify({
          email,
          billing,
          price
        }));

        this.hidePremiumModal();

        chrome.tabs.create({
          url: `https://extensions.kbizsoft.com/magicaa-extension/checkout.php?token=${encodeURIComponent(token)}`
        });

      } catch (error) {
        console.error(error);
        this.showToast('Failed to open checkout');
      }
    });

    // Search
    this.searchInput.addEventListener('input', () => this.render());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.profileDropdownOpen) {
          this.closeProfileDropdown();
        } else if (this.premiumOverlay.style.display !== 'none') {
          this.hidePremiumModal();
        } else if (this.bulkDeleteOverlay.style.display !== 'none') {
          this.hideBulkDeleteConfirm();
        } else if (this.formOverlay.style.display !== 'none') {
          this.hideForm();
        }
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && this.formOverlay.style.display !== 'none') {
        e.preventDefault();
        this.handleSave();
      }

      if (e.key === 'n' && (e.ctrlKey || e.metaKey) &&
        this.formOverlay.style.display === 'none' &&
        this.bulkDeleteOverlay.style.display === 'none' &&
        this.premiumOverlay.style.display === 'none') {
        e.preventDefault();
        this.handleAddNew();
      }
    });

    this.triggerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.expansionInput.focus(); }
    });

    // Storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.shortcuts) {
        this.shortcuts = changes.shortcuts.newValue || [];
        this.render();
      }
    });
  }

  async checkUser() {
    const profileUserInfo = await chrome.identity.getProfileUserInfo();

    const email = profileUserInfo.email || '';

    try {
      const data = await fetch(`https://extensions.kbizsoft.com/magicaa-extension/check_user.php?email=${email}`)
      const response = await data.json();
      // console.log(response)
      if (response.success && response.user && response.user.is_premium) {
        this.premiumBox.style.display = "none"
        this.premiumBoxMember.style.display = "block"
      }
      else {
        this.premiumBox.style.display = "block"
        this.premiumBoxMember.style.display = "none"

      }
    }
    catch (e) {
      console.error(e)
    }

  }

  applyFormat(type) {
    // execCommand works directly on the contenteditable div
    this.expansionInput.focus();
    document.execCommand(type, false, null);
    this.updateFormatBtns();
  }

  toggleEmojiPicker() {
    if (this.emojiPicker.classList.contains('open')) {
      this.emojiPicker.classList.remove('open');
      return;
    }
    // Build picker once
    if (!this.emojiPicker.dataset.built) {
      const categories = [
        { name: 'Smileys', emojis: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😇', '😉', '😊', '🙂', '🙃', '😋', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😛', '😝', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🥱', '😪', '🤤', '😴'] },
        { name: 'Gestures', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '💪', '🦾', '🙏', '👏', '🤲', '🤝', '✍️', '💅', '🤳'] },
        { name: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❤️‍🔥', '❤️‍🩹'] },
        { name: 'People', emojis: ['👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷'] },
        { name: 'Animals', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦏', '🦛', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃'] },
        { name: 'Food', emojis: ['🍎', '🍊', '🍋', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🍜', '🍝', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥮', '🍢', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🧃', '🥤', '🧋', '☕', '🍵', '🧉', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧊'] },
        { name: 'Travel', emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️', '🛺', '🚲', '🛴', '🛹', '🚏', '🚦', '🚧', '⛽', '🛞', '⚓', '🛟', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛺', '🏕️', '🌋', '🗺️', '🏔️', '⛰️', '🗻', '🏘️', '🏚️', '🏗️', '🏛️', '🏟️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋'] },
        { name: 'Objects', emojis: ['💡', '🔦', '🕯️', '🪔', '🧱', '💎', '🔑', '🗝️', '🔐', '🔒', '🔓', '🔨', '🪓', '⛏️', '🔧', '🪛', '🔩', '⚙️', '🗜️', '🔗', '📎', '🖇️', '📌', '📍', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '📷', '📸', '📹', '🎥', '📽️', '🎬', '📞', '☎️', '📟', '📠', '📺', '📻', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌚', '📡', '🔋', '🪫', '🔌', '💾', '💿', '📀', '🧮', '🎙️', '🎚️', '🎛️', '📢', '📣', '🔔', '🔕', '🎵', '🎶', '🎼', '🎤', '🎧', '📻'] },
        { name: 'Symbols', emojis: ['✅', '❌', '❎', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔲', '🔳', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '⬛', '⬜', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⭐', '🌟', '💫', '✨', '⚡', '🔥', '💥', '❄️', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'] },
      ];
      this.emojiPicker.innerHTML = categories.map(cat => `
      <div class="emoji-category-title">${cat.name}</div>
      <div class="emoji-grid">${cat.emojis.map(e =>
        `<button class="emoji-item" type="button" data-emoji="${e}">${e}</button>`
      ).join('')}</div>
    `).join('');
      this.emojiPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-item');
        if (!btn) return;
        this.insertEmoji(btn.dataset.emoji);
      });
      this.emojiPicker.dataset.built = '1';
    }
    this.emojiPicker.classList.add('open');
  }

  insertEmoji(emoji) {
    this.expansionInput.focus();
    document.execCommand('insertText', false, emoji);
    this.emojiPicker.classList.remove('open');
  }

  updateFormatBtns() {
    // Only show active state when focus is inside the editor
    const inEditor = document.activeElement === this.expansionInput ||
      this.expansionInput.contains(document.activeElement);
    this.fmtBold.classList.toggle('fmt-active', inEditor && document.queryCommandState('bold'));
    this.fmtItalic.classList.toggle('fmt-active', inEditor && document.queryCommandState('italic'));
    this.fmtUnderline.classList.toggle('fmt-active', inEditor && document.queryCommandState('underline'));
  }

  // =============================================
  // PREMIUM MODAL
  // =============================================
  showPremiumModal() {
    this.premiumOverlay.style.display = 'flex';
    this.isYearly = false;
    this.billingToggle.checked = false;
    this.updatePricing();
  }

  hidePremiumModal() {
    this.premiumOverlay.style.display = 'none';
  }

  updatePricing() {
    const monthlyPrice = 5.99;
    // const yearlyMonthly = parseFloat((monthlyPrice * 12 * 0.85 / 12).toFixed(2));
    const yearlyMonthly = 4.99;
    const yearlyTotal = (monthlyPrice * 12 * 0.85).toFixed(2);

    if (this.isYearly) {
      this.pricingPrice.textContent = yearlyMonthly;
      this.pricingPeriod.textContent = '/month';
      // this.pricingOriginal.style.display = 'block';
      // this.pricingStrikethrough.textContent = `$${monthlyPrice}/month — Billed $${yearlyTotal}/year`;
      this.billingMonthlyLabel.classList.remove('active');
      this.billingYearlyLabel.classList.add('active');
      this.premiumBuyBtn.textContent = `Get Premium — $${yearlyTotal}/year`;
    } else {
      this.pricingPrice.textContent = monthlyPrice;
      this.pricingPeriod.textContent = '/month';
      // this.pricingOriginal.style.display = 'none';
      this.billingMonthlyLabel.classList.add('active');
      this.billingYearlyLabel.classList.remove('active');
      this.premiumBuyBtn.textContent = `Get Premium — $${monthlyPrice}/month`;
    }
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
    const avatarImg = this.profileAvatar;
    const avatarFallback = this.profileAvatarFallback;
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

    avatarImg.src = canvas.toDataURL('image/png');
    avatarImg.style.display = 'block';
    avatarFallback.style.display = 'none';
  }

  updateDropdownPreviews() {
    const data = this.profileData;
    this.previewFirstName.textContent = (data && data.firstName) || 'Not available';
    this.previewLastName.textContent = (data && data.lastName) || 'Not available';
    this.previewEmail.textContent = (data && data.email) || 'Not available';
    this.previewFullName.textContent = (data && data.firstName + " " + data.lastName) || 'Not available';
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
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
    return Math.abs(hash);
  }

  toggleProfileDropdown() {
    if (this.profileDropdownOpen) this.closeProfileDropdown();
    else this.openProfileDropdown();
  }

  openProfileDropdown() {
    // Save current selection so we can restore it when inserting token
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this._savedRange = sel.getRangeAt(0).cloneRange();
    } else {
      this._savedRange = null;
    }
    this.profileDropdown.style.display = 'block';
    this.profileDropdownOpen = true;
  }

  closeProfileDropdown() {
    this.profileDropdown.style.display = 'none';
    this.profileDropdownOpen = false;
  }

  insertToken(token) {
    const editor = this.expansionInput;
    editor.focus();

    // Restore saved selection if we had one
    if (this._savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this._savedRange);
    }

    document.execCommand('insertText', false, token);
    this.closeProfileDropdown();
    this.showToast(`Inserted ${token}`);
  }

  // =============================================
  // SECTIONS & DATA
  // =============================================
  switchSection(section) {
    this.currentSection = section;
    this.navItems.forEach(item => item.classList.toggle('active', item.dataset.section === section));
    this.sectionShortcuts.style.display = section === 'shortcuts' ? 'block' : 'none';
    this.sectionHelp.style.display = section === 'help' ? 'block' : 'none';
  }

  async loadShortcuts() { this.shortcuts = await StorageHelper.getAll(); }

  async handleAddNew() {
    const limitReached = await StorageHelper.isLimitReached();

    if (limitReached) {

      // Pulse the upgrade notification
      if (this.upgradeCotainer) {
        this.upgradeCotainer.classList.remove("magicaa-pulse");
        void this.upgradeCotainer.offsetWidth; // Restart animation
        this.upgradeCotainer.classList.add("magicaa-pulse");

        this.upgradeCotainer.addEventListener("animationend", () => {
          this.upgradeCotainer.classList.remove("magicaa-pulse");
        }, { once: true });
      }

      this.showToast(
        `Limit reached! Max ${StorageHelper.MAX_SHORTCUTS} shortcuts allowed.`,
        'error'
      );

      return;
    }

    this.showForm();
  }

  // =============================================
  // RENDER
  // =============================================
  render() {
    const query = this.searchInput.value;
    const filtered = StorageHelper.search(this.shortcuts, query);
    const total = this.shortcuts.length;
    const max = StorageHelper.MAX_SHORTCUTS;
    const pct = (total / max) * 100;

    this.shortcutCount.textContent = total;
    this.limitFill.style.width = `${Math.min(pct, 100)}%`;
    const maxDisplay = max >= 1000000 ? 'Unlimited' : max;
    this.limitText.textContent = `${total} / ${maxDisplay} shortcuts used`;

    if (total >= max) { this.limitFill.style.background = '#e74c3c'; this.addNewBtn.title = `Limit reached`; }
    else if (total >= max - 1) { this.limitFill.style.background = '#f39c12'; this.addNewBtn.title = `${max - total} slot remaining`; }
    else { this.limitFill.style.background = '#1a1a2e'; this.addNewBtn.title = `${max - total} slots remaining`; }

    this.bulkDeleteBtn.style.display = total > 0 ? 'inline-flex' : 'none';
    this.shortcutsList.innerHTML = '';

    if (total === 0 && !query) { this.emptyState.style.display = 'block'; this.noResults.style.display = 'none'; this.shortcutsList.style.display = 'none'; return; }
    if (filtered.length === 0 && query) { this.emptyState.style.display = 'none'; this.noResults.style.display = 'block'; this.shortcutsList.style.display = 'none'; return; }

    this.emptyState.style.display = 'none';
    this.noResults.style.display = 'none';
    this.shortcutsList.style.display = 'grid';

    [...filtered].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(s => {
      this.shortcutsList.appendChild(this.createShortcutCard(s));
    });
  }

  createShortcutCard(shortcut) {
    const card = document.createElement('div');
    card.className = 'shortcut-card';
    const trunc = shortcut.expansion.length > 150 ? shortcut.expansion.substring(0, 150) + '...' : shortcut.expansion;
    const usage = shortcut.usageCount ? `Used ${shortcut.usageCount} time${shortcut.usageCount !== 1 ? 's' : ''}` : 'Never used';

    card.innerHTML = `
      <div class="shortcut-card-header">
        <div class="shortcut-trigger-wrapper">
          <span class="shortcut-trigger">${this.escapeHtml(shortcut.trigger)}</span>
          ${shortcut.label ? `<span class="shortcut-label">${this.escapeHtml(shortcut.label)}</span>` : ''}
        </div>
        <div class="shortcut-actions">
          <button class="btn btn-ghost" data-action="edit" data-id="${shortcut.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit
          </button>
          <button class="btn btn-danger-outline" data-action="delete" data-id="${shortcut.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete
          </button>
        </div>
      </div>
      <div class="shortcut-expansion">${this.escapeHtml(this.stripHtml(trunc))}</div>
      <div class="shortcut-meta"><span>📊 ${usage}</span><span>🕒 ${this.formatDate(shortcut.updatedAt)}</span></div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); this.handleEdit(shortcut.id); });
    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); this.handleDelete(shortcut.id); });
    return card;
  }

  // =============================================
  // FORM
  // =============================================
  showForm(shortcut = null) {
    this.formOverlay.style.display = 'flex';
    this.hideError();
    this.closeProfileDropdown();
    if (shortcut) {
      this.editingId = shortcut.id;
      this.formTitle.textContent = 'Edit Shortcut';
      this.triggerInput.value = shortcut.trigger;
      this.labelInput.value = shortcut.label || '';
      this.expansionInput.innerHTML = shortcut.expansion;
      this.saveBtn.textContent = 'Update Shortcut';
    } else {
      this.editingId = null;
      this.formTitle.textContent = 'Add New Shortcut';
      this.triggerInput.value = '';
      this.labelInput.value = '';
      this.expansionInput.innerHTML = '';
      this.saveBtn.textContent = 'Save Shortcut';
    }
    setTimeout(() => this.triggerInput.focus(), 100);
  }

  hideForm() { this.formOverlay.style.display = 'none'; this.editingId = null; this.hideError(); this.closeProfileDropdown(); }
  showError(msg) { this.formError.textContent = msg; this.formError.style.display = 'block'; }
  hideError() { this.formError.style.display = 'none'; }

  async handleSave() {
    const trigger = this.triggerInput.value.trim();
    const expansion = this.expansionInput.innerHTML;
    const expansionText = this.expansionInput.innerText.trim();
    const label = this.labelInput.value.trim();

    if (!trigger) { this.showError('Please enter a shortcut trigger.'); return; }
    if (trigger.length < 2) { this.showError('Trigger must be at least 2 characters.'); return; }
    if (trigger.includes(' ')) { this.showError('Trigger cannot contain spaces.'); return; }
    if (!expansionText) { this.showError('Please enter the expanded text.'); return; }

    if (!this.editingId) {
      const limitReached = await StorageHelper.isLimitReached();
      if (limitReached) { this.showError(`Maximum ${StorageHelper.MAX_SHORTCUTS} shortcuts allowed.`); return; }
    }

    const exists = await StorageHelper.triggerExists(trigger, this.editingId);
    if (exists) { this.showError(`Trigger "${trigger}" already exists.`); return; }

    try {
      if (this.editingId) {
        await StorageHelper.update(this.editingId, { trigger, expansion, label });
        this.showToast('Shortcut updated!');
      } else {
        await StorageHelper.add({ trigger, expansion, label });
        const rem = await StorageHelper.getRemainingSlots();
        this.showToast(`Shortcut created! ${rem} slot${rem !== 1 ? 's' : ''} remaining.`);
      }
      this.hideForm();
      await this.loadShortcuts();
      this.render();
    } catch (err) { this.showError(err.message || 'Failed to save.'); }
  }

  async handleEdit(id) { const s = this.shortcuts.find(x => x.id === id); if (s) this.showForm(s); }

  async handleDelete(id) {
    const s = this.shortcuts.find(x => x.id === id);
    if (!s) return;
    if (confirm(`Delete shortcut "${s.trigger}"?`)) {
      await StorageHelper.delete(id);
      this.showToast('Shortcut deleted.');
      await this.loadShortcuts();
      this.render();
    }
  }

  // =============================================
  // BULK DELETE
  // =============================================
  showBulkDeleteConfirm() { this.bulkDeleteCount.textContent = this.shortcuts.length; this.bulkDeleteOverlay.style.display = 'flex'; }
  hideBulkDeleteConfirm() { this.bulkDeleteOverlay.style.display = 'none'; }

  async handleBulkDelete() {
    const count = this.shortcuts.length;
    await StorageHelper.saveAll([]);
    this.hideBulkDeleteConfirm();
    this.showToast(`${count} shortcut${count !== 1 ? 's' : ''} deleted.`);
    await this.loadShortcuts();
    this.render();
  }

  // =============================================
  // HELPERS
  // =============================================
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
  }

  formatDate(dateStr) {
    const d = new Date(dateStr), now = new Date(), diff = now - d;
    const mins = Math.floor(diff / 60000), hrs = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }

  escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
  stripHtml(html) { const div = document.createElement('div'); div.innerHTML = html; return div.textContent || div.innerText || ''; }
}

document.addEventListener('DOMContentLoaded', () => { new TextBlitzDashboard(); });