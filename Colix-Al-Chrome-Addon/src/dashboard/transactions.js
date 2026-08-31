class TransactionsPage {
  constructor() {
    this.apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/transactions.php';
    this.results = document.getElementById('transactionsResults');
    this.summary = document.getElementById('transactionsSummary');
    this.notice = document.getElementById('transactionsNotice');
    this.refreshBtn = document.getElementById('transactionsRefreshBtn');
    this.noticeTimer = null;
    this.isLoading = false;
    this.transactions = [];

    this.refreshBtn?.addEventListener('click', () => {
      if (!this.isLoading) this.load();
    });

    this.load();
  }

  async load() {
    this.showLoading();
    try {
      const identity = await chrome.identity.getProfileUserInfo();
      if (!identity?.email) {
        throw new Error('Please sign in to Chrome before viewing transaction history.');
      }

      const response = await fetch(this.apiUrl, {
        headers: {
          'X-User-Email': identity.email,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Could not load transaction history.');
      }

      this.transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      this.render();
    } catch (error) {
      this.renderError(error.message || 'Could not load transaction history.');
    } finally {
      this.setLoadingState(false);
    }
  }

  render() {
    const count = this.transactions.length;
    this.summary.textContent = `${count} transaction${count === 1 ? '' : 's'}`;

    if (!count) {
      this.results.innerHTML = `<tr class="workspace-empty-row"><td colspan="6">
        <div class="workspace-empty-state">
          <span class="workspace-empty-icon" aria-hidden="true">·</span>
          <span class="workspace-empty-title">No transactions yet</span>
          <span class="workspace-empty-sub">Your workspace payments will appear here.</span>
        </div>
      </td></tr>`;
      return;
    }

    this.results.innerHTML = this.transactions.map((item) => {
      const ref = item.paypal_capture_id || item.paypal_order_id || '—';
      const amount = Number(item.amount || 0);
      const status = this.formatStatus(item.status);
      const statusClass = this.statusClass(item.status);

      return `<tr>
        <td>${this.formatDate(item.created_at)}</td>
        <td>${this.escape(item.workspace_name || 'Workspace')}</td>
        <td>${this.escape(item.plan_name || item.plan_code || 'Unknown')}</td>
        <td>${this.escape(this.formatCurrency(amount, item.currency || 'USD'))}</td>
        <td><span class="transaction-status ${statusClass}">${this.escape(status)}</span></td>
        <td class="transaction-ref">${this.escape(ref)}</td>
      </tr>`;
    }).join('');
  }

  setLoadingState(isLoading) {
    this.isLoading = isLoading;
    if (this.refreshBtn) this.refreshBtn.disabled = isLoading;
  }

  showLoading() {
    this.setLoadingState(true);
    this.summary.textContent = 'Loading transactions…';

    const rows = Array.from({ length: 5 }, () => {
      const cells = Array.from({ length: 6 }, () => `<td><span class="skeleton-text skeleton-cell" style="width:${55 + Math.floor(Math.random() * 35)}%"></span></td>`).join('');
      return `<tr class="workspace-skeleton-row">${cells}</tr>`;
    }).join('');

    this.results.innerHTML = rows;
  }

  renderError(message) {
    this.results.innerHTML = `<tr class="workspace-error-row"><td colspan="6">
      <div class="workspace-empty-state">
        <span class="workspace-empty-icon" aria-hidden="true">!</span>
        <span class="workspace-empty-title">Something went wrong</span>
        <span class="workspace-empty-sub">${this.escape(message)}</span>
      </div>
    </td></tr>`;
    this.summary.textContent = 'Could not load transactions';
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

  formatStatus(value) {
    const status = String(value || 'created').trim();
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  statusClass(value) {
    const status = String(value || 'created').toLowerCase();
    if (status === 'completed') return 'is-success';
    if (status === 'failed' || status === 'cancelled' || status === 'declined') return 'is-error';
    return 'is-pending';
  }

  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  }

  formatDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Not available';
  }

  escape(value) {
    const element = document.createElement('span');
    element.textContent = value ?? '';
    return element.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => new TransactionsPage());
