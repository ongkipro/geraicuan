-- T-268 (review of T-267, L1). Corrects 0071's SECURITY DEFINER event lookup:
--   * 0071 granted EXECUTE to PUBLIC and said the lookup still ran "under the table's FORCE RLS".
--     That is false whenever the owner is a superuser or BYPASSRLS role (the usual migration
--     owner): FORCE ROW LEVEL SECURITY binds a non-superuser owner only, so any role could ask
--     whether another gerai's event exists.
--   * The lookup now answers only for the context tenant (app.tenant_id, as every tenant policy
--     reads it), whoever owns it; search_path stays pinned.
--   * EXECUTE goes to the runtime role only, like the repository's other definer helpers (0020,
--     0040, 0051, 0058, 0063). The migration owner, which owns the SECURITY DEFINER audit writers
--     (prefix, registration, contact, announcements), owns this function and needs no grant.
-- Same signature, body and policy otherwise; no row, table grant or policy changes.
CREATE OR REPLACE FUNCTION public.shipment_handover_audit_event_matches(
  event_id text, event_tenant uuid, event_shipment text, event_actor text, event_kind text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shipment_handover_events event
    WHERE event.id::text = event_id
      AND event.tenant_id = event_tenant
      AND event_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      AND event.shipment_id::text = event_shipment
      AND event.actor_user_id = event_actor
      AND event.kind = event_kind
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shipment_handover_audit_event_matches(text, uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shipment_handover_audit_event_matches(text, uuid, text, text, text) TO geraicuan_app;
