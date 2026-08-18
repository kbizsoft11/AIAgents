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
   * Gets email and creates/loads user record from Supabase
   */
  async authenticateWithChrome() {
    try {
      const profileUserInfo = await chrome.identity.getProfileUserInfo();
      const email = profileUserInfo?.email;

      if (!email) {
        throw new Error('Could not get email from Chrome identity');
      }

      this.userEmail = email;

      // Try to get or create user in Supabase
      try {
        await this.createOrGetUser(email);
      } catch (error) {
        console.warn('Could not sync user to Supabase:', error.message);
        // Continue anyway - user data will still work with localStorage
      }

      this.isAuthenticated = true;
      // console.log('✅ User authenticated:', email);
      return email;

    } catch (error) {
      console.error('Chrome identity error:', error);
      throw error;
    }
  }

  /**
   * Create or get user in Supabase by email
   */
  async createOrGetUser(email) {
    try {
      const client = getSupabaseClient();

      // Try to get existing user
      try {
        const result = await client.selectWithFilter('users', { email });
        if (result && result.length > 0) {
          this.currentUser = result[0];
          return result[0];
        }
      } catch (error) {
        console.warn('User query failed:', error.message);
      }

      // Create new user if doesn't exist
      const newUser = {
        email,
        created_at: new Date().toISOString()
      };

      const created = await client.insert('users', newUser);
      const user = Array.isArray(created) ? created[0] : created;
      this.currentUser = user;
      return user;

    } catch (error) {
      console.error('User creation/fetch error:', error);
      throw error;
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
