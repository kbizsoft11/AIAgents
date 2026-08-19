// utils/supabase-client.js
// Supabase client setup and initialization
// Uses Anon Key (no authentication/token refresh needed)

class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.userEmail = null;
  }

  /**
   * Initialize client
   */
  async init() {
    if (!this.url || !this.anonKey) {
      throw new Error('Supabase URL and Anon Key are required');
    }
    return true;
  }

  /**
   * Set user email for RLS policies and data isolation
   */
  setUserEmail(email) {
    this.userEmail = email;
  }

  /**
   * Make request to Supabase using Anon Key
   * RLS policies handle authorization based on email header
   */
  async request(method, table, options = {}) {
    const headers = {
      'apikey': this.anonKey,
      'Content-Type': 'application/json'
    };

    // Send email as header for RLS policies
    if (this.userEmail) {
      headers['x-user-email'] = this.userEmail;
    }

    if (options.prefer) {
      headers['Prefer'] = options.prefer;
    }

    const url = `${this.url}/rest/v1/${table}${options.query || ''}`;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Supabase error (${response.status}): ${error.message || response.statusText}`);
      }

      // Handle different response types
      if (response.status === 204) {
        return null;
      }

      // Try to parse as JSON, but handle empty responses
      const text = await response.text();
      if (!text) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch (parseError) {
        console.warn(`Could not parse response as JSON: ${text}`);
        return null;
      }
    } catch (error) {
      console.error(`Request to ${table} failed:`, error);
      throw error;
    }
  }

  /**
   * Convert object keys from camelCase to snake_case
   */
  /**
   * Filter out fields that don't exist in Supabase table schema
   */
  filterFieldsForTable(table, data) {
    // Define which fields are allowed for each table
    const allowedFields = {
      'users': ['id', 'email', 'first_name', 'last_name', 'avatar_url', 'is_premium', 'premium_until', 'created_at', 'updated_at'],
      'shortcuts': ['id', 'user_id', 'trigger', 'expansion', 'label', 'usage_count', 'created_at', 'updated_at', 'deleted_at', 'email', 'folder_id'],
      'forms': ['id', 'user_id', 'trigger', 'label', 'template_type', 'fields', 'usage_count', 'created_at', 'updated_at', 'deleted_at', 'email', 'folder_id'],
      'folders': ['id', 'user_id', 'name', 'is_expanded', 'created_at', 'updated_at', 'deleted_at', 'email']
    };

    const allowed = allowedFields[table] || [];
    const filtered = {};

    // First convert to snake_case
    const snakeCaseData = this.convertToSnakeCase(data);

    // Then filter to only allowed fields
    for (const [key, value] of Object.entries(snakeCaseData)) {
      if (allowed.includes(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  convertToSnakeCase(obj) {
    const converted = {};
    const fieldMappings = {
      'template': 'template_type',  // Map template -> template_type for forms table
      'usageCount': 'usage_count',  // Standard camelCase to snake_case
      'folderId': 'folder_id',
      'isExpanded': 'is_expanded',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'deletedAt': 'deleted_at'
    };

    for (const [key, value] of Object.entries(obj)) {
      // Check for explicit field mappings first
      if (fieldMappings[key]) {
        converted[fieldMappings[key]] = value;
      } else {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        converted[snakeKey] = value;
      }
    }
    return converted;
  }

  /**
   * INSERT operation
   */
  async insert(table, data) {
    // Filter to only allowed fields and convert to snake_case
    const filteredData = this.filterFieldsForTable(table, data);
    return this.request('POST', table, { body: filteredData });
  }

  /**
   * SELECT operation
   */
  async select(table, query = '') {
    return this.request('GET', table, { query });
  }

  /**
   * SELECT with filters
   */
  async selectWithFilter(table, filters) {
    let query = '?select=*';

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Handle different filter operators
        if (typeof value === 'object' && value.operator) {
          query += `&${key}=${value.operator}.${encodeURIComponent(value.value)}`;
        } else {
          query += `&${key}=eq.${encodeURIComponent(value)}`;
        }
      }
    });

    return this.request('GET', table, { query });
  }

  /**
   * UPDATE operation
   */
  async update(table, data, filters) {
    let query = '?';
    Object.entries(filters).forEach(([key, value]) => {
      query += `${key}=eq.${encodeURIComponent(value)}&`;
    });
    query = query.slice(0, -1);

    // Filter to only allowed fields and convert to snake_case
    const filteredData = this.filterFieldsForTable(table, data);
    return this.request('PATCH', table, { body: filteredData, query });
  }

  /**
   * DELETE operation
   */
  async delete(table, filters) {
    let query = '?';
    Object.entries(filters).forEach(([key, value]) => {
      query += `${key}=eq.${encodeURIComponent(value)}&`;
    });
    query = query.slice(0, -1);

    return this.request('DELETE', table, { query });
  }

  /**
   * Soft delete (set deleted_at timestamp)
   */
  async softDelete(table, id) {
    return this.update(table, { deleted_at: new Date().toISOString() }, { id });
  }

  /**
   * Get user by ID
   */
  async getUser(userId) {
    const result = await this.selectWithFilter('users', { id: userId });
    return result?.[0];
  }

  convertToCamelCase(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const converted = {};
    const fieldMappings = {
      'template_type': 'template',
      'usage_count': 'usageCount',
      'folder_id': 'folderId',
      'is_expanded': 'isExpanded',
      'created_at': 'createdAt',
      'updated_at': 'updatedAt',
      'deleted_at': 'deletedAt',
      'user_id': 'userId'
    };

    for (const [key, value] of Object.entries(obj)) {
      if (fieldMappings[key]) {
        converted[fieldMappings[key]] = value;
      } else {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        converted[camelKey] = value;
      }
    }
    return converted;
  }

  /**
   * Get all shortcuts for user (by email)
   */
  async getShortcuts(userEmail) {
    const result = await this.selectWithFilter('shortcuts', {
      email: userEmail
    });
    return (result || []).map(item => this.convertToCamelCase(item));
  }

  /**
   * Get all forms for user (by email)
   */
  async getForms(userEmail) {
    const result = await this.selectWithFilter('forms', {
      email: userEmail
    });
    return (result || []).map(item => this.convertToCamelCase(item));
  }

  async getFolders(userEmail) {
    const result = await this.selectWithFilter('folders', {
      email: userEmail
    });
    return (result || []).map(item => this.convertToCamelCase(item));
  }
}

// Initialize and export client
let supabaseClient = null;

async function initSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  try {
    // Load config from secure storage (chrome.storage)
    const config = await getSupabaseConfig();

    if (!config.URL || !config.ANON_KEY) {
      throw new Error(
        'Supabase configuration not found. ' +
        'Call setupSupabaseConfig() with your URL and Anon Key first.'
      );
    }

    supabaseClient = new SupabaseClient(config.URL, config.ANON_KEY);
    await supabaseClient.init();

    // console.log('✅ Supabase client initialized securely');
    return supabaseClient;
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error.message);
    throw error;
  }
}

function getSupabaseClient() {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabaseClient() first.');
  }
  return supabaseClient;
}
