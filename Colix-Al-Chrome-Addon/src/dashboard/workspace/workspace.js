class WorkspacePage {
  constructor() {
    this.workspaceApiUrl = 'http://localhost/aiagents/api/workspace.php';
    this.inviteApiUrl = 'http://localhost/aiagents/api/send-invitation.php';
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
      document.getElementById('workspaceName').textContent = payload.workspace.name || 'Your workspace';
      document.getElementById('workspaceIdentity').textContent = `${payload.current_user.email} · ${payload.membership.role}`;
      document.getElementById('inviteUserBtn').hidden = !['owner', 'admin'].includes(payload.membership.role);
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
      resources: '<tr><th>Name</th><th>Type</th><th>Trigger</th><th>Updated</th></tr>'
    };
    this.tableHead.innerHTML = headers[this.state.tab];
    if (!items.length) {
      this.results.innerHTML = `<tr><td colspan="4">No ${this.state.tab} found.</td></tr>`;
      return;
    }
    this.results.innerHTML = items.map((item) => {
      if (this.state.tab === 'members') {
        const user = item.user || {};
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || item.user_id;
        return `<tr><td><strong>${this.escape(name)}</strong><br><small>${this.escape(user.email || 'Email unavailable')}</small></td><td>${this.escape(item.role)}</td><td>${this.escape(item.status)}</td><td>${this.formatDate(item.created_at)}</td></tr>`;
      }
      if (this.state.tab === 'invitations') return `<tr><td>${this.escape(item.email)}</td><td>${this.escape(item.role)}</td><td>${this.escape(item.status)}</td><td>${this.formatDate(item.expires_at)}</td></tr>`;
      return `<tr><td><strong>${this.escape(item.name)}</strong></td><td>${this.escape(item.type)}</td><td>${this.escape(item.trigger || '-')}</td><td>${this.formatDate(item.updated_at)}</td></tr>`;
    }).join('');
  }

  renderPagination() {
    document.getElementById('workspacePageSummary').textContent = `Page ${this.state.page} of ${this.state.pages}`;
    document.getElementById('workspacePrevious').disabled = this.state.page <= 1;
    document.getElementById('workspaceNext').disabled = this.state.page >= this.state.pages;
  }

  showLoading() { this.results.innerHTML = '<tr><td colspan="4">Loading results...</td></tr>'; }
  renderError(message) { this.results.innerHTML = `<tr><td colspan="4">${this.escape(message)}</td></tr>`; }
  showNotice(message, isError = false) { this.notice.textContent = message; this.notice.classList.toggle('is-error', isError); }
  formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Not available'; }
  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
  async getIdentity() { return chrome.identity.getProfileUserInfo(); }
}

document.addEventListener('DOMContentLoaded', () => new WorkspacePage());
