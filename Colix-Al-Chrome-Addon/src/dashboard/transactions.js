class TransactionsPage {
  constructor() {
    this.apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/transactions.php';
    this.results = document.getElementById('transactionsResults');
    this.summary = document.getElementById('transactionsSummary');
    this.rangeSummary = document.getElementById('transactionsRangeSummary');
    this.notice = document.getElementById('transactionsNotice');
    this.refreshBtn = document.getElementById('transactionsRefreshBtn');
    this.searchInput = document.getElementById('transactionsSearch');
    this.statusFilter = document.getElementById('transactionsStatusFilter');
    this.clearFiltersBtn = document.getElementById('transactionsClearFilters');
    this.previousBtn = document.getElementById('transactionsPrevious');
    this.nextBtn = document.getElementById('transactionsNext');
    this.pageSummary = document.getElementById('transactionsPageSummary');
    this.noticeTimer = null;
    this.isLoading = false;
    this.identityEmail = '';
    this.transactions = [];
    this.state = { page: 1, per_page: 10, total: 0, pages: 1, status: '', search: '' };

    this.bindEvents();
    this.load();
  }

  bindEvents() {
    this.refreshBtn?.addEventListener('click', () => {
      if (!this.isLoading) this.load();
    });

    let searchTimer;
    this.searchInput?.addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.state.search = event.target.value.trim();
        this.state.page = 1;
        this.load();
      }, 250);
    });

    this.statusFilter?.addEventListener('change', (event) => {
      this.state.status = event.target.value;
      this.state.page = 1;
      this.load();
    });

    this.clearFiltersBtn?.addEventListener('click', () => {
      if (this.isLoading) return;
      this.state.search = '';
      this.state.status = '';
      this.state.page = 1;
      this.searchInput.value = '';
      this.statusFilter.value = '';
      this.load();
    });

    this.previousBtn?.addEventListener('click', () => {
      if (this.isLoading || this.state.page <= 1) return;
      this.state.page -= 1;
      this.load();
    });

    this.nextBtn?.addEventListener('click', () => {
      if (this.isLoading || this.state.page >= this.state.pages) return;
      this.state.page += 1;
      this.load();
    });
  }

  async load() {
    this.showLoading();
    try {
      if (!this.identityEmail) {
        const identity = await chrome.identity.getProfileUserInfo();
        if (!identity?.email) {
          throw new Error('Please sign in to Chrome before viewing transaction history.');
        }
        this.identityEmail = identity.email;
      }

      const params = new URLSearchParams({
        page: String(this.state.page),
        per_page: String(this.state.per_page),
      });

      if (this.state.status) params.set('status', this.state.status);
      if (this.state.search) params.set('search', this.state.search);

      const response = await fetch(`${this.apiUrl}?${params.toString()}`, {
        headers: {
          'X-User-Email': this.identityEmail,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Could not load transaction history.');
      }

      this.transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      const pagination = payload.pagination || {};
      this.state = {
        ...this.state,
        page: Number(pagination.page || this.state.page || 1),
        per_page: Number(pagination.per_page || this.state.per_page || 10),
        total: Number(pagination.total || 0),
        pages: Number(pagination.pages || 1),
      };
      this.render();
    } catch (error) {
      this.renderError(error.message || 'Could not load transaction history.');
    } finally {
      this.setLoadingState(false);
    }
  }

  render() {
    const count = this.transactions.length;

    this.summary.textContent = count
      ? 'Payment history'
      : (this.state.search || this.state.status ? 'No transactions match your filters' : 'No transactions yet');

    this.updateRangeSummary();

    if (!count) {
      this.results.innerHTML = `<tr class="workspace-empty-row"><td colspan="6">
        <div class="workspace-empty-state">
          <span class="workspace-empty-icon" aria-hidden="true">·</span>
          <span class="workspace-empty-title">${this.escape(this.state.search || this.state.status ? 'No matching transactions' : 'No transactions yet')}</span>
          <span class="workspace-empty-sub">${this.escape(this.state.search || this.state.status ? 'Try another filter or clear the current selection.' : 'Your workspace payments will appear here.')}</span>
        </div>
      </td></tr>`;
      this.renderPagination();
      return;
    }

    this.results.innerHTML = this.transactions.map((item) => {
      const ref = item.razorpay_payment_id || item.razorpay_order_id || '—';
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

    this.renderPagination();
  }

  updateRangeSummary() {
    if (!this.rangeSummary) return;
    const total = this.state.total || 0;
    const start = total ? (this.state.page - 1) * this.state.per_page + 1 : 0;
    const end = total ? Math.min(this.state.page * this.state.per_page, total) : 0;

    this.rangeSummary.textContent = total
      ? `Showing ${start}-${end} of ${total} transaction${total === 1 ? '' : 's'}`
      : (this.state.search || this.state.status ? 'No transactions match your filters' : 'No transactions yet');
  }

  renderPagination() {
    const pageSummary = this.state.pages > 0 ? `Page ${this.state.page} of ${this.state.pages}` : 'Page 1 of 1';
    this.pageSummary.textContent = pageSummary;
    this.previousBtn.disabled = this.state.page <= 1 || this.isLoading;
    this.nextBtn.disabled = this.state.page >= this.state.pages || this.isLoading;
  }

  setLoadingState(isLoading) {
    this.isLoading = isLoading;
    if (this.refreshBtn) this.refreshBtn.disabled = isLoading;
    if (this.searchInput) this.searchInput.disabled = isLoading;
    if (this.statusFilter) this.statusFilter.disabled = isLoading;
    if (this.clearFiltersBtn) this.clearFiltersBtn.disabled = isLoading;
    if (this.previousBtn) this.previousBtn.disabled = isLoading || this.state.page <= 1;
    if (this.nextBtn) this.nextBtn.disabled = isLoading || this.state.page >= this.state.pages;
  }

  showLoading() {
    this.setLoadingState(true);
    this.summary.textContent = 'Loading transactions…';
    if (this.rangeSummary) this.rangeSummary.textContent = 'Loading transactions…';

    const rows = Array.from({ length: 5 }, () => {
      const cells = Array.from({ length: 6 }, () => `<td><span class="skeleton-text skeleton-cell" style="width:${55 + Math.floor(Math.random() * 35)}%"></span></td>`).join('');
      return `<tr class="workspace-skeleton-row">${cells}</tr>`;
    }).join('');

    this.results.innerHTML = rows;
    this.renderPagination();
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
    if (this.rangeSummary) this.rangeSummary.textContent = 'Could not load transactions';
    this.pageSummary.textContent = 'Page 1 of 1';
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
    if (status === 'approved_pending_capture') return 'Pending';
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  statusClass(value) {
    const status = String(value || 'created').toLowerCase();
    if (status === 'completed') return 'is-success';
    if (status === 'failed') return 'is-error';
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