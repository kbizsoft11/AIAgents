-- Allow the legacy application user row to be updated by its linked Supabase Auth user.
-- users.id is an application UUID; users.auth_user_id stores auth.uid().
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can read own profile"
ON public.users
FOR SELECT
USING (
	id = public.current_app_user_id()
	OR (
		auth.uid() IS NOT NULL
		AND auth_user_id IS NULL
		AND lower(email) = lower(auth.jwt() ->> 'email')
	)
);

CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
USING (
	id = public.current_app_user_id()
	OR (
		auth.uid() IS NOT NULL
		AND auth_user_id IS NULL
		AND lower(email) = lower(auth.jwt() ->> 'email')
	)
)
WITH CHECK (
	id = public.current_app_user_id()
	OR (
		auth.uid() IS NOT NULL
		AND lower(email) = lower(auth.jwt() ->> 'email')
		AND auth_user_id = auth.uid()
	)
);
