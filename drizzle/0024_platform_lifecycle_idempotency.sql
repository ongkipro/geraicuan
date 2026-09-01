DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.audit_events
    WHERE action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED')
      AND metadata ? 'attemptId'
    GROUP BY actor_id, action, metadata ->> 'attemptId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'T-47 upgrade blocked: duplicate platform lifecycle attempt receipts exist';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_platform_lifecycle_attempt_key"
  ON public.audit_events (actor_id, action, ((metadata ->> 'attemptId')))
  WHERE action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED')
    AND metadata ? 'attemptId';
--> statement-breakpoint
CREATE POLICY "audit_events_platform_lifecycle_attempt_read" ON public.audit_events
  FOR SELECT
  USING (
    actor_id = NULLIF(current_setting('app.user_id', true), '')
    AND actor_role = 'SUPER_ADMIN'
    AND target_type = 'TENANT'
    AND action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED')
    AND metadata ? 'attemptId'
    AND current_setting('app.platform_admin', true) = 'true'
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
        'TENANT_CREATED',
        'TENANT_SUSPENDED',
        'TENANT_REACTIVATED',
        'PLATFORM_MONITORING_VIEWED',
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED',
        'OUTLET_SETTINGS_CHANGED'
      )
      OR (
        action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED')
        AND target_type = 'TENANT'
        AND (
          (
            outcome = 'SUCCESS'
            AND actor_role = 'SUPER_ADMIN'
            AND current_setting('app.platform_admin', true) = 'true'
            AND tenant_id IS NOT NULL
            AND target_id = tenant_id::text
            AND metadata ? 'attemptId'
            AND metadata ? 'fingerprint'
            AND EXISTS (
              SELECT 1
              FROM public.tenants AS audit_target
              WHERE audit_target.id = audit_events.tenant_id
                AND audit_target.status = audit_events.to_status
            )
            AND (
              (action = 'TENANT_CREATED' AND from_status IS NULL AND to_status = 'ACTIVE')
              OR (action = 'TENANT_SUSPENDED' AND from_status = 'ACTIVE' AND to_status = 'SUSPENDED')
              OR (action = 'TENANT_REACTIVATED' AND from_status = 'SUSPENDED' AND to_status = 'ACTIVE')
            )
          )
          OR (
            outcome = 'DENIED'
            AND tenant_id IS NULL
            AND from_status IS NULL
            AND to_status IS NULL
          )
          OR (
            outcome = 'DENIED'
            AND actor_role = 'SUPER_ADMIN'
            AND current_setting('app.platform_admin', true) = 'true'
            AND metadata ? 'attemptId'
            AND metadata ? 'fingerprint'
          )
        )
      )
      OR (
        action = 'PLATFORM_MONITORING_VIEWED'
        AND (
          (
            outcome = 'SUCCESS'
            AND actor_role = 'SUPER_ADMIN'
            AND current_setting('app.platform_admin', true) = 'true'
            AND metadata ->> 'route' IN (
              '/platform',
              '/platform/tenant',
              '/platform/tenant/[tenantId]',
              '/platform/audit'
            )
            AND (
              (
                target_type = 'PLATFORM'
                AND target_id = 'GLOBAL'
                AND tenant_id IS NULL
                AND metadata ->> 'scope' = 'global'
              )
              OR (
                target_type = 'TENANT'
                AND tenant_id IS NOT NULL
                AND target_id = tenant_id::text
                AND metadata ->> 'scope' = 'tenant'
                AND EXISTS (
                  SELECT 1
                  FROM public.tenants AS monitoring_target
                  WHERE monitoring_target.id = audit_events.tenant_id
                )
              )
            )
          )
          OR (
            outcome = 'DENIED'
            AND target_type = 'PLATFORM'
            AND target_id = 'GLOBAL'
            AND tenant_id IS NULL
            AND metadata = '{"route":"authorization","scope":"global"}'::jsonb
          )
        )
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
