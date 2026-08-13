// background/background.js

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

// Initialize default shortcuts on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
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
    chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PATH) });
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
    const url = chrome.runtime.getURL('dashboard/dashboard.html') +
      (message.openAddNew ? '?action=add-shortcut' : '');
    chrome.tabs.create({ url });
  }
});


async function initializeExtension() {
  await registerCurrentUser();
  await verifyUserAccess();
}

chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});