// background/background.js

// Load Supabase utility files for service worker context
importScripts('../utils/supabase-config.js');
importScripts('../utils/supabase-client.js');
importScripts('../utils/auth-manager.js');
importScripts('../utils/sync-manager.js');
importScripts('../utils/storage.js');

const DASHBOARD_PATH = 'dashboard/dashboard.html';
const AUTH_API = 'https://extensions.kbizsoft.com/magicaa-extension/check_user.php';
const REGISTER_API = 'https://extensions.kbizsoft.com/magicaa-extension/register-user.php';

async function registerCurrentUser() {
  try {

    const userInfo = await chrome.identity.getProfileUserInfo({
      accountStatus: 'ANY'
    });

    if (!userInfo?.email) {
      // console.log('No Chrome account found');
      return null;
    }

    const response = await fetch(
      REGISTER_API,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: userInfo.email
        })
      }
    );

    const data = await response.json();

    // console.log('Register User:', data);

    if (data.success) {

      await chrome.storage.local.set({
        registeredUser: data.user
      });

      return data.user;
    }

    return null;

  } catch (error) {
    console.error('Registration Error:', error);
    return null;
  }
}

async function verifyUserAccess() {
  try {
    const userInfo = await chrome.identity.getProfileUserInfo({
      accountStatus: 'ANY'
    });

    if (!userInfo?.email) {
      await chrome.storage.local.set({
        extensionEnabled: false,
        disableReason: 'No Google account found'
      });
      return false;
    }

    const response = await fetch(
      `${AUTH_API}?email=${encodeURIComponent(userInfo.email)}`
    );

    const data = await response.json();
    // console.log("API Response:", data);

    const isActive =
      data.success === true &&
      data.status === 'active';

    await chrome.storage.local.set({
      extensionEnabled: isActive,
      disableReason: isActive
        ? ''
        : (data.error || 'Account disabled')
    });

    return isActive;

  } catch (error) {
    console.error('User verification failed:', error);

    await chrome.storage.local.set({
      extensionEnabled: false,
      disableReason: 'Unable to verify account'
    });

    return false;
  }
}

// Open dashboard when extension icon is clicked
chrome.action.onClicked.addListener(async () => {

  const allowed = await verifyUserAccess();

  if (!allowed) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/blocked.html')
    });
    return;
  }

  const dashboardUrl = chrome.runtime.getURL(DASHBOARD_PATH);
  const tabs = await chrome.tabs.query({ url: dashboardUrl });

  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: dashboardUrl });
  }
});

/**
 * Check if user has existing shortcuts/forms in Supabase
 * Used to decide whether to add default shortcuts on reinstall
 */
async function checkIfUserHasExistingSupabaseData() {
  try {
    // Get user email from Chrome identity
    const profileUserInfo = await chrome.identity.getProfileUserInfo();
    const userEmail = profileUserInfo.email;

    if (!userEmail) {
      console.warn('⚠️ No user email found, will add default shortcuts');
      return false;
    }

    // Initialize Supabase client
    await initSupabaseClient();
    const client = getSupabaseClient();

    if (!client) {
      console.warn('⚠️ Supabase client not available, will add default shortcuts');
      return false;
    }

    // Set email for RLS policies
    client.setUserEmail(userEmail);

    // Check if user exists and has any shortcuts or forms
    try {
      const shortcuts = await client.getShortcuts(userEmail);
      const forms = await client.getForms(userEmail);

      const hasData = (shortcuts && shortcuts.length > 0) || (forms && forms.length > 0);
      
      if (hasData) {
        console.log(`✅ User has existing data in Supabase (${shortcuts?.length || 0} shortcuts, ${forms?.length || 0} forms)`);
        return true;
      } else {
        console.log('✅ User has no existing data in Supabase, will add default shortcuts');
        return false;
      }
    } catch (error) {
      console.warn('⚠️ Could not query Supabase:', error.message);
      return false;
    }
  } catch (error) {
    console.warn('⚠️ Error checking Supabase data:', error.message);
    return false;
  }
}

