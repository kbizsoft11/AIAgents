// paypal-checkout.js
// PayPal checkout page logic

const params = new URLSearchParams(window.location.search);
const workspaceId = params.get('workspace_id') || '';
const planCode = params.get('plan_code') || '';
const userEmail = params.get('user_email') || '';
const paymentApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/paypal.php';
let orderId = '';
let currentEnvironment = 'sandbox';

function showError(message) {
  const notice = document.querySelector('.sandbox-notice');
  notice.textContent = message;
  notice.style.color = '#991b1b';
  notice.style.background = '#fef2f2';
}

function normalizePayPalEnvironment(value) {
  return String(value || 'sandbox').toLowerCase();
}

function loadPayPalSdk(clientId, environment) {
  return new Promise((resolve, reject) => {
    const normalizedEnvironment = normalizePayPalEnvironment(environment);
    const isLive = normalizedEnvironment === 'live';
    const host = isLive ? 'www' : 'www.sandbox';
    const script = document.createElement('script');
    script.src = `https://${host}.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load PayPal checkout.'));
    document.head.appendChild(script);
  });
}

async function initializeCheckout() {
  try {
    if (!userEmail) {
      const notice = document.querySelector('.sandbox-notice');
      if (notice) {
        notice.textContent = 'Missing user identity — please restart checkout from the extension';
        notice.style.color = '#991b1b';
        notice.style.background = '#fef2f2';
      }
      return;
    }

    console.log('Using URL user_email for payment:', userEmail);

    const sandboxNotice = document.querySelector('.sandbox-notice');
    sandboxNotice.textContent = 'Loading payment options...';
    sandboxNotice.style.background = '#dbeafe';
    sandboxNotice.style.borderColor = '#93c5fd';
    sandboxNotice.style.color = '#1e40af';
    
    // Create order with X-User-Email header
    const response = await fetch(paymentApiUrl, {
      method: 'POST',
      headers: { 'X-User-Email': userEmail, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_order', workspace_id: workspaceId, plan_code: planCode })
    });
    
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Could not start PayPal checkout. Please try again.');
    }
    
    orderId = payload.order_id;
    currentEnvironment = normalizePayPalEnvironment(payload.environment || 'sandbox');

    const sandboxBadge = document.querySelector('.sandbox-badge');
    if (currentEnvironment === 'live') {
      sandboxBadge.style.display = 'none';
      sandboxNotice.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        Secure payment — powered by PayPal
      `;
      sandboxNotice.style.background = '#f0fdf4';
      sandboxNotice.style.borderColor = '#86efac';
      sandboxNotice.style.color = '#166534';
    } else {
      sandboxBadge.style.display = 'inline-block';
      sandboxNotice.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="vertical-align: middle; margin-right: 4px;">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        No real charges — this is a ${currentEnvironment === 'staging' ? 'staging test' : 'sandbox test'}
      `;
      sandboxNotice.style.background = '#fef3c7';
      sandboxNotice.style.borderColor = '#fbbf24';
      sandboxNotice.style.color = '#92400e';
    }
    
    document.getElementById('planLabel').textContent = payload.plan_name;
    document.getElementById('billingLabel').textContent = `$${payload.amount} for 30 days`;
    document.getElementById('totalLabel').textContent = `$${payload.amount} USD`;
    
    await loadPayPalSdk(payload.client_id, payload.environment);
    
    paypal.Buttons({
      createOrder: () => orderId,
      onApprove: async (data) => {
        const captureResponse = await fetch(paymentApiUrl, {
          method: 'POST',
          headers: { 'X-User-Email': userEmail, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'capture_order', order_id: data.orderID })
        });
        const capture = await captureResponse.json().catch(() => ({}));
        if (!captureResponse.ok || !capture.success) {
          throw new Error(capture.error || 'Payment could not be verified.');
        }
        
        document.getElementById('checkoutCard').style.display = 'none';
        document.getElementById('successScreen').classList.add('visible');
        document.getElementById('orderIdDisplay').textContent = 'Order: ' + data.orderID;
        window.opener?.postMessage({ type: 'COLIX_PAYMENT_SUCCESS' }, window.location.origin);
        setTimeout(() => window.close(), 2500);
      },
      onCancel: () => window.close(),
      onError: (error) => showError(error?.message || 'PayPal checkout failed.')
    }).render('#paypalButtons');
  } catch (error) {
    console.error('Checkout initialization error:', error);
    showError(error.message || 'Could not initialize checkout.');
  }
}

function handleCancel() {
  window.close();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeCheckout();
  document.getElementById('cancelBtn')?.addEventListener('click', handleCancel);
});