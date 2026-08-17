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
          
          // Update with new profile data if available
          if (profileData.firstName || profileData.lastName || profileData.avatarUrl) {
            await this.updateUserProfile(result[0].id, profileData);
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
   * Update user profile with Google data
   */
  async updateUserProfile(userId, profileData) {
    try {
      const client = getSupabaseClient();
      
      const updateData = {
        first_name: profileData.firstName || '',
        last_name: profileData.lastName || '',
        avatar_url: profileData.avatarUrl || null,
        updated_at: new Date().toISOString()
      };

      await client.update('users', { id: userId }, updateData);
      
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
