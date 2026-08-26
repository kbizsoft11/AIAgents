class WorkspacePage {
  constructor() {
    this.workspaceApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/workspace.php';
    this.inviteApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/send-invitation.php';
    this.notice = document.getElementById('workspaceNotice');
    this.invitePanel = document.getElementById('invitePanel');
    this.inviteForm = document.getElementById('inviteForm');
    this.results = document.getElementById('workspaceResults');
    this.tableHead = document.getElementById('workspaceTableHead');
    this.workspaceSelector = document.getElementById('workspaceSelector');
    this.state = { tab: 'members', search: '', role: '', status: '', resource_type: '', page: 1, per_page: 10, pages: 1, total: 0 };
    this.availableWorkspaces = [];
    this.activeWorkspaceId = null;
    this.isLoading = false;
    this.noticeTimer = null;
    this.bindEvents();
    this.initialize();
  }

  async initialize() {
    this.showLoading();
    try {
      const identity = await this.getIdentity();
      if (!identity?.email) throw new Error('Please sign in to Chrome before managing this workspace.');
      this.identityEmail = identity.email;
      await this.loadResults();
    } catch (error) {
      console.error('Could not initialize workspace:', error);
      this.renderError(error.message || 'Could not load workspace data.');
    }
  }

  bindEvents() {
    document.querySelectorAll('.workspace-tab').forEach((tab) => tab.addEventListener('click', () => {
      if (this.isLoading || tab.classList.contains('is-active')) return;
      this.state.tab = tab.dataset.tab;
      this.state.page = 1;
      this.updateFilterVisibility();
      this.loadResults();
    }));

    let searchTimer;
    document.getElementById('workspaceSearch')?.addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      const value = event.target.value.trim();
      searchTimer = setTimeout(() => {
        this.state.search = value;
        this.state.page = 1;
        this.loadResults();
      }, 300);
    });
    ['workspaceRoleFilter', 'workspaceStatusFilter', 'workspaceResourceFilter'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', (event) => {
        const key = id === 'workspaceRoleFilter' ? 'role' : id === 'workspaceStatusFilter' ? 'status' : 'resource_type';
        this.state[key] = event.target.value;
        this.state.page = 1;
        this.loadResults();
      });
    });
    document.getElementById('workspaceClearFilters')?.addEventListener('click', () => {
      if (this.isLoading) return;
      this.state.search = this.state.role = this.state.status = this.state.resource_type = '';
      this.state.page = 1;
      document.getElementById('workspaceSearch').value = '';
      ['workspaceRoleFilter', 'workspaceStatusFilter', 'workspaceResourceFilter'].forEach((id) => { document.getElementById(id).value = ''; });
      this.loadResults();
    });
    document.getElementById('workspacePrevious')?.addEventListener('click', () => { if (!this.isLoading && this.state.page > 1) { this.state.page--; this.loadResults(); } });
    document.getElementById('workspaceNext')?.addEventListener('click', () => { if (!this.isLoading && this.state.page < this.state.pages) { this.state.page++; this.loadResults(); } });
    document.getElementById('inviteUserBtn')?.addEventListener('click', () => { this.invitePanel.hidden = false; document.getElementById('inviteEmail')?.focus(); });
    document.getElementById('cancelInviteBtn')?.addEventListener('click', () => { this.invitePanel.hidden = true; this.inviteForm.reset(); });
    this.workspaceSelector?.addEventListener('change', (event) => {
      const workspaceId = event.target.value;
      if (!workspaceId || this.isLoading) return;
      const params = new URLSearchParams(window.location.search);
      params.set('workspace_id', workspaceId);
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', url);
      this.loadResults();
    });
    this.inviteForm?.addEventListener('submit', (event) => this.submitInvitation(event));
    document.getElementById('closeWorkspaceShare')?.addEventListener('click', () => this.closeShareEditor());
    document.getElementById('cancelWorkspaceShare')?.addEventListener('click', () => this.closeShareEditor());
    this.results?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-folder]');
      if (button) this.openShareEditor(button.dataset.editFolder, button.dataset.folderName);
    });
  }

  async submitInvitation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = document.getElementById('sendInviteBtn');
    const label = submitButton.querySelector('.btn-label');
    const spinner = submitButton.querySelector('.btn-spinner');
    const email = document.getElementById('inviteEmail').value.trim().toLowerCase();
    const role = document.getElementById('inviteRole').value;

    submitButton.disabled = true;
    document.getElementById('cancelInviteBtn').disabled = true;
    label.textContent = 'Sending…';
    spinner.hidden = false;

    try {
      const response = await fetch(this.inviteApiUrl, { method: 'POST', headers: { 'x-user-email': this.identityEmail, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || payload.message || `Could not send invitation (${response.status}).`);
      form.reset();
      this.invitePanel.hidden = true;
      this.showNotice(payload.message || 'Invitation sent successfully.', 'success');
      this.state.tab = 'invitations';
      this.state.page = 1;
      this.updateFilterVisibility();
      await this.loadResults();
    } catch (error) {
      this.showNotice(error.message, 'error');
    } finally {
      submitButton.disabled = false;
      document.getElementById('cancelInviteBtn').disabled = false;
      label.textContent = 'Send invitation';
      spinner.hidden = true;
    }
  }

  async loadResults() {
    this.showLoading();
    const params = new URLSearchParams({ ...this.state, page: String(this.state.page), per_page: String(this.state.per_page) });
    const selectedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id');
    if (selectedWorkspaceId) params.set('workspace_id', selectedWorkspaceId);
    try {
      const response = await fetch(`${this.workspaceApiUrl}?${params}`, { headers: { 'X-User-Email': this.identityEmail } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || `Could not load workspace (${response.status}).`);
      this.state = { ...this.state, ...payload.pagination };
      this.activeWorkspaceId = payload.selected_workspace_id || payload.workspace?.id || this.activeWorkspaceId;
      this.availableWorkspaces = Array.isArray(payload.workspaces) && payload.workspaces.length ? payload.workspaces : [payload.workspace || { id: this.activeWorkspaceId, name: 'Your workspace' }];
      this.renderWorkspaceSwitcher();
      this.canManageMembers = ['owner', 'admin'].includes(payload.membership.role);
      if (!this.canManageMembers && this.state.tab === 'invitations') {
        this.state.tab = 'members';
        this.state.page = 1;
        await this.loadResults();
        return;
      }
      document.getElementById('workspaceName').textContent = payload.workspace.name || 'Your workspace';
      document.getElementById('workspaceIdentity').textContent = `${payload.current_user.email} · ${payload.membership.role}`;
      const plan = payload.workspace_plan || {};
      if (this.canManageMembers) {
        const usedSeats = Number(plan.active_members || 0) + Number(plan.pending_invitations || 0);
        const memberLimit = Number(plan.member_limit || 0);
        const seatLabel = memberLimit > 100000000 ? 'Custom member limit' : `${usedSeats} of ${memberLimit} seats used`;
        document.getElementById('workspacePlanSummary').textContent = `${plan.name || 'Free'} plan · ${seatLabel}`;
      } else {
        document.getElementById('workspacePlanSummary').textContent = `${Number(plan.member_count || 0)} workspace members`;
      }
      document.getElementById('inviteUserBtn').hidden = !this.canManageMembers;
      if (this.canManageMembers) {
        const usedSeats = Number(plan.active_members || 0) + Number(plan.pending_invitations || 0);
        const memberLimit = Number(plan.member_limit || 0);
        document.getElementById('inviteUserBtn').disabled = memberLimit > 0 && usedSeats >= memberLimit;
        document.getElementById('inviteUserBtn').title = document.getElementById('inviteUserBtn').disabled ? 'Upgrade your plan to invite more members' : '';
      }
      document.querySelector('[data-tab="invitations"]').hidden = !this.canManageMembers;
      this.updateFilterVisibility();
      this.renderTabState();
      this.renderItems(payload.items || []);
      this.renderPagination();
    } catch (error) {
      console.error('Could not load workspace results:', error);
      this.renderError(error.message || 'Could not load workspace data.');
    } finally {
      this.setLoadingState(false);
    }
  }

  renderWorkspaceSwitcher() {
    if (!this.workspaceSelector) return;
    this.workspaceSelector.disabled = false;
    this.workspaceSelector.innerHTML = this.availableWorkspaces.map((workspace) => {
      const id = workspace?.id || '';
      const name = workspace?.name || 'Workspace';
      return `<option value="${this.escapeAttribute(id)}" ${id === this.activeWorkspaceId ? 'selected' : ''}>${this.escape(name)}</option>`;
    }).join('') || '<option value="">No workspaces</option>';
    if (this.activeWorkspaceId) {
      this.workspaceSelector.value = this.activeWorkspaceId;
    }
  }

  renderTabState() {
    const labels = { members: 'Members', invitations: 'Pending invitations', resources: 'Shared resources' };
    document.querySelectorAll('.workspace-tab').forEach((tab) => {
      const active = tab.dataset.tab === this.state.tab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.getElementById('workspaceResultsTitle').textContent = labels[this.state.tab];
    document.getElementById('workspaceResultsSummary').textContent = `${this.state.total} result${this.state.total === 1 ? '' : 's'}`;
  }

  updateFilterVisibility() {
    const invitations = this.state.tab === 'invitations';
    const resources = this.state.tab === 'resources';
    document.getElementById('workspaceStatusFilterWrap').hidden = !(invitations || this.state.tab === 'members');
    document.getElementById('workspaceResourceFilterWrap').hidden = !resources;
    document.getElementById('workspaceRoleFilter').parentElement.hidden = resources;
  }

  renderBadge(value) {
    const key = (value || '').toLowerCase();
    const known = ['active', 'accepted', 'pending', 'revoked', 'expired'];
    const cls = known.includes(key) ? `workspace-badge-${key}` : 'workspace-badge-default';
    return `<span class="workspace-badge ${cls}">${this.escape(value || 'Unknown')}</span>`;
  }

  renderItems(items) {
    const headers = {
      members: '<tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th></tr>',
      invitations: '<tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th></tr>',
      resources: '<tr><th>Name</th><th>Type</th><th>Updated</th><th>Access</th><th></th></tr>'
    };
    this.tableHead.innerHTML = headers[this.state.tab];
    const colspan = this.state.tab === 'resources' ? 5 : 4;

    if (!items.length) {
      const emptyCopy = {
        members: ['No members yet', 'Invite someone to start collaborating.'],
        invitations: ['No pending invitations', 'Invitations you send will show up here.'],
        resources: ['Nothing shared yet', 'Shared folders, shortcuts, and forms will appear here.']
      }[this.state.tab];
      this.results.innerHTML = `<tr class="workspace-empty-row"><td colspan="${colspan}">
        <div class="workspace-empty-state">
          <span class="workspace-empty-icon" aria-hidden="true">·</span>
          <span class="workspace-empty-title">${this.escape(emptyCopy[0])}</span>
          <span class="workspace-empty-sub">${this.escape(emptyCopy[1])}</span>
        </div>
      </td></tr>`;
      return;
    }

    this.results.innerHTML = items.map((item) => {
      if (this.state.tab === 'members') {
        const user = item.user || {};
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || item.user_id;
        return `<tr>
          <td><span class="workspace-member-name"><strong>${this.escape(name)}</strong><small>${this.escape(user.email || 'Email unavailable')}</small></span></td>
          <td>${this.escape(item.role)}</td>
          <td>${this.renderBadge(item.status)}</td>
          <td>${this.formatDate(item.created_at)}</td>
        </tr>`;
      }
      if (this.state.tab === 'invitations') {
        return `<tr>
          <td>${this.escape(item.email)}</td>
          <td>${this.escape(item.role)}</td>
          <td>${this.renderBadge(item.status)}</td>
          <td>${this.formatDate(item.expires_at)}</td>
        </tr>`;
      }
      const shareAction = this.escape(item.permission || 'view');
      const edit = this.canManageMembers && item.type === 'folder' ? `<button class="workspace-secondary-btn workspace-edit-share" type="button" data-edit-folder="${this.escape(item.id)}" data-folder-name="${this.escape(item.name)}">Edit</button>` : '';
      return `<tr>
        <td><strong>${this.escape(item.name)}</strong></td>
        <td>${this.escape(item.type)}</td>
        <td>${this.formatDate(item.updated_at)}</td>
        <td class="table-share-action">${shareAction}</td>
        <td>${edit}</td>
      </tr>`;
    }).join('');
  }

  renderPagination() {
    document.getElementById('workspacePageSummary').textContent = `Page ${this.state.page} of ${this.state.pages}`;
    document.getElementById('workspacePrevious').disabled = this.state.page <= 1;
    document.getElementById('workspaceNext').disabled = this.state.page >= this.state.pages;
  }

  async openShareEditor(folderId, folderName) {
    const modal = document.getElementById('workspaceShareModal');
    const membersWrap = document.getElementById('workspaceShareMembers');
    const error = document.getElementById('workspaceShareError');
    error.textContent = '';
    document.getElementById('workspaceShareName').textContent = folderName;
    membersWrap.innerHTML = `<div class="workspace-share-loading">
      <span class="skeleton-text skeleton-text-lg"></span>
      <span class="skeleton-text skeleton-text-md"></span>
      <span class="skeleton-text skeleton-text-sm"></span>
    </div>`;
    modal.hidden = false;
    try {
      const [membersResponse, permissionsResponse, groupsResponse] = await Promise.all([
        fetch(`${this.workspaceApiUrl}?tab=members&page=1&per_page=50`, { headers: { 'X-User-Email': this.identityEmail } }),
        fetch(`https://extensions.kbizsoft.com/magicaa-extension/share-resource.php?resource_type=folder&resource_id=${encodeURIComponent(folderId)}`, { headers: { 'X-User-Email': this.identityEmail } }),
        fetch(`https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php${window.location.search}`, { headers: { 'X-User-Email': this.identityEmail } })
      ]);
      const membersPayload = await membersResponse.json().catch(() => ({}));
      const permissionsPayload = await permissionsResponse.json().catch(() => ({}));
      const groupsPayload = await groupsResponse.json().catch(() => ({}));
      if (!membersResponse.ok || !membersPayload.success || !permissionsResponse.ok || !permissionsPayload.success) throw new Error(permissionsPayload.error || membersPayload.error || 'Could not load folder access.');
      const permissions = permissionsPayload.permissions || [];
      const memberRows = (membersPayload.items || []).filter((item) => item.status === 'active' && item.user?.email && item.user.email.toLowerCase() !== this.identityEmail.toLowerCase()).map((item) => {
        const email = item.user.email;
        const current = permissions.find((permission) => permission.user?.email?.toLowerCase() === email.toLowerCase());
        return `<div class="workspace-share-member" data-email="${this.escape(email)}">
          <span><strong>${this.escape(email)}</strong><small>${this.escape(item.role)}</small></span>
          <select>
            <option value="view"${current?.permission === 'view' ? ' selected' : ''}>Can view</option>
            <option value="edit"${current?.permission === 'edit' ? ' selected' : ''}>Can edit</option>
            <option value="manage"${current?.permission === 'manage' ? ' selected' : ''}>Can manage</option>
          </select>
          <button class="workspace-secondary-btn" type="button" data-revoke="${current ? 'true' : 'false'}">${current ? 'Remove' : 'Grant'}</button>
        </div>`;
      }).join('');
      const groupRows = groupsResponse.ok && groupsPayload.success ? (groupsPayload.groups || []).map((group) => {
        const current = (permissionsPayload.group_permissions || []).find((permission) => permission.group_id === group.id);
        return `<div class="workspace-share-member" data-group-id="${this.escapeAttribute(group.id)}"><span><strong>${this.escape(group.name)}</strong><small>Workspace group</small></span><select><option value="view"${current?.permission === 'view' ? ' selected' : ''}>Can view</option><option value="edit"${current?.permission === 'edit' ? ' selected' : ''}>Can edit</option><option value="manage"${current?.permission === 'manage' ? ' selected' : ''}>Can manage</option></select><button class="workspace-secondary-btn" type="button" data-revoke="${current ? 'true' : 'false'}">${current ? 'Remove' : 'Grant'}</button></div>`;
      }).join('') : '';
      membersWrap.innerHTML = memberRows + groupRows || '<p>No other active members or groups.</p>';
      membersWrap.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', () => this.updateFolderAccess(folderId, button.closest('.workspace-share-member'), button.dataset.revoke === 'true')));
    } catch (loadError) {
      membersWrap.innerHTML = '';
      error.textContent = loadError.message;
    }
  }

  async updateFolderAccess(folderId, row, revoke) {
    const button = row.querySelector('button');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = revoke ? 'Removing…' : 'Granting…';
    const email = row.dataset.email || '';
    const body = { resource_type: 'folder', resource_id: folderId, email, group_id: row.dataset.groupId || '', permission: row.querySelector('select').value, action: revoke ? 'revoke' : 'grant' };
    try {
      const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/share-resource.php', { method: revoke ? 'DELETE' : 'POST', headers: { 'X-User-Email': this.identityEmail, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) { document.getElementById('workspaceShareError').textContent = payload.error || 'Could not update folder access.'; return; }
      this.showNotice(revoke ? 'Access removed.' : 'Folder access updated.', 'success');
      await this.openShareEditor(folderId, document.getElementById('workspaceShareName').textContent);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  closeShareEditor() { document.getElementById('workspaceShareModal').hidden = true; }

  setLoadingState(isLoading) {
    this.isLoading = isLoading;
    document.querySelectorAll('.workspace-filters input, .workspace-filters select, .workspace-tab, #workspacePrevious, #workspaceNext').forEach((el) => {
      if (el.id === 'workspacePrevious' || el.id === 'workspaceNext') return; // pagination handled by renderPagination
      el.disabled = isLoading;
    });
  }

  showLoading() {
    this.setLoadingState(true);
    const colspan = this.state.tab === 'resources' ? 5 : 4;
    const cols = colspan;
    const rows = Array.from({ length: 5 }, () => {
      const cells = Array.from({ length: cols }, () => `<td><span class="skeleton-text skeleton-cell" style="width:${60 + Math.floor(Math.random() * 30)}%"></span></td>`).join('');
      return `<tr class="workspace-skeleton-row">${cells}</tr>`;
    }).join('');
    this.results.innerHTML = rows;
    document.getElementById('workspaceResultsSummary').textContent = 'Loading results…';
  }

  renderError(message) {
    this.setLoadingState(false);
    const colspan = this.state.tab === 'resources' ? 5 : 4;
    this.results.innerHTML = `<tr class="workspace-error-row"><td colspan="${colspan}">
      <div class="workspace-empty-state">
        <span class="workspace-empty-icon" aria-hidden="true">!</span>
        <span class="workspace-empty-title">Something went wrong</span>
        <span class="workspace-empty-sub">${this.escape(message)}</span>
      </div>
    </td></tr>`;
    this.showNotice(message, 'error');
  }

  showNotice(message, type = 'info') {
    clearTimeout(this.noticeTimer);
    this.notice.textContent = message;
    this.notice.classList.remove('is-error', 'is-success');
    this.notice.classList.add('is-visible');
    if (type === 'error') this.notice.classList.add('is-error');
    if (type === 'success') this.notice.classList.add('is-success');
    if (type !== 'error') {
      this.noticeTimer = setTimeout(() => this.notice.classList.remove('is-visible'), 4000);
    }
  }

  formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Not available'; }
  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
  escapeAttribute(value) { return this.escape(value).replace(/"/g, '&quot;'); }
  async getIdentity() { return chrome.identity.getProfileUserInfo(); }
}

document.addEventListener('DOMContentLoaded', () => new WorkspacePage());