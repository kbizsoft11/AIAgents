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

// Dynamic-field windows are opened by the service worker because content
// scripts cannot create browser windows directly.
const dynamicFieldWindows = new Map();

function createDynamicFieldWindow(message, sender, sendResponse) {
  const requestId = message.requestId || `dynamic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  dynamicFieldWindows.set(requestId, {
    tabId: sender.tab?.id,
    frameId: sender.frameId || 0,
    text: message.text || '',
    fields: Array.isArray(message.fields) ? message.fields : [],
    windowId: null
  });
  const url = `${chrome.runtime.getURL('dynamic-fields.html')}?requestId=${encodeURIComponent(requestId)}`;
  const width = 560;
  const height = 680;
  const createWindow = bounds => {
    const options = { type: 'popup', url, width, height, focused: true };
    if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.top) && bounds.width && bounds.height) {
      options.left = Math.round(bounds.left + Math.max(0, (bounds.width - width) / 2));
      options.top = Math.round(bounds.top + Math.max(0, (bounds.height - height) / 2));
    }
    chrome.windows.create(options, window => {
      if (chrome.runtime.lastError || !window?.id) {
        dynamicFieldWindows.delete(requestId);
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Unable to open the dynamic field window.' });
        return;
      }
      const pending = dynamicFieldWindows.get(requestId);
      if (pending) pending.windowId = window.id;
      sendResponse({ success: true, requestId, windowId: window.id });
    });
  };

  // Center the popup in the browser window that owns the active webpage.
  // If the browser does not provide bounds, Chrome chooses its normal popup
  // position automatically.
  if (sender.tab?.windowId !== undefined) {
    chrome.windows.get(sender.tab.windowId, currentWindow => {
      if (chrome.runtime.lastError) createWindow(null);
      else createWindow(currentWindow);
    });
  } else {
    createWindow(null);
  }
  return true;
}

chrome.windows.onRemoved.addListener(windowId => {
  for (const [requestId, pending] of dynamicFieldWindows) {
    if (pending.windowId !== windowId) continue;
    if (pending.tabId !== undefined) {
      chrome.tabs.sendMessage(pending.tabId, { action: 'dynamicFieldResult', requestId, cancelled: true }, { frameId: pending.frameId }, () => void chrome.runtime.lastError);
    }
    dynamicFieldWindows.delete(requestId);
  }
});

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
        // console.log(`✅ User has existing data in Supabase (${shortcuts?.length || 0} shortcuts, ${forms?.length || 0} forms)`);
        return true;
      } else {
        // console.log('✅ User has no existing data in Supabase, will add default shortcuts');
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
        // console.log('✅ Default shortcuts added (fresh install)');
      } else {
        // console.log('✅ User has existing data in Supabase, skipping default shortcuts');
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
        // console.log('✅ Sync manager initialized on install');
      }
    })();
  } catch (error) {
    console.error('⚠️ Supabase initialization error:', error);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openDynamicFieldWindow') {
    return createDynamicFieldWindow(message, sender, sendResponse);
  }

  if (message.action === 'getDynamicFieldWindowData') {
    const pending = dynamicFieldWindows.get(message.requestId);
    sendResponse(pending
      ? { success: true, text: pending.text, fields: pending.fields }
      : { success: false, error: 'This dynamic field request has expired.' });
    return true;
  }

  if (message.action === 'completeDynamicFieldWindow' || message.action === 'cancelDynamicFieldWindow') {
    const pending = dynamicFieldWindows.get(message.requestId);
    if (!pending) return false;
    chrome.tabs.sendMessage(pending.tabId, {
      action: 'dynamicFieldResult',
      requestId: message.requestId,
      values: message.values || [],
      cancelled: message.action !== 'completeDynamicFieldWindow'
    }, { frameId: pending.frameId }, () => void chrome.runtime.lastError);
    if (pending.windowId) chrome.windows.remove(pending.windowId, () => void chrome.runtime.lastError);
    dynamicFieldWindows.delete(message.requestId);
    return false;
  }

  if (message.action === 'getShortcuts') {
    chrome.storage.local.get({ shortcuts: [] }, (result) => {
      sendResponse(result.shortcuts);
    });
    return true;
  }

  if (message.action === 'getProfileInfo') {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
      let email = userInfo?.email || '';
      let firstName = '';
      let lastName = '';

      if (email) {
        const namePart = email.split('@')[0];
        const parts = namePart.split(/[._-]/);
        firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
        lastName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';
      }

      chrome.storage.local.get({ profileData: null }, (result) => {
        const profile = result.profileData || {};
        sendResponse({
          firstName: profile.firstName || firstName,
          lastName: profile.lastName || lastName,
          email: email,
          photoUrl: profile.photoUrl || ''
        });
      });
    });
    return true;
  }

  if (message.action === 'saveProfileData') {
    chrome.storage.local.set({ profileData: message.data }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'updateProfileInfo') {
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
          email: saved.email || email,
          avatarUrl: saved.avatarUrl || saved.photoUrl || message.data?.avatarUrl || '',
          photoUrl: saved.photoUrl || saved.avatarUrl || message.data?.photoUrl || ''
        };

        chrome.storage.local.set({ profileData: profile }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ success: true, profile });
        });
      } catch (error) {
        console.error('Profile update failed:', error);
        sendResponse({ success: false, error: error.message || 'Profile update failed' });
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
    // console.log('✅ User limits initialized:', StorageHelper.MAX_SHORTCUTS);
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
