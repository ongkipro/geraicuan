CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "two_factors_user_id_unique" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
-- T-286 (review 2026-10-06, M2 and L1).
--
-- M2: the Better Auth `twoFactor` plugin's table and user column. Same posture as the other
-- Better Auth tables (0003): runtime grants, no row-level security, because Better Auth reads
-- them before any tenant context exists. `secret` and `backup_codes` are encrypted by Better
-- Auth. The runtime may change only `two_factor_enabled` (and `updated_at`, granted in 0051) on
-- users. Lock-light (spec 15 MIG-1): the column has a constant default, so adding it rewrites no
-- rows; the new table is empty, so its index and foreign key are built without a scan.
GRANT SELECT, INSERT, UPDATE, DELETE ON two_factors TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (two_factor_enabled) ON users TO geraicuan_app;
--> statement-breakpoint
-- L1: a suspended store's members lose their sessions in the suspending transaction. The
-- platform transaction cannot read another store's memberships (FORCE RLS), so a definer helper
-- deletes them. It acts only for an ACTIVE Super Admin in `app.user_id` and only on a store that
-- is already SUSPENDED, so a forged call can at most sign out the members of a suspended store.
CREATE FUNCTION public.revoke_suspended_tenant_sessions(target uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  revoked integer;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id
    WHERE p.user_id = actor AND p.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Session revocation is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF target IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = target AND t.status = 'SUSPENDED'
  ) THEN
    RAISE EXCEPTION 'Tenant is not suspended.' USING ERRCODE = '55000';
  END IF;
  DELETE FROM public.sessions s
  USING public.memberships m
  WHERE m.tenant_id = target AND s.user_id = m.user_id;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  RETURN revoked;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.revoke_suspended_tenant_sessions(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.revoke_suspended_tenant_sessions(uuid) TO geraicuan_app;
--> statement-breakpoint
-- The helper's owner reads the suspended store's memberships even when it is not a superuser or
-- BYPASSRLS role (memberships forces RLS); the same owner-bound pattern as 0051 and 0053.
CREATE POLICY memberships_session_revocation_read ON memberships
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'revoke_suspended_tenant_sessions(uuid)'::regprocedure::oid));
