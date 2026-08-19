// dashboard/profile.js
class ProfileModule {
  constructor(containerId = 'profile-container') {
    this.containerId = containerId;
    this.container = null;
    this.profileData = null;
    this.initialized = false;
    this.oldAvatarUrl = null; // Track old avatar URL for deletion
    this.ready = this.init();
  }

  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.warn('Profile container not found');
      return;
    }

    this.bindEvents();
    this.initialized = true;
    await this.loadProfileData();
  }

  bindEvents() {
    const refreshBtn = document.getElementById('profileRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.loadProfileData();
      });
    }

    const chooseAvatarBtn = document.getElementById('profileChooseAvatarBtn');
    const avatarFileInput = document.getElementById('profileAvatarFileInput');
    if (chooseAvatarBtn && avatarFileInput) {
      chooseAvatarBtn.addEventListener('click', () => avatarFileInput.click());
      avatarFileInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (file) {
          // Store old avatar URL before uploading new one
          this.oldAvatarUrl = this.profileData?.photoUrl || this.profileData?.avatarUrl || null;
          this.showLocalPreview(file);
          await this.handleAvatarUpload(file);
        }
        event.target.value = '';
      });
    }

    const profileForm = document.getElementById('profileEditForm');
    const cancelBtn = document.getElementById('profileCancelBtn');

    if (profileForm) {
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.saveProfile();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.populateFormFields();
        this.setUploadStatus('No file selected');
        this.hideLocalPreview();
      });
    }
  }

  showLocalPreview(file) {
    if (!file) return;
    const previewEl = document.getElementById('profileUploadPreview');
    if (!previewEl) return;
    const objectUrl = URL.createObjectURL(file);
    previewEl.src = objectUrl;
    previewEl.style.display = 'block';
    previewEl.onload = () => URL.revokeObjectURL(objectUrl);
  }

  hideLocalPreview() {
    const previewEl = document.getElementById('profileUploadPreview');
    if (!previewEl) return;
    previewEl.style.display = 'none';
    previewEl.src = '';
  }

  /**
   * Extract the filename from a Supabase storage URL
   */
  extractFilenameFromUrl(url) {
    if (!url) return null;
    try {
      // URLs look like: https://.../storage/v1/object/public/avatars/filename.png
      const match = url.match(/\/public\/avatars\/([^?]+)/);
      if (match) return match[1];
      
      // Also handle old format without /public/
      const match2 = url.match(/\/avatars\/([^?]+)/);
      if (match2) return match2[1];
      
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Delete old avatar from Supabase storage
   */
  async deleteOldAvatar(oldUrl) {
    if (!oldUrl) return;
    
    const filename = this.extractFilenameFromUrl(oldUrl);
    if (!filename) {
      console.log('Could not extract filename from old avatar URL, skipping deletion');
      return;
    }

    const config = await this.getSupabaseConfigValues();
    const supabaseUrl = config.URL || '';
    const supabaseKey = config.ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase config missing, cannot delete old avatar');
      return;
    }

    const email = (this.profileData && this.profileData.email) || '';
    const bucketName = window.SUPABASE_CONFIG?.STORAGE_BUCKET || 'avatars';
    const deleteUrl = `${supabaseUrl}/storage/v1/object/${bucketName}`;

    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    };

    if (email) {
      headers['x-user-email'] = email;
    }

    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: headers,
        body: JSON.stringify({ prefixes: [filename] })
      });

      if (response.ok) {
        console.log('✅ Old avatar deleted successfully:', filename);
      } else if (response.status === 404) {
        console.log('Old avatar not found, nothing to delete');
      } else {
        const errorText = await response.text();
        console.warn(`Failed to delete old avatar: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.warn('Error deleting old avatar:', error);
    }
  }

  async getSupabaseConfigValues() {
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.URL && window.SUPABASE_CONFIG.ANON_KEY) {
      return window.SUPABASE_CONFIG;
    }

    if (typeof getSupabaseConfig === 'function') {
      try {
        return await getSupabaseConfig();
      } catch (error) {
        console.warn('Failed to load Supabase config via helper:', error);
      }
    }

    return { URL: '', ANON_KEY: '' };
  }

  async handleAvatarUpload(file) {
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.setUploadStatus('Please choose a PNG, JPG, or WEBP image.', true);
      this.hideLocalPreview();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.setUploadStatus('Please choose an image smaller than 5MB.', true);
      this.hideLocalPreview();
      return;
    }

    const email = (this.profileData && this.profileData.email) || 'user';
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${email.split('@')[0]}-${Date.now()}.${fileExt}`;
    const config = await this.getSupabaseConfigValues();
    const supabaseUrl = config.URL || '';
    const supabaseKey = config.ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      this.setUploadStatus('Supabase config is missing. Upload is unavailable.', true);
      return;
    }

    try {
      this.setUploadStatus('Uploading photo...');

      // STEP 1: Upload new avatar first
      const bucketName = window.SUPABASE_CONFIG?.STORAGE_BUCKET || 'avatars';
      const storageUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${encodeURIComponent(fileName)}`;

      const formData = new FormData();
      formData.append('file', file);

      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'x-upsert': 'true'
      };

      if (email && email !== 'user') {
        headers['x-user-email'] = email;
      }

      const uploadResponse = await fetch(storageUrl, {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        let errorMsg = 'Avatar upload failed';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.message || errorData.error || errorText;
        } catch {
          errorMsg = errorText || 'Avatar upload failed';
        }
        if (errorMsg.toLowerCase().includes('bucket')) {
          throw new Error(`Supabase Storage bucket "${bucketName}" not found. Please create it in Supabase > Storage and make it public.`);
        }
        throw new Error(errorMsg);
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodeURIComponent(fileName)}`;

      // Update profile data with new avatar URL
      this.profileData = {
        ...(this.profileData || {}),
        firstName: this.profileData?.firstName || '',
        lastName: this.profileData?.lastName || '',
        email: this.profileData?.email || email,
        avatarUrl: publicUrl,
        photoUrl: publicUrl
      };

      this.setUploadStatus('Photo uploaded successfully. Save changes to update your profile.');
      this.render();
      this.hideLocalPreview();
    } catch (error) {
      console.error('Avatar upload failed:', error);
      const message = error?.message || 'Avatar upload failed';
      const friendlyMessage = message.includes('bucket')
        ? `${message}. Create a bucket named "avatars" in Supabase Storage and set it to public.`
        : 'Upload failed. Please create a public Storage bucket in Supabase or enter a direct avatar URL.';
      this.setUploadStatus(friendlyMessage, true);
    }
  }

  setUploadStatus(message, isError = false) {
    const statusEl = document.getElementById('profileUploadStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', isError);
  }

  setSaving(isSaving) {
    const saveBtn = document.getElementById('profileSaveBtn');
    const firstNameInput = document.getElementById('profileFirstNameInput');
    const lastNameInput = document.getElementById('profileLastNameInput');
    const avatarInput = document.getElementById('profileAvatarInput');

    if (saveBtn) {
      saveBtn.disabled = isSaving;
      saveBtn.textContent = isSaving ? 'Saving...' : 'Save changes';
    }
    [firstNameInput, lastNameInput, avatarInput].forEach((input) => {
      if (input) input.disabled = isSaving;
    });
  }

  async saveProfile() {
    const firstNameInput = document.getElementById('profileFirstNameInput');
    const lastNameInput = document.getElementById('profileLastNameInput');
    const avatarInput = document.getElementById('profileAvatarInput');

    if (!firstNameInput || !lastNameInput) {
      console.error('Profile form inputs not found');
      return;
    }

    const avatarValue = avatarInput ? (avatarInput.value || '').trim() : '';
    const payload = {
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      avatarUrl: avatarValue || this.profileData?.avatarUrl || this.profileData?.photoUrl || '',
      photoUrl: avatarValue || this.profileData?.photoUrl || this.profileData?.avatarUrl || '',
      email: (this.profileData && this.profileData.email) || ''
    };

    this.setSaving(true);

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'updateProfileInfo', data: payload }, (result) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            resolve(null);
            return;
          }
          resolve(result || null);
        });
      });

      if (response && response.profile) {
        const oldAvatarUrl = this.oldAvatarUrl;
        this.profileData = response.profile;
        this.render();
        if (window.headerModule && typeof window.headerModule.loadProfileData === 'function') {
          await window.headerModule.loadProfileData();
        }
        if (oldAvatarUrl && oldAvatarUrl !== response.profile.photoUrl) {
          await this.deleteOldAvatar(oldAvatarUrl);
        }
        this.oldAvatarUrl = null;
        this.setUploadStatus('Profile saved successfully.');
        // Show success toast if available
        if (window.dashboard && typeof window.dashboard.showToast === 'function') {
          window.dashboard.showToast('Profile updated successfully!');
        }
      } else {
        this.setUploadStatus('Could not save the profile.', true);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      this.setUploadStatus('Could not save the profile.', true);
    } finally {
      this.setSaving(false);
    }
  }

  async loadProfileData() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getProfileInfo' }, (result) => {
          if (chrome.runtime.lastError) {
            resolve({ firstName: '', lastName: '', email: '', photoUrl: '' });
            return;
          }
          resolve(result || { firstName: '', lastName: '', email: '', photoUrl: '' });
        });
      });

      this.profileData = response;
      this.render();
    } catch (error) {
      console.error('Failed to load profile data:', error);
      this.profileData = { firstName: '', lastName: '', email: '', photoUrl: '' };
      this.render();
    }
  }

  populateFormFields() {
    const data = this.profileData || {};
    const firstNameInput = document.getElementById('profileFirstNameInput');
    const lastNameInput = document.getElementById('profileLastNameInput');
    const avatarInput = document.getElementById('profileAvatarInput');

    if (firstNameInput) firstNameInput.value = data.firstName || '';
    if (lastNameInput) lastNameInput.value = data.lastName || '';
    if (avatarInput) avatarInput.value = data.photoUrl || data.avatarUrl || '';
  }

  render() {
    if (!this.container) return;

    const data = this.profileData || {};
    const firstName = (data.firstName || '').trim();
    const lastName = (data.lastName || '').trim();
    const email = (data.email || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Your profile';

    const profileName = document.getElementById('profilePageName');
    const profileEmail = document.getElementById('profilePageEmail');
    const firstValue = document.getElementById('profileFirstNameValue');
    const lastValue = document.getElementById('profileLastNameValue');
    const emailValue = document.getElementById('profileEmailValue');
    const avatar = document.getElementById('profilePageAvatar');
    const avatarFallback = document.getElementById('profilePageAvatarFallback');

    if (profileName) profileName.textContent = fullName;
    if (profileEmail) profileEmail.textContent = email || 'No email available';
    if (firstValue) firstValue.textContent = firstName || 'Not available';
    if (lastValue) lastValue.textContent = lastName || 'Not available';
    if (emailValue) emailValue.textContent = email || 'Not available';

    if (avatar && avatarFallback) {
      const photoUrl = data.photoUrl || data.avatarUrl;
      if (photoUrl && photoUrl.startsWith('http')) {
        avatar.src = photoUrl;
        avatar.style.display = 'block';
        avatarFallback.style.display = 'none';
      } else {
        // Fallback to generated avatar
        avatar.src = this.createFallbackAvatar(email, firstName, lastName);
        avatar.style.display = 'block';
        avatarFallback.style.display = 'none';
      }
    }

    this.populateFormFields();
  }

  createFallbackAvatar(email, firstName, lastName) {
    const initials = this.getInitials(firstName, lastName, email);
    const colors = ['#1a1a2e', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#e91e63', '#00bcd4', '#ff5722', '#795548', '#607d8b', '#8bc34a', '#ff9800'];
    const seed = email || firstName || lastName || 'textblitz';
    const colorIndex = this.hashString(seed) % colors.length;
    const size = 120;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colors[colorIndex];
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    const fontSize = initials.length === 1 ? 46 : 36;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2 + 2);

    return canvas.toDataURL('image/png');
  }

  getInitials(firstName, lastName, email) {
    if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
    if (firstName) return firstName.length >= 2 ? firstName.substring(0, 2).toUpperCase() : firstName[0].toUpperCase();
    if (email) {
      const local = email.split('@')[0].replace(/[0-9]/g, '');
      const parts = local.split(/[._\-+]/);
      if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
      if (local.length >= 2) return local.substring(0, 2).toUpperCase();
      if (local.length === 1) return local[0].toUpperCase();
    }
    return 'TB';
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async show() {
    await this.ready;
    if (!this.container) return;
    this.container.style.display = 'block';
    await this.loadProfileData();
  }

  hide() {
    if (!this.container) return;
    this.container.style.display = 'none';
  }

  isVisible() {
    return !!this.container && this.container.style.display !== 'none';
  }
}

// Initialize profile module
window.ProfileModule = new ProfileModule();