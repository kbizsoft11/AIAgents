const params = new URLSearchParams(window.location.search);
const workspaceId = params.get('workspace_id') || '';
const planCode = params.get('plan_code') || '';
const userEmail = params.get('user_email') || '';
const returnUrl = params.get('return_url') || '';
const paymentApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/razorpay.php';

function showError(message) {
  const notice = document.querySelector('.sandbox-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.style.color = '#991b1b';
  notice.style.background = '#fef2f2';
}

function loadRazorpaySdk() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay checkout.'));
    document.head.appendChild(script);
  });
}

async function initializeCheckout() {
  try {
    if (!userEmail) throw new Error('Missing user identity. Please restart checkout.');
    const response = await fetch(paymentApiUrl, {
      method: 'POST',
      headers: { 'X-User-Email': userEmail, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_subscription', workspace_id: workspaceId, plan_code: planCode })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not start checkout.');
    document.getElementById('planLabel').textContent = payload.plan_name;
    const currency = payload.currency || 'INR';
    document.getElementById('billingLabel').textContent = `${currency} ${payload.amount} per month`;
    document.getElementById('totalLabel').textContent = `${currency} ${payload.amount}`;
    await loadRazorpaySdk();
    new Razorpay({
      key: payload.key_id,
      name: 'ColixAI',
      description: `${payload.plan_name} - monthly subscription`,
      subscription_id: payload.subscription_id,
      prefill: { email: userEmail },
      handler: async (payment) => {
        const verification = await fetch(paymentApiUrl, {
          method: 'POST',
          headers: { 'X-User-Email': userEmail, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activate_subscription', subscription_id: payment.razorpay_subscription_id, payment_id: payment.razorpay_payment_id, signature: payment.razorpay_signature })
        });
        const result = await verification.json().catch(() => ({}));
        if (!verification.ok || !result.success) throw new Error(result.error || 'Payment could not be verified.');
        if (returnUrl) {
          const callbackUrl = new URL(returnUrl);
          callbackUrl.searchParams.set('payment_success', '1');
          callbackUrl.searchParams.set('workspace_id', workspaceId);
          window.location.replace(callbackUrl.toString());
          return;
        }
        if (returnUrl.startsWith('chrome-extension://')) {
          const callbackUrl = new URL(returnUrl);
          callbackUrl.searchParams.set('payment_success', '1');
          callbackUrl.searchParams.set('workspace_id', workspaceId);
          window.location.replace(callbackUrl.toString());
          return;
        }
        document.getElementById('checkoutCard').style.display = 'none';
        document.getElementById('successScreen').classList.add('visible');
        document.getElementById('orderIdDisplay').textContent = `Payment: ${payment.razorpay_payment_id}`;
        window.opener?.postMessage({ type: 'COLIX_PAYMENT_SUCCESS' }, window.location.origin);
        setTimeout(() => window.close(), 2500);
      },
      modal: { ondismiss: () => window.close() },
      theme: { color: '#1dac4b' }
    }).open();
  } catch (error) {
    console.error('Checkout initialization error:', error);
    showError(error instanceof Error ? error.message : 'Could not initialize checkout.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeCheckout();
  document.getElementById('cancelBtn')?.addEventListener('click', () => window.close());
});
