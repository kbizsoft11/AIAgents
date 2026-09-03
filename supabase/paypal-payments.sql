-- One-time Razorpay payment ledger for 30-day workspace access.
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.workspace_plan_catalog(plan_code),
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  razorpay_signature text,
  paypal_order_id text UNIQUE,
  paypal_capture_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('created', 'approved_pending_capture', 'completed', 'failed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS payment_transactions_workspace_id_idx ON public.payment_transactions(workspace_id);
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS razorpay_order_id text UNIQUE;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS razorpay_payment_id text UNIQUE;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS razorpay_signature text;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_transactions_owner_read ON public.payment_transactions;
CREATE POLICY payment_transactions_owner_read
ON public.payment_transactions FOR SELECT
USING (user_id = public.current_app_user_id());