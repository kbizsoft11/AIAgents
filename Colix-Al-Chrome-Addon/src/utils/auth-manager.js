// utils/auth-manager.js
// Handles user identification via Chrome Identity
// RLS policies enforce data isolation based on email

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.userEmail = null;
    this.isAuthenticated = false;
    this.session = null;
  }

  async restoreSession() {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(['supabaseSession'], (result) => resolve(result.supabaseSession || null));
    });

    if (!stored?.access_token) return false;

    if (stored.expires_at && stored.refresh_token && stored.expires_at * 1000 < Date.now() + 60000) {
      try {
        const refreshed = await this.refreshSession(stored.refresh_token);
        await this.setSession(refreshed);
        return this.isAuthenticated;
      } catch (error) {
        console.warn('Could not refresh Supabase session:', error.message);
        await this.clearSession();
        return false;
      }
    }

    this.session = stored;
    const client = getSupabaseClient();
    client.setAccessToken(stored.access_token);
    this.userEmail = stored.user?.email || null;
    this.currentUser = stored.user || null;
    this.isAuthenticated = !!this.userEmail;
    return this.isAuthenticated;
  }

  async refreshSession(refreshToken) {
    const client = getSupabaseClient();
    const response = await fetch(`${client.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: client.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) throw new Error('Supabase session refresh failed');
    return response.json();
  }

  async clearSession() {
    this.session = null;
    this.currentUser = null;
    this.userEmail = null;
    this.isAuthenticated = false;
    getSupabaseClient().setAccessToken(null);
    await new Promise((resolve) => chrome.storage.local.remove('supabaseSession', resolve));
  }

  async signInWithGoogle() {
    const client = getSupabaseClient();
    const redirectTo = this.getExtensionRedirectUrl();
    const codeVerifier = this.createRandomString(64);
    const codeChallenge = await this.createCodeChallenge(codeVerifier);
    const state = this.createRandomString(32);

    const authUrl = new URL(`${client.url}/auth/v1/authorize`);
    authUrl.searchParams.set('provider', 'google');
    authUrl.searchParams.set('redirect_to', redirectTo);
    authUrl.searchParams.set('flow_type', 'pkce');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'select_account');
    console.info('Colix Supabase OAuth URL:', authUrl.toString());

    let callbackUrl;
    try {
      callbackUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
      });
    } catch (error) {
      throw new Error(`${error.message || 'Authorization page could not be loaded.'} Redirect URL: ${redirectTo}`);
    }
    const callback = new URL(callbackUrl);
    console.info('Colix Supabase OAuth callback:', callback.toString().replace(/(access_token=)[^&]+/i, '$1[redacted]'));
    const returnedState = callback.searchParams.get('state');
    const code = callback.searchParams.get('code');
    const accessToken = callback.hash.match(/(?:^|&)access_token=([^&]+)/)?.[1];
    const error = callback.searchParams.get('error_description') || callback.searchParams.get('error');

    if (error) throw new Error(`Google sign-in failed: ${error}`);
    if (!code || returnedState !== state) {
      if (accessToken) {
        throw new Error('Supabase returned an implicit access token instead of a PKCE code. Check that response_type=code is enabled for this OAuth request.');
      }
      throw new Error('Invalid Supabase OAuth callback');
    }

    const response = await fetch(`${client.url}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        apikey: client.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier })
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error_description || details.msg || 'Could not exchange OAuth code');
    }

    await this.setSession(await response.json());
    return this.userEmail;
  }

  getExtensionRedirectUrl() {
    const redirectTo = chrome.identity.getRedirectURL('supabase-auth');
    console.info('Colix Supabase OAuth redirect URL:', redirectTo);
    return redirectTo;
  }

  async setSession(session) {
    this.session = session;
    const client = getSupabaseClient();
    client.setAccessToken(session.access_token);
    this.userEmail = session.user?.email || null;
    this.currentUser = session.user || null;
    this.isAuthenticated = !!this.userEmail;
    await new Promise((resolve) => chrome.storage.local.set({ supabaseSession: session }, resolve));
    await this.linkApplicationUser();
  }

  async linkApplicationUser() {
    if (!this.userEmail || !this.session?.user?.id) return;
    try {
      const client = getSupabaseClient();
      const result = await client.selectWithFilter('users', { email: this.userEmail });
      const user = result?.[0];
      if (user?.id && user.auth_user_id !== this.session.user.id) {
        const updated = await client.update('users', { auth_user_id: this.session.user.id }, { id: user.id });
        if (!Array.isArray(updated) || updated.length === 0) {
          throw new Error('Could not link the application user to Supabase Auth. Check the users RLS policy.');
        }
        this.currentUser = { ...user, ...(updated[0] || {}), auth_user_id: this.session.user.id };
      } else if (user) {
        this.currentUser = user;
      }
    } catch (error) {
      console.warn('Could not link Colix profile to Supabase Auth:', error.message);
    }
  }

  createRandomString(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
  }

  async createCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Authenticate user using the Chrome account email.
   */
  async authenticateWithChrome() {
    try {
      const profileUserInfo = await chrome.identity.getProfileUserInfo();
      const email = profileUserInfo?.email;

      if (!email) {
        throw new Error('Could not get email from Chrome identity');
      }

      this.userEmail = email;

      // Try to create or update user in Supabase
      try {
        await this.createOrGetUser(email, { email });
      } catch (error) {
        console.warn('Could not sync user to Supabase:', error.message);
        // Continue anyway - user data will still work with localStorage
      }

      this.isAuthenticated = true;
      console.log('✅ User authenticated:', email);
      return email;

    } catch (error) {
      console.error('Chrome identity error:', error);
      throw error;
    }
  }

  /**
   * Fetch the saved profile from Supabase by email.
   * Priority is Supabase first, with Google as fallback only when needed.
   */
  async getUserProfileFromSupabase(email) {
    try {
      const client = getSupabaseClient();
      client.setUserEmail(email);
      const result = await client.selectWithFilter('users', { email });
      const user = Array.isArray(result) && result.length > 0 ? result[0] : null;

      if (!user) {
        return null;
      }

      return {
        email: user.email || email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        avatarUrl: user.avatar_url || '',
        photoUrl: user.avatar_url || ''
      };
    } catch (error) {
      console.warn('Could not fetch user profile from Supabase:', error.message);
      return null;
    }
  }

  /**
   * Create or get user in Supabase by email
   * Stores first_name, last_name, and avatar_url from Google profile
   */
  async createOrGetUser(email, profileData = {}) {
    try {
      const client = getSupabaseClient();

      // Try to get existing user
      try {
        const result = await client.selectWithFilter('users', { email });
        if (result && result.length > 0) {
          this.currentUser = result[0];

          // Google data is only a fallback; never overwrite saved Supabase values.
          const existing = result[0];
          const fallbackData = {};
          if (!existing.first_name && profileData.firstName) fallbackData.firstName = profileData.firstName;
          if (!existing.last_name && profileData.lastName) fallbackData.lastName = profileData.lastName;
          if (!existing.avatar_url && profileData.avatarUrl) fallbackData.avatarUrl = profileData.avatarUrl;
          if (Object.keys(fallbackData).length > 0) {
            await this.updateUserProfile(existing.id, fallbackData);
          }

          return result[0];
        }
      } catch (error) {
        console.warn('User query failed:', error.message);
      }

      // Create new user if doesn't exist
      const newUser = {
        email,
        first_name: profileData.firstName || '',
        last_name: profileData.lastName || '',
        ...(profileData.avatarUrl ? { avatar_url: profileData.avatarUrl } : {}),
        created_at: new Date().toISOString()
      };

      const created = await client.insert('users', newUser);
      const user = Array.isArray(created) ? created[0] : created;
      this.currentUser = user;

      console.log('✅ User created with profile:', {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url
      });

      return user;

    } catch (error) {
      console.error('User creation/fetch error:', error);
      throw error;
    }
  }

  /**
   * Save the profile to Supabase and return the normalized user profile.
   */
  async saveUserProfile(email, profileData = {}) {
    try {
      const client = getSupabaseClient();
      client.setUserEmail(email);

      const normalized = {
        email,
        first_name: profileData.firstName || '',
        last_name: profileData.lastName || '',
        ...(profileData.avatarUrl || profileData.photoUrl
          ? { avatar_url: profileData.avatarUrl || profileData.photoUrl }
          : {}),
        updated_at: new Date().toISOString()
      };

      const existing = await client.selectWithFilter('users', { email });
      const user = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

      if (user) {
        const updateData = {
          updated_at: normalized.updated_at
        };

        if (profileData.firstName !== undefined && profileData.firstName !== null) {
          updateData.first_name = profileData.firstName;
        }
        if (profileData.lastName !== undefined && profileData.lastName !== null) {
          updateData.last_name = profileData.lastName;
        }
        if (profileData.avatarUrl || profileData.photoUrl) {
          updateData.avatar_url = profileData.avatarUrl || profileData.photoUrl;
        }

        const updated = await client.update('users', updateData, { id: user.id });
        const persistedRows = await client.selectWithFilter('users', { id: user.id });
        const persistedUser = persistedRows?.[0];
        if (updateData.avatar_url && persistedUser?.avatar_url !== updateData.avatar_url) {
          throw new Error('Profile avatar was not persisted. Apply supabase/fix-user-profile-rls.sql.');
        }
        const merged = {
          ...(persistedUser || user),
          ...updateData,
          ...(updated?.[0] || {})
        };
        this.currentUser = merged;

        return {
          email: merged.email || normalized.email,
          firstName: merged.first_name || normalized.first_name,
          lastName: merged.last_name || normalized.last_name,
          avatarUrl: merged.avatar_url || normalized.avatar_url,
          photoUrl: merged.avatar_url || normalized.avatar_url
        };
      }

      const created = await client.insert('users', {
        ...normalized,
        created_at: new Date().toISOString()
      });
      const createdUser = Array.isArray(created) ? created[0] : created;
      this.currentUser = createdUser || { ...normalized };

      return {
        email: createdUser?.email || normalized.email,
        firstName: createdUser?.first_name || normalized.first_name,
        lastName: createdUser?.last_name || normalized.last_name,
        avatarUrl: createdUser?.avatar_url || normalized.avatar_url,
        photoUrl: createdUser?.avatar_url || normalized.avatar_url
      };
    } catch (error) {
      console.warn('Could not save user profile:', error.message);
      throw error;
    }
  }

  /**
   * Update user profile with Google data
   */
  async updateUserProfile(userId, profileData) {
    try {
      const client = getSupabaseClient();

      const updateData = { updated_at: new Date().toISOString() };
      if (profileData.firstName !== undefined) updateData.first_name = profileData.firstName || '';
      if (profileData.lastName !== undefined) updateData.last_name = profileData.lastName || '';
      if (profileData.avatarUrl || profileData.photoUrl) {
        updateData.avatar_url = profileData.avatarUrl || profileData.photoUrl;
      }

      await client.update('users', updateData, { id: userId });

      console.log('✅ User profile updated');
    } catch (error) {
      console.warn('Could not update user profile:', error.message);
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isUserAuthenticated() {
    return this.isAuthenticated && !!this.userEmail;
  }

  /**
   * Get user email
   */
  getUserEmail() {
    return this.userEmail;
  }

  /**
   * Get user ID
   */
  getUserId() {
    return this.currentUser?.id || this.userEmail;
  }
}

// Initialize and export
let authManager = null;
let authManagerReady = null;

async function initAuthManager() {
  if (!authManager) authManager = new AuthManager();
  if (!authManagerReady) {
    authManagerReady = authManager.restoreSession().catch(error => {
      console.warn('Could not restore Supabase session:', error.message);
      return false;
    });
  }
  await authManagerReady;
  return authManager;
}

function getAuthManager() {
  if (!authManager) {
    throw new Error('Auth manager not initialized. Call initAuthManager() first.');
  }
  return authManager;
}
