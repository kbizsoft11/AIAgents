const SidebarSkeleton = {
  container: null,
  isLoading: true,

  async init() {
    this.container = document.getElementById('sidebar-tree');
    if (!this.container) return;
    this.show();
    try {
      const response = await fetch(chrome.runtime.getURL('dashboard/sidebar-skeleton.html'));
      if (!response.ok) throw new Error(`Skeleton template request failed: ${response.status}`);
      const markup = await response.text();
      if (this.isLoading) this.container.innerHTML = markup;
    } catch (error) {
      console.warn('Could not load sidebar skeleton:', error);
    }
  },

  show() {
    this.isLoading = true;
    if (!this.container) this.container = document.getElementById('sidebar-tree');
    if (!this.container) return;
    this.container.setAttribute('aria-busy', 'true');
    this.container.innerHTML = '<div class="sidebar-skeleton" role="status" aria-label="Loading folders and snippets"><span class="sidebar-skeleton-label">Loading workspace</span></div>';
  },

  hide() {
    this.isLoading = false;
    if (!this.container) return;
    this.container.removeAttribute('aria-busy');
  }
};

window.SidebarSkeleton = SidebarSkeleton;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SidebarSkeleton.init(), { once: true });
} else {
  SidebarSkeleton.init();
}
