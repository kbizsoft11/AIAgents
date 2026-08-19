// dashboard/dashboard.js
class TextBlitzDashboard {
  constructor() {
    this.editingId = null;
    this.shortcuts = [];
    this.forms = [];
    this.currentSection = 'shortcuts';
    this.profileData = null;
    this.profileDropdownOpen = false;
    this.isYearly = false;
    this.premiumModalReturnSection = null;
    this.premiumModalParent = null;
    // Tracks which folder a form should be created in when the form builder
    // is opened from the sidebar's per-folder / global "add form" action.
    // 'uncategorized' (the sidebar's synthetic bucket id) is normalized to null.
    this.pendingFormFolderId = null;
    this.init();
  }

  async init() {
    // Initialize Supabase
    await initSupabaseClient();
    const authMgr = await initAuthManager();

    if (!authMgr.isUserAuthenticated()) {
      // Try to authenticate with Chrome Identity
      try {
        await authMgr.authenticateWithChrome();
        console.log('✅ User authenticated with Supabase');
      } catch (error) {
        console.warn('⚠️ Supabase authentication failed:', error.message);
      }
    }

    // Initialize sync manager if authenticated
    if (authMgr.isUserAuthenticated()) {
      const userEmail = authMgr.getUserEmail();
      const syncMgr = await initSyncManager(userEmail);
      console.log('✅ Sync manager initialized for:', userEmail);
    }

    this.bindElements();
    this.bindEvents();
    
    // Check user status and load limits BEFORE loading shortcuts
    await StorageHelper.checkUser();
    
    // Initialize sidebar manager
    await initSidebarManager();
    
    await this.loadShortcuts();

    // Populate sample forms if empty
    if (!this.forms || this.forms.length === 0) {
      const sampleForms = [
        {
          id: 'form_sample_contact',
          trigger: '/contact',
          label: 'Client Contact Form',
          template: 'contact',
          fields: ['Name', 'Email', 'Phone', 'Message'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'form_sample_meeting',
          trigger: '/meeting',
          label: 'Meeting Scheduler',
          template: 'meeting',
          fields: ['Name', 'Email', 'Company', 'Meeting Date', 'Meeting Topic', 'Notes'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      await StorageHelper.saveAllForms(sampleForms);
      this.forms = sampleForms;
      // Refresh sidebar manager data
      if (typeof getSidebarManager === 'function') {
        const sidebarMgr = getSidebarManager();
        if (sidebarMgr) {
          sidebarMgr.forms = sampleForms;
          sidebarMgr.render();
        }
      }
    }

    await this.loadProfileData();
    await this.checkUser(); // This will call updateLimitDisplays()
    this.render();
    this.renderForms();
  }

  bindElements() {
    this.navItems = document.querySelectorAll('.nav-item');
    this.sectionShortcuts = document.getElementById('sectionShortcuts');
    this.sectionHelp = document.getElementById('sectionHelp');
    this.sectionForms = document.getElementById('sectionForms');
    this.profileModule = window.ProfileModule || null;

    // Mobile / responsive shell elements
    this.sidebar = document.getElementById('sidebar');
    this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
    this.sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    this.sidebarBackdrop = document.getElementById('sidebarBackdrop');

    // Editor view elements
    this.editorView = document.getElementById('editorView');
    this.editorBackBtn = document.getElementById('editorBackBtn');
    this.editorCancelBtn = document.getElementById('editorCancelBtn');
    this.editorSaveBtn = document.getElementById('editorSaveBtn');
    this.editorLabelInput = document.getElementById('editorLabelInput');
    this.editorShortcutInput = document.getElementById('editorShortcutInput');
    this.editorTextArea = document.getElementById('editorTextArea');
    this.editorTryItBtn = document.getElementById('editorTryItBtn');
    this.currentEditorMode = null; // 'new' or 'edit'
    this.currentEditorType = null; // 'shortcut' or 'form'
    this.currentEditorItem = null;
    this.currentTargetFolderId = null;
    
    // Try It Modal
    this.tryItOverlay = document.getElementById('tryItOverlay');
    this.tryItTrigger = document.getElementById('tryItTrigger');
    this.tryItPreview = document.getElementById('tryItPreview');
    this.closeTryItBtn = document.getElementById('closeTryItBtn');
    this.closeTryItBtnFooter = document.getElementById('closeTryItBtnFooter');
    
    this.formCount = document.getElementById('formCount');
    this.formsList = document.getElementById('formsList');
    this.formsEmptyState = document.getElementById('formsEmptyState');
    this.addFormBtn = document.getElementById('addFormBtn');
    this.emptyAddFormBtn = document.getElementById('emptyAddFormBtn');
    this.formBuilderOverlay = document.getElementById('formBuilderOverlay');
    this.formTemplateCards = document.getElementById('formTemplateCards');
    this.selectedFormTemplate = 'contact';
    this.formTriggerInput = document.getElementById('formTriggerInput');
    this.formLabelInput = document.getElementById('formLabelInput');
    this.formFieldsPreview = document.getElementById('formFieldsPreview');
    this.formBuilderError = document.getElementById('formBuilderError');
    this.closeFormBuilderBtn = document.getElementById('closeFormBuilderBtn');
    this.cancelFormBuilderBtn = document.getElementById('cancelFormBuilderBtn');
    this.saveFormBtn = document.getElementById('saveFormBtn');

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
    this.formsUpgradeLink = document.getElementById('magicaa-forms-upgrade-link');
    this.upgradeCotainer = document.querySelector(".magicaa-notification-bar");
    this.formsUpgradeContainer = this.sectionForms.querySelector('.magicaa-notification-bar');
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

    // Dynamic limit display elements
    this.shortcutLimitDisplay = document.getElementById('shortcut-limit-display');
    this.formLimitDisplay = document.getElementById('form-limit-display');
    this.freePlanLimitDisplay = document.getElementById('free-plan-limit-display');

    // Welcome & Folder View elements
    this.welcomeView = document.getElementById('welcomeView');
    this.folderView = document.getElementById('folderView');
    this.welcomePlayground = document.getElementById('welcomePlayground');
    this.welcomeNewSnippetBtn = document.getElementById('welcomeNewSnippetBtn');
    this.welcomeNewFolderBtn = document.getElementById('welcomeNewFolderBtn');
    this.welcomeNewFormBtn = document.getElementById('welcomeNewFormBtn');

    this.folderViewTitle = document.getElementById('folderViewTitle');
    this.folderViewDescription = document.getElementById('folderViewDescription');
    this.folderNewSnippetBtn = document.getElementById('folderNewSnippetBtn');
    this.folderItemsList = document.getElementById('folderItemsList');
    this.folderEmptyState = document.getElementById('folderEmptyState');
    this.folderEmptyAddBtn = document.getElementById('folderEmptyAddBtn');
    this.folderDisableBtn = document.getElementById('folderDisableBtn');
    this.folderDeleteBtn = document.getElementById('folderDeleteBtn');
  }

  bindEvents() {

    this.checkUser();

    window.addEventListener('headerFormsClick', () => {
      this.switchSection('forms');
      this.closeMobileSidebar();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'profile') {
      this.showProfilePage();
      return;
    }
    if (params.get('action') === 'forms') {
      window.history.replaceState({}, '', window.location.pathname);
      this.switchSection('forms');
    }
    if (params.get('action') === 'add-form') {
      window.history.replaceState({}, '', window.location.pathname);
      this.switchSection('forms');
      this.handleAddForm();
    }
    if (params.get('action') === 'add-shortcut') {
      window.history.replaceState({}, '', window.location.pathname);
      this.handleAddNew();
    }

    // Navigation
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchSection(item.dataset.section);
        this.closeMobileSidebar();
      });
    });

    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader) {
      sidebarHeader.style.cursor = 'pointer';
      sidebarHeader.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-close-btn')) return;
        const sidebarMgr = getSidebarManager();
        if (sidebarMgr) {
          sidebarMgr.setActiveFolder(null);
        }
      });
    }

    // Mobile sidebar (off-canvas) controls
    if (this.mobileMenuBtn) {
      this.mobileMenuBtn.addEventListener('click', () => this.openMobileSidebar());
    }
    if (this.sidebarCloseBtn) {
      this.sidebarCloseBtn.addEventListener('click', () => this.closeMobileSidebar());
    }
    if (this.sidebarBackdrop) {
      this.sidebarBackdrop.addEventListener('click', () => this.closeMobileSidebar());
    }
    // Close the mobile sidebar automatically after picking a snippet/folder/form from the tree
    if (this.sidebar) {
      this.sidebar.addEventListener('click', (e) => {
        if (window.innerWidth > 900) return;
        const actionable = e.target.closest('.sidebar-item, .sidebar-fab, .folder-action-btn');
        if (actionable) this.closeMobileSidebar();
      });
    }
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) this.closeMobileSidebar();
    });

    // Add new
    this.addNewBtn.addEventListener('click', () => this.handleAddNew());
    this.addFormBtn.addEventListener('click', () => this.handleAddForm());
    this.emptyAddFormBtn.addEventListener('click', () => this.handleAddForm());
    this.closeFormBuilderBtn.addEventListener('click', () => this.hideFormBuilder());
    this.cancelFormBuilderBtn.addEventListener('click', () => this.hideFormBuilder());
    this.formBuilderOverlay.addEventListener('click', (e) => { if (e.target === this.formBuilderOverlay) this.hideFormBuilder(); });
    this.saveFormBtn.addEventListener('click', () => this.handleSaveForm());
    if (this.emptyAddBtn) {
      this.emptyAddBtn.addEventListener('click', () => this.handleAddNew());
    }

    // Editor view buttons
    if (this.editorBackBtn) {
      this.editorBackBtn.addEventListener('click', () => this.closeEditor());
    }
    if (this.editorCancelBtn) {
      this.editorCancelBtn.addEventListener('click', () => this.closeEditor());
    }
    if (this.editorSaveBtn) {
      this.editorSaveBtn.addEventListener('click', () => this.saveFromEditor());
    }
    if (this.editorTryItBtn) {
      this.editorTryItBtn.addEventListener('click', () => this.showTryItModal());
    }

    // Try It Modal
    if (this.closeTryItBtn) {
      this.closeTryItBtn.addEventListener('click', () => this.closeTryItModal());
    }
    if (this.closeTryItBtnFooter) {
      this.closeTryItBtnFooter.addEventListener('click', () => this.closeTryItModal());
    }
    if (this.tryItOverlay) {
      this.tryItOverlay.addEventListener('click', (e) => {
        if (e.target === this.tryItOverlay) this.closeTryItModal();
      });
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
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.insertToken(item.dataset.token);
        }
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
    this.upgradeLink.addEventListener('click', (e) => { e.preventDefault(); this.showPremiumModal(); });
    this.formsUpgradeLink.addEventListener('click', (e) => { e.preventDefault(); this.showPremiumModal(); });
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
        } else if (this.tryItOverlay && this.tryItOverlay.classList.contains('active')) {
          this.closeTryItModal();
        } else if (this.sidebar && this.sidebar.classList.contains('open')) {
          this.closeMobileSidebar();
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

    // Welcome view quick actions
    if (this.welcomeNewSnippetBtn) {
      this.welcomeNewSnippetBtn.addEventListener('click', () => this.handleAddNew());
    }
    if (this.welcomeNewFolderBtn) {
      this.welcomeNewFolderBtn.addEventListener('click', () => {
        const sidebarMgr = getSidebarManager();
        if (sidebarMgr) sidebarMgr.createFolder();
      });
    }
    if (this.welcomeNewFormBtn) {
      this.welcomeNewFormBtn.addEventListener('click', () => this.handleAddForm());
    }

    // Welcome Playground live expansion
    if (this.welcomePlayground) {
      this.welcomePlayground.addEventListener('input', (e) => this.handlePlaygroundInput(e));
    }

    // Folder view events
    if (this.folderViewTitle) {
      this.folderViewTitle.addEventListener('blur', () => this.saveCurrentFolderTitle());
      this.folderViewTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });
    }
    if (this.folderViewDescription) {
      this.folderViewDescription.addEventListener('blur', () => this.saveCurrentFolderDescription());
    }
    if (this.folderNewSnippetBtn) {
      this.folderNewSnippetBtn.addEventListener('click', () => {
        const sidebarMgr = getSidebarManager();
        const activeFolder = sidebarMgr ? sidebarMgr.activeFolder : null;
        this.openEditor('new', 'shortcut', activeFolder);
      });
    }
    if (this.folderEmptyAddBtn) {
      this.folderEmptyAddBtn.addEventListener('click', () => {
        const sidebarMgr = getSidebarManager();
        const activeFolder = sidebarMgr ? sidebarMgr.activeFolder : null;
        this.openEditor('new', 'shortcut', activeFolder);
      });
    }
    if (this.folderDeleteBtn) {
      this.folderDeleteBtn.addEventListener('click', () => {
        const sidebarMgr = getSidebarManager();
        if (sidebarMgr && sidebarMgr.activeFolder) {
          sidebarMgr.deleteFolder(sidebarMgr.activeFolder);
        }
      });
    }

    // Storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.shortcuts) {
        this.shortcuts = changes.shortcuts.newValue || [];
        this.render();
      }
      if (namespace === 'local' && changes.forms) {
        this.forms = changes.forms.newValue || [];
        this.renderForms();
      }
    });
  }

  // =============================================
  // MOBILE / OFF-CANVAS SIDEBAR
  // =============================================
  openMobileSidebar() {
    if (!this.sidebar) return;
    this.sidebar.classList.add('open');
    if (this.sidebarBackdrop) this.sidebarBackdrop.classList.add('visible');
    if (this.mobileMenuBtn) this.mobileMenuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  closeMobileSidebar() {
    if (!this.sidebar) return;
    this.sidebar.classList.remove('open');
    if (this.sidebarBackdrop) this.sidebarBackdrop.classList.remove('visible');
    if (this.mobileMenuBtn) this.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  async checkUser() {
    const profileUserInfo = await chrome.identity.getProfileUserInfo();

    const email = profileUserInfo.email || '';

    try {
      const data = await fetch(`https://extensions.kbizsoft.com/magicaa-extension/check_user.php?email=${email}`)
      const response = await data.json();
      // console.log(response)
      const premiumValue = response.user && response.user.is_premium;
      const isPremium = premiumValue === true || premiumValue === 1 || premiumValue === '1' || premiumValue === 'true';
      if (response.success && response.user && isPremium) {
        this.premiumBox.style.display = "none"
        this.premiumBoxMember.style.display = "block"
      }
      else {
        this.premiumBox.style.display = "block"
        this.premiumBoxMember.style.display = "none"

      }
      
      // Update dynamic limit displays after checking user
      this.updateLimitDisplays();
    }
    catch (e) {
      console.error(e)
      // Still update displays with fallback values
      this.updateLimitDisplays();
    }

  }

  /**
   * Update all limit display elements with current StorageHelper.MAX_SHORTCUTS value
   */
  updateLimitDisplays() {
    const max = StorageHelper.MAX_SHORTCUTS;
    const unlimited = max >= 1000000;
    
    if (unlimited) {
      // Premium user - hide notification bars or show unlimited
      if (this.shortcutLimitDisplay) {
        this.shortcutLimitDisplay.textContent = 'Unlimited Shortcuts';
      }
      if (this.formLimitDisplay) {
        this.formLimitDisplay.textContent = 'Unlimited Forms';
      }
      if (this.freePlanLimitDisplay) {
        this.freePlanLimitDisplay.textContent = 'Unlimited shortcuts • Premium features';
      }
    } else {
      // Free user - show actual limit from API
      if (this.shortcutLimitDisplay) {
        this.shortcutLimitDisplay.textContent = `${max} Shortcuts`;
      }
      if (this.formLimitDisplay) {
        this.formLimitDisplay.textContent = `${max} Forms`;
      }
      if (this.freePlanLimitDisplay) {
        this.freePlanLimitDisplay.textContent = `${max} shortcuts • Basic features`;
      }
    }
    
    console.log(`✅ Limit displays updated: ${unlimited ? 'Unlimited' : max}`);
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
    if (this.currentSection !== 'shortcuts') {
      this.premiumModalReturnSection = this.currentSection;
      this.premiumModalParent = this.premiumOverlay.parentNode;
      document.body.appendChild(this.premiumOverlay);
    }
    this.premiumOverlay.style.display = 'flex';
    this.isYearly = false;
    this.billingToggle.checked = false;
    this.updatePricing();
  }

  hidePremiumModal() {
    this.premiumOverlay.style.display = 'none';
    if (this.premiumModalReturnSection) {
      this.premiumModalReturnSection = null;
      if (this.premiumModalParent) {
        this.premiumModalParent.appendChild(this.premiumOverlay);
        this.premiumModalParent = null;
      }
    }
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
    if (this.profileModule && this.profileModule.isVisible()) {
      this.profileModule.loadProfileData();
    }
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

  buildAvatarDataUrl(email, firstName, lastName) {
    const initials = this.getInitials(firstName, lastName, email);
    const colors = [
      '#1a1a2e', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6',
      '#e67e22', '#1abc9c', '#34495e', '#e91e63', '#00bcd4',
      '#ff5722', '#795548', '#607d8b', '#8bc34a', '#ff9800'
    ];
    const seed = email || firstName || lastName || 'textblitz';
    const colorIndex = this.hashString(seed) % colors.length;
    const size = 120;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colors[colorIndex];
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    const fontSize = initials.length === 1 ? 46 : 36;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2 + 2);
    return canvas.toDataURL('image/png');
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
    this.profileTokenBtn.setAttribute('aria-expanded', 'true');
  }

  closeProfileDropdown() {
    this.profileDropdown.style.display = 'none';
    this.profileDropdownOpen = false;
    if (this.profileTokenBtn) this.profileTokenBtn.setAttribute('aria-expanded', 'false');
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
  if (this.navItems) {
    this.navItems.forEach(item => item.classList.toggle('active', item.dataset.section === section));
  }
  this.sectionShortcuts.style.display = section === 'shortcuts' ? 'block' : 'none';
  this.sectionHelp.style.display = section === 'help' ? 'block' : 'none';
  this.sectionForms.style.display = section === 'forms' ? 'block' : 'none';
  
  // Hide profile when switching to other sections
  if (this.profileModule) {
    this.profileModule.hide();
  }
  
  if (section === 'forms') {
    this.renderForms();
    this.renderFormLimit();
  } else if (section === 'shortcuts') {
    this.renderShortcutLimit();
  }
  }

  showProfilePage() {
     if (this.profileModule) {
    this.profileModule.show();
  }
  // Hide other sections
  if (this.sectionShortcuts) this.sectionShortcuts.style.display = 'none';
  if (this.sectionHelp) this.sectionHelp.style.display = 'none';
  if (this.sectionForms) this.sectionForms.style.display = 'none';
  if (this.navItems) {
    this.navItems.forEach(item => item.classList.remove('active'));
  }
  this.currentSection = 'profile';
  }

  async loadShortcuts() {
    this.shortcuts = await StorageHelper.getAll();
    this.forms = await StorageHelper.getAllForms();
  }

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

  /**
   * Opens the form builder (template picker) to create a new form.
   * targetFolderId can be a real folder id, null, or the sidebar's
   * synthetic 'uncategorized' sentinel — which is normalized to null so
   * it's never persisted on the item itself (see StorageHelper.addForm).
   */
  async handleAddForm(targetFolderId = null) {
    const limitReached = await StorageHelper.isFormLimitReached();
    if (limitReached) {
      if (this.formsUpgradeContainer) {
        this.formsUpgradeContainer.classList.remove('magicaa-pulse');
        void this.formsUpgradeContainer.offsetWidth;
        this.formsUpgradeContainer.classList.add('magicaa-pulse');
        this.formsUpgradeContainer.addEventListener('animationend', () => {
          this.formsUpgradeContainer.classList.remove('magicaa-pulse');
        }, { once: true });
      }
      this.showToast(`Limit reached! Max ${StorageHelper.MAX_SHORTCUTS} forms allowed.`, 'error');
      return;
    }
    this.pendingFormFolderId = (targetFolderId === 'uncategorized' || !targetFolderId) ? null : targetFolderId;
    this.showFormBuilder();
  }

  getFormTemplates() {
    return {
      contact: ['Name', 'Email', 'Phone', 'Message'],
      address: ['Full Name', 'Address', 'City', 'State', 'Country', 'ZIP Code'],
      job: ['Name', 'Email', 'Phone', 'Position', 'Experience', 'Notes'],
      meeting: ['Name', 'Email', 'Company', 'Meeting Date', 'Meeting Topic', 'Notes'],
      medical: ['Patient Name', 'Age', 'Phone', 'Medical Concern', 'Medication', 'Notes']
    };
  }

  renderFormFieldsPreview() {
    const fields = this.getFormTemplates()[this.selectedFormTemplate] || [];
    this.formFieldsPreview.innerHTML = `<strong>Fields:</strong> ${fields.map(f => this.escapeHtml(f)).join(', ')}`;
  }

  renderFormTemplateCards() {
    const names = {
      contact: 'Contact Form',
      address: 'Address Form',
      job: 'Job Application',
      meeting: 'Meeting Request',
      medical: 'Medical Information'
    };
    this.formTemplateCards.innerHTML = Object.entries(this.getFormTemplates()).map(([key, fields]) => `
      <button type="button" class="form-template-card${key === this.selectedFormTemplate ? ' selected' : ''}" data-template="${key}">
        <span class="form-template-card-title">${names[key]}</span>
        <span class="form-template-card-fields">${fields.map(field => this.escapeHtml(field)).join(' • ')}</span>
      </button>
    `).join('');
    this.formTemplateCards.querySelectorAll('[data-template]').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedFormTemplate = card.dataset.template;
        this.renderFormTemplateCards();
        this.renderFormFieldsPreview();
      });
    });
  }

  showFormBuilder() {
    this.formBuilderError.style.display = 'none';
    this.formTriggerInput.value = '';
    this.formLabelInput.value = '';
    this.selectedFormTemplate = 'contact';
    this.renderFormTemplateCards();
    this.renderFormFieldsPreview();
    this.formBuilderOverlay.style.display = 'flex';
    setTimeout(() => this.formTriggerInput.focus(), 50);
  }

  hideFormBuilder() {
    this.formBuilderOverlay.style.display = 'none';
    this.pendingFormFolderId = null;
  }

  async handleSaveForm() {
    const trigger = this.formTriggerInput.value.trim();
    const label = this.formLabelInput.value.trim();
    if (!trigger || trigger.length < 2 || trigger.includes(' ')) {
      this.formBuilderError.textContent = 'Please enter a trigger of at least 2 characters without spaces.';
      this.formBuilderError.style.display = 'block'; return;
    }
    if (await StorageHelper.triggerExists(trigger)) {
      this.formBuilderError.textContent = `Trigger "${trigger}" is already used by a shortcut or form.`;
      this.formBuilderError.style.display = 'block'; return;
    }
    if (await StorageHelper.isFormLimitReached()) {
      this.formBuilderError.textContent = `Maximum ${StorageHelper.MAX_SHORTCUTS} forms allowed in the Trial Version. Please upgrade to create more.`;
      this.formBuilderError.style.display = 'block'; return;
    }
    try {
      const template = this.selectedFormTemplate;
      const folderId = this.pendingFormFolderId || null;
      await StorageHelper.addForm({ trigger, label, template, fields: this.getFormTemplates()[template], folderId });
      this.pendingFormFolderId = null;
      this.hideFormBuilder(); 
      await this.loadShortcuts(); 
      this.renderForms(); 
      this.showToast('Form created!');
      
      // Refresh sidebar
      const sidebarMgr = getSidebarManager();
      if (sidebarMgr) await sidebarMgr.refresh();
    } catch (e) {
      if (e.message && e.message.includes('Limit reached')) {
        this.hideFormBuilder();
        this.handleAddForm();
        return;
      }
      this.formBuilderError.textContent = e.message || 'Failed to save form.';
      this.formBuilderError.style.display = 'block';
    }
  }

  renderForms() {
    if (!this.formsList) return;
    this.formCount.textContent = this.forms.length;
    this.formsList.innerHTML = '';
    this.formsEmptyState.style.display = this.forms.length ? 'none' : 'block';
    this.formsList.style.display = this.forms.length ? 'grid' : 'none';
    [...this.forms].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)).forEach(form => {
      const card = document.createElement('div'); card.className = 'shortcut-card';
      card.innerHTML = `<div class="shortcut-card-header"><div class="shortcut-trigger-wrapper"><span class="shortcut-trigger">${this.escapeHtml(form.trigger)}</span>${form.label ? `<span class="shortcut-label">${this.escapeHtml(form.label)}</span>` : ''}</div><button class="btn btn-danger-outline" data-delete-form="${this.escapeHtml(form.id)}">Delete</button></div><div class="shortcut-expansion"><strong>${this.escapeHtml(form.template)} form</strong><br>${this.escapeHtml((form.fields || []).join(' • '))}</div>`;
      card.querySelector('[data-delete-form]').addEventListener('click', async () => {
        if (confirm(`Delete form "${form.trigger}"?`)) { 
          await StorageHelper.deleteForm(form.id); 
          await this.loadShortcuts(); 
          this.renderForms(); 
          this.showToast('Form deleted.');
          
          // Refresh sidebar
          const sidebarMgr = getSidebarManager();
          if (sidebarMgr) await sidebarMgr.refresh();
        }
      });
      this.formsList.appendChild(card);
    });
    if (this.currentSection === 'forms') this.renderFormLimit();
  }

  renderShortcutLimit() {
    const total = this.shortcuts.length;
    const max = StorageHelper.MAX_SHORTCUTS;
    const unlimited = max >= 1000000;
    this.limitFill.style.width = unlimited ? '0%' : `${Math.min((total / max) * 100, 100)}%`;
    this.limitFill.style.background = unlimited ? '#1a1a2e' : (total >= max ? '#e74c3c' : total >= max - 1 ? '#f39c12' : '#1a1a2e');
    this.limitText.textContent = `${total} / ${unlimited ? 'Unlimited' : max} shortcuts used`;
  }

  renderFormLimit() {
    const total = this.forms.length;
    const max = StorageHelper.MAX_SHORTCUTS;
    const unlimited = max >= 1000000;
    this.limitFill.style.width = unlimited ? '0%' : `${Math.min((total / max) * 100, 100)}%`;
    this.limitFill.style.background = unlimited ? '#1a1a2e' : (total >= max ? '#e74c3c' : total >= max - 1 ? '#f39c12' : '#1a1a2e');
    this.limitText.textContent = `${total} / ${unlimited ? 'Unlimited' : max} forms used`;
  }

  onActiveFolderChanged(folderId) {
    this.render();
  }

  handlePlaygroundInput(e) {
    const textarea = e.target;
    let val = textarea.value;
    if (!val) return;

    const sortedShortcuts = [...this.shortcuts].sort((a, b) => (b.trigger || '').length - (a.trigger || '').length);
    for (const shortcut of sortedShortcuts) {
      if (shortcut.trigger && val.endsWith(shortcut.trigger)) {
        const expansionText = this.stripHtml(shortcut.expansion || '');
        textarea.value = val.substring(0, val.length - shortcut.trigger.length) + expansionText;
        this.showToast(`Expanded: ${shortcut.trigger}`);
        this.triggerConfettiEffect();
        break;
      }
    }
  }

  triggerConfettiEffect() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const colors = ['#f43f5e', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];
    const particles = [];
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 300,
        y: window.innerHeight / 3,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.7) * 14,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 12,
        opacity: 1
      });
    }

    let startTime = Date.now();
    function animate() {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3;
        p.rotation += p.rSpeed;
        p.opacity = Math.max(0, 1 - elapsed / 1600);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (elapsed < 1600) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    }
    animate();
  }

  showCustomPrompt(title, message, defaultValue, callback) {
    const overlay = document.getElementById('customDialogOverlay');
    if (!overlay) {
      const val = prompt(`${title}\n\n${message}`, defaultValue);
      return callback(val);
    }
    const titleEl = document.getElementById('customDialogTitle');
    const msgEl = document.getElementById('customDialogMessage');
    const inputGroup = document.getElementById('customDialogInputGroup');
    const input = document.getElementById('customDialogInput');
    const cancelBtn = document.getElementById('customDialogCancelBtn');
    const confirmBtn = document.getElementById('customDialogConfirmBtn');
    const closeBtn = document.getElementById('customDialogCloseBtn');

    titleEl.textContent = title || 'Input Required';
    msgEl.textContent = message || '';
    inputGroup.style.display = 'block';
    input.value = defaultValue || '';
    overlay.style.display = 'flex';

    const cleanup = () => {
      overlay.style.display = 'none';
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      closeBtn.onclick = null;
    };

    cancelBtn.onclick = () => { cleanup(); callback(null); };
    closeBtn.onclick = () => { cleanup(); callback(null); };
    confirmBtn.onclick = () => {
      const val = input.value.trim();
      cleanup();
      callback(val);
    };
    setTimeout(() => input.focus(), 50);
  }

  showCustomConfirm(title, message, callback) {
    const overlay = document.getElementById('customDialogOverlay');
    if (!overlay) {
      const confirmed = confirm(`${title}\n\n${message}`);
      return callback(confirmed);
    }
    const titleEl = document.getElementById('customDialogTitle');
    const msgEl = document.getElementById('customDialogMessage');
    const inputGroup = document.getElementById('customDialogInputGroup');
    const cancelBtn = document.getElementById('customDialogCancelBtn');
    const confirmBtn = document.getElementById('customDialogConfirmBtn');
    const closeBtn = document.getElementById('customDialogCloseBtn');

    titleEl.textContent = title || 'Confirmation';
    msgEl.textContent = message || '';
    inputGroup.style.display = 'none';
    overlay.style.display = 'flex';

    const cleanup = () => {
      overlay.style.display = 'none';
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      closeBtn.onclick = null;
    };

    cancelBtn.onclick = () => { cleanup(); callback(false); };
    closeBtn.onclick = () => { cleanup(); callback(false); };
    confirmBtn.onclick = () => { cleanup(); callback(true); };
  }

  showSortDialog(callback) {
    const overlay = document.getElementById('customDialogOverlay');
    if (!overlay) return callback('name_asc');
    
    const titleEl = document.getElementById('customDialogTitle');
    const msgEl = document.getElementById('customDialogMessage');
    const inputGroup = document.getElementById('customDialogInputGroup');
    const cancelBtn = document.getElementById('customDialogCancelBtn');
    const confirmBtn = document.getElementById('customDialogConfirmBtn');
    const closeBtn = document.getElementById('customDialogCloseBtn');

    titleEl.textContent = 'Sort Folder Items';
    msgEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
        <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="radio" name="sortOpt" value="name_asc" checked> Alphabetical (A - Z)</label>
        <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="radio" name="sortOpt" value="name_desc"> Alphabetical (Z - A)</label>
        <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="radio" name="sortOpt" value="date_desc"> Date Added (Newest First)</label>
        <label style="cursor:pointer; display:flex; align-items:center; gap:8px;"><input type="radio" name="sortOpt" value="date_asc"> Date Added (Oldest First)</label>
      </div>
    `;
    inputGroup.style.display = 'none';
    overlay.style.display = 'flex';

    const cleanup = () => {
      overlay.style.display = 'none';
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      closeBtn.onclick = null;
    };

    cancelBtn.onclick = () => { cleanup(); callback(null); };
    closeBtn.onclick = () => { cleanup(); callback(null); };
    confirmBtn.onclick = () => {
      const selected = document.querySelector('input[name="sortOpt"]:checked');
      const sortType = selected ? selected.value : 'name_asc';
      cleanup();
      callback(sortType);
    };
  }

  async saveCurrentFolderTitle() {
    const sidebarMgr = getSidebarManager();
    if (!sidebarMgr || !sidebarMgr.activeFolder || sidebarMgr.activeFolder === 'uncategorized') return;
    const newName = this.folderViewTitle.value.trim();
    if (newName) {
      await sidebarMgr.saveFolderName(sidebarMgr.activeFolder, newName);
    }
  }

  async saveCurrentFolderDescription() {
    const sidebarMgr = getSidebarManager();
    if (!sidebarMgr || !sidebarMgr.activeFolder || sidebarMgr.activeFolder === 'uncategorized') return;
    const description = this.folderViewDescription.value.trim();
    await sidebarMgr.saveFolderDescription(sidebarMgr.activeFolder, description);
  }

  // =============================================
  // RENDER
  // =============================================
  render() {
    const query = (this.searchInput && this.searchInput.value) ? this.searchInput.value.trim().toLowerCase() : '';
    const sidebarMgr = getSidebarManager();
    const activeFolder = sidebarMgr ? sidebarMgr.activeFolder : null;

    const total = this.shortcuts.length;
    const max = StorageHelper.MAX_SHORTCUTS;
    const pct = (total / max) * 100;

    if (this.shortcutCount) this.shortcutCount.textContent = total;
    if (this.limitFill) this.limitFill.style.width = `${Math.min(pct, 100)}%`;
    const maxDisplay = max >= 1000000 ? 'Unlimited' : max;
    if (this.limitText) this.limitText.textContent = `${total} / ${maxDisplay} shortcuts used`;

    if (this.bulkDeleteBtn) this.bulkDeleteBtn.style.display = total > 0 ? 'inline-flex' : 'none';

    // Decide whether to show Welcome View or Folder View
    if (!activeFolder && !query) {
      // No folder selected & no search query -> Show Welcome View
      if (this.welcomeView) this.welcomeView.style.display = 'flex';
      if (this.folderView) this.folderView.style.display = 'none';
      if (this.noResults) this.noResults.style.display = 'none';
      if (this.currentSection === 'shortcuts') this.renderShortcutLimit();
      return;
    }

    // Folder is selected OR user is searching -> Show Folder View
    if (this.welcomeView) this.welcomeView.style.display = 'none';
    if (this.folderView) this.folderView.style.display = 'flex';

    // Populate folder header info
    let folderObj = null;
    if (sidebarMgr && sidebarMgr.folders) {
      folderObj = sidebarMgr.folders.find(f => f.id === activeFolder);
    }

    if (folderObj) {
      if (this.folderViewTitle) this.folderViewTitle.value = folderObj.name;
      if (this.folderViewDescription) this.folderViewDescription.value = folderObj.description || '';
    } else if (activeFolder === 'uncategorized') {
      if (this.folderViewTitle) this.folderViewTitle.value = 'Uncategorized';
      if (this.folderViewDescription) this.folderViewDescription.value = 'Items without an assigned folder.';
    } else {
      if (this.folderViewTitle) this.folderViewTitle.value = 'All Shortcuts';
      if (this.folderViewDescription) this.folderViewDescription.value = 'Overview of all shortcuts and forms.';
    }

    // Filter items for the active folder
    let itemsToRender = [];
    const matchesFolder = (itemFolderId) => {
      if (!activeFolder) return true; // All items if search with no folder selected
      if (activeFolder === 'uncategorized') return !itemFolderId;
      return itemFolderId === activeFolder;
    };

    this.shortcuts.forEach(s => {
      if (matchesFolder(s.folderId)) itemsToRender.push({ ...s, type: 'shortcut' });
    });
    this.forms.forEach(f => {
      if (matchesFolder(f.folderId)) itemsToRender.push({ ...f, type: 'form' });
    });

    if (query) {
      itemsToRender = itemsToRender.filter(item => 
        (item.trigger && item.trigger.toLowerCase().includes(query)) ||
        (item.label && item.label.toLowerCase().includes(query)) ||
        (item.expansion && item.expansion.toLowerCase().includes(query))
      );
    }

    if (this.folderItemsList) this.folderItemsList.innerHTML = '';

    if (itemsToRender.length === 0) {
      if (query && this.noResults) {
        this.noResults.style.display = 'block';
        if (this.folderEmptyState) this.folderEmptyState.style.display = 'none';
        if (this.folderItemsList) this.folderItemsList.style.display = 'none';
      } else {
        if (this.noResults) this.noResults.style.display = 'none';
        if (this.folderEmptyState) this.folderEmptyState.style.display = 'block';
        if (this.folderItemsList) this.folderItemsList.style.display = 'none';
      }
      return;
    }

    if (this.noResults) this.noResults.style.display = 'none';
    if (this.folderEmptyState) this.folderEmptyState.style.display = 'none';
    if (this.folderItemsList) this.folderItemsList.style.display = 'grid';

    itemsToRender.forEach(item => {
      if (item.type === 'form') {
        const card = document.createElement('div'); card.className = 'shortcut-card';
        card.innerHTML = `<div class="shortcut-card-header"><div class="shortcut-trigger-wrapper"><span class="shortcut-trigger">${this.escapeHtml(item.trigger)}</span>${item.label ? `<span class="shortcut-label">${this.escapeHtml(item.label)}</span>` : ''}</div><button class="btn btn-danger-outline" data-delete-form="${this.escapeHtml(item.id)}">Delete</button></div><div class="shortcut-expansion"><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1dac4b" stroke-width="2" style="vertical-align: middle; display: inline-block; margin-right: 4px;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>${this.escapeHtml(item.template || 'Custom')} form</strong><br>${this.escapeHtml((item.fields || []).join(' • '))}</div>`;
        card.querySelector('[data-delete-form]').addEventListener('click', async () => {
          if (confirm(`Delete form "${item.trigger}"?`)) { 
            await StorageHelper.deleteForm(item.id); 
            await this.loadShortcuts(); 
            this.render(); 
            this.showToast('Form deleted.');
            if (sidebarMgr) await sidebarMgr.refresh();
          }
        });
        this.attachCardDragEvents(card, item);
        this.folderItemsList.appendChild(card);
      } else {
        const card = this.createShortcutCard(item);
        this.attachCardDragEvents(card, item);
        this.folderItemsList.appendChild(card);
      }
    });

    if (this.currentSection === 'shortcuts') this.renderShortcutLimit();
  }

  attachCardDragEvents(card, item) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      const sidebarMgr = getSidebarManager();
      if (sidebarMgr) {
        sidebarMgr.draggedElement = card;
        sidebarMgr.draggedType = 'snippet';
        sidebarMgr.draggedId = item.id;
        sidebarMgr.draggedFromFolder = item.folderId;
      }
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', (e) => {
      e.stopPropagation();
      card.classList.remove('dragging');
      const sidebarMgr = getSidebarManager();
      if (sidebarMgr) {
        sidebarMgr.draggedElement = null;
        sidebarMgr.draggedType = null;
        sidebarMgr.draggedId = null;
      }
      document.querySelectorAll('.drag-above, .drag-below').forEach(el => {
        el.classList.remove('drag-above', 'drag-below');
      });
    });

    card.addEventListener('dragover', (e) => {
      const sidebarMgr = getSidebarManager();
      if (!sidebarMgr || !sidebarMgr.draggedId || sidebarMgr.draggedType !== 'snippet' || sidebarMgr.draggedId === item.id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';

      const rect = card.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      if (offset > rect.height / 2) {
        card.classList.remove('drag-above');
        card.classList.add('drag-below');
      } else {
        card.classList.remove('drag-below');
        card.classList.add('drag-above');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-above', 'drag-below');
    });

    card.addEventListener('drop', async (e) => {
      const sidebarMgr = getSidebarManager();
      if (!sidebarMgr || !sidebarMgr.draggedId || sidebarMgr.draggedType !== 'snippet' || sidebarMgr.draggedId === item.id) return;
      e.preventDefault();
      e.stopPropagation();

      const position = card.classList.contains('drag-below') ? 'after' : 'before';
      card.classList.remove('drag-above', 'drag-below');

      await sidebarMgr.reorderSnippet(sidebarMgr.draggedId, item.id, position, item.folderId);
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
          <button class="btn btn-ghost" data-action="edit" data-id="${shortcut.id}" aria-label="Edit ${this.escapeHtml(shortcut.trigger)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit
          </button>
          <button class="btn btn-danger-outline" data-action="delete" data-id="${shortcut.id}" aria-label="Delete ${this.escapeHtml(shortcut.trigger)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete
          </button>
        </div>
      </div>
      <div class="shortcut-expansion">${this.escapeHtml(this.stripHtml(trunc))}</div>
      <div class="shortcut-meta"><span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; display: inline-block; margin-right: 3px;"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>${usage}</span><span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; display: inline-block; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${this.formatDate(shortcut.updatedAt)}</span></div>
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
      
      // Refresh sidebar
      const sidebarMgr = getSidebarManager();
      if (sidebarMgr) await sidebarMgr.refresh();
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
      
      // Refresh sidebar
      const sidebarMgr = getSidebarManager();
      if (sidebarMgr) await sidebarMgr.refresh();
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
    
    // Refresh sidebar
    const sidebarMgr = getSidebarManager();
    if (sidebarMgr) await sidebarMgr.refresh();
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

  // =============================================
  // EDITOR VIEW
  // =============================================
  openEditor(mode, type, targetFolderId = null, item = null) {
    this.currentEditorMode = mode; // 'new' or 'edit'
    this.currentEditorType = type; // 'shortcut' or 'form'
    this.currentTargetFolderId = targetFolderId;
    this.currentEditorItem = item;

    // Show editor view
    this.editorView.classList.add('active');
    this.closeMobileSidebar();
    
    // Populate fields
    if (mode === 'edit' && item) {
      this.editorLabelInput.value = item.label || '';
      this.editorShortcutInput.value = item.trigger || '';
      this.editorTextArea.value = item.expansion || '';
    } else {
      // Clear fields for new
      this.editorLabelInput.value = '';
      this.editorShortcutInput.value = '';
      this.editorTextArea.value = '';
    }

    // Focus on label input
    setTimeout(() => this.editorLabelInput.focus(), 100);
  }

  closeEditor() {
    this.editorView.classList.remove('active');
    this.currentEditorMode = null;
    this.currentEditorType = null;
    this.currentTargetFolderId = null;
    this.currentEditorItem = null;
  }

  showTryItModal() {
    const trigger = this.editorShortcutInput.value.trim();
    const expansion = this.editorTextArea.value.trim();

    if (!trigger) {
      this.showToast('Please enter a shortcut trigger first', 'error');
      return;
    }

    if (!expansion) {
      this.showToast('Please enter the expansion text first', 'error');
      return;
    }

    // Show modal with preview
    if (this.tryItTrigger) {
      this.tryItTrigger.textContent = trigger;
    }
    if (this.tryItPreview) {
      this.tryItPreview.textContent = expansion;
    }
    if (this.tryItOverlay) {
      this.tryItOverlay.classList.add('active');
    }
  }

  closeTryItModal() {
    if (this.tryItOverlay) {
      this.tryItOverlay.classList.remove('active');
    }
  }

  async saveFromEditor() {
    const label = this.editorLabelInput.value.trim();
    const trigger = this.editorShortcutInput.value.trim();
    const expansion = this.editorTextArea.value.trim();

    // Validation
    if (!trigger) {
      this.showToast('Please enter a shortcut trigger', 'error');
      this.editorShortcutInput.focus();
      return;
    }

    if (trigger.length < 2) {
      this.showToast('Trigger must be at least 2 characters', 'error');
      this.editorShortcutInput.focus();
      return;
    }

    if (trigger.includes(' ')) {
      this.showToast('Trigger cannot contain spaces', 'error');
      this.editorShortcutInput.focus();
      return;
    }

    if (!expansion) {
      this.showToast('Please enter the expanded text', 'error');
      this.editorTextArea.focus();
      return;
    }

    // Check limit for new items
    if (this.currentEditorMode === 'new') {
      const limitReached = await StorageHelper.isLimitReached();
      if (limitReached) {
        this.showToast(`Maximum ${StorageHelper.MAX_SHORTCUTS} shortcuts allowed`, 'error');
        return;
      }
    }

    // Check if trigger exists
    const existingId = this.currentEditorMode === 'edit' ? this.currentEditorItem.id : null;
    const exists = await StorageHelper.triggerExists(trigger, existingId);
    if (exists) {
      this.showToast(`Trigger "${trigger}" already exists`, 'error');
      this.editorShortcutInput.focus();
      return;
    }

    try {
      if (this.currentEditorMode === 'edit') {
        // Update existing
        await StorageHelper.update(this.currentEditorItem.id, { trigger, expansion, label });
        this.showToast('Snippet updated!');
      } else {
        // Create new. Normalize the sidebar's synthetic 'uncategorized' bucket
        // id to null so it's never persisted verbatim on the item — otherwise
        // it silently diverges from what drag-and-drop (moveSnippetToFolder)
        // and the "no folder" checks elsewhere (!item.folderId) expect.
        const normalizedFolderId = (this.currentTargetFolderId === 'uncategorized' || !this.currentTargetFolderId)
          ? null
          : this.currentTargetFolderId;

        const newItem = { 
          trigger, 
          expansion, 
          label,
          folderId: normalizedFolderId
        };
        
        if (this.currentEditorType === 'form') {
          await StorageHelper.addForm(newItem);
          this.showToast('Form created!');
        } else {
          await StorageHelper.add(newItem);
          this.showToast('Shortcut created!');
        }
      }

      // Close editor and refresh
      this.closeEditor();
      await this.loadShortcuts();
      this.render();
      this.renderForms();

      // Refresh sidebar
      const sidebarMgr = getSidebarManager();
      if (sidebarMgr) await sidebarMgr.refresh();

    } catch (err) {
      this.showToast(err.message || 'Failed to save', 'error');
    }
  }

  tryShortcut() {
    const trigger = this.editorShortcutInput.value.trim();
    if (!trigger) {
      this.showToast('Enter a shortcut trigger first', 'error');
      return;
    }

    this.showToast(`Try typing "${trigger}" in any text field!`, 'success');
  }
}

document.addEventListener('DOMContentLoaded', () => { 
  window.dashboard = new TextBlitzDashboard(); 
});