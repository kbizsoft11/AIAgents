// content/content.js
// ColixAI - Content Script with Shortcut Menu
(function () {
  'use strict';

  if (window.__textBlitzLoaded) return;
  window.__textBlitzLoaded = true;

  // console.log('ColixAI: Content script loaded on', window.location.hostname);

  let shortcuts = [];
  let forms = [];
  const pendingDynamicFields = new Map();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action !== 'dynamicFieldResult') return;
    const pending = pendingDynamicFields.get(message.requestId);
    if (!pending) return;
    pendingDynamicFields.delete(message.requestId);
    if (message.cancelled) {
      pending.cancel();
      return;
    }
    const escapeValue = value => String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    let expanded = pending.text;
    pending.fields.forEach((field, index) => {
      expanded = expanded.split(field.token).join(escapeValue(message.values?.[index]));
    });
    pending.complete(expanded);
  });

  // Feature flag — set to true to re-enable the "//" popup trigger in future
  const ENABLE_SLASH_MENU = true;

  const DISMISS_KEY = 'tb_fab_dismissed';
  const DISMISS_DURATION = 2 * 24 * 60 * 60 * 1000; // 2 days in ms

  // LinkedIn profile detection
  const isLinkedInProfile = () => {
    return window.location.hostname.includes('linkedin.com') &&
      (window.location.pathname.startsWith('/in/') ||
        window.location.pathname.match(/\/feed\/|\/admin\/|\/sales\/|\/pulse\//));
  };

  // =============================================
  // LINKEDIN PROFILE SCRAPER
  // =============================================
  function scrapeLinkedInProfile() {
    try {
      const profile = {};

      // console.log('🔍 Starting LinkedIn profile scrape...');

      // ===== NAME =====
      let nameEl = document.querySelector('h1');
      profile.name = nameEl ? nameEl.innerText.split('\n')[0].trim() : 'N/A';
      // console.log('📝 Name:', profile.name);

      // ===== HEADLINE (Job Title) =====
      // Try to find in common locations
      let headlineEl = null;

      // Method 1: Look for text near the profile photo
      let possibleHeadlines = document.querySelectorAll('div[class*="headline"], div[class*="title"], .text-body-medium');
      for (let el of possibleHeadlines) {
        let text = el.innerText;
        if (text && text.length > 5 && text.length < 150 && !text.includes('View') && !text.includes('profile')) {
          headlineEl = el;
          break;
        }
      }

      // Method 2: Get from meta description or page text
      if (!headlineEl) {
        let allText = document.body.innerText;
        let lines = allText.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(profile.name) && i + 1 < lines.length) {
            headlineEl = lines[i + 1];
            break;
          }
        }
      }

      profile.headline = headlineEl ? (typeof headlineEl === 'string' ? headlineEl : headlineEl.innerText).split('\n')[0].trim() : 'N/A';
      // console.log('💼 Headline:', profile.headline);

      // ===== LOCATION =====
      let locationText = 'N/A';
      let pageText = document.body.innerText;

      // Look for common location patterns
      let allDivs = document.querySelectorAll('div, span, p');
      for (let div of allDivs) {
        let text = div.innerText || div.textContent;
        // Look for pattern like "City, State" or "City, Country"
        if (text && text.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z\s]*$/)) {
          locationText = text.trim();
          break;
        }
      }
      profile.location = locationText;
      // console.log('📍 Location:', profile.location);

      // ===== PROFILE PHOTO =====
      let photoEl = null;

      // LinkedIn profile photos usually have specific patterns
      let imageEls = document.querySelectorAll('img');
      for (let img of imageEls) {
        let src = img.src || img.getAttribute('src');
        let alt = img.alt || img.getAttribute('alt');

        // Look for profile/avatar images
        if (src && (src.includes('profile') || src.includes('avatar') || src.includes('dms') || src.match(/\d{3,}/))) {
          // Check if it's reasonably sized (profile photos are usually >50px)
          if (img.width > 50 || img.height > 50) {
            photoEl = img;
            break;
          }
        }
      }

      profile.photo = photoEl ? photoEl.src : null;
      // console.log('📷 Photo:', profile.photo ? 'Found' : 'Not found');

      // ===== EDUCATION =====
      const educationItems = [];
      const liElements = document.querySelectorAll('li');

      liElements.forEach(li => {
        let text = li.innerText || li.textContent;
        // Check if this li contains education keywords
        if (text && (
          text.match(/university|college|school|institute|academy|polytechnic/i) ||
          text.match(/bachelor|master|phd|diploma|degree|b\.?a|b\.?s|m\.?a|m\.?s|b\.?tech|m\.?tech/i)
        )) {
          let lines = text.split('\n').filter(l => l.trim());
          if (lines.length > 0) {
            educationItems.push({
              school: lines[0]?.trim() || 'N/A',
              degree: lines[1]?.trim() || lines[0]?.trim() || 'N/A'
            });
          }
        }
      });

      profile.education = educationItems.length > 0 ? educationItems.slice(0, 5) : [];
      // console.log('🎓 Education items found:', profile.education.length);

      // ===== EXPERIENCE =====
      const experienceItems = [];

      liElements.forEach(li => {
        let text = li.innerText || li.textContent;
        // Look for common job-related keywords
        if (text && text.match(/manager|engineer|developer|designer|analyst|consultant|lead|director|officer|executive|specialist|associate|coordinator/i)) {
          let lines = text.split('\n').filter(l => l.trim());

          // Experience entries usually have: Title, Company, Duration
          if (lines.length >= 1) {
            // Filter out too short entries (likely false positives)
            if (lines[0].length > 3) {
              experienceItems.push({
                title: lines[0]?.trim() || 'N/A',
                company: lines[1]?.trim() || 'N/A',
                duration: lines[2]?.trim() || lines[3]?.trim() || ''
              });
            }
          }
        }
      });

      profile.experience = experienceItems.length > 0 ? experienceItems.slice(0, 5) : [];
      // console.log('💼 Experience items found:', profile.experience.length);

      // console.log('✅ Profile scrape complete:', profile);
      return profile;

    } catch (e) {
      console.error('❌ LinkedIn profile scrape error:', e);
      return {
        name: 'Error scraping',
        headline: 'N/A',
        location: 'N/A',
        photo: null,
        education: [],
        experience: []
      };
    }
  }

  // =============================================
  // MENU STATE
  // =============================================
  const menuState = {
    visible: false,
    element: null,
    searchInput: null,
    listEl: null,
    selectedIndex: 0,
    triggerElement: null,
    triggerType: null,
    filterText: '',
    justOpened: false,
    lockInput: false,
    savedInputCursor: -1,   // cursor position at the moment // was typed (input/textarea)
    savedCERange: null       // selection range at the moment // was typed (contenteditable)
  };

  // =============================================
  // STYLES
  // =============================================
  function injectStyles() {
    if (document.getElementById('textblitz-styles')) return;

    const style = document.createElement('style');
    style.id = 'textblitz-styles';
    style.textContent = `
      #textblitz-menu {
        position: fixed;
        z-index: 2147483647;
        background: #ffffff;
        border: 1px solid #e2e2e2;
        border-radius: 12px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
        width: 380px;
        max-height: 340px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: none;
        flex-direction: column;
      }

      #textblitz-menu.tb-open {
        display: flex;
      }

      .tb-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid #f0f0f0;
        flex-shrink: 0;
      }

      .tb-logo {
        font-size: 12px;
        font-weight: 700;
        color: #1a1a2e;
        letter-spacing: -0.3px;
        white-space: nowrap;
      }

      .tb-search-wrap {
        flex: 1;
      }

      #tb-search {
        width: 100%;
        padding: 6px 10px;
        border: 1.5px solid #eee;
        border-radius: 6px;
        font-size: 12px;
        color: #333;
        background: #fafafa;
        outline: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      #tb-search:focus {
        border-color: #1a1a2e;
        background: #fff;
      }

      #tb-search::placeholder {
        color: #ccc;
      }

      .tb-list {
        overflow-y: auto;
        flex: 1;
        padding: 4px;
      }

      .tb-list::-webkit-scrollbar {
        width: 4px;
      }

      .tb-list::-webkit-scrollbar-track {
        background: transparent;
      }

      .tb-list::-webkit-scrollbar-thumb {
        background: #ddd;
        border-radius: 2px;
      }

      .tb-item {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        border: 1.5px solid transparent;
        user-select: none;
      }

      .tb-item:hover {
        background: #f8f8fa;
      }

      .tb-item.tb-active {
        background: #f0f0f5;
        border-color: #e0e0ea;
      }

      .tb-item-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .tb-item-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .tb-trigger {
        font-family: 'SF Mono','Fira Code','Consolas', monospace;
        font-size: 12px;
        font-weight: 700;
        color: #1a1a2e;
        background: #f0f0f5;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }

      .tb-label {
        font-size: 12px;
        font-weight: 600;
        color: #555;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tb-date {
        font-size: 10px;
        color: #bbb;
        white-space: nowrap;
      }

      .tb-preview {
        font-size: 12px;
        color: #999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;
      }

      .tb-empty {
        padding: 24px 16px;
        text-align: center;
        color: #bbb;
        font-size: 13px;
      }

      .tb-empty-icon {
        font-size: 24px;
        margin-bottom: 6px;
      }

      .tb-footer {
        padding: 8px 14px;
        border-top: 1px solid #f0f0f0;
        flex-shrink: 0;
      }

      .tb-hints {
        font-size: 10px;
        color: #ccc;
        display: flex;
        gap: 8px;
      }

      .tb-hints kbd {
        background: #f0f0f0;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        color: #888;
        border: 1px solid #e0e0e0;
      }
    `;
    document.head.appendChild(style);
  }

  // =============================================
  // LOAD SHORTCUTS
  // =============================================
  function loadShortcuts() {
    chrome.storage.local.get({ shortcuts: [], forms: [] }, function (result) {
      shortcuts = Array.isArray(result.shortcuts) ? result.shortcuts : [];
      forms = Array.isArray(result.forms) ? result.forms : [];
      // console.log('ColixAI: Loaded', shortcuts.length, 'shortcuts');
    });
  }

  chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace === 'local' && changes.shortcuts) {
      shortcuts = changes.shortcuts.newValue || [];
    }
    if (namespace === 'local' && changes.forms) {
      forms = changes.forms.newValue || [];
    }
  });

  // =============================================
  // TRACK LAST FOCUSED EDITABLE FIELD (for sidebar insert)
  // =============================================
  let lastFocusedEl = null;
  let lastFocusedRange = null;
  document.addEventListener('focusin', function (e) {
    if (isInsideMenu(e.target)) return;        // ignore the // popup menu's own inputs
    if (isInsideSidebar(e.target)) return;      // ignore the sidebar's own search input
    if (isEditable(e.target)) {
      lastFocusedEl = e.target;
      if (e.target.isContentEditable) {
        const sel = window.getSelection();
        lastFocusedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      } else {
        lastFocusedRange = null;
      }
    }
  }, true);

  document.addEventListener('selectionchange', function () {
    const active = document.activeElement;
    if (active && isEditable(active) && active.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) lastFocusedRange = sel.getRangeAt(0).cloneRange();
    }
  }, true);

  // =============================================
  // HELPERS
  // =============================================
  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // Strip HTML tags to plain text (for regular inputs & textareas)
  function htmlToPlainText(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    // Replace <br> with newlines
    d.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    // Add newlines after block elements
    d.querySelectorAll('p, div').forEach(el => {
      if (el.nextSibling) el.insertAdjacentText('afterend', '\n');
    });
    return (d.innerText || d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function triggerWebConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;';
    document.documentElement.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }

    const colors = ['#1dac4b', '#f43f5e', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899'];
    const particles = Array.from({ length: 70 }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 300,
      y: window.innerHeight / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.7) * 14,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 12
    }));
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.3;
        particle.rotation += particle.rSpeed;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 1600);
        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        ctx.restore();
      });
      if (elapsed < 1600) requestAnimationFrame(animate);
      else canvas.remove();
    };
    animate();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return date.getFullYear() === now.getFullYear()
      ? `${date.getDate()} ${m[date.getMonth()]}`
      : `${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear()}`;
  }

  function getSortedShortcuts(filter) {
    let list = [...shortcuts];
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(s =>
        s.trigger.toLowerCase().includes(q) ||
        s.expansion.toLowerCase().includes(q) ||
        (s.label && s.label.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      const au = a.usageCount || 0;
      const bu = b.usageCount || 0;
      if (au > 0 && bu === 0) return -1;
      if (bu > 0 && au === 0) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return list;
  }

  function isInsideMenu(el) {
    return menuState.element && menuState.element.contains(el);
  }

  function isInsideSidebar(el) {
    return sidebarEl && sidebarEl.contains(el);
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      return ['text', 'email', 'search', 'url', 'tel', ''].includes(t) && !el.readOnly && !el.disabled;
    }
    return el.isContentEditable && el.contentEditable !== 'false';
  }

  function getTextBeforeCursor(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return { type: 'input', text: el.value.substring(0, el.selectionStart) };
    }
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.startContainer, range.startOffset);
      return { type: 'contenteditable', text: pre.toString() };
    }
    return null;
  }

  // =============================================
  // CREATE MENU (once)
  // =============================================
  function createMenu() {
    if (menuState.element) return;
    injectStyles();

    const menu = document.createElement('div');
    menu.id = 'textblitz-menu';

    menu.innerHTML = `
      <div class="tb-header">
        <span class="tb-logo">ColixAI</span>
        <div class="tb-search-wrap">
          <input type="text" id="tb-search" placeholder="Filter shortcuts..." autocomplete="off" spellcheck="false">
        </div>
      </div>
      <div class="tb-list" id="tb-list"></div>
      <div class="tb-footer">
        <div class="tb-hints">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Select</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    `;

    document.body.appendChild(menu);

    menuState.element = menu;
    menuState.searchInput = menu.querySelector('#tb-search');
    menuState.listEl = menu.querySelector('#tb-list');

    // ------------------------------------------
    // SEARCH INPUT — typing handler
    // ------------------------------------------
    menuState.searchInput.addEventListener('input', function () {
      menuState.filterText = this.value;
      menuState.selectedIndex = 0;
      renderItems();
    });

    // ------------------------------------------
    // SEARCH INPUT — keyboard navigation
    // ------------------------------------------
    menuState.searchInput.addEventListener('keydown', function (e) {
      const sorted = getSortedShortcuts(menuState.filterText);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (sorted.length > 0) {
          menuState.selectedIndex = (menuState.selectedIndex + 1) % sorted.length;
          highlightSelected();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (sorted.length > 0) {
          menuState.selectedIndex = (menuState.selectedIndex - 1 + sorted.length) % sorted.length;
          highlightSelected();
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (sorted.length > 0 && sorted[menuState.selectedIndex]) {
          doSelect(sorted[menuState.selectedIndex]);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        closeMenu();
        return;
      }
    });

    // ------------------------------------------
    // PREVENT menu clicks from bubbling to page
    // but do NOT block internal menu interactions
    // ------------------------------------------
    menu.addEventListener('mousedown', function (e) {
      // Prevent blur on the original trigger element
      e.preventDefault();
    });
  }

  // =============================================
  // RENDER LIST ITEMS
  // =============================================
  function renderItems() {
    const sorted = getSortedShortcuts(menuState.filterText);

    if (sorted.length === 0) {
      menuState.listEl.innerHTML = `
        <div class="tb-empty">
          <div class="tb-empty-icon">🔍</div>
          ${menuState.filterText ? 'No matching shortcuts' : 'No shortcuts yet'}
        </div>
      `;
      return;
    }

    if (menuState.selectedIndex >= sorted.length) {
      menuState.selectedIndex = 0;
    }

    menuState.listEl.innerHTML = sorted.map((s, i) => {
      const preview = s.expansion.replace(/\n/g, ' ');
      const short = preview.length > 80 ? preview.substring(0, 80) + '...' : preview;
      const active = i === menuState.selectedIndex ? 'tb-active' : '';

      return `
        <div class="tb-item ${active}" data-idx="${i}" data-id="${s.id}">
          <div class="tb-item-row">
            <div class="tb-item-left">
              <span class="tb-trigger">${escapeHtml(s.trigger)}</span>
              ${s.label ? `<span class="tb-label">${escapeHtml(s.label)}</span>` : ''}
            </div>
            <span class="tb-date">${formatDate(s.updatedAt)}</span>
          </div>
          <div class="tb-preview">${escapeHtml(stripHtml(short))}</div>
        </div>
      `;
    }).join('');

    // Click handlers
    menuState.listEl.querySelectorAll('.tb-item').forEach(item => {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = this.dataset.id;
        const shortcut = shortcuts.find(s => s.id === id);
        if (shortcut) doSelect(shortcut);
      });

      item.addEventListener('mouseenter', function () {
        menuState.selectedIndex = parseInt(this.dataset.idx);
        highlightSelected();
      });
    });
  }

  // =============================================
  // HIGHLIGHT SELECTED ITEM
  // =============================================
  function highlightSelected() {
    const items = menuState.listEl.querySelectorAll('.tb-item');
    items.forEach((item, i) => {
      item.classList.toggle('tb-active', i === menuState.selectedIndex);
    });

    const active = menuState.listEl.querySelector('.tb-item.tb-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // =============================================
  // CURSOR COORDINATES
  // =============================================
  function getCursorXY(el) {
    // ContentEditable
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const span = document.createElement('span');
        span.textContent = '\u200b';
        range.insertNode(span);
        const rect = span.getBoundingClientRect();
        const x = rect.left;
        const y = rect.bottom + 4;
        span.remove();
        if (rect.height > 0) return { x, y };
      }
    }

    // Input / Textarea — mirror technique
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      try {
        const mirror = document.createElement('div');
        const cs = getComputedStyle(el);
        const props = [
          'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
          'wordSpacing', 'textTransform', 'paddingTop', 'paddingRight',
          'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
          'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'lineHeight', 'textIndent'
        ];
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = el.tagName === 'INPUT' ? 'pre' : 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        props.forEach(p => { mirror.style[p] = cs[p]; });
        if (el.tagName !== 'INPUT') mirror.style.width = cs.width;

        mirror.textContent = el.value.substring(0, el.selectionStart);
        const marker = document.createElement('span');
        marker.textContent = '|';
        mirror.appendChild(marker);
        document.body.appendChild(mirror);

        const elRect = el.getBoundingClientRect();
        const mkRect = marker.getBoundingClientRect();
        const mrRect = mirror.getBoundingClientRect();
        document.body.removeChild(mirror);

        const lh = parseInt(cs.lineHeight) || parseInt(cs.fontSize) * 1.2;
        return {
          x: elRect.left + (mkRect.left - mrRect.left),
          y: elRect.top + (mkRect.top - mrRect.top) + lh + 4
        };
      } catch (e) { }
    }

    // Fallback
    const r = el.getBoundingClientRect();
    return { x: r.left + 10, y: r.bottom + 4 };
  }

  // =============================================
  // OPEN MENU
  // =============================================
  function openMenu(el, type) {
    if (menuState.visible) return;

    createMenu();

    menuState.triggerElement = el;
    menuState.triggerType = type;
    menuState.filterText = '';
    menuState.selectedIndex = 0;
    menuState.justOpened = true;
    menuState.savedInputCursor = -1;
    menuState.savedCERange = null;

    // Snapshot cursor position NOW, before focus moves to the search box
    if (type === 'input') {
      menuState.savedInputCursor = el.selectionStart;
    } else if (type === 'contenteditable') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        menuState.savedCERange = sel.getRangeAt(0).cloneRange();
      }
    }

    menuState.searchInput.value = '';

    renderItems();

    // Position
    const pos = getCursorXY(el);
    const mw = 380, mh = 340, pad = 8;
    const vw = window.innerWidth, vh = window.innerHeight;

    let left = pos.x;
    if (left + mw + pad > vw) left = vw - mw - pad;
    if (left < pad) left = pad;

    let top = pos.y;
    if (top + mh + pad > vh) top = pos.y - mh - 30;
    if (top < pad) top = pad;

    menuState.element.style.left = left + 'px';
    menuState.element.style.top = top + 'px';

    // Show
    menuState.element.classList.add('tb-open');
    menuState.visible = true;

    // Focus search with delay
    setTimeout(() => {
      menuState.searchInput.focus({ preventScroll: true });
      menuState.justOpened = false;
    }, 60);

    // console.log('ColixAI: Menu opened');
  }

  // =============================================
  // CLOSE MENU
  // =============================================
  function closeMenu() {
    if (!menuState.visible) return;

    menuState.element.classList.remove('tb-open');
    menuState.visible = false;
    menuState.justOpened = false;
    menuState.filterText = '';

    // Return focus to original element
    if (menuState.triggerElement) {
      try { menuState.triggerElement.focus({ preventScroll: true }); } catch (e) { }
    }

    // console.log('ColixAI: Menu closed');
  }

  // =============================================
  // SELECT A SHORTCUT FROM MENU
  // =============================================
  function doSelect(shortcut) {
    const el = menuState.triggerElement;
    const type = menuState.triggerType;

    if (!el) { closeMenu(); return; }

    // console.log('ColixAI: Selected', shortcut.trigger);

    menuState.lockInput = true;
    closeMenu();

    setTimeout(() => {
      el.focus({ preventScroll: true });

      // Replace tokens then insert
      replaceTokens(shortcut.expansion, function (expandedText) {
        const processedShortcut = { ...shortcut, expansion: expandedText };

        setTimeout(() => {
          if (type === 'input') {
            menuInsertInput(el, processedShortcut);
          } else if (type === 'contenteditable') {
            menuInsertCE(el, processedShortcut);
          }
          triggerWebConfetti();

          chrome.storage.local.get({ shortcuts: [] }, function (result) {
            const all = result.shortcuts;
            const idx = all.findIndex(s => s.id === shortcut.id);
            if (idx !== -1) {
              all[idx].usageCount = (all[idx].usageCount || 0) + 1;
              all[idx].updatedAt = new Date().toISOString();
              chrome.storage.local.set({ shortcuts: all });
            }
          });

          setTimeout(() => { menuState.lockInput = false; }, 150);
        }, 30);
      });
    }, 50);
  }

  // =============================================
  // MENU INSERT — Input/Textarea
  // =============================================
  function menuInsertInput(el, shortcut) {
    // Always plain text for regular inputs/textareas — strip any HTML tags
    const plainText = htmlToPlainText(shortcut.expansion);

    const val = el.value;
    // Use the saved cursor position from when // was typed, not the current one
    // (focus moved to search box and back, so selectionStart is unreliable)
    const cursor = menuState.savedInputCursor >= 0 ? menuState.savedInputCursor : el.selectionStart;
    const before = val.substring(0, cursor);
    const idx = before.lastIndexOf('//');

    if (idx === -1) return;

    const pre = val.substring(0, idx);
    const post = val.substring(cursor);
    const newVal = pre + plainText + post;

    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, newVal);
    else el.value = newVal;

    const nc = pre.length + plainText.length;
    el.setSelectionRange(nc, nc);

    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // =============================================
  // MENU INSERT — ContentEditable
  // =============================================
  function menuInsertCE(el, shortcut) {
    // contenteditable: insert as HTML so bold/italic/underline render correctly
    const sel = window.getSelection();
    if (!sel) return;

    // Restore the saved range from when // was typed.
    // After closeMenu() refocused the element, getSelection() may have no range
    // or point to the wrong position — so we always use the saved snapshot.
    const savedRange = menuState.savedCERange;
    if (!savedRange) return;

    sel.removeAllRanges();
    sel.addRange(savedRange);

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent;
    const offset = range.startOffset;
    const before = text.substring(0, offset);
    const idx = before.lastIndexOf('//');

    if (idx === -1) return;

    // Remove the '//' from the text node
    const pre = text.substring(0, idx);
    const post = text.substring(offset);
    node.textContent = pre + post;

    // Place cursor right where // was
    const nr = document.createRange();
    nr.setStart(node, pre.length);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);

    // Insert the stored HTML (preserves <b>, <i>, <u> and newlines)
    document.execCommand('insertHTML', false, shortcut.expansion);

    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // =============================================
  // DIRECT SHORTCUT MATCHING (typing -hbd etc)
  // =============================================
  let formPopup = null;
  let formPopupRange = null;
  let sidebarHiddenForForm = false;

  function findFormMatch(textBefore) {
    return forms.find(f => f.trigger && textBefore && textBefore.endsWith(f.trigger)) || null;
  }

  function closeFormPopup() {
    if (formPopup) { formPopup.remove(); formPopup = null; }
    formPopupRange = null;
    sidebarHiddenForForm = false;
  }

  function openFormPopup(el, form, savedRange = null, removeTrigger = true) {
    closeFormPopup();
    const currentSelection = window.getSelection();
    formPopupRange = savedRange || (currentSelection && currentSelection.rangeCount ? currentSelection.getRangeAt(0).cloneRange() : null);
    const popup = document.createElement('div');
    popup.id = 'tb-form-popup';
    popup.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(15,23,42,.42);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    popup.innerHTML = `<div id="tb-form-modal" style="width:min(420px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #e2e2e2;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.28);padding:22px;box-sizing:border-box;">` +
      `<div style="font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:5px;">${escapeHtml(form.label || form.template || 'Fill Form')}</div><div style="font-size:12px;color:#777;margin-bottom:16px;">Fill any fields you need, then insert the form.</div><form id="tb-form-fields">${(form.fields || []).map((field, i) => { const multi = /message|notes|address|concern|medication|experience|topic/i.test(field); return `<label style="display:block;font-size:12px;font-weight:600;color:#444;margin:0 0 10px;">${escapeHtml(field)}<${multi ? 'textarea' : 'input'} data-field-index="${i}" ${multi ? 'rows="3"' : 'type="text"'} style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #ddd;border-radius:7px;font:inherit;font-weight:400;resize:vertical;"></${multi ? 'textarea' : 'input'}></label>`; }).join('')}<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;"><button type="button" id="tb-form-cancel" style="padding:9px 14px;border:1px solid #ddd;background:#fff;border-radius:7px;cursor:pointer;">Cancel</button><button type="submit" style="padding:9px 14px;border:0;background:#1a1a2e;color:#fff;border-radius:7px;cursor:pointer;">Insert Form</button></div><div id="tb-form-error" style="display:none;color:#c0392b;font-size:12px;margin-top:8px;"></div></form></div>`;
    document.documentElement.appendChild(popup); formPopup = popup;
    popup.addEventListener('mousedown', (event) => { if (event.target === popup) closeFormPopup(); });
    popup.querySelector('#tb-form-cancel').addEventListener('click', closeFormPopup);
    popup.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = [...popup.querySelectorAll('[data-field-index]')].map(input => input.value.trim());
      if (!values.some(Boolean)) { const error = popup.querySelector('#tb-form-error'); error.textContent = 'Please fill in at least one field before inserting the form.'; error.style.display = 'block'; return; }
      const sel = window.getSelection();
      if (!sel || !formPopupRange) { closeFormPopup(); return; }
      sel.removeAllRanges(); sel.addRange(formPopupRange);
      const range = sel.getRangeAt(0);
      if (removeTrigger) {
        let node = range.startContainer;
        let idx = node.nodeType === Node.TEXT_NODE ? node.textContent.substring(0, range.startOffset).lastIndexOf(form.trigger) : -1;

        if (node.nodeType !== Node.TEXT_NODE || idx < 0) {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let candidate;
          while (walker.nextNode()) {
            const textNode = walker.currentNode;
            const found = textNode.textContent.lastIndexOf(form.trigger);
            if (found >= 0) { candidate = textNode; idx = found; }
          }
          node = candidate;
        }

        if (!node || idx < 0) { closeFormPopup(); return; }
        const triggerRange = document.createRange();
        triggerRange.setStart(node, idx);
        triggerRange.setEnd(node, idx + form.trigger.length);
        triggerRange.deleteContents();
        triggerRange.collapse(true);
        sel.removeAllRanges(); sel.addRange(triggerRange);
      } else {
        range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      }
      const html = (form.fields || []).map((field, i) => values[i] ? `<strong>${escapeHtml(field)}:</strong> ${escapeHtml(values[i]).replace(/\n/g, '<br>')}<br>` : '').join('').replace(/<br>$/, '');
      document.execCommand('insertHTML', false, html);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      chrome.storage.local.get({ forms: [] }, result => { const all = result.forms; const item = all.find(f => f.id === form.id); if (item) { item.usageCount = (item.usageCount || 0) + 1; item.updatedAt = new Date().toISOString(); chrome.storage.local.set({ forms: all }); } });
      closeFormPopup();
    });
  }

  function findDirectMatch(textBefore) {
    if (!textBefore || shortcuts.length === 0) return null;
    for (const s of shortcuts) {
      if (!s.trigger) continue;
      if (textBefore.endsWith(s.trigger)) {
        const ch = textBefore[textBefore.length - s.trigger.length - 1];
        if (/^[^a-zA-Z0-9]/.test(s.trigger) || !ch || /[\s\n\r]/.test(ch)) {
          return s;
        }
      }
    }
    return null;
  }

  function directExpandInput(el, shortcut, savedCursor = null) {
    // Always plain text for regular inputs/textareas — strip any HTML tags
    const plainText = htmlToPlainText(shortcut.expansion);

    const cursor = Number.isInteger(savedCursor) ? savedCursor : el.selectionStart;
    const val = el.value;
    const before = val.substring(0, cursor);
    if (!before.endsWith(shortcut.trigger)) return;

    const pre = val.substring(0, cursor - shortcut.trigger.length);
    const post = val.substring(cursor);
    const newVal = pre + plainText + post;

    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, newVal);
    else el.value = newVal;

    el.setSelectionRange(pre.length + plainText.length, pre.length + plainText.length);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function directExpandCE(el, shortcut, savedRange = null) {
    // contenteditable: insert as HTML so bold/italic/underline render correctly
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRange) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    if (sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent;
    const offset = range.startOffset;
    const before = text.substring(0, offset);
    if (!before.endsWith(shortcut.trigger)) return;

    // Remove the trigger text from the node
    const pre = before.substring(0, before.length - shortcut.trigger.length);
    const post = text.substring(offset);
    node.textContent = pre + post;

    // Place cursor right after removed trigger
    const nr = document.createRange();
    nr.setStart(node, pre.length);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);

    // Insert stored HTML (preserves <b>, <i>, <u> and newlines)
    document.execCommand('insertHTML', false, shortcut.expansion);

    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // =============================================
  // MAIN INPUT HANDLER
  // =============================================
  function onInput(e) {
    const el = e.target;

    // Skip if locked or inside menu
    if (menuState.lockInput) return;
    if (isInsideMenu(el)) return;
    if (!isEditable(el)) return;
    if (shortcuts.length === 0) return;

    const info = getTextBeforeCursor(el);
    if (!info) return;

    const formMatch = findFormMatch(info.text);
    if (formMatch) {
      if (info.type !== 'contenteditable') {
        showTbToast('Forms can only be inserted into rich-text editors.');
        return;
      }
      if (!formPopup) openFormPopup(el, formMatch);
      return;
    }

    // ---- Menu trigger '//' ----
    // ---- Menu trigger '//' (disabled for now) ----
    if (ENABLE_SLASH_MENU && info.text.endsWith('//')) {
      if (!menuState.visible) {
        openMenu(el, info.type);
      }
      return;
    }

    // ---- If menu is open, don't do anything else ----
    if (menuState.visible) return;

    // ---- Direct shortcut expansion ----
    // ---- DIRECT SHORTCUT EXPANSION ----
    const match = findDirectMatch(info.text);
    if (!match) return;

    menuState.lockInput = true;

    // Save the exact insertion position before token resolution can open a
    // popup and move focus away from the webpage field.
    const savedInputCursor = info.type === 'input' ? el.selectionStart : null;
    const savedContentRange = info.type === 'contenteditable'
      ? (() => {
        const selection = window.getSelection();
        return selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      })()
      : null;

    // Replace tokens then expand
    replaceTokens(match.expansion, function (expandedText) {
      const processedShortcut = { ...match, expansion: expandedText };

      if (info.type === 'input') {
        directExpandInput(el, processedShortcut, savedInputCursor);
      } else {
        directExpandCE(el, processedShortcut, savedContentRange);
      }
      triggerWebConfetti();

      chrome.storage.local.get({ shortcuts: [] }, function (result) {
        const all = result.shortcuts;
        const idx = all.findIndex(s => s.id === match.id);
        if (idx !== -1) {
          all[idx].usageCount = (all[idx].usageCount || 0) + 1;
          all[idx].updatedAt = new Date().toISOString();
          chrome.storage.local.set({ shortcuts: all });
        }
      });

      setTimeout(() => { menuState.lockInput = false; }, 100);
    });
  }

  // =============================================
  // CLOSE ON OUTSIDE CLICK
  // =============================================
  document.addEventListener('mousedown', function (e) {
    if (!menuState.visible) return;
    if (menuState.justOpened) return;
    if (isInsideMenu(e.target)) return;
    closeMenu();
  }, true);

  // =============================================
  // CLOSE ON ESCAPE (when focus is NOT in menu)
  // =============================================
  document.addEventListener('keydown', function (e) {
    if (formPopup && e.key === 'Escape') {
      e.preventDefault();
      closeFormPopup();
      return;
    }
    if (!menuState.visible) return;
    if (isInsideMenu(document.activeElement)) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    }
  }, true);

  // =============================================
  // CLOSE ON PAGE SCROLL
  // =============================================
  window.addEventListener('scroll', function () {
    if (menuState.visible && !menuState.justOpened) closeMenu();
  }, true);

  // =============================================
  // CLOSE ON WINDOW RESIZE
  // =============================================
  window.addEventListener('resize', function () {
    if (menuState.visible) closeMenu();
  });

  // =============================================
  // ATTACH INPUT LISTENER
  // =============================================
  document.addEventListener('input', onInput, true);

  // =============================================
  // IFRAME SUPPORT
  // =============================================
  function attachIframe(iframe) {
    iframe.addEventListener('load', function () {
      try {
        const doc = iframe.contentDocument;
        if (doc) doc.addEventListener('input', onInput, true);
      } catch (e) { }
    });
  }

  if (document.body) {
    new MutationObserver(function (muts) {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.tagName === 'IFRAME') attachIframe(n);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }

  document.querySelectorAll('iframe').forEach(attachIframe);

  // =============================================
  // INIT
  // =============================================
  loadShortcuts();
  // console.log('ColixAI: Ready ✓');

  // =============================================
  // TOKEN REPLACEMENT
  // =============================================
  function replaceTokens(text, callback) {
    // Check if text contains any tokens
    if (!text.includes('{{')) {
      callback(text);
      return;
    }

    chrome.runtime.sendMessage({ action: 'getProfileInfo' }, function (profile) {
      const now = new Date();
      const date = now.toLocaleDateString();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const pad = value => String(value).padStart(2, '0');
      const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekdayLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const formatDateTime = format => {
        const hours24 = now.getHours();
        const hours12 = hours24 % 12 || 12;
        const replacements = {
          YYYY: now.getFullYear(), MMMM: monthLong[now.getMonth()], MMM: monthShort[now.getMonth()],
          dddd: weekdayLong[now.getDay()], ddd: weekdayShort[now.getDay()], MM: pad(now.getMonth() + 1),
          DD: pad(now.getDate()), D: now.getDate(), HH: pad(hours24), hh: pad(hours12),
          mm: pad(now.getMinutes()), ss: pad(now.getSeconds()), a: hours24 >= 12 ? 'pm' : 'am'
        };
        return format.replace(/YYYY|MMMM|MMM|dddd|ddd|MM|DD|HH|hh|mm|ss|D|a/g, token => replacements[token]);
      };

      const finish = (result) => {
        result = result.replace(/\{\{snippet:([^}]+)\}\}/g, (_, snippetId) => {
          const imported = shortcuts.find(shortcut => shortcut.id === snippetId);
          return imported ? (imported.expansion || '') : '';
        });
        // Imported snippets can contain profile tokens of their own, so
        // resolve them after the imported content has been injected.
        result = result.replace(/\{\{first_name\}\}/g, profile?.firstName || '');
        result = result.replace(/\{\{last_name\}\}/g, profile?.lastName || '');
        result = result.replace(/\{\{email\}\}/g, profile?.email || '');
        result = result.replace(/\{\{date_time:([^}]+)\}\}/g, (_, format) => formatDateTime(format));
        result = result.replace(/\{\{date\}\}/g, date);
        result = result.replace(/\{\{time\}\}/g, time);
        result = result.replace(/\{\{formula:([^|}]+)(?:\|([^}]*))?\}\}/g, (_, expression, format) => {
          const value = evaluateNumericExpression(expression);
          return value === null ? '' : formatFormulaResult(value, format || '');
        });
        resolveInputFields(result, callback);
      };

      if (chrome.runtime.lastError || !profile) {
        // Remove tokens if no profile available
        let result = text;
        result = result.replace(/\{\{first_name\}\}/g, '');
        result = result.replace(/\{\{last_name\}\}/g, '');
        result = result.replace(/\{\{email\}\}/g, '');
        result = result.replace(/\{\{clipboard\}\}/g, '');
        finish(result);
        return;
      }

      let result = text;
      result = result.replace(/\{\{first_name\}\}/g, profile.firstName || '');
      result = result.replace(/\{\{last_name\}\}/g, profile.lastName || '');
      result = result.replace(/\{\{email\}\}/g, profile.email || '');

      if (result.includes('{{clipboard}}')) {
        const clipboardPromise = navigator.clipboard?.readText();
        if (clipboardPromise) {
          clipboardPromise.then(clipboard => {
            finish(result.replace(/\{\{clipboard\}\}/g, clipboard || ''));
          }).catch(() => finish(result.replace(/\{\{clipboard\}\}/g, '')));
        } else {
          finish(result.replace(/\{\{clipboard\}\}/g, ''));
        }
      } else {
        finish(result);
      }
    });
  }

  // Safe arithmetic evaluator for formula fields. It accepts only numbers,
  // decimal points, parentheses, and + - * / operators; it never executes JS.
  function evaluateNumericExpression(expression) {
    const source = String(expression).replace(/\s+/g, '');
    if (!source || !/^[0-9+\-*/().]+$/.test(source)) return null;
    let index = 0;

    const parseNumber = () => {
      const start = index;
      while (index < source.length && /[0-9.]/.test(source[index])) index++;
      const number = Number(source.slice(start, index));
      return Number.isFinite(number) ? number : null;
    };
    const parseFactor = () => {
      if (source[index] === '+') { index++; return parseFactor(); }
      if (source[index] === '-') { index++; const value = parseFactor(); return value === null ? null : -value; }
      if (source[index] === '(') {
        index++;
        const value = parseExpression();
        if (source[index] !== ')') return null;
        index++;
        return value;
      }
      return parseNumber();
    };
    const parseTerm = () => {
      let value = parseFactor();
      if (value === null) return null;
      while (source[index] === '*' || source[index] === '/') {
        const operator = source[index++];
        const right = parseFactor();
        if (right === null || (operator === '/' && right === 0)) return null;
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    };
    function parseExpression() {
      let value = parseTerm();
      if (value === null) return null;
      while (source[index] === '+' || source[index] === '-') {
        const operator = source[index++];
        const right = parseTerm();
        if (right === null) return null;
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    const value = parseExpression();
    return index === source.length && Number.isFinite(value) ? value : null;
  }

  function formatFormulaResult(value, format) {
    if (format === 'integer') return String(Math.round(value));
    if (format === '2-decimals') return value.toFixed(2);
    if (format === 'currency') {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  }

  function resolveInputFields(text, callback) {
    const fieldPattern = /\{\{(field|textarea|select|radio):([^|}]+)((?:\|[^}]*)*)\}\}/g;
    const fields = [];
    const seen = new Set();
    let match;

    while ((match = fieldPattern.exec(text))) {
      const token = match[0];
      if (seen.has(token)) continue;
      seen.add(token);
      const values = match[3] ? match[3].split('|').slice(1).map(value => value.trim()).filter(Boolean) : [];
      fields.push({
        token,
        kind: match[1],
        label: match[2].trim() || (['select', 'radio'].includes(match[1]) ? 'Choose an option' : 'Text field'),
        defaultValue: values[0] || '',
        options: values
      });
    }

    if (!fields.length) {
      callback(text);
      return;
    }

    // Prefer a real Chrome popup window. If it cannot be created (for example
    // while the browser is shutting down), continue with the existing in-page
    // implementation below so shortcut insertion remains available.
    const requestId = `dynamic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingDynamicFields.set(requestId, {
      text,
      fields,
      complete: callback,
      cancel: () => { menuState.lockInput = false; }
    });
    let fallbackTimer = setTimeout(() => {
      if (!pendingDynamicFields.has(requestId)) return;
      pendingDynamicFields.delete(requestId);
      renderInPagePopup();
    }, 2500);
    chrome.runtime.sendMessage({ action: 'openDynamicFieldWindow', requestId, text, fields }, response => {
      if (chrome.runtime.lastError || !response?.success) {
        clearTimeout(fallbackTimer);
        if (pendingDynamicFields.delete(requestId)) renderInPagePopup();
        return;
      }
      // The native window opened successfully. Do not let the fallback timer
      // open a second in-page popup while the user is filling this window.
      clearTimeout(fallbackTimer);
    });

    function renderInPagePopup() {

    const escapeHtml = value => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const overlay = document.createElement('div');
    overlay.id = 'textblitz-input-fields';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(15,23,42,.42);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    let previewHtml = text.replace(/\n/g, '<br>');
    fields.forEach((field, index) => {
      let control;
      if (field.kind === 'select') {
        control = `<select data-field-index="${index}" aria-label="${escapeHtml(field.label)}" style="display:inline-block;max-width:200px;box-sizing:border-box;margin:0 3px;padding:5px 7px;border:1px solid #b9c0a0;border-radius:2px;outline:none;background:#ffffc9;color:#243029;font:inherit;font-size:13px;vertical-align:middle;">${field.options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}</select>`;
      } else if (field.kind === 'radio') {
        control = `<span data-field-index="${index}" style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 3px;vertical-align:middle;">${field.options.map((option, optionIndex) => `<label style="display:inline-flex;align-items:center;gap:3px;font-size:13px;white-space:nowrap;"><input type="radio" data-field-index="${index}" name="tb-radio-${index}" value="${escapeHtml(option)}" ${optionIndex === 0 ? 'checked' : ''}>${escapeHtml(option)}</label>`).join('')}</span>`;
      } else if (field.kind === 'textarea') {
        control = `<textarea data-field-index="${index}" aria-label="${escapeHtml(field.label)}" placeholder="${escapeHtml(field.label)}" rows="2" style="display:inline-block;width:min(240px,60vw);box-sizing:border-box;margin:0 3px;padding:5px 7px;border:1px solid #b9c0a0;border-radius:2px;outline:none;resize:vertical;background:#ffffc9;color:#243029;font:inherit;font-size:13px;vertical-align:middle;">${escapeHtml(field.defaultValue)}</textarea>`;
      } else {
        control = `<input data-field-index="${index}" type="text" value="${escapeHtml(field.defaultValue)}" placeholder="${escapeHtml(field.label)}" aria-label="${escapeHtml(field.label)}" style="display:inline-block;width:min(170px,45vw);box-sizing:border-box;margin:0 3px;padding:5px 7px;border:1px solid #b9c0a0;border-radius:2px;outline:none;background:#ffffc9;color:#243029;font:inherit;font-size:13px;vertical-align:middle;">`;
      }
      previewHtml = previewHtml.split(field.token).join(control);
    });
    overlay.innerHTML = `<div data-field-window style="display:flex;flex-direction:column;width:min(535px,calc(100vw - 40px));height:min(610px,calc(100vh - 40px));box-sizing:border-box;background:#fff;border:1px solid #c8c8c8;box-shadow:0 18px 60px rgba(0,0,0,.35);">
      <div data-field-titlebar style="display:flex;align-items:center;justify-content:space-between;height:34px;flex:0 0 34px;padding:0 9px;background:#09282a;color:#fff;font-size:13px;font-weight:600;user-select:none;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Fill shortcut fields</span>
        <span style="display:flex;align-items:center;gap:2px;"><button type="button" data-field-minimize aria-label="Minimize" style="width:28px;height:26px;border:0;background:transparent;color:#fff;cursor:pointer;font-size:16px;line-height:1;">−</button><button type="button" data-field-cancel aria-label="Close" style="width:28px;height:26px;border:0;background:transparent;color:#fff;cursor:pointer;font-size:19px;line-height:1;">&times;</button></span>
      </div>
      <form data-field-form style="display:flex;flex:1;min-height:0;flex-direction:column;">
        <div data-field-content style="flex:1;overflow:auto;padding:20px;color:#1e2a22;font-size:14px;line-height:2.2;white-space:normal;">${previewHtml}</div>
        <div data-field-footer style="display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #edf0ed;background:#fff;"><button type="button" data-field-cancel style="padding:9px 16px;border:0;background:#fff;color:#009fb4;border-radius:5px;cursor:pointer;font-weight:600;">Cancel</button><button type="submit" style="padding:9px 16px;border:0;background:#08a9bd;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;box-shadow:0 3px 8px rgba(8,169,189,.25);">Insert</button></div>
      </form>
    </div>`;

    const close = (cancelled = false) => {
      overlay.remove();
      if (cancelled) menuState.lockInput = false;
    };
    overlay.querySelectorAll('[data-field-cancel]').forEach(button => button.addEventListener('click', () => close(true)));
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(true); });
    overlay.querySelector('[data-field-minimize]').addEventListener('click', () => {
      const windowEl = overlay.querySelector('[data-field-window]');
      const form = overlay.querySelector('[data-field-form]');
      const minimized = windowEl.classList.toggle('tb-field-minimized');
      form.style.display = minimized ? 'none' : 'flex';
      windowEl.style.height = minimized ? '34px' : 'min(610px,calc(100vh - 40px))';
    });
    const fieldWindow = overlay.querySelector('[data-field-window]');
    const titlebar = overlay.querySelector('[data-field-titlebar]');
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    titlebar.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = fieldWindow.getBoundingClientRect();
      dragging = true;
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      fieldWindow.style.position = 'fixed';
      fieldWindow.style.left = `${rect.left}px`;
      fieldWindow.style.top = `${rect.top}px`;
      fieldWindow.style.margin = '0';
      titlebar.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    titlebar.addEventListener('pointermove', event => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - fieldWindow.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - fieldWindow.offsetHeight);
      const left = Math.min(Math.max(0, event.clientX - dragOffsetX), maxLeft);
      const top = Math.min(Math.max(0, event.clientY - dragOffsetY), maxTop);
      fieldWindow.style.left = `${left}px`;
      fieldWindow.style.top = `${top}px`;
    });
    const stopDragging = () => { dragging = false; };
    titlebar.addEventListener('pointerup', stopDragging);
    titlebar.addEventListener('pointercancel', stopDragging);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    });
    overlay.querySelector('[data-field-form]').addEventListener('submit', event => {
      event.preventDefault();
      const values = fields.map((field, index) => {
        const selector = field.kind === 'radio'
          ? `[data-field-index="${index}"]:checked`
          : `[data-field-index="${index}"]`;
        return escapeHtml(overlay.querySelector(selector)?.value || '');
      });
      let expanded = text;
      fields.forEach((field, index) => {
        expanded = expanded.split(field.token).join(values[index]);
      });
      close();
      callback(expanded);
    });

    document.documentElement.appendChild(overlay);
    setTimeout(() => overlay.querySelector('[data-field-index]')?.focus(), 40);
    }
  }

  // =============================================
  // FAKE DRAG ANIMATION — flies a clone of the clicked
  // shortcut item to the target input, then inserts
  // =============================================
  function animateFlyToInput(itemEl, targetEl, onComplete) {
    const startRect = itemEl.getBoundingClientRect();
    const endRect = targetEl.getBoundingClientRect();

    const clone = itemEl.cloneNode(true);
    clone.classList.add('tb-fly-clone');
    clone.style.cssText = `
      position: fixed;
      top: ${startRect.top}px;
      left: ${startRect.left}px;
      width: ${startRect.width}px;
      z-index: 2147483647;
      pointer-events: none;
      margin: 0;
      transition: top 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                  left 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                  width 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                  opacity 0.45s ease,
                  transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
      opacity: 1;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    `;
    document.documentElement.appendChild(clone);

    // Target the center of the input/field
    const targetTop = endRect.top + (endRect.height / 2) - (startRect.height / 4);
    const targetLeft = endRect.left + Math.min(endRect.width, 160) / 2 - (startRect.width / 6);

    requestAnimationFrame(() => {
      clone.style.top = `${targetTop}px`;
      clone.style.left = `${targetLeft}px`;
      clone.style.width = `${Math.min(startRect.width, 140)}px`;
      clone.style.transform = 'scale(0.55)';
      clone.style.opacity = '0';
    });

    // Quick highlight pulse on the target field
    const prevOutline = targetEl.style.outline;
    const prevOutlineOffset = targetEl.style.outlineOffset;
    targetEl.style.transition = 'outline-color 0.3s ease';
    targetEl.style.outline = '2px solid #1a1a2e';
    targetEl.style.outlineOffset = '2px';

    setTimeout(() => {
      clone.remove();
      targetEl.style.outline = prevOutline;
      targetEl.style.outlineOffset = prevOutlineOffset;
      onComplete();
    }, 200);
  }


  // =============================================
  // SIDEBAR INSERT (plain text for inputs, HTML for contenteditable)
  // =============================================
  function sidebarInsert(el, shortcut, savedRange = null) {
    if (!el || !document.contains(el)) return;
    if (sidebarEl && sidebarEl.contains(el)) return;
    el.focus();

    replaceTokens(shortcut.expansion, function (expandedText) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const plainText = htmlToPlainText(expandedText);
        let start, end;
        try {
          start = el.selectionStart ?? el.value.length;
          end = el.selectionEnd ?? el.value.length;
        } catch (err) {
          start = el.value.length;
          end = el.value.length;
        }
        const val = el.value;
        const newVal = val.substring(0, start) + plainText + val.substring(end);

        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) setter.set.call(el, newVal);
        else el.value = newVal;

        const nc = start + plainText.length;
        try {
          el.setSelectionRange(nc, nc);
        } catch (err) {
          // Some input types (email, number, etc.) don't support selection ranges
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        const sel = window.getSelection();
        if (!sel) return;
        if (savedRange) {
          try {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          } catch (err) {
            savedRange = null;
          }
        }
        if (!savedRange && !(sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer))) {
          // No active selection inside el — place cursor at end and insert
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Restore the target range before inserting so rich HTML formatting
        // is preserved after the sidebar temporarily owns focus.
        document.execCommand('insertHTML', false, expandedText);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      triggerWebConfetti();

      // Bump usage count
      chrome.storage.local.get({ shortcuts: [] }, function (result) {
        const all = result.shortcuts;
        const idx = all.findIndex(s => s.id === shortcut.id);
        if (idx !== -1) {
          all[idx].usageCount = (all[idx].usageCount || 0) + 1;
          all[idx].updatedAt = new Date().toISOString();
          chrome.storage.local.set({ shortcuts: all });
        }
      });
    });
  }

  // =============================================
  // FLOATING LOGO + SLIDE-IN SIDEBAR
  // =============================================
  function injectSidebarStyles() {
    if (document.getElementById('textblitz-sidebar-styles')) return;
    const style = document.createElement('style');
    style.id = 'textblitz-sidebar-styles';
    style.textContent = `
      #tb-fab {
        position: fixed;
        top: 50%;
        right: 15px;
        transform: translateY(-50%);
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: 0.1s;
      }
      #tb-fab:hover { scale: 1.05; }
      #tb-fab svg { width: 22px; height: 22px; }
      #tb-fab img {
        width: 100%;
        height: 100%;
        border-radius: 100%;
        box-shadow: -2px 2px 10px rgba(0,0,0,0.2);
        object-fit: cover;
        pointer-events: none;
      }
        #tb-fab-close {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 22px;
          height: 22px;
          background: #ff4444;
          color: white;
          border-radius: 50%;
          font-size: 14px;
          display: flex;
          justify-content: center;
          align-items: center;
          text-align: center;
          cursor: pointer;
          display: none; /* show on hover */
          z-index: 99999;
        }

        #tb-fab-close:hover{
          scale: 1.2;
        }

        #tb-fab:hover #tb-fab-close {
          display: block;
        }

      #tb-sidebar {
        position: fixed;
        top: 50%;
        transform: translateY(-50%);
        right: -340px;
        width: 390px;
        height: 560px; 
        padding: 10px 0;
        border-radius: 20px;
        background: #fff;
        box-shadow: -4px 0 24px rgba(0,0,0,0.2);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: right 0.25s ease;
        display: flex;
        flex-direction: column;
      }

      #tb-sidebar.tb-sidebar-open { right: 15px; }

      .tb-sb-header {
        padding: 16px;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .tb-sb-title { font-size: 18px; font-family: monospace; font-weight: 700; color: #1a1a2e; }
      .tb-sb-tabs { display: flex; gap: 6px; padding: 10px 16px 0; flex-shrink: 0; }
      .tb-sb-tab { flex: 1; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #999; padding: 8px 4px; font-size: 12px; font-weight: 700; cursor: pointer; }
      .tb-sb-tab-active { color: #1a1a2e; border-bottom-color: #1a1a2e; }
      .tb-sb-home {
        background: none;
        border: none;
        cursor: pointer;
        color: #000;
        display: flex;
        align-items: center;
        margin-right: 4px;
        overflow: hidden;
        border-radius: 100%;
      }
      .tb-sb-home:hover { color: #555; }
      .tb-sb-home svg { width: 18px; height: 18px; }
      .tb-sb-close {
          cursor: pointer;
          color: #000;
          background: none;
          border: none;
          padding: 4px;
          display: flex;
          align-items: center;
        }
      .tb-sb-close:hover { color: #333; }
      .tb-sb-close svg { width: 20px; height: 20px; }

      .tb-sb-search-wrap { padding: 12px 16px; flex-shrink: 0; }
      #tb-sb-search {
        width: 100%;
        padding: 9px 12px;
        border: 1.5px solid #e8e8eb;
        border-radius: 8px;
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
        font-family: inherit;
        background: #fafafa;
        transition: border-color 0.15s, background 0.15s;
      }
      #tb-sb-search:focus { border-color: #1a1a2e; background: #fff; }
      #tb-sb-search::placeholder { color: #b8b8bd; }
      .tb-sb-search-btn{display: flex; justify-content: flex-end; align-items:center; margin-top: 10px; gap: 10px;}
      .tb-sb-search-btn span {font-family: monospace; font-size: 15px; text-transform: uppercase; font-weight: 600;}
      #tb-sb-add {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: none;
        background: #6c47ff;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      #tb-sb-add:hover {
        background: #5535e0;
      }

      .tb-sb-list { flex: 1; overflow-y: auto; padding: 6px 12px 16px; }
      .tb-sb-item {
        padding: 12px 12px;
        border-radius: 10px;
        cursor: pointer;
        margin-bottom: 10px;
        background: #fff;
        border: 1px solid lightgray;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
      }
      .tb-sb-item:hover {
        border-color: #e0e0e6;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transform: translateY(-1px);
      }
      .tb-sb-item:active { transform: translateY(0); }
      .tb-sb-item-trigger {
        font-size: 12px;
        font-weight: 700;
        color: #1a1a2e;
        background: #f0f0f7;
        padding: 2px 7px;
        border-radius: 5px;
      }
      .tb-sb-item-label { font-size: 11px; color: #999; margin-left: 6px; }
      .tb-sb-item-preview {
        font-size: 12.5px;
        color: #666;
        margin-top: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;
      }
      .tb-sb-empty {
        padding: 40px 16px;
        text-align: center;
        color: #bbb;
        font-size: 12.5px;
      }

      #tb-toast {
        position: fixed;
        top: 28px;
        left: 50%;
        transform: translateX(-50%) translateY(12px);
        background: #1a1a2e;
        color: #fff;
        font-size: 13px;
        padding: 10px 18px;
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        max-width: 320px;
        text-align: center;
      }
      #tb-toast.tb-toast-show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  let sidebarEl = null;
  let sidebarListEl = null;
  let sidebarSearchEl = null;

  function buildSidebar() {
    if (sidebarEl) return;
    injectSidebarStyles();

    const logo = chrome.runtime.getURL('icons/logo.png');
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'tb-sidebar';

    // Add LinkedIn Profile button if on LinkedIn
    const linkedInButtonHTML = isLinkedInProfile() ? `
      <div style="display: none; padding: 12px 16px; background: linear-gradient(135deg, #e6f2ff 0%, #f0f8ff 100%); border-bottom: 2px solid #0A66C2;">
        <button id="tb-sb-view-profile" style="
          width: 100%;
          padding: 12px 14px;
          background: linear-gradient(135deg, #0A66C2 0%, #005399 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(10, 102, 194, 0.25);
        " onmouseover="this.style.boxShadow='0 4px 12px rgba(10, 102, 194, 0.35)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(10, 102, 194, 0.25)'; this.style.transform='translateY(0)'">
          <span>👤</span> <span>View Profile</span>
        </button>
      </div>
    ` : '';

    sidebarEl.innerHTML = `
      ${linkedInButtonHTML}
      <div class="tb-sb-header">
        <button class="tb-sb-home" id="tb-sb-home" type="button" title="Open Dashboard">
          <img src=${logo} style="width: 40px;">
        </button>
        <span class="tb-sb-title">ColixAI</span>
        <button class="tb-sb-close" id="tb-sb-close" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="tb-sb-tabs" role="tablist">
        <button type="button" class="tb-sb-tab tb-sb-tab-active" data-tab="shortcuts">Shortcuts</button>
        <button type="button" class="tb-sb-tab" data-tab="forms">Forms</button>
      </div>
      <div class="tb-sb-search-wrap">
        <input type="text" id="tb-sb-search" placeholder="Search shortcuts...">
        <div class='tb-sb-search-btn'>
          <span id="tb-sb-add-label">Add shortcut</span>
          <button id="tb-sb-add" title="Add Shortcut">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="tb-sb-list" id="tb-sb-list"></div>
    `;

    sidebarEl.querySelector('#tb-sb-home').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openDashboard' });
    });

    sidebarEl.querySelector('#tb-sb-add').addEventListener('click', () => {
      const activeTab = sidebarEl.querySelector('.tb-sb-tab-active');
      chrome.runtime.sendMessage({ action: 'openDashboard', openAddNew: activeTab?.dataset.tab !== 'forms', openForm: activeTab?.dataset.tab === 'forms' });
    });

    document.documentElement.appendChild(sidebarEl);

    sidebarListEl = sidebarEl.querySelector('#tb-sb-list');
    sidebarSearchEl = sidebarEl.querySelector('#tb-sb-search');

    // Attach all event listeners
    attachSidebarEventListeners();
  }

  function renderSidebarProfile() {
    if (!sidebarEl) return;
    const profile = scrapeLinkedInProfile();

    let educationHTML = '';
    if (Array.isArray(profile.education) && profile.education.length > 0) {
      educationHTML = profile.education.map(edu =>
        `<div style="font-size: 12px; margin: 8px 0; padding: 10px; background: #ffffff; border-radius: 8px; border-left: 3px solid #0A66C2; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-weight: 700; color: #1a1a2e; margin-bottom: 2px;">${escapeHtml(edu.school)}</div>
          <div style="color: #666; font-size: 11px;">${escapeHtml(edu.degree)}</div>
        </div>`
      ).join('');
    }

    let experienceHTML = '';
    if (Array.isArray(profile.experience) && profile.experience.length > 0) {
      experienceHTML = profile.experience.map(exp =>
        `<div style="font-size: 12px; margin: 8px 0; padding: 10px; background: #ffffff; border-radius: 8px; border-left: 3px solid #0A66C2; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-weight: 700; color: #1a1a2e; margin-bottom: 2px;">${escapeHtml(exp.title)}</div>
          <div style="color: #666; font-size: 11px; margin-bottom: 2px;">${escapeHtml(exp.company)}</div>
          ${exp.duration ? `<div style="color: #999; font-size: 10px;">${escapeHtml(exp.duration)}</div>` : ''}
        </div>`
      ).join('');
    }

    const photoHTML = profile.photo && profile.photo !== 'N/A'
      ? `<img src="${profile.photo}" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 3px solid #0A66C2;">`
      : `<div style="width: 70px; height: 70px; border-radius: 50%; background: linear-gradient(135deg, #0A66C2, #005399); display: flex; align-items: center; justify-content: center; font-size: 28px; border: 3px solid #0A66C2;">👤</div>`;

    // Store original sidebar HTML
    const originalSidebarHTML = sidebarEl.innerHTML;

    // Replace entire sidebar with profile overlay
    sidebarEl.innerHTML = `
      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #fff; border-radius: 20px; display: flex; flex-direction: column; z-index: 1000; overflow: hidden;">
        <!-- Close Button Top Right -->
        <div style="position: absolute; top: 12px; right: 12px; z-index: 1001;">
          <button id="tb-profile-close" style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: none;
            background: #f0f0f5;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.2s;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Profile Header -->
        <div style="padding: 20px 16px; background: linear-gradient(135deg, #f0f8ff 0%, #e6f2ff 100%); border-bottom: 2px solid #0A66C2;">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${photoHTML}
            <div style="flex: 1;">
              <div style="font-weight: 800; font-size: 16px; color: #1a1a2e; line-height: 1.2; margin-bottom: 4px;">${escapeHtml(profile.name)}</div>
              <div style="font-size: 12px; color: #0A66C2; font-weight: 600; margin-bottom: 4px;">${escapeHtml(profile.headline)}</div>
              <div style="font-size: 11px; color: #666;">📍 ${escapeHtml(profile.location)}</div>
            </div>
          </div>
        </div>

        <!-- Content Area - Scrollable -->
        <div style="flex: 1; overflow-y: auto; padding: 16px;">
          ${educationHTML ? `
            <div style="margin-bottom: 16px;">
              <div style="font-weight: 700; font-size: 12px; color: #1a1a2e; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #0A66C2; padding-bottom: 6px;">🎓 Education</div>
              <div>${educationHTML}</div>
            </div>
          ` : ''}

          ${experienceHTML ? `
            <div style="margin-bottom: 16px;">
              <div style="font-weight: 700; font-size: 12px; color: #1a1a2e; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #0A66C2; padding-bottom: 6px;">💼 Experience</div>
              <div>${experienceHTML}</div>
            </div>
          ` : ''}

          ${!educationHTML && !experienceHTML ? `
            <div style="text-align: center; color: #999; padding: 40px 20px; font-size: 12px;">
              <div style="font-size: 32px; margin-bottom: 12px;">📋</div>
              No education or experience data available
            </div>
          ` : ''}
        </div>

        <!-- Back Button -->
        <div style="padding: 12px 16px; border-top: 1px solid #e0e0e0; background: #fafafa;">
          <button id="tb-sb-back" style="
            width: 100%;
            padding: 12px 14px;
            background: linear-gradient(135deg, #1a1a2e, #2a2a3e);
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            color: white;
            cursor: pointer;
            transition: 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          ">
            ← Back to Shortcuts
          </button>
        </div>
      </div>
    `;

    // Re-attach event listeners
    const backBtn = sidebarEl.querySelector('#tb-sb-back');
    const closeBtn = sidebarEl.querySelector('#tb-profile-close');

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Restore original sidebar HTML
        sidebarEl.innerHTML = originalSidebarHTML;
        // Re-attach all original event listeners
        attachSidebarEventListeners();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Restore original sidebar HTML
        sidebarEl.innerHTML = originalSidebarHTML;
        // Re-attach all original event listeners
        attachSidebarEventListeners();
      });
    }
  }

  // Helper to attach sidebar event listeners
  function attachSidebarEventListeners() {
    if (!sidebarEl) return;

    sidebarSearchEl = sidebarEl.querySelector('#tb-sb-search');
    sidebarListEl = sidebarEl.querySelector('#tb-sb-list');

    sidebarEl.querySelectorAll('.tb-sb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        sidebarEl.querySelectorAll('.tb-sb-tab').forEach(item => item.classList.toggle('tb-sb-tab-active', item === tab));
        sidebarSearchEl.placeholder = tab.dataset.tab === 'forms' ? 'Search forms...' : 'Search shortcuts...';
        const addLabel = sidebarEl.querySelector('#tb-sb-add-label');
        if (addLabel) addLabel.textContent = tab.dataset.tab === 'forms' ? 'Add form' : 'Add shortcut';
        renderSidebarList(sidebarSearchEl.value, tab.dataset.tab);
      });
    });

    // Profile button
    const profileBtn = sidebarEl.querySelector('#tb-sb-view-profile');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        renderSidebarProfile();
      });
    }

    // Search input
    if (sidebarSearchEl) {
      sidebarSearchEl.addEventListener('input', () => renderSidebarList(sidebarSearchEl.value));
    }

    // Close button
    const closeBtn = sidebarEl.querySelector('#tb-sb-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSidebar);
    }

    // Shortcuts list
    if (sidebarListEl) {
      sidebarListEl.addEventListener('click', (e) => {
        const item = e.target.closest('.tb-sb-item');
        if (!item) return;
        const kind = item.dataset.kind || 'shortcut';
        const entry = kind === 'form' ? forms.find(f => f.id === item.dataset.id) : shortcuts.find(s => s.id === item.dataset.id);
        if (!entry) return;

        if (!lastFocusedEl || !document.contains(lastFocusedEl)) {
          showTbToast('Please select an input field first to insert the shortcut.');
          return;
        }

        if (kind === 'form') {
          if (!lastFocusedEl.isContentEditable) {
            showTbToast('Forms can only be inserted into rich-text editors.');
            closeSidebar();
            return;
          }
          const savedRange = lastFocusedRange ? lastFocusedRange.cloneRange() : null;
          closeSidebar();
          openFormPopup(lastFocusedEl, entry, savedRange, false);
          sidebarHiddenForForm = true;
          sidebarEl.style.display = 'none';
          return;
        }

        const savedInsertRange = lastFocusedRange ? lastFocusedRange.cloneRange() : null;
        animateFlyToInput(item, lastFocusedEl, () => {
          sidebarInsert(lastFocusedEl, entry, savedInsertRange);
        });
        closeSidebar();
      });
    }
  }

  function renderSidebarList(filter, type = 'shortcuts') {
    if (!sidebarListEl) return;
    const query = (filter || '').toLowerCase();
    const source = type === 'forms' ? forms : shortcuts;
    const list = (Array.isArray(source) ? source : [])
      .filter(item => item && typeof item === 'object')
      .filter(item => {
        const trigger = String(item.trigger || '').toLowerCase();
        const label = String(item.label || '').toLowerCase();
        return !query || trigger.includes(query) || label.includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    if (list.length === 0) {
      sidebarListEl.innerHTML = `
        <div class="tb-sb-empty" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #bbb; font-size: 13px; padding: 20px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">✂️</div>
          <div>No ${type} found</div>
          <div style="font-size: 11px; color: #ccc; margin-top: 4px;">Create one to get started</div>
        </div>`;
      return;
    }
    sidebarListEl.innerHTML = `
      <div style="padding: 8px 12px; overflow-y: auto; height: 100%;">
        ${list.map(s => `
          <div class="tb-sb-item" data-id="${escapeHtml(s.id)}" data-kind="${type === 'forms' ? 'form' : 'shortcut'}" style="
            padding: 12px 12px;
            border-radius: 8px;
            cursor: pointer;
            margin-bottom: 8px;
            background: #fff;
            border: 1.5px solid #e8e8eb;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            transition: all 0.15s;
          " onmouseover="this.style.borderColor='#0A66C2'; this.style.boxShadow='0 2px 6px rgba(10, 102, 194, 0.15)'; this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='#e8e8eb'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; this.style.transform='translateY(0)'">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="tb-sb-item-trigger" style="
                font-size: 11px;
                font-weight: 700;
                color: #fff;
                background: linear-gradient(135deg, #0A66C2, #005399);
                padding: 3px 8px;
                border-radius: 4px;
                font-family: monospace;
              ">${escapeHtml(s.trigger)}</span>
              ${s.label ? `<span class="tb-sb-item-label" style="font-size: 11px; color: #999; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(s.label)}</span>` : '<span style="flex: 1;"></span>'}
              <span style="font-size: 9px; color: #ccc;">${s.usageCount || 0}x</span>
            </div>
            <div class="tb-sb-item-preview" style="
              font-size: 11px;
              color: #666;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.3;
            ">${escapeHtml(type === 'forms' ? `${s.template || 'Form'} form • ${(Array.isArray(s.fields) ? s.fields : []).join(', ')}` : stripHtml(String(s.expansion || '')))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function openSidebar() {
    try {
      buildSidebar();
      if (!sidebarEl) return;
      sidebarEl.style.display = 'flex';
      renderSidebarList('');
      sidebarEl.classList.add('tb-sidebar-open');
    } catch (error) {
      console.error('ColixAI: Could not open shortcuts sidebar:', error);
      showTbToast('Could not open shortcuts. Please reload the page.');
    }
  }

  function closeSidebar() {
    if (sidebarEl) {
      sidebarEl.classList.remove('tb-sidebar-open');
      sidebarEl.style.display = 'none';
    }
  }

  // =============================================
  // SIMPLE TOAST NOTIFICATION
  // =============================================
  let tbToastEl = null;
  let tbToastTimer = null;

  function showTbToast(message) {
    injectSidebarStyles(); // ensures styles are present even if sidebar never opened

    if (!tbToastEl) {
      tbToastEl = document.createElement('div');
      tbToastEl.id = 'tb-toast';
      document.documentElement.appendChild(tbToastEl);
    }

    tbToastEl.textContent = message;
    tbToastEl.classList.add('tb-toast-show');

    clearTimeout(tbToastTimer);
    tbToastTimer = setTimeout(() => {
      tbToastEl.classList.remove('tb-toast-show');
    }, 2400);
  }

  function checkDismissed(callback) {
    chrome.storage.local.get([DISMISS_KEY], (result) => {
      const data = result[DISMISS_KEY];
      if (data && Date.now() < data.until) {
        callback(true); // still dismissed
      } else {
        if (data) chrome.storage.local.remove(DISMISS_KEY); // clean expired
        callback(false);
      }
    });
  }

  function dismissFab() {
    chrome.storage.local.set({
      [DISMISS_KEY]: { until: Date.now() + DISMISS_DURATION }
    });
    const fab = document.getElementById('tb-fab');
    if (fab) fab.remove();
  }

  function injectFab() {
    if (document.getElementById('tb-fab')) return;
    injectSidebarStyles();

    const fab = document.createElement('div');
    fab.id = 'tb-fab';
    fab.title = 'ColixAI Shortcuts';
    const iconUrl = chrome.runtime.getURL('icons/logo.png');

    // Close button
    const closeBtn = document.createElement('span');
    closeBtn.id = 'tb-fab-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Hide for 2 days';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissFab();
    });

    fab.innerHTML = `<img src="${iconUrl}" alt="ColixAI">`;
    fab.appendChild(closeBtn);

    fab.addEventListener('click', () => {
      if (sidebarEl && sidebarEl.classList.contains('tb-sidebar-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    document.documentElement.appendChild(fab);
  }

  if (window.location.hostname.includes('linkedin.com')) {
    window.debugLinkedInScraper = function () {
      // console.log('=== LINKEDIN DEBUG INFO ===');
      // console.log('\n📝 NAME ELEMENTS:');
      // console.log(document.querySelector('h1'));

      // console.log('\n💼 POSSIBLE HEADLINE ELEMENTS:');
      document.querySelectorAll('div[class*="headline"], div[class*="title"], .text-body-medium').forEach((el, i) => {
        // console.log(`[${i}]`, el.innerText?.substring(0, 100), el.className);
      });

      // console.log('\n📍 LOCATION ELEMENTS:');
      document.querySelectorAll('div, span, p').forEach(el => {
        let text = el.innerText || el.textContent;
        if (text && text.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]/)) {
          // console.log(text, el.className, el.tagName);
        }
      });

      // console.log('\n📷 IMAGES:');
      document.querySelectorAll('img').forEach((img, i) => {
        if (img.width > 30) {
          // console.log(`[${i}] src:`, img.src.substring(0, 80), 'alt:', img.alt, 'size:', img.width, 'x', img.height);
        }
      });

      // console.log('\n🎓 EDUCATION ITEMS:');
      let eduCount = 0;
      document.querySelectorAll('li').forEach((li, i) => {
        if (li.innerText.match(/university|college|school|degree|bachelor|master/i)) {
          // console.log(`[${i}]`, li.innerText.substring(0, 80));
          eduCount++;
          if (eduCount >= 3) return;
        }
      });

      // console.log('\n💼 EXPERIENCE ITEMS:');
      let expCount = 0;
      document.querySelectorAll('li').forEach((li, i) => {
        if (li.innerText.match(/manager|engineer|developer|director|lead/i)) {
          // console.log(`[${i}]`, li.innerText.substring(0, 80));
          expCount++;
          if (expCount >= 3) return;
        }
      });

      // console.log('\n✅ Run scrapeLinkedInProfile() to test scraper');
    };

    // console.log('💡 Tip: Run window.debugLinkedInScraper() in console to inspect LinkedIn HTML structure');
  }

  if (window.top === window.self) {
    checkDismissed((isDismissed) => {
      if (isDismissed) return;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFab);
      } else {
        injectFab();
      }
    });
  }

})();
