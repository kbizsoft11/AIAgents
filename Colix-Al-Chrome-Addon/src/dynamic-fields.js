(function () {
  const requestId = new URLSearchParams(location.search).get('requestId');
  const preview = document.getElementById('preview');
  const form = document.getElementById('form');
  const error = document.getElementById('error');
  const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const sanitizeContent = value => {
    const template = document.createElement('template');
    template.innerHTML = String(value || '').replace(/\n/g, '<br>');
    template.content.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attribute => {
        if (/^on/i.test(attribute.name) || (attribute.name === 'href' && /^javascript:/i.test(attribute.value))) node.removeAttribute(attribute.name);
      });
    });
    return template.innerHTML;
  };
  const showError = message => { error.textContent = message; error.style.display = 'block'; };

  function render(data) {
    // Keep the same basic rich-text formatting as direct shortcut insertion,
    // while removing executable markup before placing it in the extension page.
    let html = sanitizeContent(data.text);
    (data.fields || []).forEach((field, index) => {
      const label = escapeHtml(field.label || 'Text field');
      const defaultValue = escapeHtml(field.defaultValue || '');
      let control;
      if (field.kind === 'select') {
        control = `<select data-field-index="${index}" aria-label="${label}">${(field.options || []).map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}</select>`;
      } else if (field.kind === 'radio') {
        control = `<span class="radio-group" data-field-index="${index}">${(field.options || []).map((option, optionIndex) => `<label><input type="radio" name="radio-${index}" value="${escapeHtml(option)}" ${optionIndex === 0 ? 'checked' : ''}>${escapeHtml(option)}</label>`).join('')}</span>`;
      } else if (field.kind === 'textarea') {
        control = `<textarea data-field-index="${index}" rows="3" aria-label="${label}" placeholder="${label}">${defaultValue}</textarea>`;
      } else {
        control = `<input data-field-index="${index}" type="text" value="${defaultValue}" aria-label="${label}" placeholder="${label}">`;
      }
      html = html.split(escapeHtml(field.token)).join(control);
    });
    preview.innerHTML = html;
    preview.querySelector('[data-field-index]')?.focus();
  }

  chrome.runtime.sendMessage({ action: 'getDynamicFieldWindowData', requestId }, response => {
    if (chrome.runtime.lastError || !response?.success) { showError(response?.error || chrome.runtime.lastError?.message || 'Unable to load shortcut fields.'); return; }
    render(response);
  });
  document.getElementById('cancel').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'cancelDynamicFieldWindow', requestId }, () => window.close()));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = [];
    preview.querySelectorAll('[data-field-index]').forEach(control => {
      const index = Number(control.dataset.fieldIndex);
      if (values[index] !== undefined) return;
      const selected = control.matches('.radio-group') ? control.querySelector(':checked') : control;
      values[index] = selected?.value || '';
    });
    chrome.runtime.sendMessage({ action: 'completeDynamicFieldWindow', requestId, values }, () => window.close());
  });
}());
