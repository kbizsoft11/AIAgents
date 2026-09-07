-- Run this migration before enabling recurring checkout.
ALTER TABLE public.workspace_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_subscriptions_status_check;
ALTER TABLE public.workspace_subscriptions
  ADD CONSTRAINT workspace_subscriptions_status_check
  CHECK (status IN ('active', 'past_due', 'paused', 'canceled', 'completed'));

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS razorpay_invoice_id text;
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS period_start timestamptz;
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS period_end timestamptz;
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('created', 'authorized', 'approved_pending_capture', 'completed', 'failed'));
CREATE INDEX IF NOT EXISTS payment_transactions_razorpay_subscription_idx
  ON public.payment_transactions(razorpay_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_razorpay_payment_idx
  ON public.payment_transactions(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_plan_catalog
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text;
