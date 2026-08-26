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

CREATE INDEX IF NOT EXISTS group_permissions_resource_idx
  ON public.resource_group_permissions(workspace_id, resource_type, resource_id);

ALTER TABLE public.resource_group_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_permissions_member_read ON public.resource_group_permissions;
CREATE POLICY group_permissions_member_read ON public.resource_group_permissions FOR SELECT
  USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS group_permissions_admin_write ON public.resource_group_permissions;
CREATE POLICY group_permissions_admin_write ON public.resource_group_permissions FOR ALL
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));