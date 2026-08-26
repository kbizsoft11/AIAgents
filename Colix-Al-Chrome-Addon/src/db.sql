-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  email text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  avatar_url text,
  is_premium boolean DEFAULT false,
  premium_until timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shortcuts (
  id text NOT NULL,
  user_id uuid,
  trigger text NOT NULL,
  expansion text NOT NULL,
  label text,
  usage_count integer DEFAULT 0,
  folder_id text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp without time zone,
  email text,
  CONSTRAINT shortcuts_pkey PRIMARY KEY (id),
  CONSTRAINT shortcuts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.forms (
  id text NOT NULL,
  user_id uuid,
  trigger text NOT NULL,
  label text,
  template_type text,
  fields jsonb NOT NULL,
  usage_count integer DEFAULT 0,
  folder_id text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp without time zone,
  email text,
  CONSTRAINT forms_pkey PRIMARY KEY (id),
  CONSTRAINT forms_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE IF NOT EXISTS public.folders (
  id text NOT NULL,
  user_id uuid,
  name text NOT NULL,
  is_expanded boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp without time zone,
  email text,
  CONSTRAINT folders_pkey PRIMARY KEY (id),
  CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  status text DEFAULT 'pending'::text,
  error_message text,
  created_at timestamp without time zone DEFAULT now(),
  email text,
  CONSTRAINT sync_logs_pkey PRIMARY KEY (id),
  CONSTRAINT sync_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Workspace foundation for invitations and shared snippets/forms/folders.
-- Apply after enabling Supabase Auth. See workspace-setup.md for migration steps.
CREATE TABLE IF NOT EXISTS public.workspace_plan_catalog (
  plan_code text NOT NULL,
  name text NOT NULL,
  max_members integer NOT NULL CHECK (max_members > 0),
  monthly_price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT workspace_plan_catalog_pkey PRIMARY KEY (plan_code)
);

INSERT INTO public.workspace_plan_catalog (plan_code, name, max_members, monthly_price)
VALUES
  ('free', 'Free', 2, 0),
  ('team_20', 'Team', 20, 19),
  ('business_50', 'Business', 50, 50),
  ('custom', 'Custom', 2147483647, 0)
ON CONFLICT (plan_code) DO UPDATE SET
  name = EXCLUDED.name,
  max_members = EXCLUDED.max_members,
  monthly_price = EXCLUDED.monthly_price;

CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'free' REFERENCES public.workspace_plan_catalog(plan_code),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  provider text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_subscriptions_pkey PRIMARY KEY (workspace_id),
  CONSTRAINT workspace_subscriptions_provider_id_unique UNIQUE (provider_subscription_id)
);

INSERT INTO public.workspace_subscriptions (workspace_id)
SELECT id FROM public.workspaces
ON CONFLICT (workspace_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_workspace_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.workspace_subscriptions (workspace_id) VALUES (NEW.id)
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_subscription_after_insert ON public.workspaces;
CREATE TRIGGER workspaces_subscription_after_insert
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.initialize_workspace_subscription();

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_groups_pkey PRIMARY KEY (id),
  CONSTRAINT workspace_groups_name_unique UNIQUE (workspace_id, name)
);

ALTER TABLE public.workspace_groups ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ordered_groups AS (
  SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at, id) - 1 AS next_order
  FROM public.workspace_groups
  WHERE sort_order IS NULL
)
UPDATE public.workspace_groups AS groups
SET sort_order = ordered_groups.next_order
FROM ordered_groups
WHERE groups.id = ordered_groups.id AND groups.sort_order IS NULL;

CREATE TABLE IF NOT EXISTS public.workspace_group_members (
  group_id uuid NOT NULL REFERENCES public.workspace_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_group_members_pkey PRIMARY KEY (group_id, user_id)
);

CREATE TABLE public.workspace_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.resource_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('folder', 'shortcut', 'form')),
  resource_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'manage')),
  granted_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_permissions_unique UNIQUE (workspace_id, resource_type, resource_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.resource_group_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('folder', 'shortcut', 'form')),
  resource_id text NOT NULL,
  group_id uuid NOT NULL REFERENCES public.workspace_groups(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'manage')),
  granted_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_group_permissions_unique UNIQUE (workspace_id, resource_type, resource_id, group_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  type text NOT NULL CHECK (type IN ('folder_shared')),
  resource_type text NOT NULL CHECK (resource_type = 'folder'),
  resource_id text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_unique UNIQUE (workspace_id, recipient_id, type, resource_id)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications(recipient_id, read_at, created_at DESC);

ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.shortcuts ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_idx ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON public.workspace_members(user_id, status);
CREATE INDEX IF NOT EXISTS workspace_groups_workspace_idx ON public.workspace_groups(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS workspace_group_members_user_idx ON public.workspace_group_members(user_id, group_id);
CREATE INDEX IF NOT EXISTS invitations_workspace_idx ON public.workspace_invitations(workspace_id, status);
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON public.resource_permissions(workspace_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS group_permissions_resource_idx ON public.resource_group_permissions(workspace_id, resource_type, resource_id);

CREATE OR REPLACE FUNCTION public.create_workspace_invitation(
  target_workspace uuid,
  invited_email text,
  invited_role text,
  invitation_token_hash text,
  inviter_id uuid,
  invitation_expires_at timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  member_limit integer;
  active_members integer;
  pending_invitations integer;
  invitation_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_workspace::text, 0));
  SELECT c.max_members INTO member_limit
  FROM public.workspace_subscriptions s
  JOIN public.workspace_plan_catalog c ON c.plan_code = s.plan_code
  WHERE s.workspace_id = target_workspace AND s.status IN ('active', 'past_due');

  IF member_limit IS NULL THEN
    SELECT max_members INTO member_limit FROM public.workspace_plan_catalog WHERE plan_code = 'free';
  END IF;

  SELECT count(*)::integer INTO active_members
  FROM public.workspace_members WHERE workspace_id = target_workspace AND status = 'active';
  SELECT count(*)::integer INTO pending_invitations
  FROM public.workspace_invitations
  WHERE workspace_id = target_workspace AND status = 'pending' AND expires_at > now();

  IF active_members + pending_invitations >= member_limit THEN
    RAISE EXCEPTION 'WORKSPACE_MEMBER_LIMIT_REACHED';
  END IF;

  INSERT INTO public.workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
  VALUES (target_workspace, lower(trim(invited_email)), invited_role, invitation_token_hash, inviter_id, invitation_expires_at)
  RETURNING id INTO invitation_id;
  RETURN invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(target_invitation uuid, joining_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invitation public.workspace_invitations%ROWTYPE;
  member_limit integer;
  active_members integer;
  membership_id uuid;
BEGIN
  SELECT * INTO invitation FROM public.workspace_invitations WHERE id = target_invitation FOR UPDATE;
  IF invitation.id IS NULL OR invitation.status <> 'pending' OR invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'INVITATION_NOT_ACTIVE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(invitation.workspace_id::text, 0));
  SELECT c.max_members INTO member_limit
  FROM public.workspace_subscriptions s
  JOIN public.workspace_plan_catalog c ON c.plan_code = s.plan_code
  WHERE s.workspace_id = invitation.workspace_id AND s.status IN ('active', 'past_due');
  IF member_limit IS NULL THEN
    SELECT max_members INTO member_limit FROM public.workspace_plan_catalog WHERE plan_code = 'free';
  END IF;

  SELECT user_id INTO membership_id FROM public.workspace_members
  WHERE workspace_id = invitation.workspace_id AND user_id = joining_user;
  IF membership_id IS NULL THEN
    SELECT count(*)::integer INTO active_members FROM public.workspace_members
    WHERE workspace_id = invitation.workspace_id AND status = 'active';
    IF active_members >= member_limit THEN RAISE EXCEPTION 'WORKSPACE_MEMBER_LIMIT_REACHED'; END IF;
    INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
    VALUES (invitation.workspace_id, joining_user, invitation.role, 'active')
    RETURNING user_id INTO membership_id;
  ELSE
    UPDATE public.workspace_members
    SET role = invitation.role, status = 'active', updated_at = now()
    WHERE workspace_id = invitation.workspace_id AND user_id = joining_user;
  END IF;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = invitation.id AND status = 'pending';
  RETURN membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace AND user_id = public.current_app_user_id() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace AND user_id = public.current_app_user_id()
      AND status = 'active' AND role = ANY(allowed_roles)
  );
$$;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_plan_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_member_read ON public.workspaces FOR SELECT USING (public.is_workspace_member(id));
CREATE POLICY workspace_plan_catalog_public_read ON public.workspace_plan_catalog FOR SELECT USING (is_active = true);
CREATE POLICY workspace_subscriptions_owner_read ON public.workspace_subscriptions FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY workspace_members_member_read ON public.workspace_members FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY workspace_members_admin_write ON public.workspace_members FOR ALL
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY invitations_admin_read ON public.workspace_invitations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY permissions_member_read ON public.resource_permissions FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY permissions_admin_write ON public.resource_permissions FOR ALL
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY group_permissions_member_read ON public.resource_group_permissions FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY group_permissions_admin_write ON public.resource_group_permissions FOR ALL
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY workspace_groups_member_read ON public.workspace_groups FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY workspace_groups_admin_write ON public.workspace_groups FOR ALL
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY workspace_group_members_member_read ON public.workspace_group_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_groups g WHERE g.id = group_id AND public.is_workspace_member(g.workspace_id)));
CREATE POLICY workspace_group_members_admin_write ON public.workspace_group_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.workspace_groups g WHERE g.id = group_id AND public.has_workspace_role(g.workspace_id, ARRAY['owner', 'admin'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_groups g WHERE g.id = group_id AND public.has_workspace_role(g.workspace_id, ARRAY['owner', 'admin'])));