// Initialize default shortcuts on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    try {
      // Check if user already has data in Supabase (reinstall scenario)
      const hasExistingData = await checkIfUserHasExistingSupabaseData();

      if (!hasExistingData) {
        // Only add default shortcuts if this is a fresh install (no Supabase data)
        const defaultShortcuts = [
          {
            id: 'example2',
            trigger: '-ty',
            expansion: 'Thank you so much! I really appreciate your help.',
            label: 'Thank You',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            usageCount: 0
          },
          {
            id: 'example3',
            trigger: '-sig',
            expansion: 'Best regards,\n{{first_name}} {{last_name}}\n{{email}}',
            label: 'Email Signature',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            usageCount: 0
          }
        ];

        chrome.storage.local.set({ shortcuts: defaultShortcuts });
        console.log('✅ Default shortcuts added (fresh install)');
      } else {
        console.log('✅ User has existing data in Supabase, skipping default shortcuts');
        chrome.storage.local.set({ shortcuts: [] });
      }
    } catch (error) {
      console.warn('⚠️ Could not check Supabase, adding default shortcuts:', error.message);
      // Fallback: add defaults if we can't check Supabase
      const defaultShortcuts = [
        {
          id: 'example2',
          trigger: '-ty',
          expansion: 'Thank you so much! I really appreciate your help.',
          label: 'Thank You',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0
        },
        {
          id: 'example3',
          trigger: '-sig',
          expansion: 'Best regards,\n{{first_name}} {{last_name}}\n{{email}}',
          label: 'Email Signature',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0
        }
      ];
      chrome.storage.local.set({ shortcuts: defaultShortcuts });
    }

    chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PATH) });
  }

  // Initialize Supabase on every install/update
  try {
    (async () => {
      await initSupabaseClient();
      const authMgr = await initAuthManager();
      
      if (authMgr.isUserAuthenticated()) {
        const syncMgr = await initSyncManager(authMgr.getUserId());
        console.log('✅ Sync manager initialized on install');
      }
    })();
  } catch (error) {
    console.error('⚠️ Supabase initialization error:', error);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getShortcuts') {
    chrome.storage.local.get({ shortcuts: [] }, (result) => {
      sendResponse(result.shortcuts);
    });
    return true;
  }

  if (message.action === 'getProfileInfo') {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, async (userInfo) => {
      let email = userInfo?.email || '';
      let firstName = '';
      let lastName = '';
      let photoUrl = '';

      if (email) {
        const namePart = email.split('@')[0];
        const parts = namePart.split(/[._-]/);
        firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
        lastName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';
      }

      try {
        const token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: false }, (tokenValue) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(tokenValue || null);
          });
        });

        if (token) {
          const response = await fetch('https://www.googleapis.com/people/v1/people/me?personFields=names,photos,emailAddresses', {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            firstName = data.names?.[0]?.givenName || firstName;
            lastName = data.names?.[0]?.familyName || lastName;
            photoUrl = data.photos?.[0]?.url || photoUrl;
            if (!email && data.emailAddresses?.[0]?.value) {
              email = data.emailAddresses[0].value;
            }
          }
        }
      } catch (error) {
        console.warn('Could not refresh Google profile details:', error.message);
      }

      try {
        await initSupabaseClient();
        const authMgr = await initAuthManager();
        const supabaseUser = await authMgr.getUserProfileFromSupabase(email || userInfo?.email || '');

        const fallback = {
          firstName: supabaseUser?.firstName || firstName,
          lastName: supabaseUser?.lastName || lastName,
          email: email || supabaseUser?.email || userInfo?.email || '',
          photoUrl: supabaseUser?.photoUrl || supabaseUser?.avatarUrl || photoUrl || ''
        };

        if ((!supabaseUser || !supabaseUser.firstName || !supabaseUser.lastName || !supabaseUser.photoUrl) && email) {
          const googleFallback = {
            firstName: firstName || fallback.firstName,
            lastName: lastName || fallback.lastName,
            avatarUrl: photoUrl || fallback.photoUrl,
            email
          };
          await authMgr.saveUserProfile(email, googleFallback).catch(() => undefined);
        }

        chrome.storage.local.get({ profileData: null }, (result) => {
          const stored = result.profileData || {};
          const profile = {
            firstName: fallback.firstName || stored.firstName || firstName,
            lastName: fallback.lastName || stored.lastName || lastName,
            email: fallback.email || stored.email || email,
            photoUrl: fallback.photoUrl || stored.photoUrl || stored.avatarUrl || photoUrl || ''
          };

          chrome.storage.local.set({ profileData: profile }, () => {
            sendResponse(profile);
          });
        });
        return;
      } catch (error) {
        console.warn('Supabase profile fallback failed:', error.message);
      }

      chrome.storage.local.get({ profileData: null }, (result) => {
        const stored = result.profileData || {};
        const profile = {
          firstName: stored.firstName || firstName,
          lastName: stored.lastName || lastName,
          email: email,
          photoUrl: stored.photoUrl || stored.avatarUrl || photoUrl || ''
        };

        chrome.storage.local.set({ profileData: profile }, () => {
          sendResponse(profile);
        });
      });
    });
    return true;
  }

  if (message.action === 'updateProfileInfo' || message.action === 'saveProfileData') {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, async (userInfo) => {
      try {
        const email = userInfo?.email || message.data?.email || '';
        if (!email) {
          sendResponse({ success: false, error: 'No account email found' });
          return;
        }

        await initSupabaseClient();
        const authMgr = await initAuthManager();
        const saved = await authMgr.saveUserProfile(email, message.data || {});

        const profile = {
          firstName: saved.firstName || message.data?.firstName || '',
          lastName: saved.lastName || message.data?.lastName || '',
          email,
          photoUrl: saved.photoUrl || message.data?.photoUrl || message.data?.avatarUrl || ''
        };

        chrome.storage.local.set({ profileData: profile }, () => {
          sendResponse({ success: true, profile });
        });
      } catch (error) {
        console.error('Profile update failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }

  if (message.action === 'incrementUsage') {
    chrome.storage.local.get({ shortcuts: [] }, (result) => {
      const shortcuts = result.shortcuts;
      const index = shortcuts.findIndex(s => s.id === message.id);
      if (index !== -1) {
        shortcuts[index].usageCount = (shortcuts[index].usageCount || 0) + 1;
        chrome.storage.local.set({ shortcuts });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openDashboard') {
    const action = message.openForm ? 'add-form' : (message.openAddNew ? 'add-shortcut' : (message.openForms ? 'forms' : ''));
    const url = chrome.runtime.getURL('dashboard/dashboard.html') + (action ? `?action=${action}` : '');
    chrome.tabs.create({ url });
  }

  // Supabase sync status request
  if (message.action === 'GET_SYNC_STATUS') {
    try {
      const syncMgr = getSyncManager();
      sendResponse(syncMgr.getSyncStatus());
    } catch (error) {
      sendResponse({ error: error.message, isSyncing: false, pendingItems: 0 });
    }
    return true;
  }

  // Supabase auth status request
  if (message.action === 'GET_AUTH_STATUS') {
    try {
      const authMgr = getAuthManager();
      sendResponse({
        isAuthenticated: authMgr.isUserAuthenticated(),
        user: authMgr.getCurrentUser()
      });
    } catch (error) {
      sendResponse({ isAuthenticated: false, error: error.message });
    }
    return true;
  }
});


async function initializeExtension() {
  await registerCurrentUser();
  await verifyUserAccess();
  
  // Initialize user limits from admin panel
  try {
    await StorageHelper.checkUser();
    console.log('✅ User limits initialized:', StorageHelper.MAX_SHORTCUTS);
  } catch (error) {
    console.error('⚠️ Failed to initialize user limits:', error);
  }
}

chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});
