-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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