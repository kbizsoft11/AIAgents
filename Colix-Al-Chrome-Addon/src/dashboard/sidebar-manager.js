/**
 * Sidebar Manager - Drag & Drop Folders and Snippets
 * Manages folder structure, drag-and-drop, and snippet organization
 */

class SidebarManager {
  constructor() {
    this.folders = [];
    this.draggedElement = null;
    this.draggedType = null; // 'folder' or 'snippet'
    this.draggedId = null;
    this.draggedFromFolder = null;
    this.dropIndicator = null;
    this.contextMenu = null;
    this.contextMenuTarget = null;
    this.activeFolder = null; // Track active folder for creating new snippets
    this.shareApiUrl =
      "https://extensions.kbizsoft.com/magicaa-extension/share-resource.php";
    this.workspaceApiUrl =
      "https://extensions.kbizsoft.com/magicaa-extension/workspace.php";
    this.canManageSharing = false;
    this.workspaceRole = "viewer";
    this.folderPermissions = new Map();
    this.workspaceMembers = [];
    this.workspaceGroups = [];
    this.shareResource = null;
    this.sharingContextPromise = null;
  }

  async init() {
    await this.loadFolders();
    await this.loadActiveFolder();
    this.bindElements();
    this.bindEvents();
    this.createContextMenu();
    this.render();
    this.sharingContextPromise = this.loadSharingContext()
      .then(() => this.render())
      .catch((error) =>
        console.warn("Could not finish sidebar sharing setup:", error),
      );
  }

  async loadSharingContext() {
    try {
      const identity = await new Promise((resolve) =>
        chrome.identity.getProfileUserInfo(resolve),
      );
      if (!identity?.email) return;
      this.currentUserEmail = identity.email;
      const params = new URLSearchParams({
        tab: "members",
        page: "1",
        per_page: "50",
      });
      const response = await fetch(`${this.workspaceApiUrl}?${params}`, {
        headers: { "X-User-Email": identity.email },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) return;
      this.workspaceRole = payload.membership?.role || "viewer";
      this.canManageSharing = ["owner", "admin"].includes(this.workspaceRole);
      this.workspaceMembers = (payload.items || []).filter(
        (member) =>
          member.status === "active" &&
          member.user?.email &&
          member.user.email.toLowerCase() !== identity.email.toLowerCase(),
      );
      const groupsResponse = await fetch(
        `https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php`,
        { headers: { "X-User-Email": identity.email } },
      );
      const groupsPayload = await groupsResponse.json().catch(() => ({}));
      this.workspaceGroups = groupsResponse.ok && groupsPayload.success ? (groupsPayload.groups || []) : [];

      this.folders.forEach((folder) => {
        if (folder.permission)
          this.folderPermissions.set(String(folder.id), folder.permission);
      });
    } catch (error) {
      console.warn("Could not load workspace sharing members:", error);
    }
  }

  bindElements() {
    this.sidebarTree = document.getElementById("sidebar-tree");
    this.addFolderBtn = document.getElementById("add-folder-btn");
    this.addSnippetBtn = document.getElementById("add-snippet-btn");
  }

  bindEvents() {
    // Add folder button
    if (this.addFolderBtn) {
      this.addFolderBtn.addEventListener("click", () => this.createFolder());
    }

    // Add snippet button - use active folder or default
    if (this.addSnippetBtn) {
      this.addSnippetBtn.addEventListener("click", () => {
        const targetFolder =
          this.activeFolder ||
          (this.folders.length > 0 ? this.folders[0].id : null);
        this.createSnippet("shortcut", targetFolder);
      });
    }

    // Close context menu when clicking outside
    document.addEventListener("click", (e) => {
      if (this.contextMenu && !this.contextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    // Prevent default context menu on sidebar
    if (this.sidebarTree) {
      this.sidebarTree.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
    }

    document
      .getElementById("closeShareResourceBtn")
      ?.addEventListener("click", () => this.closeShareDialog());
    document
      .getElementById("cancelShareResourceBtn")
      ?.addEventListener("click", () => this.closeShareDialog());
    document
      .getElementById("shareResourceForm")
      ?.addEventListener("submit", (event) => this.submitShare(event));
    window.addEventListener("sharedFolderNotification", (event) =>
      this.enableSharedFolder(event.detail),
    );
  }

  async loadFolders() {
    return (async () => {
      this.folders = (await StorageHelper.getAllFolders()).map((f) => ({
        ...f,
        isExpanded:
          f.isExpanded !== undefined
            ? f.isExpanded
            : f.is_expanded !== undefined
              ? f.is_expanded
              : true,
      }));
      const legacyUncategorizedFolders = this.folders.filter(
        (folder) =>
          String(folder.id).toLowerCase() === "uncategorized" ||
          String(folder.name).toLowerCase() === "uncategorized",
      );
      this.folders = this.folders.filter(
        (folder) => !legacyUncategorizedFolders.includes(folder),
      );
      this.shortcuts = (await StorageHelper.getAll()).map((s) => ({
        ...s,
        folderId:
          s.folderId !== undefined
            ? s.folderId
            : s.folder_id !== undefined
              ? s.folder_id
              : null,
      }));
      this.forms = (await StorageHelper.getAllForms()).map((f) => ({
        ...f,
        folderId:
          f.folderId !== undefined
            ? f.folderId
            : f.folder_id !== undefined
              ? f.folder_id
              : null,
      }));

      // Keep every item inside a real folder, including legacy unassigned items.
      if (this.folders.length === 0) {
        this.folders = this.createDefaultFolders();
      }

      const defaultFolderId = this.folders[0]?.id;
      let itemsMigrated = false;
      this.shortcuts.forEach((shortcut) => {
        if (
          !shortcut.folderId ||
          !this.folders.some(
            (folder) => String(folder.id) === String(shortcut.folderId),
          )
        ) {
          shortcut.folderId = defaultFolderId;
          itemsMigrated = true;
        }
      });
      this.forms.forEach((form) => {
        if (
          !form.folderId ||
          !this.folders.some(
            (folder) => String(folder.id) === String(form.folderId),
          )
        ) {
          form.folderId = defaultFolderId;
          itemsMigrated = true;
        }
      });

      if (itemsMigrated) {
        await this.saveShortcuts();
        await this.saveForms();
      }
      for (const folder of legacyUncategorizedFolders) {
        await StorageHelper.deleteFolder(folder.id);
      }
      await this.saveFolders();
    })();
  }

  async enableSharedFolder(notification) {
    const folder = notification?.folder;
    if (!folder?.id) return;
    const existingFolder = this.folders.find(
      (item) => String(item.id) === String(folder.id),
    );
    if (existingFolder)
      Object.assign(existingFolder, folder, {
        isExpanded: true,
        isShared: true,
      });
    else this.folders.push({ ...folder, isExpanded: true, isShared: true });
    await this.saveActiveFolder(folder.id);
    const existingById = new Map(
      this.shortcuts.map((item) => [String(item.id), item]),
    );
    const importedShortcuts = (notification.shortcuts || []).map((item) => ({
      ...item,
      type: "shortcut",
      folderId: item.folder_id || folder.id,
      isShared: true,
    }));
    importedShortcuts.forEach((item) => {
      const existing = existingById.get(String(item.id));
      if (existing) Object.assign(existing, item);
      else this.shortcuts.push(item);
    });
    if (importedShortcuts.length) {
      await this.saveShortcuts();
    }
    if (window.dashboard) {
      window.dashboard.shortcuts = this.shortcuts;
      window.dashboard.forms = this.forms;
      if (window.dashboard.folderDeleteBtn)
        window.dashboard.folderDeleteBtn.hidden = !this.canManageSharing;
    }
    this.render();
    window.dashboard?.render();
    window.dashboard?.renderForms();
    window.dashboard?.showToast(`Folder "${folder.name}" enabled.`);
  }

  createDefaultFolders() {
    return [
      {
        id: "default",
        name: "New Folder",
        isExpanded: true,
        items: [],
      },
    ];
  }

  async saveFolders() {
    return this.folders;
  }

  async loadActiveFolder() {
    this.activeFolder = null;
    this.updateSnippetButtonState();
  }

  async saveActiveFolder(folderId) {
    this.activeFolder = folderId;
    this.updateSnippetButtonState();
    return folderId;
  }

  updateSnippetButtonState() {
    if (this.addSnippetBtn) {
      this.addSnippetBtn.disabled = false;
    }
  }

  getFolderPermission(folderId) {
    if (this.canManageSharing) return "manage";
    const permission = this.folderPermissions.get(String(folderId)) || null;
    return permission && this.workspaceRole === "editor" ? "edit" : permission;
  }

  canEditFolder(folderId) {
    return (
      ["edit", "manage"].includes(this.getFolderPermission(folderId)) ||
      (!this.folders.find((folder) => String(folder.id) === String(folderId))
        ?.isShared &&
        this.workspaceRole === "editor")
    );
  }

  canManageFolder(folderId) {
    if (this.workspaceRole === "viewer") return false;
    return this.getFolderPermission(folderId) === "manage";
  }

  canEditItem(item) {
    return this.canEditFolder(item.folderId);
  }

  canDeleteItem(item) {
    if (this.workspaceRole === "viewer") return false;
    return (
      this.canManageFolder(item.folderId) ||
      (!item.isShared &&
        ["owner", "admin", "editor"].includes(this.workspaceRole))
    );
  }

  render() {
    if (!this.sidebarTree) return;

    window.SidebarSkeleton?.hide();
    this.sidebarTree.innerHTML = "";

    this.folders.forEach((folder) => {
      const folderEl = this.createFolderElement(folder);
      this.sidebarTree.appendChild(folderEl);
    });
  }

  createFolderElement(folder) {
    const folderDiv = document.createElement("div");
    folderDiv.className = "sidebar-folder";
    folderDiv.dataset.folderId = folder.id;
    folderDiv.draggable = true;

    // Add active class if this is the active folder
    if (this.activeFolder === folder.id) {
      folderDiv.classList.add("active");
    }

    // Folder header
    const header = document.createElement("div");
    header.className = "sidebar-folder-header";

    // Click to set as active folder
    header.addEventListener("click", (e) => {
      // Don't set as active if clicking on toggle button
      if (
        e.target.closest(".folder-toggle") ||
        e.target.closest(".folder-actions")
      ) {
        return;
      }
      this.setActiveFolder(folder.id);
    });

    // Right-click context menu
    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e.clientX, e.clientY, folder.id);
    });

    const toggle = document.createElement("button");
    toggle.className = "folder-toggle";
    toggle.innerHTML = folder.isExpanded
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    toggle.onclick = () => this.toggleFolder(folder.id);

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1dac4b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "folder-name-input";
    nameInput.value = folder.name;
    nameInput.readOnly = true;
    nameInput.ondblclick = () => this.editFolderName(folder.id);
    nameInput.onblur = (e) => this.saveFolderName(folder.id, e.target.value);
    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.target.blur();
      }
    };

