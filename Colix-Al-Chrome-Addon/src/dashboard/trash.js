class TrashPage {
  constructor() {
    this.apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/trash.php';
    this.results = document.getElementById('trashResults');
    this.summary = document.getElementById('trashSummary');
    this.notice = document.getElementById('trashNotice');
    document.getElementById('trashRefreshBtn')?.addEventListener('click', () => this.load());
    this.load();
  }

  async getIdentity() {
    return chrome.identity.getProfileUserInfo();
  }

  async load() {
    this.results.innerHTML = '<tr><td colspan="5">Loading trash...</td></tr>';
    try {
      const identity = await this.getIdentity();
      const response = await fetch(this.apiUrl, { headers: { 'X-User-Email': identity.email } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load trash.');
      this.items = payload.items || [];
      this.render();
    } catch (error) {
      this.results.innerHTML = `<tr><td colspan="5">${this.escape(error.message)}</td></tr>`;
      this.summary.textContent = 'Could not load trash';
    }
  }

  render() {
    this.summary.textContent = `${this.items.length} deleted item${this.items.length === 1 ? '' : 's'}`;
    if (!this.items.length) {
      this.results.innerHTML = '<tr><td class="trash-empty" colspan="5">Trash is empty.</td></tr>';
      return;
    }
    this.results.innerHTML = this.items.map((item) => `<tr>
      <td><strong>${this.escape(item.name)}</strong>${item.type !== 'folder' && item.trigger ? `<br><small>${this.escape(item.trigger)}</small>` : ''}</td>
      <td>${this.escape(item.type)}</td>
      <td>${this.formatDate(item.deleted_at)}</td>
      <td>${this.escape(item.workspace_name || 'Workspace')}</td>
      <td>${item.can_manage ? `<button class="workspace-secondary-btn trash-action" type="button" data-action="restore" data-type="${this.escapeAttribute(item.type)}" data-id="${this.escapeAttribute(item.id)}">Restore</button><button class="workspace-secondary-btn trash-action trash-action-danger" type="button" data-action="permanent_delete" data-type="${this.escapeAttribute(item.type)}" data-id="${this.escapeAttribute(item.id)}">Delete permanently</button>` : '<span>View only</span>'}</td>
    </tr>`).join('');
    this.results.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => this.handleAction(button)));
  }

  async handleAction(button) {
    const permanent = button.dataset.action === 'permanent_delete';
    const item = this.items.find((entry) => entry.id === button.dataset.id && entry.type === button.dataset.type);
    if (!item || (permanent && !confirm(`Permanently delete "${item.name}"? This cannot be undone.`))) return;
    button.disabled = true;
    try {
      const identity = await this.getIdentity();
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'X-User-Email': identity.email, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: button.dataset.action, type: button.dataset.type, id: button.dataset.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Trash action failed.');
      this.showNotice(permanent ? 'Item permanently deleted.' : 'Item restored.');
      await this.load();
    } catch (error) {
      button.disabled = false;
      this.showNotice(error.message, true);
    }
  }

  showNotice(message, error = false) {
    this.notice.textContent = message;
    this.notice.classList.toggle('is-error', error);
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
