const params = new URLSearchParams(window.location.search);
const workspaceId = params.get('workspace_id') || '';
const planCode = params.get('plan_code') || '';
const userEmail = params.get('user_email') || '';
const paymentApiUrl = 'https://extensions.kbizsoft.com/magicaa-extension/paypal.php';

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
      body: JSON.stringify({ action: 'create_order', workspace_id: workspaceId, plan_code: planCode })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not start checkout.');
    document.getElementById('planLabel').textContent = payload.plan_name;
    document.getElementById('billingLabel').textContent = `$${payload.amount} for 30 days`;
    document.getElementById('totalLabel').textContent = `$${payload.amount} USD`;
    await loadRazorpaySdk();
    new Razorpay({
      key: payload.key_id,
      amount: Math.round(Number(payload.amount) * 100),
      currency: 'USD',
      name: 'ColixAI',
      description: `${payload.plan_name} - 30 day workspace access`,
      order_id: payload.order_id,
      prefill: { email: userEmail },
      handler: async (payment) => {
        const verification = await fetch(paymentApiUrl, {
          method: 'POST',
          headers: { 'X-User-Email': userEmail, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'capture_order', order_id: payment.razorpay_order_id, payment_id: payment.razorpay_payment_id, signature: payment.razorpay_signature })
        });
        const result = await verification.json().catch(() => ({}));
        if (!verification.ok || !result.success) throw new Error(result.error || 'Payment could not be verified.');
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
