// utils/auth-manager.js
// Handles user identification via Chrome Identity
// RLS policies enforce data isolation based on email

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.userEmail = null;
    this.isAuthenticated = false;
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
