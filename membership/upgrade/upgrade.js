const params = new URLSearchParams(window.location.search);
const apiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/paypal.php';
const workspaceId = params.get('workspace_id') || '';
const planCode = params.get('plan_code') || '';
const userEmail = params.get('user_email') || '';
const title = document.getElementById('plan-name');
const planSummary = document.getElementById('plan-summary');
const price = document.getElementById('price');
const message = document.getElementById('message');
const buttons = document.getElementById('paypal-buttons');
const retry = document.getElementById('retry');
const planPill = document.getElementById('plan-pill');
const billingSummary = document.getElementById('billing-summary');
let billingInterval = params.get('billing_interval') === 'annual' ? 'annual' : 'monthly';
let paypalSdkPromise = null;

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    currencyDisplay: 'symbol',
  }).format(Number(amount));
}

function showError(error) {
  message.textContent = error instanceof Error ? error.message : 'PayPal checkout is unavailable.';
  message.classList.add('error');
  retry.hidden = false;
  buttons.hidden = true;
}

async function callApi(body) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': userEmail },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.error || 'PayPal request failed.');
  return payload;
}

function loadPayPalSdk(clientId) {
  if (window.paypal?.Buttons) return Promise.resolve();
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('PayPal checkout could not be loaded.'));
    document.head.appendChild(script);
  });
  return paypalSdkPromise;
}

async function initialize() {
  retry.hidden = true;
  message.classList.remove('error');
  message.textContent = 'Connecting to secure checkout...';
  try {
    if (!workspaceId || !planCode || !userEmail) throw new Error('Missing checkout details. Please restart checkout.');
    const payload = await callApi({ action: 'prepare_subscription', workspace_id: workspaceId, plan_code: planCode, billing_interval: billingInterval });
    title.textContent = payload.plan_name;
    planSummary.textContent = payload.plan_name;
    price.textContent = formatPrice(payload.amount, payload.currency);
    planPill.textContent = payload.billing_interval === 'annual' ? 'ANNUAL' : 'MONTHLY';
    billingSummary.textContent = payload.billing_interval === 'annual' ? 'Annual, recurring · 5% saved' : 'Monthly, recurring';
    document.getElementById('interval').textContent = payload.billing_interval === 'annual' ? 'per year' : 'per month';
    message.textContent = 'Choose a payment method below to start your subscription.';
    await loadPayPalSdk(payload.paypal_client_id);
    buttons.replaceChildren();
    buttons.hidden = false;
    window.paypal.Buttons({
      style: { layout: 'vertical', shape: 'rect', label: 'subscribe', height: 48 },
      createSubscription: (_data, actions) => actions.subscription.create({ plan_id: payload.paypal_plan_id }),
      onApprove: async (data) => {
        buttons.hidden = true;
        message.classList.remove('error');
        message.textContent = 'Confirming your subscription securely...';
        await callApi({ action: 'activate_subscription', transaction_id: payload.transaction_id, subscription_id: data.subscriptionID });
        message.textContent = 'Subscription active. You can close this page.';
        window.opener?.postMessage({ type: 'COLIX_PAYMENT_SUCCESS' }, 'https://colixai.com');
      },
      onCancel: () => showError(new Error('PayPal checkout was cancelled.')),
      onError: (error) => showError(error instanceof Error ? error : new Error('PayPal checkout failed.')),
    }).render('#paypal-buttons');
  } catch (error) {
    showError(error);
  }
}

retry.addEventListener('click', initialize);
initialize();



(function hidePayPalOverlay() {

    function hideOverlay() {
        const overlays = document.querySelectorAll(
            '.paypal-overlay-context-popup, .paypal-checkout-overlay'
        );

        overlays.forEach(function (overlay) {
            overlay.style.setProperty('display', 'none', 'important');
            overlay.style.setProperty('visibility', 'hidden', 'important');
            overlay.style.setProperty('opacity', '0', 'important');
            overlay.style.setProperty('pointer-events', 'none', 'important');
        });
    }

    // Check repeatedly because PayPal creates the overlay dynamically.
    const interval = setInterval(hideOverlay, 100);

    // Stop checking after 30 seconds.
    setTimeout(function () {
        clearInterval(interval);
    }, 30000);

})();
