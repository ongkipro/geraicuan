ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_target_type_valid";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_type_valid" CHECK (target_type IN ('TENANT', 'PLATFORM', 'MEMBERSHIP', 'OUTLET'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_valid" CHECK (action IN (
        'TENANT_CREATED',
        'TENANT_SUSPENDED',
        'TENANT_REACTIVATED',
        'PLATFORM_MONITORING_VIEWED',
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED',
        'OUTLET_SETTINGS_CHANGED'
      ));--> statement-breakpoint
DROP POLICY "audit_events_append" ON "audit_events";--> statement-breakpoint
CREATE POLICY "audit_events_append" ON "audit_events"
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
        action IN (
          'MEMBER_INVITED',
          'MEMBER_ROLE_CHANGED',
          'MEMBER_DEACTIVATED'
        )
        AND actor_role = 'TENANT_MEMBER'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND target_type = 'MEMBERSHIP'
      )
      OR (
        action = 'OUTLET_SETTINGS_CHANGED'
        AND actor_role = 'TENANT_MEMBER'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND target_type = 'OUTLET'
        AND EXISTS (
          SELECT 1
          FROM outlets
          WHERE outlets.id::text = audit_events.target_id
            AND outlets.tenant_id = audit_events.tenant_id
        )
      )
    )
  );
