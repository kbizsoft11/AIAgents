/**
 * Gmail AI Email Generator
 * Injects AI button into Gmail compose and handles email generation
 */

(function() {
  'use strict';

  if (window.__gmailAILoaded) return;
  window.__gmailAILoaded = true;

  // Configuration
  const BACKEND_URL = 'https://extensions.kbizsoft.com/colix-ai-desktop-app/generate-email.php';

  let isGenerating = false;

  /**
   * Get email content from Gmail compose
   */
  function getEmailContent() {
    const subject = document.querySelector('input[name="subjectbox"]')?.value || '';
    const bodyElement = document.querySelector('[role="textbox"][aria-label*="Message"]');
    const body = bodyElement?.innerText || '';
    return { subject, body };
  }

  /**
   * Create the AI button element
   */
  function createAIButton() {
    const button = document.createElement('button');
    button.setAttribute('data-ai-button', 'true');
    button.className = 'gmail-ai-btn';
    button.title = 'Generate professional email with AI';
    button.type = 'button';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"></path>
      </svg>
    `;
    
    button.addEventListener('click', handleAIClick);
    return button;
  }

  /**
   * Handle AI button click
   */
  async function handleAIClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (isGenerating) return;

    const { subject, body } = getEmailContent();

    if (!subject && !body) {
      showNotification('Please enter a subject or email content first', 'warning');
      return; // Don't throw error, just exit gracefully
    }

    isGenerating = true;
    const button = e.currentTarget;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<span class="gmail-ai-spinner"></span>';
    button.disabled = true;

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject,
          body,
          tone: 'professional'
        })
      });

      const data = await response.json();

      if (!data.success) {
        showNotification(data.error || 'Failed to generate email', 'error');
        return; // Don't throw, just show notification
      }

      // Insert generated email into compose area
      const bodyElement = document.querySelector('[role="textbox"][aria-label*="Message"]');
      if (bodyElement) {
        // Clear current content
        bodyElement.innerHTML = '';
        
        // Insert generated email with proper spacing
        const generatedText = data.email;
        
        // Split by newline and filter empty lines
        const lines = generatedText.split('\n').map(l => l.trim()).filter(l => l);
        
        // Create paragraphs for logical sections
        let currentParagraph = [];
        
        lines.forEach((line, index) => {
          currentParagraph.push(line);
          
          // Check if this is a natural paragraph break
          const isLastLine = index === lines.length - 1;
          
          if (isLastLine || currentParagraph.length > 3) {
            const p = document.createElement('p');
            p.innerText = currentParagraph.join('\n');
            bodyElement.appendChild(p);
            currentParagraph = [];
          }
        });

        showNotification('Email generated successfully', 'success');
      }

    } catch (error) {
      console.error('AI Email generation error:', error);
      showNotification('Network error or server issue', 'error'); // Generic message, don't expose full error
    } finally {
      isGenerating = false;
      button.innerHTML = originalHTML;
      button.disabled = false;
    }
  }

  /**
   * Show notification toast
   */
  function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `gmail-ai-toast gmail-ai-toast-${type}`;
    toast.innerText = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      animation: gmail-ai-slideIn 0.3s ease-out;
      max-width: 300px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'gmail-ai-slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Inject button styles
   */
  function injectStyles() {
    if (document.querySelector('#gmail-ai-button-styles')) return;

    const style = document.createElement('style');
    style.id = 'gmail-ai-button-styles';
    style.textContent = `
      .gmail-ai-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 5px;
        width: 32px;
        height: 32px;
        padding: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .gmail-ai-btn:hover:not(:disabled) {
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transform: translateY(-1px);
      }

      .gmail-ai-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .gmail-ai-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .gmail-ai-btn svg {
        width: 18px;
        height: 18px;
      }

      .gmail-ai-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top: 2px solid white;
        border-radius: 50%;
        animation: gmail-ai-spin 0.6s linear infinite;
      }

      .gmail-ai-toast {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .gmail-ai-toast-success {
        background: #34a853;
        color: white;
      }

      .gmail-ai-toast-error {
        background: #ea4335;
        color: white;
      }

      .gmail-ai-toast-warning {
        background: #fbbc04;
        color: #202124;
      }

      .gmail-ai-toast-info {
        background: #4285f4;
        color: white;
      }

      @keyframes gmail-ai-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes gmail-ai-slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes gmail-ai-slideOut {
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Find and inject button into toolbar
   */
  function findAndInjectButton() {
    if (document.querySelector('[data-ai-button]')) return true;

    console.log('🔍 Searching for Send button...');

    // Find ALL elements with Send in aria-label
    const allSendElements = Array.from(document.querySelectorAll('[aria-label*="Send"]'));
    console.log('Found', allSendElements.length, 'elements with "Send" in aria-label');

    // Filter to find the VISIBLE one (not in hidden menus)
    const sendBtn = allSendElements.find(el => {
      // Check if element or any parent is hidden
      let current = el;
      let isHidden = false;
      
      for (let i = 0; i < 10; i++) {
        if (!current) break;
        const style = window.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || current.getAttribute('aria-hidden') === 'true') {
          isHidden = true;
          break;
        }
        current = current.parentElement;
      }
      
      return !isHidden && (el.tagName === 'DIV' || el.getAttribute('role') === 'button');
    });

    if (!sendBtn) {
      console.log('❌ Visible Send button not found');
      return false;
    }

    console.log('✓ Visible Send button found');

    // Walk up to find a reasonable container (not hidden menu)
    let container = sendBtn.parentElement;
    let foundContainer = false;

    for (let i = 0; i < 15; i++) {
      if (!container) break;

      // Skip hidden containers
      const style = window.getComputedStyle(container);
      if (style.display === 'none') {
        container = container.parentElement;
        continue;
      }

      // Find a container that's a direct parent of button-like elements
      const directButtons = Array.from(container.children).filter(child => {
        return child.getAttribute('aria-label')?.includes('Send') || 
               child.getAttribute('role') === 'button' ||
               child.classList.contains('T-I');
      });

      if (directButtons.length > 0) {
        foundContainer = true;
        console.log('✓ Button container found at level', i);
        break;
      }

      container = container.parentElement;
    }

    if (!foundContainer || !container) {
      console.log('❌ Visible button container not found');
      return false;
    }

    // Create AI button
    const aiButton = createAIButton();
    
    // Find the Send button's immediate parent and insert after the "More send options" button
    const sendBtnParent = sendBtn.parentElement;
    if (sendBtnParent === container) {
      // Send button is direct child
      // Find "More send options" button (comes after Send button)
      let nextBtn = sendBtn.nextElementSibling;
      if (nextBtn) {
        // Insert after "More send options"
        container.insertBefore(aiButton, nextBtn.nextSibling);
      } else {
        // Fallback: just append at end
        container.appendChild(aiButton);
      }
    } else {
      // Insert at end of container
      container.appendChild(aiButton);
    }

    console.log('✅ Gmail AI button injected successfully');
    return true;
  }

  /**
   * Watch for compose and inject button
   */
  function observeAndInject() {
    let attemptCount = 0;
    const maxAttempts = 100; // Try for ~10 seconds
    
    const checkInterval = setInterval(() => {
      attemptCount++;
      
      // If button exists and is still visible, keep it
      const existingBtn = document.querySelector('[data-ai-button]');
      if (existingBtn) {
        const style = window.getComputedStyle(existingBtn);
        if (style.display !== 'none') {
          // Button exists and is visible, all good
          return;
        } else {
          // Button exists but is hidden, remove it so we can reinject
          existingBtn.remove();
        }
      }

      // Try to inject
      const success = findAndInjectButton();
      
      if (success) {
        console.log('✅ Button injected on attempt', attemptCount);
        attemptCount = 0; // Reset for next compose
      } else if (attemptCount >= maxAttempts) {
        console.log('⏸️ Stopping search after', maxAttempts, 'attempts');
        attemptCount = 0;
      }
    }, 200); // Check every 200ms for better detection

    // Also observe for DOM changes
    const observer = new MutationObserver(() => {
      // If button exists and is visible, do nothing
      const btn = document.querySelector('[data-ai-button]');
      if (btn && window.getComputedStyle(btn).display !== 'none') {
        return;
      }

      // Otherwise try to inject
      if (!btn) {
        findAndInjectButton();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });

    console.log('👀 Watching for compose changes...');
  }

  /**
   * Initialize
   */
  function init() {
    console.log('🚀 Gmail AI Email Generator initializing...');
    injectStyles();
    observeAndInject();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Debug: Log when script loads
  console.log('📧 Gmail AI module loaded on', window.location.href);
})();
