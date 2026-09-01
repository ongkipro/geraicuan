ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_target_type_valid";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_type_valid" CHECK (target_type IN ('TENANT', 'PLATFORM', 'MEMBERSHIP'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_valid" CHECK (action IN (
        'TENANT_CREATED',
        'TENANT_SUSPENDED',
        'TENANT_REACTIVATED',
        'PLATFORM_MONITORING_VIEWED',
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED'
      ));
--> statement-breakpoint
CREATE FUNCTION public.tenant_member_governance_authorized(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    target_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM public.memberships AS actor_membership
      JOIN public.users AS actor_user
        ON actor_user.id = actor_membership.user_id
      JOIN public.tenants AS actor_tenant
        ON actor_tenant.id = actor_membership.tenant_id
      WHERE actor_membership.tenant_id = target_tenant_id
        AND actor_membership.user_id = NULLIF(current_setting('app.user_id', true), '')
        AND actor_membership.role = 'TENANT_ADMIN'
        AND actor_membership.status = 'ACTIVE'
        AND actor_user.status = 'ACTIVE'
        AND actor_tenant.status = 'ACTIVE'
    ),
    false
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_member_governance_authorized(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_member_governance_authorized(uuid) TO geraicuan_app;
--> statement-breakpoint
CREATE POLICY "platform_roles_member_invitation_guard" ON public.platform_roles
  FOR SELECT
  USING (
    current_user <> session_user
    AND public.tenant_member_governance_authorized(
      NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );
--> statement-breakpoint
CREATE FUNCTION public.tenant_member_invitation_allowed(
  target_tenant_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    public.tenant_member_governance_authorized(target_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.users AS target_user
      WHERE target_user.id = target_user_id
        AND target_user.status = 'ACTIVE'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.platform_roles AS target_platform_role
      WHERE target_platform_role.user_id = target_user_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.memberships AS target_membership
      WHERE target_membership.user_id = target_user_id
        AND target_membership.tenant_id <> target_tenant_id
    ),
    false
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_member_invitation_allowed(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_member_invitation_allowed(uuid, text) TO geraicuan_app;
--> statement-breakpoint
DROP POLICY "memberships_current_user" ON public.memberships;
--> statement-breakpoint
CREATE POLICY "memberships_current_user" ON public.memberships
  FOR SELECT
  USING (
    (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND EXISTS (
        SELECT 1
        FROM public.users
        WHERE users.id = memberships.user_id
          AND users.status = 'ACTIVE'
      )
    )
    OR public.tenant_member_governance_authorized(tenant_id)
  );
--> statement-breakpoint
CREATE POLICY "memberships_tenant_admin_insert" ON public.memberships
  FOR INSERT
  WITH CHECK (
    public.tenant_member_invitation_allowed(tenant_id, user_id)
  );
--> statement-breakpoint
CREATE POLICY "memberships_tenant_admin_update" ON public.memberships
  FOR UPDATE
  USING (
    public.tenant_member_governance_authorized(tenant_id)
  )
  WITH CHECK (
    public.tenant_member_governance_authorized(tenant_id)
  );
--> statement-breakpoint
GRANT INSERT ON public.memberships TO geraicuan_app;
--> statement-breakpoint
GRANT UPDATE (role, status, updated_at) ON public.memberships TO geraicuan_app;
--> statement-breakpoint
DROP POLICY "audit_events_append" ON public.audit_events;
--> statement-breakpoint
CREATE POLICY "audit_events_append" ON public.audit_events
  FOR INSERT
  WITH CHECK (
    actor_id IS NOT DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')
    AND (
      action NOT IN (
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED'
      )
      OR (
        actor_role = 'TENANT_MEMBER'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND target_type = 'MEMBERSHIP'
      )
    )
  );