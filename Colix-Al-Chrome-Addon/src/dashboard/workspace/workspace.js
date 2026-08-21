class WorkspacePage {
  constructor() {
    this.supabaseUrl = SUPABASE_CONFIG.URL;
    this.supabaseAnonKey = SUPABASE_CONFIG.ANON_KEY;
    this.inviteApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/send-invitation.php';
    this.notice = document.getElementById('workspaceNotice');
    this.memberList = document.getElementById('memberList');
    this.invitationList = document.getElementById('invitationList');
    this.invitePanel = document.getElementById('invitePanel');
    this.workspaceIdentity = document.getElementById('workspaceIdentity');
    this.bindEvents();
    this.initialize();
  }

  async initialize() {
    const identity = await this.getIdentity();
    if (!identity?.email) {
      this.renderEmptyState('Please sign in to Chrome before managing this workspace.');
      return;
    }

    this.workspaceIdentity.textContent = identity.email;
    this.renderEmptyState('Workspace members will appear after the workspace API is connected.');
  }

  bindEvents() {
    document.getElementById('inviteUserBtn')?.addEventListener('click', () => {
      this.invitePanel.hidden = false;
      document.getElementById('inviteEmail')?.focus();
    });
    document.getElementById('cancelInviteBtn')?.addEventListener('click', () => { this.invitePanel.hidden = true; });
    document.getElementById('inviteForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailInput = document.getElementById('inviteEmail');
      const roleInput = document.getElementById('inviteRole');
      const submitButton = event.currentTarget.querySelector('[type="submit"]');
      submitButton.disabled = true;
      this.showNotice('Checking your Chrome account...');
      try {
        const identity = await this.getIdentity();
        if (!identity?.email) throw new Error('Please sign in to Chrome before sending an invitation.');

        this.showNotice('Sending invitation...');
        const response = await fetch(this.inviteApiUrl, {
          method: 'POST',
          headers: {
            'x-user-email': identity.email,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: emailInput.value.trim(), role: roleInput.value })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || `Could not send invitation (${response.status}).`);
        }
        this.showNotice('Invitation sent successfully.');
        event.currentTarget.reset();
        this.invitePanel.hidden = true;
      } catch (error) {
        this.showNotice(error.message, true);
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  async getIdentity() {
    return chrome.identity.getProfileUserInfo();
  }

  async acceptInvitation(token, accessToken) {
    const response = await fetch(`${this.supabaseUrl}/functions/v1/accept-invitation`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not accept invitation.');
    history.replaceState({}, document.title, location.pathname);
    this.showNotice(`You joined the workspace as ${payload.role}.`);
  }

  async loadWorkspace(session) {
    const authUserId = session.user?.id;
    if (!authUserId) throw new Error('Your session is missing user details. Please sign in again.');

    const users = await this.supabaseRequest(`users?auth_user_id=eq.${encodeURIComponent(authUserId)}&select=id,email,first_name,last_name` , session.access_token);
    const appUser = users[0];
    if (!appUser) throw new Error('Your account is not linked to the workspace database.');

    const memberships = await this.supabaseRequest(`workspace_members?user_id=eq.${encodeURIComponent(appUser.id)}&status=eq.active&select=workspace_id,role` , session.access_token);
    const membership = memberships[0];
    if (!membership) throw new Error('You are not a member of any workspace.');

    const [workspaceRows, memberRows, invitationRows] = await Promise.all([
      this.supabaseRequest(`workspaces?id=eq.${encodeURIComponent(membership.workspace_id)}&select=id,name`, session.access_token),
      this.supabaseRequest(`workspace_members?workspace_id=eq.${encodeURIComponent(membership.workspace_id)}&status=eq.active&select=user_id,role,status,created_at`, session.access_token),
      this.supabaseRequest(`workspace_invitations?workspace_id=eq.${encodeURIComponent(membership.workspace_id)}&status=eq.pending&select=email,role,expires_at&order=created_at.desc`, session.access_token)
    ]);

    this.workspaceIdentity.textContent = `${appUser.email} · ${membership.role}`;
    document.getElementById('workspaceName').textContent = workspaceRows[0]?.name || 'Your workspace';
    this.renderMembers(memberRows);
    this.renderInvitations(invitationRows);
  }

  async supabaseRequest(path, accessToken) {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) throw new Error(payload.message || 'Could not load workspace data.');
    return payload;
  }

  renderMembers(members) {
    this.memberList.innerHTML = members.length ? members.map((member) => `<tr><td>${this.escape(member.user_id)}</td><td>${this.escape(member.role)}</td><td>${this.escape(member.status)}</td><td></td></tr>`).join('') : '<tr><td colspan="4">No active members.</td></tr>';
  }

  renderInvitations(invitations) {
    this.invitationList.innerHTML = invitations.length ? invitations.map((invitation) => `<tr><td>${this.escape(invitation.email)}</td><td>${this.escape(invitation.role)}</td><td>${this.escape(new Date(invitation.expires_at).toLocaleDateString())}</td><td></td></tr>`).join('') : '<tr><td colspan="4">No pending invitations.</td></tr>';
  }

  renderEmptyState(message) {
    this.memberList.innerHTML = `<tr><td colspan="4">${this.escape(message)}</td></tr>`;
    this.invitationList.innerHTML = '<tr><td colspan="4">No pending invitations.</td></tr>';
  }

  showNotice(message, isError = false) { this.notice.textContent = message; this.notice.classList.toggle('is-error', isError); }
  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
}

document.addEventListener('DOMContentLoaded', () => new WorkspacePage());