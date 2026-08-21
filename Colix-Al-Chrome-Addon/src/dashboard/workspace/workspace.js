class WorkspacePage {
  constructor() {
    this.workspaceApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/workspace.php';
    this.inviteApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/send-invitation.php';
    this.notice = document.getElementById('workspaceNotice');
    this.invitePanel = document.getElementById('invitePanel');
    this.inviteForm = document.getElementById('inviteForm');
    this.results = document.getElementById('workspaceResults');
    this.tableHead = document.getElementById('workspaceTableHead');
    this.state = { tab: 'members', search: '', role: '', status: '', resource_type: '', page: 1, per_page: 10, pages: 1, total: 0 };
    this.bindEvents();
    this.initialize();
  }

  async initialize() {
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
      this.state.tab = tab.dataset.tab;
      this.state.page = 1;
      this.updateFilterVisibility();
      this.loadResults();
    }));

    let searchTimer;
    document.getElementById('workspaceSearch')?.addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.state.search = event.target.value.trim();
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
      this.state.search = this.state.role = this.state.status = this.state.resource_type = '';
      this.state.page = 1;
      document.getElementById('workspaceSearch').value = '';
      ['workspaceRoleFilter', 'workspaceStatusFilter', 'workspaceResourceFilter'].forEach((id) => { document.getElementById(id).value = ''; });
      this.loadResults();
    });
    document.getElementById('workspacePrevious')?.addEventListener('click', () => { if (this.state.page > 1) { this.state.page--; this.loadResults(); } });
    document.getElementById('workspaceNext')?.addEventListener('click', () => { if (this.state.page < this.state.pages) { this.state.page++; this.loadResults(); } });
    document.getElementById('inviteUserBtn')?.addEventListener('click', () => { this.invitePanel.hidden = false; document.getElementById('inviteEmail')?.focus(); });
    document.getElementById('cancelInviteBtn')?.addEventListener('click', () => { this.invitePanel.hidden = true; });
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
    const submitButton = form.querySelector('[type="submit"]');
    const email = document.getElementById('inviteEmail').value.trim().toLowerCase();
    const role = document.getElementById('inviteRole').value;
    submitButton.disabled = true;
    try {
      this.showNotice('Sending invitation...');
      const response = await fetch(this.inviteApiUrl, { method: 'POST', headers: { 'x-user-email': this.identityEmail, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || payload.message || `Could not send invitation (${response.status}).`);
      form.reset();
      this.invitePanel.hidden = true;
      this.showNotice(payload.message || 'Invitation sent successfully.');
      this.state.tab = 'invitations';
      this.state.page = 1;
      this.updateFilterVisibility();
      await this.loadResults();
    } catch (error) {
      this.showNotice(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  }

  async loadResults() {
    this.showLoading();
    const params = new URLSearchParams({ ...this.state, page: String(this.state.page), per_page: String(this.state.per_page) });
    try {
      const response = await fetch(`${this.workspaceApiUrl}?${params}`, { headers: { 'X-User-Email': this.identityEmail } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || `Could not load workspace (${response.status}).`);
      this.state = { ...this.state, ...payload.pagination };
      this.canManageMembers = payload.membership.role === 'owner';
      if (!this.canManageMembers && this.state.tab === 'invitations') {
        this.state.tab = 'members';
        this.state.page = 1;
        await this.loadResults();
        return;
      }
      document.getElementById('workspaceName').textContent = payload.workspace.name || 'Your workspace';
      document.getElementById('workspaceIdentity').textContent = `${payload.current_user.email} · ${payload.membership.role}`;
      document.getElementById('inviteUserBtn').hidden = !this.canManageMembers;
      document.querySelector('[data-tab="invitations"]').hidden = !this.canManageMembers;
      this.updateFilterVisibility();
      this.renderTabState();
      this.renderItems(payload.items || []);
      this.renderPagination();
    } catch (error) {
      console.error('Could not load workspace results:', error);
      this.renderError(error.message || 'Could not load workspace data.');
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

  renderItems(items) {
    const headers = {
      members: '<tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th></tr>',
      invitations: '<tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th></tr>',
      resources: '<tr><th>Name</th><th>Type</th><th>Updated</th><th>Access</th><th></th></tr>'
    };
    this.tableHead.innerHTML = headers[this.state.tab];
    if (!items.length) {
      this.results.innerHTML = `<tr><td colspan="${this.state.tab === 'resources' ? 5 : 4}">No ${this.state.tab} found.</td></tr>`;
      return;
    }
    this.results.innerHTML = items.map((item) => {
      if (this.state.tab === 'members') {
        const user = item.user || {};
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || item.user_id;
        return `<tr><td><strong>${this.escape(name)}</strong><br><small>${this.escape(user.email || 'Email unavailable')}</small></td><td>${this.escape(item.role)}</td><td>${this.escape(item.status)}</td><td>${this.formatDate(item.created_at)}</td></tr>`;
      }
      if (this.state.tab === 'invitations') return `<tr><td>${this.escape(item.email)}</td><td>${this.escape(item.role)}</td><td>${this.escape(item.status)}</td><td>${this.formatDate(item.expires_at)}</td></tr>`;
      const shareAction = this.escape(item.permission || 'view');
      const edit = this.canManageMembers && item.type === 'folder' ? `<button class="workspace-secondary-btn workspace-edit-share" type="button" data-edit-folder="${this.escape(item.id)}" data-folder-name="${this.escape(item.name)}">Edit</button>` : '';
      return `<tr><td><strong>${this.escape(item.name)}</strong></td><td>${this.escape(item.type)}</td><td>${this.formatDate(item.updated_at)}</td><td>${shareAction}</td><td>${edit}</td></tr>`;
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
    modal.hidden = false;
    try {
      const [membersResponse, permissionsResponse] = await Promise.all([
        fetch(`${this.workspaceApiUrl}?tab=members&page=1&per_page=50`, { headers: { 'X-User-Email': this.identityEmail } }),
        fetch(`https://extensions.kbizsoft.com/magicaa-extension/share-resource.php?resource_type=folder&resource_id=${encodeURIComponent(folderId)}`, { headers: { 'X-User-Email': this.identityEmail } })
      ]);
      const membersPayload = await membersResponse.json().catch(() => ({}));
      const permissionsPayload = await permissionsResponse.json().catch(() => ({}));
      if (!membersResponse.ok || !membersPayload.success || !permissionsResponse.ok || !permissionsPayload.success) throw new Error(permissionsPayload.error || membersPayload.error || 'Could not load folder access.');
      const permissions = permissionsPayload.permissions || [];
      membersWrap.innerHTML = (membersPayload.items || []).filter((item) => item.status === 'active' && item.user?.email && item.user.email.toLowerCase() !== this.identityEmail.toLowerCase()).map((item) => {
        const email = item.user.email;
        const current = permissions.find((permission) => permission.user?.email?.toLowerCase() === email.toLowerCase());
        return `<div class="workspace-share-member" data-email="${this.escape(email)}"><span><strong>${this.escape(email)}</strong><small>${this.escape(item.role)}</small></span><select><option value="view"${current?.permission === 'view' ? ' selected' : ''}>Can view</option><option value="edit"${current?.permission === 'edit' ? ' selected' : ''}>Can edit</option><option value="manage"${current?.permission === 'manage' ? ' selected' : ''}>Can manage</option></select><button class="workspace-secondary-btn" type="button" data-revoke="${current ? 'true' : 'false'}">${current ? 'Remove' : 'Grant'}</button></div>`;
      }).join('') || '<p>No other active members.</p>';
      membersWrap.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', () => this.updateFolderAccess(folderId, button.closest('.workspace-share-member'), button.dataset.revoke === 'true')));
    } catch (loadError) { error.textContent = loadError.message; }
  }

  async updateFolderAccess(folderId, row, revoke) {
    const email = row.dataset.email;
    const body = { resource_type: 'folder', resource_id: folderId, email, permission: row.querySelector('select').value, action: revoke ? 'revoke' : 'grant' };
    const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/share-resource.php', { method: revoke ? 'DELETE' : 'POST', headers: { 'X-User-Email': this.identityEmail, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) { document.getElementById('workspaceShareError').textContent = payload.error || 'Could not update folder access.'; return; }
    this.showNotice(revoke ? 'Access removed.' : 'Folder access updated.');
    await this.openShareEditor(folderId, document.getElementById('workspaceShareName').textContent);
  }

  closeShareEditor() { document.getElementById('workspaceShareModal').hidden = true; }

  showLoading() { this.results.innerHTML = `<tr><td colspan="${this.state.tab === 'resources' ? 5 : 4}">Loading results...</td></tr>`; }
  renderError(message) { this.results.innerHTML = `<tr><td colspan="${this.state.tab === 'resources' ? 5 : 4}">${this.escape(message)}</td></tr>`; }
  showNotice(message, isError = false) { this.notice.textContent = message; this.notice.classList.toggle('is-error', isError); }
  formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Not available'; }
  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
  async getIdentity() { return chrome.identity.getProfileUserInfo(); }
}

document.addEventListener('DOMContentLoaded', () => new WorkspacePage());
