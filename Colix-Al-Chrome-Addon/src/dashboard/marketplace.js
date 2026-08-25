(function () {
  const MARKETPLACE_FOLDER = 'Marketplace';
  const templates = {
    medical: { label: 'Medical Intake Form', trigger: '-medical-form', expansion: 'Patient: {{field:Patient name}}\nConcern: {{textarea:Main concern}}\nVisit type: {{select:Visit type|New patient|Follow-up|Urgent}}\nConsent: {{radio:Consent|Yes|No}}' },
    support: { label: 'Customer Support Reply', trigger: '-support-reply', expansion: 'Hello {{field:Customer name}},\n\nThanks for reaching out about {{field:Order or topic}}. Your request is marked as {{select:Priority|Normal|High|Urgent}}.\n\n{{textarea:Reply message}}\n\nBest,\n{{first_name}}' },
    meeting: { label: 'Meeting Notes', trigger: '-meeting-notes', expansion: 'Meeting: {{field:Meeting title}}\nDate: {{date_time:MMM D, YYYY HH:mm}}\nAttendees: {{textarea:Attendees}}\nOutcome: {{select:Outcome|Planned|In progress|Complete}}\nFollow-up needed: {{radio:Follow-up|Yes|No}}' },
    handover: { label: 'Project Handover', trigger: '-handover', expansion: 'Project: {{field:Project name}}\nStatus: {{select:Project status|Planning|Active|On hold|Complete}}\nSummary:\n{{textarea:Handover summary}}\nCopied reference: {{clipboard}}' },
    estimate: { label: 'Simple Cost Estimate', trigger: '-cost-estimate', expansion: 'Item: {{field:Item name}}\nQuantity: {{field:Quantity|1}}\nUnit cost: {{field:Unit cost|0}}\nExample calculation: {{formula:7*8|2-decimals}}\nNotes: {{textarea:Estimate notes}}' }
  };

  const notice = document.getElementById('marketplaceNotice');
  const buttons = document.querySelectorAll('.copy-template');

  function showNotice(message, type) {
    notice.textContent = message;
    notice.className = `marketplace-notice ${type || ''}`;
  }

  function markTemplateImported(button) {
    button.disabled = true;
    button.classList.remove('loading');
    button.classList.add('imported');
    button.textContent = 'Imported';
  }

  async function updateImportedTemplateButtons() {
    const existingTriggers = new Set();
    const shortcuts = await StorageHelper.getAll();
    const forms = await StorageHelper.getAllForms();
    [...shortcuts, ...forms].forEach(item => {
      if (item.trigger) existingTriggers.add(String(item.trigger).toLowerCase());
    });

    buttons.forEach(button => {
      const template = templates[button.dataset.template];
      if (template && existingTriggers.has(template.trigger.toLowerCase())) {
        markTemplateImported(button);
      } else {
        button.disabled = false;
        button.classList.remove('imported');
        button.textContent = 'Import template';
        button.addEventListener('click', () => copyTemplate(button));
      }
    });
  }

  async function initializeMarketplace() {
    try {
      await initSupabaseClient();
      const authManager = await initAuthManager();
      if (!authManager.isUserAuthenticated()) {
        await authManager.authenticateWithChrome();
      }
      if (!authManager.isUserAuthenticated()) {
        throw new Error('Please sign in before importing a template.');
      }
      await initSyncManager(authManager.getUserEmail());
      await updateImportedTemplateButtons();
    } catch (error) {
      console.error('Marketplace initialization failed:', error);
      showNotice(error?.message || 'Could not connect to your workspace.', 'error');
    }
  }

  async function copyTemplate(button) {
    const template = templates[button.dataset.template];
    if (!template) return;
    button.disabled = true;
    button.classList.add('loading');
    button.textContent = 'Importing...';
    try {
      if (await StorageHelper.triggerExists(template.trigger)) {
        showNotice(`The shortcut ${template.trigger} is already imported.`, 'error');
        markTemplateImported(button);
        return;
      }

      let folders = await StorageHelper.getAllFolders();
      let marketplaceFolder = folders.find(folder => String(folder.name || '').trim().toLowerCase() === MARKETPLACE_FOLDER.toLowerCase());
      if (!marketplaceFolder) {
        marketplaceFolder = await StorageHelper.addFolder({
          id: 'marketplace',
          name: MARKETPLACE_FOLDER,
          isExpanded: true
        });
      }

      await StorageHelper.add({
        trigger: template.trigger,
        label: template.label,
        expansion: template.expansion,
        folderId: marketplaceFolder.id
      });
      showNotice(`${template.label} was added to your Marketplace folder.`, 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 450);
    } catch (error) {
      console.error('Marketplace copy failed:', error);
      showNotice(error?.message || 'Could not copy this template. Please try again.', 'error');
      button.disabled = false;
      button.classList.remove('loading');
      button.textContent = 'Import template';
    }
  }

  buttons.forEach(button => { button.disabled = true; });
  initializeMarketplace();
}());
