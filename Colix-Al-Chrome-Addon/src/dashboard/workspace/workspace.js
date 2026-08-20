class WorkspacePage {
  constructor() {
    this.notice = document.getElementById('workspaceNotice');
    this.memberList = document.getElementById('memberList');
    this.invitationList = document.getElementById('invitationList');
    this.invitePanel = document.getElementById('invitePanel');
    this.workspaceIdentity = document.getElementById('workspaceIdentity');
    this.bindEvents();
    this.renderEmptyState('Workspace management is currently unavailable.');
  }

  bindEvents() {
    document.getElementById('inviteUserBtn')?.addEventListener('click', () => {
      this.invitePanel.hidden = false;
      document.getElementById('inviteEmail')?.focus();
    });
    document.getElementById('cancelInviteBtn')?.addEventListener('click', () => { this.invitePanel.hidden = true; });
    document.getElementById('inviteForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.showNotice('Workspace invitations are currently unavailable.');
    });
  }

  renderEmptyState(message) {
    this.memberList.innerHTML = `<tr><td colspan="4">${this.escape(message)}</td></tr>`;
    this.invitationList.innerHTML = '<tr><td colspan="4">No pending invitations.</td></tr>';
  }

  showNotice(message, isError = false) { this.notice.textContent = message; this.notice.classList.toggle('is-error', isError); }
  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
}

document.addEventListener('DOMContentLoaded', () => new WorkspacePage());