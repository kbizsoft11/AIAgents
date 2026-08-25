class TrashPage {
  constructor() {
    this.apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/trash.php';
    this.results = document.getElementById('trashResults');
    this.summary = document.getElementById('trashSummary');
    this.notice = document.getElementById('trashNotice');
    this.refreshBtn = document.getElementById('trashRefreshBtn');
    this.noticeTimer = null;
    this.isLoading = false;
    this.refreshBtn?.addEventListener('click', () => { if (!this.isLoading) this.load(); });
    this.load();
  }

  async getIdentity() {
    return chrome.identity.getProfileUserInfo();
  }

  async load() {
    this.showLoading();
    try {
      const identity = await this.getIdentity();
      if (!identity?.email) throw new Error('Please sign in to Chrome before viewing trash.');
      const response = await fetch(this.apiUrl, { headers: { 'X-User-Email': identity.email } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load trash.');
      this.items = payload.items || [];
      this.render();
    } catch (error) {
      this.renderError(error.message || 'Could not load trash.');
    } finally {
      this.setLoadingState(false);
    }
  }

  render() {
    this.summary.textContent = `${this.items.length} deleted item${this.items.length === 1 ? '' : 's'}`;
    if (!this.items.length) {
      this.results.innerHTML = `<tr class="workspace-empty-row"><td colspan="5">
        <div class="workspace-empty-state">
          <span class="workspace-empty-icon" aria-hidden="true">·</span>
          <span class="workspace-empty-title">Trash is empty</span>
          <span class="workspace-empty-sub">Deleted folders and snippets will show up here.</span>
        </div>
      </td></tr>`;
      return;
    }
    this.results.innerHTML = this.items.map((item) => `<tr>
      <td><strong>${this.escape(item.name)}</strong>${item.type !== 'folder' && item.trigger ? `<br><small>${this.escape(item.trigger)}</small>` : ''}</td>
      <td>${this.escape(item.type)}</td>
      <td>${this.formatDate(item.deleted_at)}</td>
      <td>${this.escape(item.workspace_name || 'Workspace')}</td>
      <td>${item.can_manage ? `<button class="workspace-secondary-btn trash-action" type="button" data-action="restore" data-type="${this.escapeAttribute(item.type)}" data-id="${this.escapeAttribute(item.id)}">Restore</button><button class="workspace-secondary-btn trash-action trash-action-danger" type="button" data-action="permanent_delete" data-type="${this.escapeAttribute(item.type)}" data-id="${this.escapeAttribute(item.id)}">Delete permanently</button>` : '<span class="trash-view-only">View only</span>'}</td>
    </tr>`).join('');
    this.results.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => this.handleAction(button)));
  }

  async handleAction(button) {
    const permanent = button.dataset.action === 'permanent_delete';
    const item = this.items.find((entry) => entry.id === button.dataset.id && entry.type === button.dataset.type);
    if (!item || (permanent && !confirm(`Permanently delete "${item.name}"? This cannot be undone.`))) return;
    const row = button.closest('tr');
    const rowButtons = row.querySelectorAll('button');
    const originalLabel = button.textContent;
    rowButtons.forEach((b) => { b.disabled = true; });
    button.textContent = permanent ? 'Deleting…' : 'Restoring…';
    try {
      const identity = await this.getIdentity();
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'X-User-Email': identity.email, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: button.dataset.action, type: button.dataset.type, id: button.dataset.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Trash action failed.');
      this.showNotice(permanent ? 'Item permanently deleted.' : 'Item restored.', 'success');
      await this.load();
    } catch (error) {
      rowButtons.forEach((b) => { b.disabled = false; });
      button.textContent = originalLabel;
      this.showNotice(error.message, 'error');
    }
  }

  setLoadingState(isLoading) {
    this.isLoading = isLoading;
    if (this.refreshBtn) this.refreshBtn.disabled = isLoading;
  }

  showLoading() {
    this.setLoadingState(true);
    this.summary.textContent = 'Loading trash…';
    const rows = Array.from({ length: 5 }, () => {
      const cells = Array.from({ length: 5 }, () => `<td><span class="skeleton-text skeleton-cell" style="width:${55 + Math.floor(Math.random() * 35)}%"></span></td>`).join('');
      return `<tr class="workspace-skeleton-row">${cells}</tr>`;
    }).join('');
    this.results.innerHTML = rows;
  }

  renderError(message) {
    this.results.innerHTML = `<tr class="workspace-error-row"><td colspan="5">
      <div class="workspace-empty-state">
        <span class="workspace-empty-icon" aria-hidden="true">!</span>
        <span class="workspace-empty-title">Something went wrong</span>
        <span class="workspace-empty-sub">${this.escape(message)}</span>
      </div>
    </td></tr>`;
    this.summary.textContent = 'Could not load trash';
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

  formatDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Not available';
  }

  escape(value) {
    const element = document.createElement('span');
    element.textContent = value ?? '';
    return element.innerHTML;
  }

  escapeAttribute(value) { return this.escape(value).replace(/"/g, '&quot;'); }
}

document.addEventListener('DOMContentLoaded', () => new TrashPage());