DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.memberships
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'T-46 upgrade blocked: memberships.user_id contains duplicates';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_key" UNIQUE("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_member_attempt_key"
  ON public.audit_events (tenant_id, actor_id, action, ((metadata ->> 'attemptId')))
  WHERE action IN ('MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_DEACTIVATED')
    AND metadata ? 'attemptId';
--> statement-breakpoint
GRANT SELECT ON public.audit_events TO geraicuan_app;
--> statement-breakpoint
CREATE POLICY "audit_events_member_attempt_read" ON public.audit_events
  FOR SELECT
  USING (
    actor_id = NULLIF(current_setting('app.user_id', true), '')
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_role = 'TENANT_MEMBER'
    AND target_type = 'MEMBERSHIP'
    AND action IN ('MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_DEACTIVATED')
    AND metadata ? 'attemptId'
  );
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
        'MEMBER_DEACTIVATED',
        'OUTLET_SETTINGS_CHANGED'
      )
      OR (
        action IN ('MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_DEACTIVATED')
        AND actor_role = 'TENANT_MEMBER'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND target_type = 'MEMBERSHIP'
        AND metadata ? 'attemptId'
        AND (
          (
            outcome = 'SUCCESS'
            AND public.tenant_member_governance_authorized(tenant_id)
            AND EXISTS (
              SELECT 1
              FROM public.memberships AS audit_target
              WHERE audit_target.id::text = audit_events.target_id
                AND audit_target.tenant_id = audit_events.tenant_id
            )
          )
          OR (
            outcome = 'DENIED'
            AND (
              target_id = 'UNRESOLVED_MEMBER'
              OR EXISTS (
                SELECT 1
                FROM public.memberships AS audit_target
                WHERE audit_target.id::text = audit_events.target_id
                  AND audit_target.tenant_id = audit_events.tenant_id
              )
            )
          )
        )
      )
      OR (
        action = 'OUTLET_SETTINGS_CHANGED'
        AND actor_role = 'TENANT_MEMBER'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND target_type = 'OUTLET'
        AND EXISTS (
          SELECT 1
          FROM public.outlets
          WHERE outlets.id::text = audit_events.target_id
            AND outlets.tenant_id = audit_events.tenant_id
        )
      )
    )
  );
