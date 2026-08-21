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
        this.currentUser = { ...user, ...(updated || {}), auth_user_id: this.session.user.id };
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
   * Authenticate user using Chrome Identity API
   * Gets email, first name, last name, and avatar from Google account
   */
  async authenticateWithChrome() {
    try {
      const profileUserInfo = await chrome.identity.getProfileUserInfo();
      const email = profileUserInfo?.email;

      if (!email) {
        throw new Error('Could not get email from Chrome identity');
      }

      this.userEmail = email;

      // Get full profile data from Google People API
      let profileData = { email };
      try {
        profileData = await this.getGoogleProfileData();
      } catch (error) {
        console.warn('Could not fetch Google profile data:', error.message);
        // Continue with just email if Google API fails
      }

      // Try to create or update user in Supabase
      try {
        await this.createOrGetUser(email, profileData);
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
   * Get user profile data from Google People API
   * Returns { firstName, lastName, avatarUrl, email }
   */
  async getGoogleProfileData() {
    try {
      const manifest = chrome.runtime.getManifest();
      const clientId = manifest.oauth2?.client_id || '';
      if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        console.warn('Google People API skipped: configure a real OAuth client ID in manifest.json');
        return {
          firstName: '',
          lastName: '',
          avatarUrl: null,
          email: this.userEmail
        };
      }

      // Get access token for Google services
      const token = await chrome.identity.getAuthToken({ interactive: true });
      
      if (!token) {
        throw new Error('Could not get auth token');
      }

      // Call Google People API
      const response = await fetch(
        'https://www.googleapis.com/people/v1/people/me?personFields=names,photos,emailAddresses',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Extract profile information
      const profileData = {
        firstName: data.names?.[0]?.givenName || '',
        lastName: data.names?.[0]?.familyName || '',
        avatarUrl: data.photos?.[0]?.url || null,
        email: data.emailAddresses?.[0]?.value || this.userEmail
      };

      console.log('✅ Google profile data fetched:', profileData);
      return profileData;

    } catch (error) {
      console.error('Google People API error:', error);
      // Return empty profile data if API fails
      return {
        firstName: '',
        lastName: '',
        avatarUrl: null,
        email: this.userEmail
      };
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
        avatar_url: profileData.avatarUrl || null,
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
        avatar_url: profileData.avatarUrl || profileData.photoUrl || null,
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
        const merged = {
          ...user,
          ...updateData,
          ...(updated || {})
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

      const updateData = {
        first_name: profileData.firstName || '',
        last_name: profileData.lastName || '',
        avatar_url: profileData.avatarUrl || profileData.photoUrl || null,
        updated_at: new Date().toISOString()
      };

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

async function initAuthManager() {
  if (authManager) return authManager;
  authManager = new AuthManager();
  return authManager;
}

function getAuthManager() {
  if (!authManager) {
    throw new Error('Auth manager not initialized. Call initAuthManager() first.');
  }
  return authManager;
}