    const actions = document.createElement("div");
    actions.className = "folder-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "folder-action-btn";
    deleteBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    deleteBtn.title = "Delete folder";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.deleteFolder(folder.id);
    };

    actions.appendChild(deleteBtn);
    header.appendChild(toggle);
    header.appendChild(icon);
    header.appendChild(nameInput);
    header.appendChild(actions);

    // Folder content
    const content = document.createElement("div");
    content.className = "sidebar-folder-content";
    content.style.display = folder.isExpanded ? "block" : "none";

    // Get items for this folder
    const folderItems = this.getItemsForFolder(folder.id);
    folderItems.forEach((item) => {
      const itemEl = this.createItemElement(item, folder.id);
      content.appendChild(itemEl);
    });

    // Drop zone indicator
    const dropZone = document.createElement("div");
    dropZone.className = "folder-drop-zone";
    dropZone.hidden = true;
    dropZone.textContent = "Drop here";
    content.appendChild(dropZone);

    folderDiv.appendChild(header);
    folderDiv.appendChild(content);

    // Drag events for folder
    this.attachDragEvents(folderDiv, "folder", folder.id);
    this.attachFolderReorderDropEvents(folderDiv, folder.id);

    // Drop events for folder content
    this.attachDropEvents(content, folder.id);

    return folderDiv;
  }

  createItemElement(item, folderId) {
    const itemDiv = document.createElement("div");
    itemDiv.className = "sidebar-item";
    itemDiv.dataset.itemId = item.id;
    itemDiv.dataset.itemType = item.type;
    itemDiv.draggable = true;

    const typeIcon = document.createElement("span");
    typeIcon.className = "item-type-icon";
    typeIcon.innerHTML =
      item.type === "form"
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1dac4b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1dac4b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';

    const nameSpan = document.createElement("span");
    nameSpan.className = "item-name";
    nameSpan.textContent = item.label || item.trigger;

    const triggerSpan = document.createElement("span");
    triggerSpan.className = "item-trigger";
    triggerSpan.textContent = item.trigger;

    itemDiv.appendChild(typeIcon);
    itemDiv.appendChild(nameSpan);
    itemDiv.appendChild(triggerSpan);

    // Click to edit
    itemDiv.onclick = () => {
      if (this.canEditItem(item)) this.editItem(item);
      else
        window.dashboard?.showToast(
          "You only have view access to this item.",
          "error",
        );
    };

    // Right-click context menu for items
    itemDiv.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showItemContextMenu(e.clientX, e.clientY, item);
    });

    // Drag events
    this.attachDragEvents(itemDiv, "snippet", item.id, folderId);
    this.attachItemReorderDropEvents(itemDiv, item.id, folderId);

    return itemDiv;
  }

  getItemsForFolder(folderId) {
    const items = [];
    const matches = (itemFolderId) => String(itemFolderId) === String(folderId);

    // Get shortcuts
    this.shortcuts.forEach((shortcut) => {
      if (matches(shortcut.folderId)) {
        items.push({
          ...shortcut,
          type: "shortcut",
        });
      }
    });

    // Get forms
    this.forms.forEach((form) => {
      if (matches(form.folderId)) {
        items.push({
          ...form,
          type: "form",
        });
      }
    });

    return items;
  }

  toggleFolder(folderId) {
    const folder = this.folders.find((f) => f.id === folderId);
    if (folder) {
      folder.isExpanded = !folder.isExpanded;
      this.saveFolders();
      this.render();
    }
  }

  async setActiveFolder(folderId) {
    await this.saveActiveFolder(folderId);
    this.render();
    if (
      window.dashboard &&
      typeof window.dashboard.onActiveFolderChanged === "function"
    ) {
      window.dashboard.onActiveFolderChanged(folderId);
    }
  }

  async saveFolderDescription(folderId, description) {
    const folder = this.folders.find((f) => f.id === folderId);
    if (folder) {
      folder.description = description;
      await StorageHelper.updateFolder(folderId, {
        description: folder.description,
      });
      await this.saveFolders();
    }
  }

  async createFolder() {
    if (!["owner", "admin", "editor"].includes(this.workspaceRole)) {
      window.dashboard?.showToast("Viewers cannot create folders.", "error");
      return;
    }
    const doCreate = async (name) => {
      if (!name || !name.trim()) return;
      const newFolder = {
        id: "folder_" + Date.now(),
        name: name.trim(),
        isExpanded: true,
        description: "",
        items: [],
      };

      this.folders.push(newFolder);
      await StorageHelper.addFolder(newFolder);
      await this.saveFolders();
      this.render();
    };

    if (
      window.dashboard &&
      typeof window.dashboard.showCustomPrompt === "function"
    ) {
      window.dashboard.showCustomPrompt(
        "New Folder",
        "Enter folder name:",
        "New Folder",
        doCreate,
      );
    } else {
      const name = prompt("Enter folder name:", "New Folder");
      if (name) doCreate(name);
    }
  }

  async ensureDefaultFolder() {
    if (this.folders.length > 0) return this.folders[0].id;

    const folder = this.createDefaultFolders()[0];
    this.folders.push(folder);
    await this.saveFolders();
    this.render();
    return folder.id;
  }

  editFolderName(folderId) {
    const folderEl = document.querySelector(`[data-folder-id="${folderId}"]`);
    if (!folderEl) return;

    const input = folderEl.querySelector(".folder-name-input");
    if (input) {
      input.readOnly = false;
      input.focus();
      input.select();
    }
  }

  async saveFolderName(folderId, newName) {
    if (!this.canEditFolder(folderId)) {
      window.dashboard?.showToast(
        "You do not have permission to rename this folder.",
        "error",
      );
      return;
    }
    const folder = this.folders.find((f) => f.id === folderId);
    if (folder && newName.trim()) {
      try {
        const updatedFolder = await StorageHelper.updateFolder(folderId, {
          name: newName.trim(),
        });
        Object.assign(folder, updatedFolder);
        this.render();
      } catch (error) {
        window.dashboard?.showToast(
          error.message || "Could not rename this folder.",
          "error",
        );
        this.render();
      }
    }
  }

  async deleteFolder(folderId) {
    if (!["owner", "admin"].includes(this.workspaceRole)) {
      window.dashboard?.showToast(
        "You do not have permission to delete this folder.",
        "error",
      );
      return;
    }
    const doDelete = async () => {
      try {
        await StorageHelper.deleteFolder(folderId);

        this.shortcuts = this.shortcuts.filter(
          (shortcut) => String(shortcut.folderId) !== String(folderId),
        );
        this.forms = this.forms.filter(
          (form) => String(form.folderId) !== String(folderId),
        );
        this.folders = this.folders.filter((f) => f.id !== folderId);
        if (this.activeFolder === folderId) await this.saveActiveFolder(null);
        this.render();
        if (window.dashboard) {
          window.dashboard.shortcuts = this.shortcuts;
          window.dashboard.forms = this.forms;
          window.dashboard.render();
          window.dashboard.renderForms();
        }
      } catch (error) {
        window.dashboard?.showToast(
          error.message || "Could not delete this folder.",
          "error",
        );
      }
    };

    if (
      window.dashboard &&
      typeof window.dashboard.showCustomConfirm === "function"
    ) {
      window.dashboard.showCustomConfirm(
        "Delete Folder",
        "Delete this folder and all its snippets?",
        (confirmed) => {
          if (confirmed) doDelete();
        },
      );
    } else {
      if (confirm("Delete this folder and all its snippets?")) {
        doDelete();
      }
    }
  }

  async saveShortcuts() {
    return this.shortcuts;
  }

  async saveForms() {
    return this.forms;
  }

  /**
   * Kicks off creation of a new sidebar item.
   * - 'shortcut' uses the lightweight editor view (openEditor).
   * - 'form' is routed through dashboard.handleAddForm(), which opens the
   *   real form builder (template + fields picker). This branch is kept
   *   for robustness (e.g. if a per-folder "new form" entry point is
   *   reintroduced later) even though the sidebar no longer has its own
   *   form FAB — forms are created from the Forms section's own
   *   "+ New Form" button, which calls dashboard.handleAddForm() directly.
   */
  async createSnippet(type, targetFolderId = null) {
    if (!window.dashboard) return;

    if (
      !targetFolderId ||
      !this.folders.some(
        (folder) => String(folder.id) === String(targetFolderId),
      )
    ) {
      targetFolderId = await this.ensureDefaultFolder();
    }
    if (!this.canEditFolder(targetFolderId)) {
      window.dashboard.showToast(
        "You do not have permission to add items to this folder.",
        "error",
      );
      return;
    }

    if (type === "form") {
      window.dashboard.handleAddForm(targetFolderId);
      return;
    }

    window.dashboard.openEditor("new", type, targetFolderId);
  }

  editItem(item) {
    // Open editor view for editing
    if (window.dashboard) {
      window.dashboard.openEditor("edit", item.type, null, item);
    }
  }

  // === CONTEXT MENU ===

  createContextMenu() {
    // Create context menu element
    this.contextMenu = document.createElement("div");
    this.contextMenu.className = "sidebar-context-menu";
    this.contextMenu.style.display = "none";

    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="new-snippet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>New snippet</span>
      </div>
<div class="context-menu-item" data-action="share-folder">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round"
       stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"></circle>
    <circle cx="6" cy="12" r="3"></circle>
    <circle cx="18" cy="19" r="3"></circle>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
  </svg>

  <span>Share folder...</span>
</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item context-menu-disabled"  style="display:none;" data-action="enable-folder">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Enable folder</span>
      </div>
      <div class="context-menu-item context-menu-disabled"  style="display:none;" data-action="disable-folder">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          <line x1="2" y1="2" x2="22" y2="22"></line>
        </svg>
        <span>Disable folder</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item${!this.canManageSharing ? " context-menu-disabled" : ""}" data-action="rename">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        <span>Rename...</span>
      </div>
      <div class="context-menu-item context-menu-submenu" data-action="sort-by">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="16" y2="6"></line>
          <line x1="4" y1="12" x2="14" y2="12"></line>
          <line x1="4" y1="18" x2="12" y2="18"></line>
        </svg>
        <span>Sort by</span>
        <svg class="submenu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger${!this.canManageSharing ? " context-menu-disabled" : ""}" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>Delete folder...</span>
      </div>
    `;

    document.body.appendChild(this.contextMenu);

    // Bind context menu item clicks
    this.contextMenu
      .querySelectorAll(".context-menu-item:not(.context-menu-disabled)")
      .forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          this.handleContextMenuAction(action);
        });
      });
  }

  showContextMenu(x, y, folderId) {
    if (!this.contextMenu) return;

    if (!this.contextMenu.querySelector('[data-action="share-folder"]')) {
      this.contextMenu.remove();
      this.createContextMenu();
    }

    this.contextMenuTarget = folderId;
    const shareFolder = this.contextMenu.querySelector(
      '[data-action="share-folder"]',
    );
    if (shareFolder)
      shareFolder.style.display = this.canManageSharing ? "flex" : "none";
    this.contextMenu.style.display = "block";

    // Position the menu
    this.contextMenu.style.left = x + "px";
    this.contextMenu.style.top = y + "px";

    // Adjust if menu goes off-screen
    const menuRect = this.contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (menuRect.right > viewportWidth) {
      this.contextMenu.style.left = viewportWidth - menuRect.width - 10 + "px";
    }

    if (menuRect.bottom > viewportHeight) {
      this.contextMenu.style.top = viewportHeight - menuRect.height - 10 + "px";
    }
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = "none";
      this.contextMenuTarget = null;
    }
  }

  handleContextMenuAction(action) {
    const folderId = this.contextMenuTarget;
    if (
      (action === "share-folder" && !this.canManageSharing) ||
      (action === "rename" && !this.canEditFolder(folderId)) ||
      (action === "delete" && !this.canManageFolder(folderId))
    ) {
      this.hideContextMenu();
      return;
    }

    switch (action) {
      case "new-snippet":
        this.hideContextMenu();
        // Pass folder ID to create snippet in this folder
        this.createSnippet("shortcut", folderId);
        break;

      case "share-folder":
        this.hideContextMenu();
        const folder = this.folders.find((item) => item.id === folderId);
        this.openShareDialog("folder", folderId, folder?.name || "Folder");
        break;

      case "rename":
        this.hideContextMenu();
        this.editFolderName(folderId);
        break;

      case "delete":
        this.hideContextMenu();
        this.deleteFolder(folderId);
        break;

      case "sort-by":
        this.hideContextMenu();
        if (
          window.dashboard &&
          typeof window.dashboard.showSortDialog === "function"
        ) {
          window.dashboard.showSortDialog((sortType) => {
            if (sortType) this.sortFolderItems(folderId, sortType);
          });
        } else {
          this.sortFolderItems(folderId, "name_asc");
        }
        break;

      default:
        this.hideContextMenu();
        break;
    }
  }

  // Context menu for individual items (snippets/forms)
  showItemContextMenu(x, y, item) {
    if (!this.contextMenu) return;

    this.contextMenuTarget = item;

    // Create item-specific context menu
    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="edit-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        <span>Edit ${item.type === "form" ? "form" : "snippet"}</span>
      </div>
      <div class="context-menu-item" data-action="duplicate-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Duplicate</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="move-to">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Move to folder...</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="delete-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>Delete ${item.type === "form" ? "form" : "snippet"}...</span>
      </div>
    `;

    // Re-bind click events
    this.contextMenu
      .querySelectorAll(".context-menu-item")
      .forEach((menuItem) => {
        menuItem.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = menuItem.dataset.action;
          this.handleItemContextMenuAction(action, item);
        });
      });

    this.contextMenu.style.display = "block";
    this.contextMenu.style.left = x + "px";
    this.contextMenu.style.top = y + "px";

    // Adjust if menu goes off-screen
    const menuRect = this.contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (menuRect.right > viewportWidth) {
      this.contextMenu.style.left = viewportWidth - menuRect.width - 10 + "px";
    }

    if (menuRect.bottom > viewportHeight) {
      this.contextMenu.style.top = viewportHeight - menuRect.height - 10 + "px";
    }
  }

  handleItemContextMenuAction(action, item) {
    const lacksPermission = ["edit-item", "duplicate-item", "move-to"].includes(
      action,
    )
      ? !this.canEditItem(item)
      : action === "delete-item" && !this.canDeleteItem(item);
    if (lacksPermission) {
      this.hideContextMenu();
      window.dashboard?.showToast(
        action === "delete-item"
          ? "You do not have permission to delete this item."
          : "You only have view access to this item.",
        "error",
      );
      return;
    }
    switch (action) {
      case "edit-item":
        this.hideContextMenu();
        this.editItem(item);
        break;

      case "duplicate-item":
        this.hideContextMenu();
        this.duplicateItem(item);
        break;

      case "move-to":
        this.hideContextMenu();
        this.showMoveToFolderDialog(item);
        break;

      case "delete-item":
        this.hideContextMenu();
        this.deleteItem(item);
        break;

      default:
        this.hideContextMenu();
        break;
    }
  }

  async openShareDialog(type, id, name) {
    await this.sharingContextPromise;
    if (!this.canManageSharing) return;
    const overlay = document.getElementById("shareResourceOverlay");
    const members = document.getElementById("shareResourceMembers");
    const error = document.getElementById("shareResourceError");
    if (!overlay || !members) return;

    this.shareResource = { type, id, name, permissions: [], groupPermissions: [] };
    this.activeShareTab = "users";
    document.getElementById("shareResourceTitle").textContent =
      `Share ${type === "folder" ? "folder" : type === "form" ? "form" : "snippet"}`;
    document.getElementById("shareResourceDescription").textContent =
      `${name} - choose the workspace members who can access it.`;
    error.textContent = "";
    overlay.style.display = "none";
    members.innerHTML =
      '<p class="share-resource-empty">Loading workspace members...</p>';
    document.getElementById("shareResourceMemberSearch").value = "";
    document.querySelectorAll("[data-share-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.shareTab === this.activeShareTab);
      tab.setAttribute("aria-selected", String(tab.dataset.shareTab === this.activeShareTab));
      tab.onclick = () => {
        this.activeShareTab = tab.dataset.shareTab;
        document.querySelectorAll("[data-share-tab]").forEach((item) => {
          item.classList.toggle("is-active", item.dataset.shareTab === this.activeShareTab);
          item.setAttribute("aria-selected", String(item.dataset.shareTab === this.activeShareTab));
        });
        this.filterShareMembers(document.getElementById("shareResourceMemberSearch").value);
      };
    });
    document.getElementById("shareResourceMemberSearch").oninput = (event) =>
      this.filterShareMembers(event.target.value);
    const renderMemberRows = () =>
      this.workspaceMembers.length || this.workspaceGroups.length
        ? this.workspaceMembers
            .map((member) => {
              const user = member.user;
              const displayName =
                [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                user.email;
              return `<div class="share-resource-member" data-member-email="${this.escapeAttribute(user.email)}" data-member-search="${this.escapeAttribute(`${displayName} ${user.email} ${member.role}`.toLowerCase())}" data-shared="false"><input type="checkbox" aria-label="Select ${this.escapeAttribute(displayName)}"><span><strong>${this.escapeHtml(displayName)}</strong><small>${this.escapeHtml(user.email)} · ${this.escapeHtml(member.role)}</small></span><select class="share-member-permission" aria-label="Permission for ${this.escapeAttribute(displayName)}"><option value="view">Can view</option><option value="edit">Can edit</option><option value="manage">Can manage</option></select><button class="share-member-remove" type="button" aria-label="Remove access from ${this.escapeAttribute(displayName)}" hidden>&times;</button></div>`;
            })
            .join("") + this.workspaceGroups.map((group) => `<div class="share-resource-member share-resource-group" data-group-id="${this.escapeAttribute(group.id)}" data-member-search="${this.escapeAttribute(`${group.name} group`.toLowerCase())}" data-shared="false"><input type="checkbox" aria-label="Select ${this.escapeAttribute(group.name)}"><span><strong>${this.escapeHtml(group.name)}</strong><small>Workspace group</small></span><select class="share-member-permission" aria-label="Permission for ${this.escapeAttribute(group.name)}"><option value="view">Can view</option><option value="edit">Can edit</option><option value="manage">Can manage</option></select><button class="share-member-remove" type="button" aria-label="Remove access from group" hidden>&times;</button></div>`).join("")
        : '<p class="share-resource-empty">No active workspace members are available.</p>';
    members.innerHTML =
      '<p class="share-resource-empty">Loading folder access...</p>';
    try {
      const response = await fetch(
        `${this.shareApiUrl}?resource_type=folder&resource_id=${encodeURIComponent(id)}`,
        { headers: { "X-User-Email": this.currentUserEmail } },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success)
        throw new Error(payload.error || "Could not load folder access.");
      this.shareResource.permissions = payload.permissions || [];
      this.shareResource.groupPermissions = payload.group_permissions || [];
      members.innerHTML = renderMemberRows();
      this.shareResource.permissions.forEach((permission) => {
        const row = members.querySelector(
          `[data-member-email="${CSS.escape(permission.user?.email || "")}"]`,
        );
        if (!row) return;
        row.querySelector("input").checked = true;
        row.querySelector("select").value = permission.permission;
      });
      this.applySharePermissions();
    } catch (loadError) {
      error.textContent = loadError.message;
      members.innerHTML = renderMemberRows();
    }
    overlay.style.display = "flex";
    this.bindShareMemberActions();
    this.filterShareMembers("");
  }

  filterShareMembers(value) {
    const query = value.trim().toLowerCase();
    document
      .querySelectorAll("#shareResourceMembers .share-resource-member")
      .forEach((row) => {
        const recipientType = row.dataset.groupId ? "groups" : "users";
        row.hidden = recipientType !== this.activeShareTab || (query !== "" && !row.dataset.memberSearch.includes(query));
      });
  }

  bindShareMemberActions() {
    document
      .querySelectorAll("#shareResourceMembers .share-member-remove")
      .forEach(
        (button) =>
          (button.onclick = () => {
            const row = button.closest(".share-resource-member");
            if (row.dataset.shared === "true") this.removeShareMember(row);
            else {
              row.querySelector("input").checked = true;
              row.dataset.shared = "pending";
              this.updateShareRowAction(row);
            }
          }),
      );
  }

  applySharePermissions() {
    this.shareResource.permissions.forEach((permission) => {
      const row = [
        ...document.querySelectorAll(
          "#shareResourceMembers .share-resource-member",
        ),
      ].find(
        (item) =>
          item.dataset.memberEmail.toLowerCase() ===
          (permission.user?.email || "").toLowerCase(),
      );
      if (!row) return;
      row.querySelector("input").checked = true;
      row.querySelector("select").value = permission.permission;
      row.dataset.shared = "true";
      this.updateShareRowAction(row);
    });
    this.shareResource.groupPermissions.forEach((permission) => {
      const row = document.querySelector(`#shareResourceMembers [data-group-id="${CSS.escape(permission.group_id)}"]`);
      if (!row) return;
      row.querySelector("select").value = permission.permission;
      row.dataset.shared = "true";
      this.updateShareRowAction(row);
    });
  }

  updateShareRowAction(row) {
    const button = row.querySelector(".share-member-remove");
    const shared =
      row.dataset.shared === "true" || row.dataset.shared === "pending";
    const checkbox = row.querySelector('input[type="checkbox"]');
    button.hidden = !shared;
    checkbox.hidden = shared;
    const label = row.dataset.groupId ? row.querySelector("strong").textContent : row.dataset.memberEmail;
    button.setAttribute(
      "aria-label",
      `${shared ? "Remove access from" : "Grant access to"} ${label}`,
    );
  }

  closeShareDialog() {
    const overlay = document.getElementById("shareResourceOverlay");
    if (overlay) overlay.style.display = "none";
    this.shareResource = null;
  }

  async submitShare(event) {
    event.preventDefault();
    const selected = [
      ...document.querySelectorAll(
        "#shareResourceMembers .share-resource-member input:checked",
      ),
    ].map((input) => input.closest(".share-resource-member"));
    const error = document.getElementById("shareResourceError");
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (!selected.length) {
      error.textContent = "Select at least one workspace member or group.";
      return;
    }
    if (!this.shareResource) return;

    submit.disabled = true;
    error.textContent = "";
    try {
      const results = await Promise.all(
        selected.map((row) =>
          fetch(this.shareApiUrl, {
            method: "POST",
            headers: {
              "X-User-Email": this.currentUserEmail,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resource_type: "folder",
              resource_id: this.shareResource.id,
              email: row.dataset.memberEmail || "",
              group_id: row.dataset.groupId || "",
              permission: row.querySelector("select").value,
            }),
          }).then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success)
              throw new Error(payload.error || "Could not share resource.");
            return { row, payload };
          }),
        ),
      );
      results.forEach(({ row }) => {
        const permission = row.querySelector("select").value;
        row.dataset.shared = "true";
        row.querySelector("input").checked = true;
        this.updateShareRowAction(row);
        if (row.dataset.groupId) {
          this.shareResource.groupPermissions = this.shareResource.groupPermissions.filter((item) => item.group_id !== row.dataset.groupId);
          this.shareResource.groupPermissions.push({ permission, group_id: row.dataset.groupId });
          return;
        }
        const email = row.dataset.memberEmail;
        this.shareResource.permissions = this.shareResource.permissions.filter(
          (item) => item.user?.email?.toLowerCase() !== email.toLowerCase(),
        );
        this.shareResource.permissions.push({ permission, user: { email } });
      });
      window.dashboard?.showToast(
        `Shared with ${results.length} recipient${results.length === 1 ? "" : "s"}.`,
      );
    } catch (shareError) {
      error.textContent = shareError.message;
    } finally {
      submit.disabled = false;
    }
  }

  async removeShareMember(row) {
    if (!row || !this.shareResource) return;
    const email = row.dataset.memberEmail;
    const groupId = row.dataset.groupId;
    const groupPermission = this.shareResource.groupPermissions.find((item) => item.group_id === groupId);
    if (groupId) {
      if (!groupPermission) {
        row.dataset.shared = "false";
        this.updateShareRowAction(row);
        return;
      }
      try {
        const response = await fetch(this.shareApiUrl, { method: "DELETE", headers: { "X-User-Email": this.currentUserEmail, "Content-Type": "application/json" }, body: JSON.stringify({ resource_type: "folder", resource_id: this.shareResource.id, group_id: groupId, action: "revoke" }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || "Could not remove group access.");
        row.dataset.shared = "false";
        this.updateShareRowAction(row);
        this.shareResource.groupPermissions = this.shareResource.groupPermissions.filter((item) => item.group_id !== groupId);
      } catch (removeError) { document.getElementById("shareResourceError").textContent = removeError.message; }
      return;
    }
    const permission = this.shareResource.permissions.find(
      (item) => item.user?.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!permission) {
      row.querySelector("input").checked = false;
      return;
    }
    try {
      const response = await fetch(this.shareApiUrl, {
        method: "DELETE",
        headers: {
          "X-User-Email": this.currentUserEmail,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource_type: "folder",
          resource_id: this.shareResource.id,
          email,
          permission: permission.permission,
          action: "revoke",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success)
        throw new Error(payload.error || "Could not remove access.");
      row.querySelector("input").checked = false;
      row.dataset.shared = "false";
      this.updateShareRowAction(row);
      this.shareResource.permissions = this.shareResource.permissions.filter(
        (item) => item.user?.email?.toLowerCase() !== email.toLowerCase(),
      );
    } catch (removeError) {
      document.getElementById("shareResourceError").textContent =
        removeError.message;
    }
  }

  escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value ?? "";
    return element.innerHTML;
  }

  escapeAttribute(value) {
    return this.escapeHtml(value).replace(/"/g, "&quot;");
  }

  async duplicateItem(item) {
    const newItem = {
      ...item,
      id:
        item.type === "form" ? "form_" + Date.now() : "shortcut_" + Date.now(),
      trigger: item.trigger + "_copy",
      label: item.label ? item.label + " (Copy)" : item.trigger + " (Copy)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (item.type === "form") {
      this.forms.push(newItem);
      await this.saveForms();
    } else {
      this.shortcuts.push(newItem);
      await this.saveShortcuts();
    }

    await this.refresh();

    if (window.dashboard) {
      window.dashboard.showToast("Item duplicated successfully!");
    }
  }

  showMoveToFolderDialog(item) {
    const folderNames = this.folders.map((f) => f.name);
    const folderOptions = folderNames
      .map((name, idx) => `${idx + 1}. ${name}`)
      .join("\n");

    const choice = prompt(
      `Move to folder:\n\n${folderOptions}\n\nEnter folder number or name:`,
    );

    if (!choice) return;

    // Find folder by number or name
    let targetFolder = null;
    const choiceNum = parseInt(choice);

    if (
      !isNaN(choiceNum) &&
      choiceNum > 0 &&
      choiceNum <= this.folders.length
    ) {
      targetFolder = this.folders[choiceNum - 1];
    } else {
      targetFolder = this.folders.find(
        (f) => f.name.toLowerCase() === choice.toLowerCase(),
      );
    }

    if (targetFolder) {
      this.moveSnippetToFolder(item.id, targetFolder.id);
    } else {
      alert("Folder not found!");
    }
  }

  async deleteItem(item) {
    const confirmMsg = `Delete ${item.type === "form" ? "form" : "snippet"} "${item.trigger}"?`;

    if (!confirm(confirmMsg)) return;

    if (item.type === "form") {
      await StorageHelper.deleteForm(item.id);
    } else {
      await StorageHelper.delete(item.id);
    }

    await this.loadFolders();
    this.render();

    if (window.dashboard) {
      window.dashboard.showToast(
        `${item.type === "form" ? "Form" : "Snippet"} deleted!`,
      );
      await window.dashboard.loadShortcuts();
      window.dashboard.render();
      window.dashboard.renderForms();
    }
  }

  // === DRAG & DROP ===

  /**
   * Sets up an element as a drag SOURCE.
   *
   * IMPORTANT: dragstart/dragend are bubbling events. Snippet items live
   * inside a folder's content div, which lives inside the folder's own
   * root element — and the folder root is ALSO draggable with its own
   * dragstart/dragend listeners (registered via this same method, with
   * type 'folder'). Without stopPropagation, starting a drag on a snippet
   * fires the snippet's dragstart first (draggedType = 'snippet'), then
   * the SAME event bubbles up and fires the ancestor folder's dragstart
   * too, which overwrites the shared drag state with draggedType =
   * 'folder'. By the time drop fires, this.draggedType is 'folder', so
   * the "move snippet" branch in attachDropEvents() never runs and the
   * drop silently does nothing. stopPropagation() here prevents that.
   */
  attachDragEvents(element, type, id, folderId = null) {
    element.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      this.draggedElement = element;
      this.draggedType = type;
      this.draggedId = id;
      this.draggedFromFolder = folderId;

      element.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/html", element.innerHTML);
    });

    element.addEventListener("dragend", (e) => {
      e.stopPropagation();
      element.classList.remove("dragging");
      this.draggedElement = null;
      this.draggedType = null;
      this.draggedId = null;
      this.draggedFromFolder = null;

      // Remove all drop indicators
      document.querySelectorAll(".drag-over").forEach((el) => {
        el.classList.remove("drag-over");
      });
      document.querySelectorAll(".drop-target-active").forEach((el) => {
        el.classList.remove("drop-target-active");
      });
      document.querySelectorAll(".folder-drop-zone").forEach((el) => {
        el.hidden = true;
      });
    });
  }

  attachDropEvents(dropZone, folderId) {
    const handleSnippetDrop = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove("drag-over");

      const folderDropZone = dropZone.querySelector(".folder-drop-zone");
      if (folderDropZone) folderDropZone.hidden = true;
      dropZone.classList.remove("drop-target-active");

      if (this.draggedType !== "snippet" || !this.draggedId) return;
      await this.moveSnippetToFolder(this.draggedId, folderId);
      this.render();
    };

    const setDropTargetVisible = (visible) => {
      const folderDropZone = dropZone.querySelector(".folder-drop-zone");
      if (folderDropZone) folderDropZone.hidden = !visible;
      dropZone.classList.toggle("drop-target-active", visible);
    };

    const folderDropZone = dropZone.querySelector(".folder-drop-zone");
    if (folderDropZone) {
      folderDropZone.addEventListener("dragover", (event) => {
        if (!this.draggedId || this.draggedType !== "snippet") return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        folderDropZone.classList.add("drag-over");
      });
      folderDropZone.addEventListener("drop", handleSnippetDrop);
    }

    dropZone.addEventListener("dragenter", (e) => {
      if (!this.draggedId || this.draggedType !== "snippet") return;
      e.preventDefault();
      e.stopPropagation();
      setDropTargetVisible(true);
    });

    dropZone.addEventListener("dragover", (e) => {
      if (!this.draggedId || this.draggedType !== "snippet") return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      dropZone.classList.add("drag-over");
      setDropTargetVisible(true);
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async (e) => {
      await handleSnippetDrop(e);
    });
  }

  attachFolderReorderDropEvents(folderDiv, folderId) {
    folderDiv.addEventListener("dragover", (e) => {
      if (!this.draggedId || this.draggedType !== "snippet") return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      folderDiv.classList.add("drag-over");
      const dropZone = folderDiv.querySelector(".folder-drop-zone");
      if (dropZone) dropZone.hidden = false;
    });

    folderDiv.addEventListener("dragleave", () => {
      folderDiv.classList.remove("drag-over");
    });

    folderDiv.addEventListener("drop", async (e) => {
      if (!this.draggedId || this.draggedType !== "snippet") return;
      e.preventDefault();
      e.stopPropagation();
      folderDiv.classList.remove("drag-over");
      const dropZone = folderDiv.querySelector(".folder-drop-zone");
      if (dropZone) dropZone.hidden = true;

      await this.moveSnippetToFolder(this.draggedId, folderId);
      this.render();
    });
  }

  attachItemReorderDropEvents(itemDiv, targetItemId, folderId) {
    itemDiv.addEventListener("dragover", (e) => {
      if (
        !this.draggedId ||
        this.draggedType !== "snippet" ||
        this.draggedId === targetItemId
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";

      const rect = itemDiv.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      if (offset > rect.height / 2) {
        itemDiv.classList.remove("drag-above");
        itemDiv.classList.add("drag-below");
      } else {
        itemDiv.classList.remove("drag-below");
        itemDiv.classList.add("drag-above");
      }
    });

    itemDiv.addEventListener("dragleave", () => {
      itemDiv.classList.remove("drag-above", "drag-below");
    });

    itemDiv.addEventListener("drop", async (e) => {
      if (
        !this.draggedId ||
        this.draggedType !== "snippet" ||
        this.draggedId === targetItemId
      )
        return;
      e.preventDefault();
      e.stopPropagation();

      const position = itemDiv.classList.contains("drag-below")
        ? "after"
        : "before";
      itemDiv.classList.remove("drag-above", "drag-below");

      await this.reorderSnippet(
        this.draggedId,
        targetItemId,
        position,
        folderId,
      );
    });
  }

  async reorderSnippet(
    draggedId,
    targetItemId,
    position = "before",
    targetFolderId = null,
  ) {
    const normalizedFolderId = targetFolderId;
    if (!this.canEditFolder(normalizedFolderId)) {
      window.dashboard?.showToast(
        "You do not have permission to edit this folder.",
        "error",
      );
      return;
    }

    let shortcut = this.shortcuts.find((s) => s.id === draggedId);
    let form = this.forms.find((f) => f.id === draggedId);

    if (shortcut && shortcut.folderId !== normalizedFolderId) {
      await this.moveSnippetToFolder(draggedId, targetFolderId);
      shortcut = this.shortcuts.find((s) => s.id === draggedId);
    } else if (form && form.folderId !== normalizedFolderId) {
      await this.moveSnippetToFolder(draggedId, targetFolderId);
      form = this.forms.find((f) => f.id === draggedId);
    }

    if (shortcut) {
      const draggedIdx = this.shortcuts.findIndex((s) => s.id === draggedId);
      const targetIdx = this.shortcuts.findIndex((s) => s.id === targetItemId);
      if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
        const [moved] = this.shortcuts.splice(draggedIdx, 1);
        let insertIdx =
          position === "after"
            ? draggedIdx < targetIdx
              ? targetIdx
              : targetIdx + 1
            : draggedIdx < targetIdx
              ? targetIdx - 1
              : targetIdx;
        insertIdx = Math.max(0, Math.min(insertIdx, this.shortcuts.length));
        this.shortcuts.splice(insertIdx, 0, moved);
        await StorageHelper.saveAll(this.shortcuts);
      }
    } else if (form) {
      const draggedIdx = this.forms.findIndex((f) => f.id === draggedId);
      const targetIdx = this.forms.findIndex((f) => f.id === targetItemId);
      if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
        const [moved] = this.forms.splice(draggedIdx, 1);
        let insertIdx =
          position === "after"
            ? draggedIdx < targetIdx
              ? targetIdx
              : targetIdx + 1
            : draggedIdx < targetIdx
              ? targetIdx - 1
              : targetIdx;
        insertIdx = Math.max(0, Math.min(insertIdx, this.forms.length));
        this.forms.splice(insertIdx, 0, moved);
        await StorageHelper.saveAllForms(this.forms);
      }
    }

    this.render();
    if (window.dashboard) {
      window.dashboard.shortcuts = this.shortcuts;
      window.dashboard.forms = this.forms;
      window.dashboard.render();
    }
  }

  async moveSnippetToFolder(itemId, targetFolderId) {
    const normalizedFolderId = targetFolderId;
    if (!this.canEditFolder(normalizedFolderId)) {
      window.dashboard?.showToast(
        "You do not have permission to move items to this folder.",
        "error",
      );
      return;
    }

    const shortcut = this.shortcuts.find((s) => s.id === itemId);
    if (shortcut) {
      if (!this.canEditItem(shortcut)) {
        window.dashboard?.showToast(
          "You do not have permission to move this item.",
          "error",
        );
        return;
      }
      const updatedShortcut = {
        ...shortcut,
        folderId: normalizedFolderId,
        updatedAt: new Date().toISOString(),
      };

      this.shortcuts = this.shortcuts.map((item) =>
        item.id === itemId ? updatedShortcut : item,
      );
      await StorageHelper.update(itemId, { folderId: normalizedFolderId });
      return;
    }

    const form = this.forms.find((f) => f.id === itemId);
    if (form) {
      if (!this.canEditItem(form)) {
        window.dashboard?.showToast(
          "You do not have permission to move this item.",
          "error",
        );
        return;
      }
      const updatedForm = {
        ...form,
        folderId: normalizedFolderId,
        updatedAt: new Date().toISOString(),
      };

      this.forms = this.forms.map((item) =>
        item.id === itemId ? updatedForm : item,
      );
      await StorageHelper.updateForm(itemId, { folderId: normalizedFolderId });
    }
  }

  attachFolderReorderDropEvents(folderDiv, targetFolderId) {
    folderDiv.addEventListener("dragover", (e) => {
      if (
        !this.draggedId ||
        this.draggedType !== "folder" ||
        this.draggedId === targetFolderId
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";

      const rect = folderDiv.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      if (offset > rect.height / 2) {
        folderDiv.classList.remove("drag-above");
        folderDiv.classList.add("drag-below");
      } else {
        folderDiv.classList.remove("drag-below");
        folderDiv.classList.add("drag-above");
      }
    });

    folderDiv.addEventListener("dragleave", () => {
      folderDiv.classList.remove("drag-above", "drag-below");
    });

    folderDiv.addEventListener("drop", async (e) => {
      if (
        !this.draggedId ||
        this.draggedType !== "folder" ||
        this.draggedId === targetFolderId
      )
        return;
      e.preventDefault();
      e.stopPropagation();

      const position = folderDiv.classList.contains("drag-below")
        ? "after"
        : "before";
      folderDiv.classList.remove("drag-above", "drag-below");

      await this.reorderFolder(this.draggedId, targetFolderId, position);
    });
  }

  async reorderFolder(draggedFolderId, targetFolderId, position = "before") {
    const draggedIdx = this.folders.findIndex((f) => f.id === draggedFolderId);
    const targetIdx = this.folders.findIndex((f) => f.id === targetFolderId);

    if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
      const [moved] = this.folders.splice(draggedIdx, 1);
      let insertIdx =
        position === "after"
          ? draggedIdx < targetIdx
            ? targetIdx
            : targetIdx + 1
          : draggedIdx < targetIdx
            ? targetIdx - 1
            : targetIdx;
      insertIdx = Math.max(0, Math.min(insertIdx, this.folders.length));
      this.folders.splice(insertIdx, 0, moved);

      await this.saveFolders();
      this.render();
    }
  }

  async sortFolderItems(folderId, sortType) {
    const isTarget = (item) => item.folderId === folderId;

    const folderShortcuts = this.shortcuts.filter((s) => isTarget(s));
    const otherShortcuts = this.shortcuts.filter((s) => !isTarget(s));

    const folderForms = this.forms.filter((f) => isTarget(f));
    const otherForms = this.forms.filter((f) => !isTarget(f));

    const compareFn = (a, b) => {
      if (sortType === "name_asc") {
        return (a.label || a.trigger || "").localeCompare(
          b.label || b.trigger || "",
        );
      } else if (sortType === "name_desc") {
        return (b.label || b.trigger || "").localeCompare(
          a.label || a.trigger || "",
        );
      } else if (sortType === "date_desc") {
        return (
          new Date(b.createdAt || b.updatedAt || 0) -
          new Date(a.createdAt || a.updatedAt || 0)
        );
      } else if (sortType === "date_asc") {
        return (
          new Date(a.createdAt || a.updatedAt || 0) -
          new Date(b.createdAt || b.updatedAt || 0)
        );
      }
      return 0;
    };

    folderShortcuts.sort(compareFn);
    folderForms.sort(compareFn);

    this.shortcuts = [...otherShortcuts, ...folderShortcuts];
    this.forms = [...otherForms, ...folderForms];

    await StorageHelper.saveAll(this.shortcuts);
    await StorageHelper.saveAllForms(this.forms);

    this.render();
    if (window.dashboard) {
      window.dashboard.shortcuts = this.shortcuts;
      window.dashboard.forms = this.forms;
      window.dashboard.render();
      window.dashboard.showToast("Folder items sorted!");
    }
  }

  // Public method to refresh sidebar when items change
  async refresh() {
    await this.loadFolders();
    this.render();
  }
}

// Initialize sidebar manager
let sidebarManager;

async function initSidebarManager() {
  if (!sidebarManager) {
    sidebarManager = new SidebarManager();
    await sidebarManager.init();
  }
  return sidebarManager;
}

function getSidebarManager() {
  return sidebarManager;
}
