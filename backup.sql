


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."current_app_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."current_app_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_workspace_role"("target_workspace" "uuid", "allowed_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace AND user_id = public.current_app_user_id()
      AND status = 'active' AND role = ANY(allowed_roles)
  );
$$;


ALTER FUNCTION "public"."has_workspace_role"("target_workspace" "uuid", "allowed_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace AND user_id = public.current_app_user_id() AND status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "text" NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "is_expanded" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "deleted_at" timestamp without time zone,
    "email" "text",
    "workspace_id" "uuid"
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forms" (
    "id" "text" NOT NULL,
    "user_id" "uuid",
    "trigger" "text" NOT NULL,
    "label" "text",
    "template_type" "text",
    "fields" "jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "deleted_at" timestamp without time zone,
    "email" "text",
    "folder_id" "text",
    "workspace_id" "uuid"
);


ALTER TABLE "public"."forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission" "text" DEFAULT 'view'::"text" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_permissions_permission_check" CHECK (("permission" = ANY (ARRAY['view'::"text", 'edit'::"text", 'manage'::"text"]))),
    CONSTRAINT "resource_permissions_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['folder'::"text", 'shortcut'::"text", 'form'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_unique" UNIQUE ("workspace_id", "recipient_id", "type", "resource_id")
);


ALTER TABLE "public"."resource_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shortcuts" (
    "id" "text" NOT NULL,
    "user_id" "uuid",
    "trigger" "text" NOT NULL,
    "expansion" "text" NOT NULL,
    "label" "text",
    "usage_count" integer DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "deleted_at" timestamp without time zone,
    "email" "text",
    "folder_id" "text",
    "workspace_id" "uuid"
);


ALTER TABLE "public"."shortcuts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "email" "text"
);


ALTER TABLE "public"."sync_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "avatar_url" "text",
    "is_premium" boolean DEFAULT false,
    "premium_until" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "auth_user_id" "uuid"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'editor'::"text", 'viewer'::"text"]))),
    CONSTRAINT "workspace_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."workspace_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text", 'viewer'::"text"]))),
    CONSTRAINT "workspace_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";

