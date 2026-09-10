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
    this.billingNote = document.getElementById('teamsBillingNote');
    this.workspaces = [];
    this.isLoading = false;
    this.noticeTimer = null;
    this.lastPaymentRefresh = 0;
    this.selectedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id') || '';
    this.billingInterval = new URLSearchParams(window.location.search).get('billing_interval') === 'annual' ? 'annual' : 'monthly';
    
    const callbackParams = new URLSearchParams(window.location.search);
    this.paymentReturned = callbackParams.get('payment_success') === '1';
    
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
      window.location.href = 'mailto:info@kbizsoft.com';
    });
    window.addEventListener('message', (event) => {
      if (event.origin === 'https://colixai.com' && event.data?.type === 'COLIX_PAYMENT_SUCCESS') {
        this.refreshAfterPayment();
      }
    });
    window.addEventListener('focus', () => this.refreshAfterPayment());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.refreshAfterPayment();
    });
    this.showLoadingState();
    this.load();
  }

  refreshAfterPayment() {
    const now = Date.now();
    if (this.isLoading || now - this.lastPaymentRefresh < 1200) return;
    this.lastPaymentRefresh = now;
    this.showNotice('Checking your subscription status...', 'success');
    setTimeout(() => this.load(), 1200);
  }

  async load() {
    try {
      const identity = await chrome.identity.getProfileUserInfo();
      if (!identity?.email) throw new Error('Please sign in to Chrome before viewing Teams plans.');
      const response = await fetch(this.apiUrl, { headers: { 'X-User-Email': identity.email } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load Teams plans.');
      this.plans = Array.isArray(payload.plans) ? payload.plans : [];
      this.currency = payload.currency || 'USD';
      this.workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
      this.canManageBilling = payload.can_manage_billing === true;
      this.workspacePanel.hidden = false;
      this.renderWorkspacePicker();
      this.renderWorkspaceState();
      this.renderPlans();
      if (this.paymentReturned) {
        this.showNotice('Payment complete. Refreshing subscription status...', 'success');
        this.paymentReturned = false;
        window.history.replaceState({}, '', `${window.location.pathname}?workspace_id=${encodeURIComponent(this.selectedWorkspaceId)}`);
        setTimeout(() => this.load(), 1200);
      }
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
    const interval = subscription.billing_interval === 'annual' ? 'Annual billing' : 'Monthly billing';
    this.subscriptionSummary.textContent = `${currentPlan?.name || subscription.plan_code || 'Free'} plan · ${interval} · ${this.formatStatus(status)}${period}`;
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
    if (this.billingNote) this.billingNote.textContent = this.billingInterval === 'annual' ? 'Annual billing · Save 5%' : 'Monthly billing';
    this.planGrid.innerHTML = `<div class="teams-billing-toggle" role="group" aria-label="Billing frequency"><button type="button" data-billing-interval="monthly" class="${this.billingInterval === 'monthly' ? 'is-selected' : ''}">Monthly</button><button type="button" data-billing-interval="annual" class="${this.billingInterval === 'annual' ? 'is-selected' : ''}">Annual <span>Save 5%</span></button></div><div class="teams-plans-list">${orderedPlans.map((plan) => {
      const isCurrent = plan.plan_code === currentCode;
      const custom = Number(plan.max_members) > 100000000;
      const monthlyPrice = Number(plan.monthly_price);
      const annualMonthlyPrice = monthlyPrice * 0.95;
      const price = this.billingInterval === 'annual' ? annualMonthlyPrice : monthlyPrice;
      const annualTotal = annualMonthlyPrice * 12;
      const hasActivePaidPlan = Boolean(currentCode && currentCode !== 'free');
      const canUpgrade = !isCurrent && !custom && monthlyPrice > 0 && this.canManageBilling && !hasActivePaidPlan;
      const isCustomAction = custom && !isCurrent;
      const buttonDisabled = isCurrent || !(canUpgrade || isCustomAction);
      
      return `<article class="teams-plan-card${isCurrent ? ' is-current' : ''}">
        <h3 class="teams-plan-name">${this.escape(plan.name)}</h3>
        <div class="teams-plan-price">${custom ? 'Custom' : this.formatPrice(price)}<small>${custom ? '' : ' / month'}</small>${!custom && this.billingInterval === 'annual' ? `<span class="teams-annual-total">${this.formatPrice(annualTotal)} / year</span>` : ''}</div>
        <p class="teams-plan-members">${custom ? 'A member limit tailored to your agreement' : `Up to ${Number(plan.max_members)} members`}</p>
        ${isCurrent ? `<p class="teams-plan-status">${this.formatStatus(workspace.subscription.status || 'active')}${workspace.subscription.current_period_end ? ` · ${this.formatDate(workspace.subscription.current_period_end)}` : ''}</p>` : ''}
        <button class="teams-plan-action" type="button" data-plan-code="${this.escapeAttribute(plan.plan_code)}" data-custom-contact="${isCustomAction ? '1' : '0'}" ${buttonDisabled ? 'disabled' : ''}>${isCurrent ? 'Current plan' : custom ? 'Contact us' : monthlyPrice > 0 ? `Subscribe ${this.billingInterval}` : 'Included'}</button>
      </article>`;
    }).join('')}</div>`;

    this.planGrid.querySelectorAll('[data-billing-interval]').forEach((button) => {
      button.addEventListener('click', () => {
        this.billingInterval = button.dataset.billingInterval;
        const url = new URL(window.location.href);
        url.searchParams.set('billing_interval', this.billingInterval);
        window.history.replaceState({}, '', url);
        this.renderPlans();
      });
    });
    
    // Add click handlers to plan buttons.
    this.planGrid.querySelectorAll('[data-plan-code]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        if (button.dataset.customContact === '1') {
          window.location.href = 'mailto:info@kbizsoft.com';
          return;
        }
        this.startCheckout(button.dataset.planCode, this.billingInterval);
      });
    });
  }

  async startCheckout(planCode, billingInterval) {
    const workspace = this.getSelectedWorkspace();
    if (!workspace) {
      this.showNotice('Select an owned workspace before starting checkout.', 'error');
      return;
    }

    try {
      const identity = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
      if (!identity?.email) {
        this.showNotice('Please sign in to Chrome to continue.', 'error');
        return;
      }

      const hostedUrl = new URL('https://colixai.com/membership/upgrade/');
      hostedUrl.searchParams.set('workspace_id', workspace.id);
      hostedUrl.searchParams.set('plan_code', planCode);
      hostedUrl.searchParams.set('user_email', identity.email);
      hostedUrl.searchParams.set('billing_interval', billingInterval);

      await chrome.tabs.create({ url: hostedUrl.toString(), active: true });
    } catch (error) {
      console.error('Checkout error:', error);
      this.showNotice(error.message || 'Could not start checkout.', 'error');
    }
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
  formatPrice(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: this.currency || 'USD', currencyDisplay: 'symbol' }).format(Number(value)); }

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
