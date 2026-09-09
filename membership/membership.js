(function () {
  const apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/teams-plans.php';
//   const extensionTeamsUrl = 'chrome-extension://mlcnnmcdcanffolbficmglfheedalmfl/dashboard/teams_plans.html';
const extensionTeamsUrl = 'chrome-extension://bhgcokmcpbafflnncgpahiacepkbhodj/dashboard/teams_plans.html';
  const params = new URLSearchParams(window.location.search);
  let userEmail = params.get('user_email') || '';
  let selectedWorkspaceId = params.get('workspace_id') || '';
  let billingInterval = params.get('billing_interval') === 'annual' ? 'annual' : 'monthly';
  let payload = null;

  const grid = document.getElementById('membershipGrid') || document.querySelector('.membership-grid');
  const loading = document.getElementById('membershipLoading');
  const notice = document.getElementById('membershipNotice');
  const billingButtons = document.querySelectorAll('[data-billing]');

  function escape(value) {
    const node = document.createElement('span');
    node.textContent = value ?? '';
    return node.innerHTML;
  }

  function formatPrice(value, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value) || 0);
  }

  function showNotice(message) {
    if (notice) notice.textContent = message;
  }

  function currentWorkspace() {
    return payload?.workspaces?.find(workspace => String(workspace.id) === String(selectedWorkspaceId)) || payload?.workspaces?.[0] || null;
  }

  async function resolveUserEmail() {
    if (userEmail || typeof chrome === 'undefined' || !chrome.identity?.getProfileUserInfo) return;
    try {
      const identity = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
      userEmail = identity?.email || '';
    } catch (error) {
      userEmail = '';
    }
  }

  function planRank(plan) {
    const key = `${plan.plan_code || ''} ${plan.name || ''}`.toLowerCase();
    if (Number(plan.max_members) > 100000000 || key.includes('custom')) return 4;
    if (key.includes('free')) return 1;
    if (key.includes('team')) return 2;
    if (key.includes('business')) return 3;
    return 3;
  }

  function renderPlans() {
    const workspace = currentWorkspace();
    if (workspace && !selectedWorkspaceId) selectedWorkspaceId = String(workspace.id);
    const subscription = workspace?.subscription || {};
    const currentCode = String(subscription.plan_code || '').toLowerCase();
    const currentStatus = String(subscription.status || '').toLowerCase();
    const currentIsActive = ['active', 'trialing'].includes(currentStatus);
    const plans = (Array.isArray(payload?.plans) ? payload.plans : []).slice().sort((a, b) => planRank(a) - planRank(b));
    grid.innerHTML = plans.map(plan => {
      const isCurrent = currentIsActive && String(plan.plan_code || '').toLowerCase() === currentCode;
      const isCustom = Number(plan.max_members) > 100000000;
      const price = Number(plan.monthly_price) || 0;
      const displayPrice = billingInterval === 'annual' ? price * 12 * 0.95 : price;
      const checkoutUrl = new URL('https://colixai.com/membership/upgrade/');
      if (selectedWorkspaceId) checkoutUrl.searchParams.set('workspace_id', selectedWorkspaceId);
      if (userEmail) checkoutUrl.searchParams.set('user_email', userEmail);
      checkoutUrl.searchParams.set('plan_code', plan.plan_code || '');
      checkoutUrl.searchParams.set('billing_interval', billingInterval);
      const subscribeUrl = userEmail && selectedWorkspaceId ? checkoutUrl.href : extensionTeamsUrl;
      const action = isCurrent
        ? '<span class="current-action">Current plan</span>'
        : isCustom
          ? '<a class="plan-link" href="mailto:info@kbizsoft.com?subject=ColixAI%20Custom%20plan">Contact us</a>'
          : price === 0
          ? '<span class="current-action">Included</span>'
          : `<a class="plan-button" href="${escape(subscribeUrl)}">Subscribe ${billingInterval}</a>`;
      return `<article class="plan-card${isCurrent ? ' is-current' : ''}">
        ${isCurrent ? '<span class="current-badge">Current plan</span>' : ''}
        <p class="plan-kicker">${isCustom ? 'Tailored setup' : (price === 0 ? 'Start here' : 'Workspace plan')}</p>
        <h2>${escape(plan.name || plan.plan_code || 'Plan')}</h2>
        <p class="plan-price">${isCustom ? 'By agreement' : formatPrice(displayPrice, payload.currency)}<small>${isCustom ? '' : billingInterval === 'annual' ? ' / year' : ' / month'}</small></p>
        ${!isCustom ? `<p class="annual-price">${billingInterval === 'annual' ? '5% annual saving included' : `${formatPrice(price * 12 * 0.95, payload.currency)} / year with annual billing`}</p>` : ''}
        <p class="plan-description">${isCustom ? 'A member limit and workspace arrangement tailored to your agreement.' : `${Number(plan.max_members) || 0} members with shared workspace resources.`}</p>
        <ul><li>Shared shortcuts and forms</li><li>Workspace folders</li><li>${isCustom ? 'Custom member capacity' : `Up to ${Number(plan.max_members) || 0} members`}</li></ul>
        ${action}
      </article>`;
    }).join('') || '<div class="membership-loading">No plans are currently available.</div>';
  }

  async function load() {
    try {
      await resolveUserEmail();
      const headers = userEmail ? { 'X-User-Email': userEmail } : {};
      const response = await fetch(apiUrl, { headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) throw new Error(result.error || 'Could not load membership plans.');
      payload = result;
      renderPlans();
      loading?.remove();
      showNotice(userEmail && currentWorkspace() ? `Showing plans for ${currentWorkspace().name || 'your workspace'}.` : 'Subscribe from the ColixAI extension.');
    } catch (error) {
      if (loading) loading.textContent = userEmail ? error.message : 'Open ColixAI to view workspace-specific membership details.';
    }
  }

  billingButtons.forEach(button => button.classList.toggle('is-selected', button.dataset.billing === billingInterval));
  billingButtons.forEach(button => button.addEventListener('click', () => {
    billingInterval = button.dataset.billing;
    billingButtons.forEach(item => item.classList.toggle('is-selected', item === button));
    const url = new URL(window.location.href);
    url.searchParams.set('billing_interval', billingInterval);
    window.history.replaceState({}, '', url);
    if (payload) renderPlans();
  }));

  load();
}());