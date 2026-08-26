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