-- Backfill existing personal resources into a workspace for each user.
-- This keeps older records compatible with the shareable folder workflow and
-- prevents "Folder is not available in the active workspace" for records that
-- were created before the workspace migration.
INSERT INTO public.workspaces (name, owner_id)
SELECT
  COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), split_part(email, '@', 1) || '''s Workspace'),
  id
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspaces w WHERE w.owner_id = u.id
);

INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
SELECT w.id, w.owner_id, 'owner', 'active'
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
);

UPDATE public.folders f
SET workspace_id = w.id
FROM public.workspaces w
WHERE f.workspace_id IS NULL
  AND w.owner_id = f.user_id;

UPDATE public.shortcuts s
SET workspace_id = w.id
FROM public.workspaces w
WHERE s.workspace_id IS NULL
  AND w.owner_id = s.user_id;

UPDATE public.forms f
SET workspace_id = w.id
FROM public.workspaces w
WHERE f.workspace_id IS NULL
  AND w.owner_id = f.user_id;

-- Normalize existing folder grants so permissions cannot exceed the member role.
UPDATE public.resource_permissions rp
SET permission = CASE wm.role
    WHEN 'viewer' THEN 'view'
    WHEN 'editor' THEN 'edit'
    ELSE 'manage'
END
FROM public.workspace_members wm
WHERE wm.workspace_id = rp.workspace_id
    AND wm.user_id = rp.user_id
    AND (
        (wm.role = 'viewer' AND rp.permission <> 'view') OR
        (wm.role = 'editor' AND rp.permission = 'manage')
    );


ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_permissions"
    ADD CONSTRAINT "resource_permissions_unique" UNIQUE ("workspace_id", "resource_type", "resource_id", "user_id");



ALTER TABLE ONLY "public"."shortcuts"
    ADD CONSTRAINT "shortcuts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_logs"
    ADD CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "invitations_workspace_idx" ON "public"."workspace_invitations" USING "btree" ("workspace_id", "status");



CREATE INDEX "permissions_resource_idx" ON "public"."resource_permissions" USING "btree" ("workspace_id", "resource_type", "resource_id");



CREATE UNIQUE INDEX "users_auth_user_id_idx" ON "public"."users" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "workspace_members_user_idx" ON "public"."workspace_members" USING "btree" ("user_id", "status");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."resource_permissions"
    ADD CONSTRAINT "resource_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."resource_permissions"
    ADD CONSTRAINT "resource_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_permissions"
    ADD CONSTRAINT "resource_permissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shortcuts"
    ADD CONSTRAINT "shortcuts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."shortcuts"
    ADD CONSTRAINT "shortcuts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."sync_logs"
    ADD CONSTRAINT "sync_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



CREATE POLICY "Allow anon access by email" ON "public"."forms" USING (("email" = (("current_setting"('request.headers'::"text"))::"jsonb" ->> 'x-user-email'::"text"))) WITH CHECK (("email" = (("current_setting"('request.headers'::"text"))::"jsonb" ->> 'x-user-email'::"text")));



CREATE POLICY "Allow anon access by email" ON "public"."shortcuts" USING (("email" = (("current_setting"('request.headers'::"text"))::"jsonb" ->> 'x-user-email'::"text"))) WITH CHECK (("email" = (("current_setting"('request.headers'::"text"))::"jsonb" ->> 'x-user-email'::"text")));



CREATE POLICY "Allow anon access by email" ON "public"."sync_logs" USING (("email" = (("current_setting"('request.headers'::"text"))::"jsonb" ->> 'x-user-email'::"text"))) WITH CHECK (("email" = (("current_setting"('request.headers'::"text"))::"jsonb" ->> 'x-user-email'::"text")));



CREATE POLICY "Allow users to insert by email" ON "public"."users" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow viewing all users" ON "public"."users" FOR SELECT USING (true);



CREATE POLICY "Users can delete own forms" ON "public"."forms" FOR DELETE USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "Users can delete own shortcuts" ON "public"."shortcuts" FOR DELETE USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "Users can insert own forms" ON "public"."forms" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own shortcuts" ON "public"."shortcuts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own sync logs" ON "public"."sync_logs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own forms" ON "public"."forms" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own profile" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can read own shortcuts" ON "public"."shortcuts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own sync logs" ON "public"."sync_logs" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own forms" ON "public"."forms" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own shortcuts" ON "public"."shortcuts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_admin_read" ON "public"."workspace_invitations" FOR SELECT USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "permissions_admin_write" ON "public"."resource_permissions" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "permissions_member_read" ON "public"."resource_permissions" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."resource_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shortcuts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_members_admin_write" ON "public"."workspace_members" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "workspace_members_member_read" ON "public"."workspace_members" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));


CREATE POLICY "folders_member_read" ON "public"."folders" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));


CREATE POLICY "folders_member_write" ON "public"."folders" FOR INSERT WITH CHECK ("public"."is_workspace_member"("workspace_id") AND "user_id" = "public"."current_app_user_id"());


CREATE POLICY "folders_owner_admin_write" ON "public"."folders" FOR UPDATE USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "user_id" = "public"."current_app_user_id"()) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "user_id" = "public"."current_app_user_id"());


CREATE POLICY "folders_member_delete" ON "public"."folders" FOR DELETE USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));


CREATE POLICY "shortcuts_member_read" ON "public"."shortcuts" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));


CREATE POLICY "shortcuts_member_write" ON "public"."shortcuts" FOR INSERT WITH CHECK ("public"."is_workspace_member"("workspace_id") AND "user_id" = "public"."current_app_user_id"());


CREATE POLICY "shortcuts_owner_admin_write" ON "public"."shortcuts" FOR UPDATE USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "user_id" = "public"."current_app_user_id"()) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "user_id" = "public"."current_app_user_id"());


CREATE POLICY "forms_member_read" ON "public"."forms" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));


CREATE POLICY "forms_member_write" ON "public"."forms" FOR INSERT WITH CHECK ("public"."is_workspace_member"("workspace_id") AND "user_id" = "public"."current_app_user_id"());


CREATE POLICY "forms_owner_admin_write" ON "public"."forms" FOR UPDATE USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "user_id" = "public"."current_app_user_id"()) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "user_id" = "public"."current_app_user_id"());


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspaces_member_read" ON "public"."workspaces" FOR SELECT USING ("public"."is_workspace_member"("id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_workspace_role"("target_workspace" "uuid", "allowed_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_workspace_role"("target_workspace" "uuid", "allowed_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_workspace_role"("target_workspace" "uuid", "allowed_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."forms" TO "anon";
GRANT ALL ON TABLE "public"."forms" TO "authenticated";
GRANT ALL ON TABLE "public"."forms" TO "service_role";



GRANT ALL ON TABLE "public"."resource_permissions" TO "anon";
GRANT ALL ON TABLE "public"."resource_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."shortcuts" TO "anon";
GRANT ALL ON TABLE "public"."shortcuts" TO "authenticated";
GRANT ALL ON TABLE "public"."shortcuts" TO "service_role";



GRANT ALL ON TABLE "public"."sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invitations" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































