class WorkspaceGroupsPage {
  constructor() {
    this.apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php';
    this.shareApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/share-resource.php';

    this.notice = document.getElementById('groupsNotice');
    this.list = document.getElementById('groupsList');
    this.count = document.getElementById('groupsCount');
    this.newBtn = document.getElementById('groupsNewBtn');
    this.createModal = document.getElementById('groupsCreateModal');
    this.createForm = document.getElementById('groupsCreateForm');
    this.cancelCreateBtn = document.getElementById('groupsCancelCreateBtn');
    this.closeCreateBtn = document.getElementById('groupsCloseCreateBtn');
    this.nameInput = document.getElementById('groupsName');
    this.descriptionInput = document.getElementById('groupsDescription');
    this.workspacePicker = document.getElementById('groupsWorkspacePicker');
    this.workspaceSelect = document.getElementById('groupsWorkspaceSelect');
    this.detailContent = document.getElementById('groupsDetailContent');
    this.memberModal = document.getElementById('groupsMemberModal');
    this.memberSearch = document.getElementById('groupsMemberSearch');
    this.memberOptions = document.getElementById('groupsMemberOptions');
    this.closeMemberBtn = document.getElementById('groupsCloseMemberBtn');
    this.editModal = document.getElementById('groupsEditModal');
    this.editForm = document.getElementById('groupsEditForm');
    this.editNameInput = document.getElementById('groupsEditName');
    this.editDescriptionInput = document.getElementById('groupsEditDescription');
    this.cancelEditBtn = document.getElementById('groupsCancelEditBtn');
    this.closeEditBtn = document.getElementById('groupsCloseEditBtn');

    this.groups = [];
    this.members = [];
    this.canManage = false;
    this.selectedGroupId = null;
    this.activeDetailTab = 'members';
    this.sharedFolders = [];
    this.sharedFoldersLoadedGroupId = null;
    this.sharedFoldersLoading = false;
    this.draggedGroupId = null;
    this.isReordering = false;
    this.isLoading = false;
    this.hasLoadedOnce = false;
    this.noticeTimer = null;
    this.selectedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id') || '';

    this.workspaceSelect?.addEventListener('change', () => this.changeWorkspace(this.workspaceSelect.value));
    this.newBtn?.addEventListener('click', () => this.openCreateModal());
    this.cancelCreateBtn?.addEventListener('click', () => this.closeCreateModal());
    this.closeCreateBtn?.addEventListener('click', () => this.closeCreateModal());
    this.closeMemberBtn?.addEventListener('click', () => this.closeMemberModal());
    this.cancelEditBtn?.addEventListener('click', () => this.closeEditModal());
    this.closeEditBtn?.addEventListener('click', () => this.closeEditModal());
    this.editForm?.addEventListener('submit', (event) => this.updateGroup(event));
    this.memberSearch?.addEventListener('input', () => this.renderMemberOptions());
    [this.createModal, this.memberModal, this.editModal].forEach((modal) => modal?.addEventListener('click', (event) => {
      if (event.target === modal) modal.hidden = true;
    }));
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      this.closeCreateModal();
      this.closeMemberModal();
      this.closeEditModal();
    });
    this.createForm?.addEventListener('submit', (event) => this.createGroup(event));
    this.list?.addEventListener('click', (event) => this.handleListClick(event));
    this.list?.addEventListener('keydown', (event) => this.handleListKeydown(event));
    this.list?.addEventListener('dragstart', (event) => this.handleDragStart(event));
    this.list?.addEventListener('dragover', (event) => this.handleDragOver(event));
    this.list?.addEventListener('drop', (event) => this.handleDrop(event));
    this.list?.addEventListener('dragend', () => this.handleDragEnd());
    this.detailContent?.addEventListener('click', (event) => this.handleDetailClick(event));

    this.showListSkeleton();
    this.showDetailSkeleton();
    this.load();
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  async load() {
    this.setLoading(true);
    if (this.hasLoadedOnce) {
      this.showListSkeleton();
      this.showDetailSkeleton();
    }
    try {
      const identity = await chrome.identity.getProfileUserInfo();
      if (!identity?.email) throw new Error('Please sign in to Chrome before managing groups.');
      this.identityEmail = identity.email;

      const url = new URL(this.apiUrl);
      if (this.selectedWorkspaceId) url.searchParams.set('workspace_id', this.selectedWorkspaceId);
      const response = await fetch(url, { headers: { 'X-User-Email': identity.email } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load workspace groups.');

      this.selectedWorkspaceId = payload.workspace_id;
      this.groups = Array.isArray(payload.groups) ? payload.groups : [];
      this.members = Array.isArray(payload.members) ? payload.members : [];
      this.canManage = payload.can_manage === true;

      this.renderWorkspacePicker(payload.workspace_ids || []);
      this.newBtn.hidden = !this.canManage;
      if (!this.canManage) this.closeCreateModal();

      // Keep the current selection if it still exists; otherwise fall back to the first group.
      if (!this.selectedGroupId || !this.groups.some((group) => group.id === this.selectedGroupId)) {
        this.selectedGroupId = this.groups[0]?.id || null;
      }

      this.renderList();
      this.renderDetail();
      this.hasLoadedOnce = true;
    } catch (error) {
      this.renderLoadError(error.message || 'Could not load workspace groups.');
    } finally {
      this.setLoading(false);
    }
  }

  async changeWorkspace(workspaceId) {
    if (!workspaceId || this.isLoading) return;
    this.selectedWorkspaceId = workspaceId;
    this.selectedGroupId = null;
    const url = new URL(window.location.href);
    url.searchParams.set('workspace_id', workspaceId);
    window.history.replaceState({}, '', url);
    await this.load();
  }

  // ------------------------------------------------------------------
  // Workspace picker
  // ------------------------------------------------------------------

  renderWorkspacePicker(workspaceIds) {
    if (!this.workspaceSelect || workspaceIds.length <= 1) {
      this.workspacePicker.hidden = true;
      return;
    }
    this.workspacePicker.hidden = false;
    this.workspaceSelect.innerHTML = workspaceIds.map((workspace) => `<option value="${this.escapeAttribute(workspace.id)}">${this.escape(workspace.name)}</option>`).join('');
    this.workspaceSelect.value = this.selectedWorkspaceId;
  }

  // ------------------------------------------------------------------
  // List panel (left column)
  // ------------------------------------------------------------------

  showListSkeleton() {
    this.count.textContent = 'Loading…';
    this.list.innerHTML = Array.from({ length: 4 }, () => `
      <div class="groups-row groups-row-skeleton">
        <span class="groups-skeleton-line"></span>
        <span class="groups-skeleton-line"></span>
      </div>
    `).join('');
  }

  renderList() {
    this.count.textContent = `${this.groups.length} group${this.groups.length === 1 ? '' : 's'}`;

    if (!this.groups.length) {
      this.list.innerHTML = `<div class="groups-state">
        <span class="groups-state-icon" aria-hidden="true">·</span>
        <span class="groups-state-title">No groups yet</span>
        <span class="groups-state-sub">${this.canManage ? 'Create your first group to start organizing access.' : 'No groups have been created in this workspace yet.'}</span>
      </div>`;
      return;
    }

    this.list.innerHTML = this.groups.map((group) => {
      const members = Array.isArray(group.members) ? group.members : [];
      const selected = group.id === this.selectedGroupId;
      return `<div class="groups-row${selected ? ' is-selected' : ''}" role="option" aria-selected="${selected}" tabindex="0" draggable="${this.canManage}" data-select-group="${this.escapeAttribute(group.id)}">
        <div class="groups-row-top">
          <span class="groups-row-name">${this.escape(group.name)}</span>
          <span class="groups-row-count">${members.length} member${members.length === 1 ? '' : 's'}</span>
        </div>
        <span class="groups-row-desc">${this.escape(group.description || 'No description added.')}</span>
      </div>`;
    }).join('');
  }

  handleListClick(event) {
    const row = event.target.closest('[data-select-group]');
    if (!row) return;
    this.selectGroup(row.dataset.selectGroup);
  }

  handleListKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-select-group]');
    if (!row) return;
    event.preventDefault();
    this.selectGroup(row.dataset.selectGroup);
  }

  handleDragStart(event) {
    if (!this.canManage || this.isReordering) return;
    const row = event.target.closest('[data-select-group]');
    if (!row) return;
    this.draggedGroupId = row.dataset.selectGroup;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.draggedGroupId);
  }

  handleDragOver(event) {
    if (!this.draggedGroupId) return;
    const row = event.target.closest('[data-select-group]');
    if (!row || row.dataset.selectGroup === this.draggedGroupId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  handleDrop(event) {
    if (!this.draggedGroupId) return;
    const target = event.target.closest('[data-select-group]');
    if (!target || target.dataset.selectGroup === this.draggedGroupId) return;
    event.preventDefault();
    const targetGroupId = target.dataset.selectGroup;
    const previousGroups = [...this.groups];
    const draggedIndex = this.groups.findIndex((group) => group.id === this.draggedGroupId);
    const targetIndex = this.groups.findIndex((group) => group.id === targetGroupId);
    if (draggedIndex < 0 || targetIndex < 0) return;
    const [draggedGroup] = this.groups.splice(draggedIndex, 1);
    this.groups.splice(targetIndex, 0, draggedGroup);
    this.renderList();
    this.persistGroupOrder(previousGroups);
  }

  handleDragEnd() {
    this.draggedGroupId = null;
    this.list?.querySelector('.is-dragging')?.classList.remove('is-dragging');
  }

  async persistGroupOrder(previousGroups) {
    this.isReordering = true;
    try {
      await this.request({ action: 'reorder_groups', workspace_id: this.selectedWorkspaceId, group_ids: this.groups.map((group) => group.id) });
      this.showNotice('Group order saved.', 'success');
    } catch (error) {
      this.groups = previousGroups;
      this.renderList();
      this.showNotice(error.message, 'error');
    } finally {
      this.isReordering = false;
    }
  }

  selectGroup(groupId) {
    if (groupId === this.selectedGroupId) return;
    this.selectedGroupId = groupId;
    this.activeDetailTab = 'members';
    this.sharedFolders = [];
    this.sharedFoldersLoadedGroupId = null;
    this.renderList();
    this.renderDetail();
  }

  // ------------------------------------------------------------------
  // Detail panel (right column)
  // ------------------------------------------------------------------

  showDetailSkeleton() {
    this.detailContent.innerHTML = `
      <span class="groups-skeleton-line" style="width:40%; height:1.3em; margin-bottom:10px;"></span>
      <span class="groups-skeleton-line" style="width:70%; margin-bottom:24px;"></span>
      <span class="groups-skeleton-line" style="width:20%; height:.8em; margin-bottom:14px;"></span>
      <span class="groups-skeleton-line" style="width:100%; height:2.6em; margin-bottom:8px;"></span>
      <span class="groups-skeleton-line" style="width:100%; height:2.6em; margin-bottom:8px;"></span>
      <span class="groups-skeleton-line" style="width:100%; height:2.6em;"></span>
    `;
  }

  getSelectedGroup() {
    return this.groups.find((group) => group.id === this.selectedGroupId) || null;
  }

  renderDetail() {
    const group = this.getSelectedGroup();

    if (!group) {
      this.detailContent.innerHTML = `<div class="groups-state">
        <span class="groups-state-icon" aria-hidden="true">·</span>
        <span class="groups-state-title">${this.groups.length ? 'Select a group' : 'No group selected'}</span>
        <span class="groups-state-sub">${this.groups.length ? 'Choose a group on the left to view and manage its members.' : 'Create a group to start assigning members.'}</span>
      </div>`;
      return;
    }

    const members = Array.isArray(group.members) ? group.members : [];
    const memberList = members.length
      ? members.map((member) => `<div class="groups-member-row" data-member-row="${this.escapeAttribute(member.id)}">
          <span class="groups-avatar" style="background:${this.avatarColor(member.email || member.id)}">${this.escape(this.memberInitials(member))}</span>
          <span class="groups-member-text">
            <span class="groups-member-name">${this.escape(this.memberLabel(member))}</span>
            <span class="groups-member-email">${this.escape(member.email || '')}</span>
          </span>
          ${this.canManage ? `<button type="button" class="groups-remove-member" data-group-id="${this.escapeAttribute(group.id)}" data-user-id="${this.escapeAttribute(member.id)}" aria-label="Remove ${this.escapeAttribute(member.email || 'member')}">×</button>` : ''}
        </div>`).join('')
      : `<div class="groups-member-empty">No members assigned yet.</div>`;

    const detailBody = this.activeDetailTab === 'shared-folders'
      ? this.renderSharedFolders(group)
      : `<p class="groups-detail-section-label">${members.length} member${members.length === 1 ? '' : 's'}</p>
         <div class="groups-member-list">${memberList}</div>`;
    this.detailContent.innerHTML = `
      <div class="groups-detail-heading">
        <div>
          <h2>${this.escape(group.name)}</h2>
          <p class="groups-detail-desc">${this.escape(group.description || 'No description added.')}</p>
        </div>
        ${this.canManage ? `<div class="groups-detail-actions">
          <button class="groups-secondary-btn" type="button" data-edit-group="${this.escapeAttribute(group.id)}">Edit group</button>
          <button class="groups-secondary-btn" type="button" data-add-member-group="${this.escapeAttribute(group.id)}">Add member</button>
          <button class="groups-secondary-btn groups-delete-btn" type="button" data-delete-group="${this.escapeAttribute(group.id)}">
            <span class="groups-button-label">Delete group</span>
            <span class="groups-spinner groups-spinner-dark" aria-hidden="true" hidden></span>
          </button>
        </div>` : ''}
      </div>
      <div class="groups-detail-tabs" role="tablist" aria-label="Group details">
        <button class="groups-detail-tab${this.activeDetailTab === 'members' ? ' is-active' : ''}" type="button" role="tab" aria-selected="${this.activeDetailTab === 'members'}" data-detail-tab="members">Members</button>
        <button class="groups-detail-tab${this.activeDetailTab === 'shared-folders' ? ' is-active' : ''}" type="button" role="tab" aria-selected="${this.activeDetailTab === 'shared-folders'}" data-detail-tab="shared-folders">Shared folders</button>
      </div>
      <div class="groups-detail-tab-content">${detailBody}</div>
    `;
    if (this.activeDetailTab === 'shared-folders' && this.sharedFoldersLoadedGroupId !== group.id && !this.sharedFoldersLoading) this.loadSharedFolders(group.id);
  }

  handleDetailClick(event) {
    const detailTab = event.target.closest('[data-detail-tab]');
    if (detailTab) {
      this.activeDetailTab = detailTab.dataset.detailTab;
      this.renderDetail();
      return;
    }
    const revokeButton = event.target.closest('[data-revoke-group-share]');
    if (revokeButton) {
      this.revokeSharedFolder(revokeButton);
      return;
    }
    const removeButton = event.target.closest('[data-user-id]');
    if (removeButton) {
      this.removeMember(removeButton);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-group]');
    if (deleteButton) {
      this.deleteGroup(deleteButton);
      return;
    }
    const editButton = event.target.closest('[data-edit-group]');
    if (editButton) {
      this.openEditModal(editButton.dataset.editGroup);
      return;
    }
    const addButton = event.target.closest('[data-add-member-group]');
    if (addButton) {
      this.openMemberModal(addButton.dataset.addMemberGroup);
    }
  }

  renderSharedFolders(group) {
    if (this.sharedFoldersLoading && this.sharedFoldersLoadedGroupId !== group.id) return '<div class="groups-state"><span class="groups-state-sub">Loading shared folders...</span></div>';
    if (!this.sharedFolders.length) return '<div class="groups-state"><span class="groups-state-icon" aria-hidden="true">·</span><span class="groups-state-title">No shared folders</span><span class="groups-state-sub">Folders shared with this group will appear here.</span></div>';
    return `<p class="groups-detail-section-label">${this.sharedFolders.length} shared folder${this.sharedFolders.length === 1 ? '' : 's'}</p><div class="groups-shared-folder-list">${this.sharedFolders.map((folder) => `<div class="groups-shared-folder-row"><span class="groups-shared-folder-icon" aria-hidden="true">□</span><span class="groups-member-text"><span class="groups-member-name">${this.escape(folder.name)}</span><span class="groups-member-email">Can ${this.escape(folder.permission)} · Shared ${this.escape(this.formatDate(folder.shared_at))}</span></span>${this.canManage ? `<button type="button" class="groups-secondary-btn groups-revoke-share-btn" data-revoke-group-share="${this.escapeAttribute(folder.id)}" data-permission-id="${this.escapeAttribute(folder.permission_id)}">Remove access</button>` : ''}</div>`).join('')}</div>`;
  }

  async loadSharedFolders(groupId) {
    this.sharedFoldersLoading = true;
    this.renderDetail();
    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('workspace_id', this.selectedWorkspaceId);
      url.searchParams.set('action', 'shared_folders');
      url.searchParams.set('group_id', groupId);
      const response = await fetch(url, { headers: { 'X-User-Email': this.identityEmail } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load shared folders.');
      this.sharedFolders = Array.isArray(payload.shared_folders) ? payload.shared_folders : [];
      this.sharedFoldersLoadedGroupId = groupId;
    } catch (error) {
      this.showNotice(error.message, 'error');
      this.sharedFolders = [];
      this.sharedFoldersLoadedGroupId = groupId;
    } finally {
      this.sharedFoldersLoading = false;
      if (this.activeDetailTab === 'shared-folders' && this.selectedGroupId === groupId) this.renderDetail();
    }
  }

  async revokeSharedFolder(button) {
    if (this.isLoading) return;
    if (!confirm('Remove this folder from the group?')) return;
    this.setButtonBusy(button, true, 'Removing...');
    try {
      const response = await fetch(this.shareApiUrl, { method: 'DELETE', headers: { 'X-User-Email': this.identityEmail, 'Content-Type': 'application/json' }, body: JSON.stringify({ resource_type: 'folder', resource_id: button.dataset.revokeGroupShare, group_id: this.selectedGroupId, action: 'revoke' }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not remove folder access.');
      this.showNotice('Folder access removed from group.', 'success');
      this.sharedFoldersLoadedGroupId = null;
      await this.loadSharedFolders(this.selectedGroupId);
    } catch (error) {
      this.showNotice(error.message, 'error');
      this.setButtonBusy(button, false, 'Remove access');
    }
  }

  // ------------------------------------------------------------------
  // Create group
  // ------------------------------------------------------------------

  openCreateModal() {
    this.createModal.hidden = false;
    this.nameInput?.focus();
  }

  closeCreateModal() {
    if (!this.createModal) return;
    this.createModal.hidden = true;
    this.createForm?.reset();
  }

  openEditModal(groupId) {
    const group = this.groups.find((item) => item.id === groupId);
    if (!group) return;
    this.editGroupId = groupId;
    this.editNameInput.value = group.name || '';
    this.editDescriptionInput.value = group.description || '';
    this.editModal.hidden = false;
    this.editNameInput.focus();
  }

  closeEditModal() {
    if (this.editModal) this.editModal.hidden = true;
    this.editForm?.reset();
    this.editGroupId = null;
  }

  openMemberModal(groupId) {
    this.memberGroupId = groupId;
    this.memberSearch.value = '';
    this.renderMemberOptions();
    this.memberModal.hidden = false;
    this.memberSearch.focus();
  }

  closeMemberModal() {
    if (this.memberModal) this.memberModal.hidden = true;
  }

  renderMemberOptions() {
    const group = this.groups.find((item) => item.id === this.memberGroupId);
    const existingIds = new Set((group?.members || []).map((member) => member.id));
    const query = (this.memberSearch?.value || '').trim().toLowerCase();
    const options = this.members.filter((member) => {
      const label = this.memberLabel(member).toLowerCase();
      return !existingIds.has(member.id) && (!query || label.includes(query) || (member.email || '').toLowerCase().includes(query));
    });
    this.memberOptions.innerHTML = options.length ? options.map((member) => `<div class="groups-member-option">
      <span class="groups-avatar" style="background:${this.avatarColor(member.email || member.id)}">${this.escape(this.memberInitials(member))}</span>
      <span class="groups-member-text"><span class="groups-member-name">${this.escape(this.memberLabel(member))}</span><span class="groups-member-email">${this.escape(member.email || '')}</span></span>
      <button type="button" class="groups-primary-btn groups-member-add-btn" data-add-user="${this.escapeAttribute(member.id)}">Add</button>
    </div>`).join('') : '<div class="groups-member-empty">No matching members available.</div>';
    this.memberOptions.querySelectorAll('[data-add-user]').forEach((button) => button.addEventListener('click', () => this.addMember(button)));
  }

  async createGroup(event) {
    event.preventDefault();
    if (!this.canManage || this.isLoading) return;
    const submitButton = this.createForm.querySelector('button[type="submit"]');
    this.setButtonBusy(submitButton, true, 'Creating…');
    this.cancelCreateBtn.disabled = true;
    try {
      await this.request({ action: 'create_group', workspace_id: this.selectedWorkspaceId, name: this.nameInput.value.trim(), description: this.descriptionInput.value.trim() });
      this.closeCreateModal();
      this.showNotice('Group created.', 'success');
      // Newly created groups should become the active selection once reloaded.
      this.selectedGroupId = null;
      await this.load();
    } catch (error) {
      this.showNotice(error.message, 'error');
    } finally {
      this.setButtonBusy(submitButton, false, 'Create group');
      this.cancelCreateBtn.disabled = false;
    }
  }

  async updateGroup(event) {
    event.preventDefault();
    if (!this.canManage || this.isLoading || !this.editGroupId) return;
    const submitButton = this.editForm.querySelector('button[type="submit"]');
    this.setButtonBusy(submitButton, true, 'Saving…');
    this.cancelEditBtn.disabled = true;
    try {
      await this.request({ action: 'update_group', workspace_id: this.selectedWorkspaceId, group_id: this.editGroupId, name: this.editNameInput.value.trim(), description: this.editDescriptionInput.value.trim() });
      this.closeEditModal();
      this.showNotice('Group updated.', 'success');
      await this.load();
    } catch (error) {
      this.showNotice(error.message, 'error');
    } finally {
      this.setButtonBusy(submitButton, false, 'Save changes');
      this.cancelEditBtn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Membership mutations
  // ------------------------------------------------------------------

  async addMember(button) {
    if (this.isLoading) return;
    const groupId = this.memberGroupId;
    const userId = button.dataset.addUser;
    if (!userId) return;
    this.setButtonBusy(button, true, 'Adding…');
    try {
      await this.request({ action: 'add_member', workspace_id: this.selectedWorkspaceId, group_id: groupId, user_id: userId });
      this.closeMemberModal();
      this.showNotice('Member added to group.', 'success');
      await this.load();
    } catch (error) {
      this.showNotice(error.message, 'error');
      this.setButtonBusy(button, false, 'Add');
    }
  }

  async removeMember(button) {
    if (this.isLoading) return;
    const row = button.closest('[data-member-row]');
    button.disabled = true;
    if (row) row.style.opacity = '.55';
    try {
      await this.request({ action: 'remove_member', workspace_id: this.selectedWorkspaceId, group_id: button.dataset.groupId, user_id: button.dataset.userId });
      this.showNotice('Member removed from group.', 'success');
      await this.load();
    } catch (error) {
      this.showNotice(error.message, 'error');
      button.disabled = false;
      if (row) row.style.opacity = '';
    }
  }

  async deleteGroup(button) {
    if (this.isLoading) return;
    if (!confirm('Delete this group? Its members will remain in the workspace.')) return;
    this.setButtonBusy(button, true, 'Deleting…');
    try {
      await this.request({ action: 'delete_group', workspace_id: this.selectedWorkspaceId, group_id: button.dataset.deleteGroup });
      this.showNotice('Group deleted.', 'success');
      this.selectedGroupId = null;
      await this.load();
    } catch (error) {
      this.showNotice(error.message, 'error');
      this.setButtonBusy(button, false, 'Delete group');
    }
  }

  // ------------------------------------------------------------------
  // Shared request/loading/notice helpers
  // ------------------------------------------------------------------

  async request(body) {
    const response = await fetch(this.apiUrl, { method: 'POST', headers: { 'X-User-Email': this.identityEmail, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Group action failed.');
    return payload;
  }

  setLoading(value) {
    this.isLoading = value;
    if (this.workspaceSelect) this.workspaceSelect.disabled = value;
    if (this.newBtn) this.newBtn.disabled = value;
  }

  setButtonBusy(button, busy, label) {
    if (!button) return;
    const labelEl = button.querySelector('.groups-button-label');
    const spinnerEl = button.querySelector('.groups-spinner');
    button.disabled = busy;
    if (labelEl && label) labelEl.textContent = label;
    if (spinnerEl) spinnerEl.hidden = !busy;
  }

  renderLoadError(message) {
    this.count.textContent = 'Could not load groups';
    this.list.innerHTML = `<div class="groups-state is-error">
      <span class="groups-state-icon" aria-hidden="true">!</span>
      <span class="groups-state-title">Something went wrong</span>
      <span class="groups-state-sub">${this.escape(message)}</span>
    </div>`;
    this.detailContent.innerHTML = '';
    this.showNotice(message, 'error');
  }

  showNotice(message, type = 'info') {
    clearTimeout(this.noticeTimer);
    this.notice.textContent = message;
    this.notice.className = `groups-notice is-visible${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    if (type !== 'error') {
      this.noticeTimer = setTimeout(() => this.notice.classList.remove('is-visible'), 4000);
    }
  }

  // ------------------------------------------------------------------
  // Formatting helpers
  // ------------------------------------------------------------------

  memberLabel(member) { return [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || 'Member'; }

  memberInitials(member) {
    const first = (member.first_name || '').trim();
    const last = (member.last_name || '').trim();
    if (first && last) return (first[0] + last[0]).toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
    const email = (member.email || '').trim();
    if (email) return email.slice(0, 2).toUpperCase();
    return '?';
  }

  avatarColor(seed) {
    const colors = ['#159447', '#3498db', '#9b59b6', '#e67e22', '#e74c3c', '#1abc9c', '#34495e', '#d35400'];
    let hash = 0;
    for (let i = 0; i < (seed || '').length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash |= 0; } 
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'recently';
  }

  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
  escapeAttribute(value) { return this.escape(value).replace(/"/g, '&quot;'); }
}

document.addEventListener('DOMContentLoaded', () => new WorkspaceGroupsPage());