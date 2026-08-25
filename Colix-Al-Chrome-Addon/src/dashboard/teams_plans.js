class TeamsPlansPage {
  constructor() {
    this.apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/teams-plans.php';
    this.planGrid = document.getElementById('teamsPlanGrid');
    this.notice = document.getElementById('teamsNotice');
    this.workspacePanel = document.getElementById('teamsAccountPanel');
    this.workspaceName = document.getElementById('teamsWorkspaceName');
    this.subscriptionSummary = document.getElementById('teamsSubscriptionSummary');
    this.workspacePicker = document.getElementById('teamsWorkspacePicker');
    this.workspaceSelect = document.getElementById('teamsWorkspaceSelect');
    this.contactBtn = document.getElementById('teamsContactBtn');
    this.workspaces = [];
    this.isLoading = false;
    this.noticeTimer = null;
    this.selectedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id') || '';
    this.workspaceSelect?.addEventListener('change', () => {
      if (this.isLoading) return;
      this.selectedWorkspaceId = this.workspaceSelect.value;
      const url = new URL(window.location.href);
      url.searchParams.set('workspace_id', this.selectedWorkspaceId);
      window.history.replaceState({}, '', url);
      this.renderWorkspaceState();
      this.renderPlans();
    });
    this.contactBtn?.addEventListener('click', () => {
      this.showNotice('Please contact the ColixAI team to discuss a custom workspace plan.', 'info');
    });
    this.showLoadingState();
    this.load();
  }

  async load() {
    try {
      const identity = await chrome.identity.getProfileUserInfo();
      if (!identity?.email) throw new Error('Please sign in to Chrome before viewing Teams plans.');
      const response = await fetch(this.apiUrl, { headers: { 'X-User-Email': identity.email } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load Teams plans.');
      this.plans = Array.isArray(payload.plans) ? payload.plans : [];
      this.workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
      this.canManageBilling = payload.can_manage_billing === true;
      this.workspacePanel.hidden = false;
      this.renderWorkspacePicker();
      this.renderWorkspaceState();
      this.renderPlans();
    } catch (error) {
      this.renderError(error.message || 'Teams plans are unavailable right now.');
    } finally {
      this.setLoadingState(false);
    }
  }

  getSelectedWorkspace() {
    return this.workspaces.find((workspace) => workspace.id === this.selectedWorkspaceId) || this.workspaces[0] || null;
  }

  renderWorkspacePicker() {
    if (this.workspaces.length <= 1) return;
    this.workspacePicker.hidden = false;
    this.workspaceSelect.innerHTML = this.workspaces.map((workspace) => `<option value="${this.escapeAttribute(workspace.id)}">${this.escape(workspace.name)}</option>`).join('');
    const selected = this.getSelectedWorkspace();
    if (selected) {
      this.selectedWorkspaceId = selected.id;
      this.workspaceSelect.value = selected.id;
    }
  }

  renderWorkspaceState() {
    const workspace = this.getSelectedWorkspace();
    if (!workspace) {
      this.workspaceName.textContent = 'No owned workspace';
      this.subscriptionSummary.textContent = 'You can review the available plans below.';
      return;
    }
    const subscription = workspace.subscription || {};
    const currentPlan = this.plans.find((plan) => plan.plan_code === subscription.plan_code);
    const status = subscription.status || 'active';
    const period = subscription.current_period_end ? ` · Renews ${this.formatDate(subscription.current_period_end)}` : '';
    this.workspaceName.textContent = workspace.name || 'Your workspace';
    this.subscriptionSummary.textContent = `${currentPlan?.name || subscription.plan_code || 'Free'} plan · ${this.formatStatus(status)}${period}`;
  }

  // Fixed display order regardless of what order the API returns plans in:
  // Free, Team, Business, then any custom/enterprise-style plan last.
  planSortRank(plan) {
    const order = ['free', 'team', 'business'];
    const custom = Number(plan.max_members) > 100000000;
    if (custom) return order.length + 1;
    const key = `${plan.plan_code || ''} ${plan.name || ''}`.toLowerCase();
    const index = order.findIndex((label) => key.includes(label));
    return index === -1 ? order.length : index;
  }

  renderPlans() {
    const workspace = this.getSelectedWorkspace();
    const currentCode = workspace?.subscription?.plan_code || '';
    if (!this.plans.length) {
      this.planGrid.innerHTML = `<div class="teams-empty-state">
        <span class="teams-state-icon" aria-hidden="true">·</span>
        <span class="teams-state-title">No plans are currently available</span>
        <span class="teams-state-sub">Check back later or contact us for a custom setup.</span>
      </div>`;
      return;
    }
    const orderedPlans = this.plans.slice().sort((a, b) => this.planSortRank(a) - this.planSortRank(b));
    this.planGrid.innerHTML = orderedPlans.map((plan) => {
      const isCurrent = plan.plan_code === currentCode;
      const custom = Number(plan.max_members) > 100000000;
      const price = Number(plan.monthly_price);
      return `<article class="teams-plan-card${isCurrent ? ' is-current' : ''}">
        <h3 class="teams-plan-name">${this.escape(plan.name)}</h3>
        <div class="teams-plan-price">${custom ? 'Custom' : `$${price.toFixed(2)}`}<small>${custom ? '' : ' / month'}</small></div>
        <p class="teams-plan-members">${custom ? 'A member limit tailored to your agreement' : `Up to ${Number(plan.max_members)} members`}</p>
        ${isCurrent ? `<p class="teams-plan-status">${this.formatStatus(workspace.subscription.status || 'active')}${workspace.subscription.current_period_end ? ` · ${this.formatDate(workspace.subscription.current_period_end)}` : ''}</p>` : ''}
        <button class="teams-plan-action" type="button" disabled>${isCurrent ? 'Current plan' : custom ? 'Contact us' : 'Available soon'}</button>
      </article>`;
    }).join('');
  }

  setLoadingState(isLoading) {
    this.isLoading = isLoading;
    if (this.workspaceSelect) this.workspaceSelect.disabled = isLoading;
    if (this.contactBtn) this.contactBtn.disabled = isLoading;
  }

  showLoadingState() {
    this.setLoadingState(true);
    this.subscriptionSummary.innerHTML = '<span class="teams-skeleton-line" style="width:220px"></span>';
    this.planGrid.innerHTML = Array.from({ length: 4 }, () => `
      <article class="teams-plan-card is-skeleton">
        <span class="teams-skeleton-line" style="width:60%; height:1.1em; margin-bottom:14px;"></span>
        <span class="teams-skeleton-line" style="width:80%; height:1.8em; margin-bottom:22px;"></span>
        <span class="teams-skeleton-line" style="width:90%; margin-bottom:8px;"></span>
        <span class="teams-skeleton-line" style="width:70%; margin-bottom:26px;"></span>
        <span class="teams-skeleton-line" style="width:100%; height:2.4em; margin-top:auto;"></span>
      </article>
    `).join('');
  }

  renderError(message) {
    this.planGrid.innerHTML = `<div class="teams-empty-state is-error">
      <span class="teams-state-icon" aria-hidden="true">!</span>
      <span class="teams-state-title">Something went wrong</span>
      <span class="teams-state-sub">${this.escape(message)}</span>
    </div>`;
    this.subscriptionSummary.textContent = 'Could not load subscription details';
    this.showNotice(message, 'error');
  }

  formatStatus(status) { return status.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : ''; }

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

  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
  escapeAttribute(value) { return this.escape(value).replace(/"/g, '&quot;'); }
}

document.addEventListener('DOMContentLoaded', () => new TeamsPlansPage());