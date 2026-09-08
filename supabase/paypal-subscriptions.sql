-- Run this migration before enabling PayPal recurring checkout.
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS paypal_subscription_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS paypal_payment_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_billing_interval_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_billing_interval_check CHECK (billing_interval IN ('monthly', 'annual'));
ALTER TABLE public.workspace_subscriptions ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';
ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT IF EXISTS workspace_subscriptions_billing_interval_check;
ALTER TABLE public.workspace_subscriptions ADD CONSTRAINT workspace_subscriptions_billing_interval_check CHECK (billing_interval IN ('monthly', 'annual'));
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_paypal_subscription_idx ON public.payment_transactions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_paypal_payment_idx ON public.payment_transactions(paypal_payment_id) WHERE paypal_payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);