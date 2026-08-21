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
CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id)
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
CREATE INDEX IF NOT EXISTS invitations_workspace_idx ON public.workspace_invitations(workspace_id, status);
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON public.resource_permissions(workspace_id, resource_type, resource_id);

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
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_member_read ON public.workspaces FOR SELECT USING (public.is_workspace_member(id));
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