-- Run this migration before enabling PayPal recurring checkout.
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS paypal_subscription_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS paypal_payment_id text;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_paypal_subscription_idx ON public.payment_transactions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_paypal_payment_idx ON public.payment_transactions(paypal_payment_id) WHERE paypal_payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);