-- T-267 (DATA-24, D-36) follow-up to 0070. The restrictive audit guard of 0070 read
-- shipment_handover_events directly, so every audit INSERT — including the ones written by the
-- existing SECURITY DEFINER functions (prefix, registration, contact, announcements) — needed
-- SELECT on that table. When those functions are owned by a non-superuser, non-BYPASSRLS role
-- (the supported production posture, tested) the owner has no such grant and every one of them
-- failed with 42501. The event lookup now runs inside one SECURITY DEFINER function owned by
-- the migration owner; it only answers true/false, still under the table's FORCE RLS (the
-- context tenant's events only). Same rule as 0070; no row, grant or other policy changes.
CREATE FUNCTION public.shipment_handover_audit_event_matches(
  event_id text, event_tenant uuid, event_shipment text, event_actor text, event_kind text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shipment_handover_events event
    WHERE event.id::text = event_id
      AND event.tenant_id = event_tenant
      AND event.shipment_id::text = event_shipment
      AND event.actor_user_id = event_actor
      AND event.kind = event_kind
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shipment_handover_audit_event_matches(text, uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
-- Any role that may append an audit row evaluates the guard, so every role may call it (a boolean
-- about an event id it already holds, limited to its own tenant by the table's RLS).
GRANT EXECUTE ON FUNCTION public.shipment_handover_audit_event_matches(text, uuid, text, text, text) TO PUBLIC;
--> statement-breakpoint
DROP POLICY audit_events_shipment_handover_guard ON audit_events;
--> statement-breakpoint
CREATE POLICY audit_events_shipment_handover_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action NOT IN ('SHIPMENT_HANDOVER_RECORDED', 'SHIPMENT_HANDOVER_UNDONE')
    OR (
      outcome = 'SUCCESS'
      AND actor_role = 'TENANT_MEMBER'
      AND target_type = 'SHIPMENT'
      AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      AND public.shipment_handover_audit_event_matches(
        metadata ->> 'eventId', tenant_id, target_id, actor_id,
        CASE action WHEN 'SHIPMENT_HANDOVER_RECORDED' THEN 'HANDED_OVER' ELSE 'UNDONE' END
      )
    )
  );
