-- T-181, T-182, T-183 (PR-59, PR-60, PR-61, D-1 amended, D-8, D-9, D-10).
-- Opens self-service sign-up into a system that was invitation-only down to its
-- grants. Order of the rules below matches the delivery order: the credential
-- policy that refuses the platform account, the policies that let a PROVISIONING
-- tenant configure itself (and nothing that ships), then the registration and
-- review functions that are the only writers of the new audit actions.
-- Existing rows are not updated: every existing tenant keeps
-- PLATFORM_DEFAULT_ALLOWED through the column default, and no user, membership
-- or audit row is touched.

-- 1. D-9: the Mengantar credential policy and the store's WhatsApp number.
ALTER TABLE tenants ADD COLUMN mengantar_credential_policy text DEFAULT 'PLATFORM_DEFAULT_ALLOWED' NOT NULL;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN contact_whatsapp text;
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_mengantar_credential_policy_valid
  CHECK (mengantar_credential_policy IN ('PLATFORM_DEFAULT_ALLOWED', 'PRIVATE_ONLY'));
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_contact_whatsapp_valid
  CHECK (contact_whatsapp IS NULL OR contact_whatsapp ~ '^0[2-9][0-9]{7,11}$');
--> statement-breakpoint
-- The runtime role keeps its column-scoped UPDATE (name, status, updated_at), so
-- no application path can relax a tenant's policy after it is written.
-- A row that records a platform-default credential source is refused for a
-- PRIVATE_ONLY tenant, whatever the application computed (DATA-11).
CREATE POLICY shipment_estimate_snapshots_credential_policy ON shipment_estimate_snapshots
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (credential_source = 'private' OR EXISTS (
    SELECT 1 FROM tenants policy_tenant
    WHERE policy_tenant.id = shipment_estimate_snapshots.tenant_id
      AND policy_tenant.mengantar_credential_policy = 'PLATFORM_DEFAULT_ALLOWED'
  ));
--> statement-breakpoint
CREATE POLICY provider_batches_credential_policy ON provider_batches
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (credential_source = 'private' OR EXISTS (
    SELECT 1 FROM tenants policy_tenant
    WHERE policy_tenant.id = provider_batches.tenant_id
      AND policy_tenant.mengantar_credential_policy = 'PLATFORM_DEFAULT_ALLOWED'
  ));
--> statement-breakpoint
CREATE POLICY provider_settlement_pulls_credential_policy ON provider_settlement_pulls
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (credential_source = 'private' OR EXISTS (
    SELECT 1 FROM tenants policy_tenant
    WHERE policy_tenant.id = provider_settlement_pulls.tenant_id
      AND policy_tenant.mengantar_credential_policy = 'PLATFORM_DEFAULT_ALLOWED'
  ));
--> statement-breakpoint

-- 2. PR-60: a PROVISIONING tenant's admin configures its outlet, pickup points,
-- own Mengantar connection and profile. Exactly these policies and the two
-- profile functions accept ACTIVE or PROVISIONING; every policy on a table that
-- ships (shipments, drafts, parties, estimates, COD totals, batches, orders,
-- recoveries, ledger, settlement, RTS, print, contacts, shipment rate limits)
-- still requires an ACTIVE tenant, as does allocate_shipment_reference.
DROP POLICY audit_events_mengantar_credential_guard ON audit_events;
--> statement-breakpoint
CREATE POLICY audit_events_mengantar_credential_guard ON audit_events
  AS RESTRICTIVE
  FOR INSERT
  TO public
  WITH CHECK (((action <> ALL (ARRAY['MENGANTAR_CREDENTIAL_CREATED'::text, 'MENGANTAR_CREDENTIAL_REPLACED'::text, 'MENGANTAR_PLATFORM_DEFAULT_RESTORED'::text])) OR ((actor_role = 'TENANT_MEMBER'::text) AND (outcome = 'SUCCESS'::text) AND (tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (target_type = 'OUTLET'::text) AND (EXISTS ( SELECT 1
   FROM (((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
     JOIN outlets ON ((outlets.tenant_id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = audit_events.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.role = 'TENANT_ADMIN'::text) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND ((outlets.id)::text = audit_events.target_id)))) AND (((action = 'MENGANTAR_CREDENTIAL_CREATED'::text) AND (metadata = '{"connectionSource": "private", "credentialChange": "created"}'::jsonb)) OR ((action = 'MENGANTAR_CREDENTIAL_REPLACED'::text) AND (metadata = '{"connectionSource": "private", "credentialChange": "replaced"}'::jsonb)) OR ((action = 'MENGANTAR_PLATFORM_DEFAULT_RESTORED'::text) AND (metadata = '{"connectionSource": "platform_default", "credentialChange": "removed"}'::jsonb))))));
--> statement-breakpoint
DROP POLICY managed_secret_payloads_active_tenant_select ON managed_secret_payloads;
--> statement-breakpoint
CREATE POLICY managed_secret_payloads_active_tenant_select ON managed_secret_payloads
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = managed_secret_payloads.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])))))));
--> statement-breakpoint
DROP POLICY managed_secret_payloads_tenant_admin_insert ON managed_secret_payloads;
--> statement-breakpoint
CREATE POLICY managed_secret_payloads_tenant_admin_insert ON managed_secret_payloads
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = managed_secret_payloads.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.role = 'TENANT_ADMIN'::text) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text]))))) AND (EXISTS ( SELECT 1
   FROM outlets
  WHERE ((outlets.id = managed_secret_payloads.outlet_id) AND (outlets.tenant_id = managed_secret_payloads.tenant_id))))));
--> statement-breakpoint
DROP POLICY mengantar_connections_active_tenant_select ON mengantar_connections;
--> statement-breakpoint
CREATE POLICY mengantar_connections_active_tenant_select ON mengantar_connections
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = mengantar_connections.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])))))));
--> statement-breakpoint
DROP POLICY mengantar_connections_tenant_admin_delete ON mengantar_connections;
--> statement-breakpoint
CREATE POLICY mengantar_connections_tenant_admin_delete ON mengantar_connections
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = mengantar_connections.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.role = 'TENANT_ADMIN'::text) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])))))));
--> statement-breakpoint
DROP POLICY mengantar_connections_tenant_admin_insert ON mengantar_connections;
--> statement-breakpoint
CREATE POLICY mengantar_connections_tenant_admin_insert ON mengantar_connections
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = mengantar_connections.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.role = 'TENANT_ADMIN'::text) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text]))))) AND (EXISTS ( SELECT 1
   FROM outlets
  WHERE ((outlets.id = mengantar_connections.outlet_id) AND (outlets.tenant_id = mengantar_connections.tenant_id))))));
--> statement-breakpoint
DROP POLICY mengantar_connections_tenant_admin_update ON mengantar_connections;
--> statement-breakpoint
CREATE POLICY mengantar_connections_tenant_admin_update ON mengantar_connections
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = mengantar_connections.tenant_id) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.role = 'TENANT_ADMIN'::text) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])))))))
  WITH CHECK (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM outlets
  WHERE ((outlets.id = mengantar_connections.outlet_id) AND (outlets.tenant_id = mengantar_connections.tenant_id))))));
--> statement-breakpoint
DROP POLICY mengantar_credential_rate_limits_tenant_admin ON mengantar_credential_rate_limits;
--> statement-breakpoint
CREATE POLICY mengantar_credential_rate_limits_tenant_admin ON mengantar_credential_rate_limits
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (actor_id = current_setting('app.user_id'::text, true)) AND (EXISTS ( SELECT 1
   FROM ((memberships
     JOIN users ON ((users.id = memberships.user_id)))
     JOIN tenants ON ((tenants.id = memberships.tenant_id)))
  WHERE ((memberships.tenant_id = mengantar_credential_rate_limits.tenant_id) AND (memberships.user_id = mengantar_credential_rate_limits.actor_id) AND (memberships.role = 'TENANT_ADMIN'::text) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])))))))
  WITH CHECK (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (actor_id = current_setting('app.user_id'::text, true)) AND (EXISTS ( SELECT 1
   FROM outlets
  WHERE ((outlets.id = mengantar_credential_rate_limits.outlet_id) AND (outlets.tenant_id = mengantar_credential_rate_limits.tenant_id))))));
--> statement-breakpoint
DROP POLICY outlet_pickup_points_active_tenant_delete ON outlet_pickup_points;
--> statement-breakpoint
CREATE POLICY outlet_pickup_points_active_tenant_delete ON outlet_pickup_points
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((tenants
     JOIN memberships ON ((memberships.tenant_id = tenants.id)))
     JOIN users ON ((users.id = memberships.user_id)))
  WHERE ((tenants.id = outlet_pickup_points.tenant_id) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text))))));
--> statement-breakpoint
DROP POLICY outlet_pickup_points_active_tenant_insert ON outlet_pickup_points;
--> statement-breakpoint
CREATE POLICY outlet_pickup_points_active_tenant_insert ON outlet_pickup_points
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((tenants
     JOIN memberships ON ((memberships.tenant_id = tenants.id)))
     JOIN users ON ((users.id = memberships.user_id)))
  WHERE ((tenants.id = outlet_pickup_points.tenant_id) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text))))));
--> statement-breakpoint
DROP POLICY outlet_pickup_points_active_tenant_select ON outlet_pickup_points;
--> statement-breakpoint
CREATE POLICY outlet_pickup_points_active_tenant_select ON outlet_pickup_points
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((tenants
     JOIN memberships ON ((memberships.tenant_id = tenants.id)))
     JOIN users ON ((users.id = memberships.user_id)))
  WHERE ((tenants.id = outlet_pickup_points.tenant_id) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text))))));
--> statement-breakpoint
DROP POLICY outlet_pickup_points_active_tenant_update ON outlet_pickup_points;
--> statement-breakpoint
CREATE POLICY outlet_pickup_points_active_tenant_update ON outlet_pickup_points
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((tenants
     JOIN memberships ON ((memberships.tenant_id = tenants.id)))
     JOIN users ON ((users.id = memberships.user_id)))
  WHERE ((tenants.id = outlet_pickup_points.tenant_id) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text))))))
  WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));
--> statement-breakpoint
DROP POLICY outlets_active_tenant ON outlets;
--> statement-breakpoint
CREATE POLICY outlets_active_tenant ON outlets
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((tenants
     JOIN memberships ON ((memberships.tenant_id = tenants.id)))
     JOIN users ON ((users.id = memberships.user_id)))
  WHERE ((tenants.id = outlets.tenant_id) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text))))))
  WITH CHECK (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM ((tenants
     JOIN memberships ON ((memberships.tenant_id = tenants.id)))
     JOIN users ON ((users.id = memberships.user_id)))
  WHERE ((tenants.id = outlets.tenant_id) AND (tenants.status = ANY (ARRAY['ACTIVE'::text, 'PROVISIONING'::text])) AND (memberships.user_id = current_setting('app.user_id'::text, true)) AND (memberships.status = 'ACTIVE'::text) AND (users.status = 'ACTIVE'::text))))));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.set_tenant_shipment_prefix(requested text, attempt_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  previous text;
BEGIN
  IF requested IS NULL OR requested !~ '^[A-Z0-9]{2,5}$' THEN
    RAISE EXCEPTION 'Shipment prefix is invalid.' USING ERRCODE = '22023';
  END IF;
  IF actor IS NULL OR tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id
    JOIN public.tenants t ON t.id = m.tenant_id
    WHERE m.tenant_id = tenant AND m.user_id = actor AND m.role = 'TENANT_ADMIN'
      AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND t.status IN ('ACTIVE', 'PROVISIONING')
  ) THEN
    RAISE EXCEPTION 'Shipment prefix change is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT shipment_prefix INTO previous FROM public.tenant_shipment_counters WHERE tenant_id = tenant FOR UPDATE;
  INSERT INTO public.tenant_shipment_counters AS counter (tenant_id, shipment_prefix, shipment_prefix_locked_at)
  VALUES (tenant, requested, now())
  ON CONFLICT (tenant_id) DO UPDATE SET shipment_prefix = EXCLUDED.shipment_prefix, shipment_prefix_locked_at = now()
  WHERE counter.shipment_prefix_locked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment prefix is locked.' USING ERRCODE = '55000';
  END IF;
  PERFORM set_config('app.shipment_prefix_rewrite', 'on', true);
  UPDATE public.shipments SET public_reference = requested || '-' || tenant_number::text
  WHERE tenant_id = tenant AND public_reference <> requested || '-' || tenant_number::text;
  PERFORM set_config('app.shipment_prefix_rewrite', 'off', true);
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
  VALUES (actor, 'TENANT_MEMBER', tenant, 'SHIPMENT_PREFIX_LOCKED', 'TENANT', tenant::text, 'SUCCESS',
    jsonb_build_object('attemptId', attempt_id, 'previousPrefix', coalesce(previous, 'GC'), 'prefix', requested));
  RETURN requested;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.tenant_shipment_prefix_state(target uuid DEFAULT NULL::uuid)
 RETURNS TABLE(prefix text, locked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  tenant uuid;
BEGIN
  IF target IS NULL THEN
    tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
    IF actor IS NULL OR tenant IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.memberships m JOIN public.users u ON u.id = m.user_id JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.tenant_id = tenant AND m.user_id = actor AND m.status = 'ACTIVE' AND u.status = 'ACTIVE' AND t.status IN ('ACTIVE', 'PROVISIONING')
    ) THEN
      RAISE EXCEPTION 'Shipment prefix state is not authorized.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF actor IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id WHERE p.user_id = actor AND u.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Shipment prefix state is not authorized.' USING ERRCODE = '42501';
    END IF;
    tenant := target;
  END IF;
  RETURN QUERY
    SELECT coalesce(c.shipment_prefix, 'GC'), c.shipment_prefix_locked_at
    FROM (SELECT tenant AS id) requested
    LEFT JOIN public.tenant_shipment_counters c ON c.tenant_id = requested.id;
END;
$function$;
--> statement-breakpoint

-- 3. Email verification: Better Auth sets users.email_verified (and updated_at)
-- when a verification link is opened. Nothing else on users becomes writable.
GRANT UPDATE (email_verified, updated_at) ON users TO geraicuan_app;
--> statement-breakpoint

-- 4. Anonymous sign-up, verification and recovery rate limits.
CREATE TABLE public_auth_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  window_started_at timestamp with time zone NOT NULL,
  CONSTRAINT public_auth_rate_limits_key_valid CHECK (key ~ '^[a-z-]+:[0-9a-f]{64}$'),
  CONSTRAINT public_auth_rate_limits_count_positive CHECK (count > 0)
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public_auth_rate_limits TO geraicuan_app;
--> statement-breakpoint

-- 5. Audit vocabulary. Only the owning functions may write the new actions.
ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_valid;
--> statement-breakpoint
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_valid CHECK (action IN (
  'TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'PLATFORM_MONITORING_VIEWED',
  'MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_DEACTIVATED', 'OUTLET_SETTINGS_CHANGED',
  'MENGANTAR_CREDENTIAL_CREATED', 'MENGANTAR_CREDENTIAL_REPLACED', 'MENGANTAR_PLATFORM_DEFAULT_RESTORED',
  'SHIPMENT_PREFIX_LOCKED', 'SHIPMENT_PREFIX_UNLOCKED',
  'TENANT_SELF_REGISTERED', 'TENANT_REGISTRATION_APPROVED', 'TENANT_REGISTRATION_REJECTED'
));
--> statement-breakpoint

-- 6. The registration function. Every value that decides authority is fixed in
-- the body: the tenant is PROVISIONING and PRIVATE_ONLY, its id and the user's
-- id are generated here, the membership is that new user's TENANT_ADMIN row in
-- that new tenant, the email is unverified, and no platform role is written.
-- A caller controls only the store name, owner name, email, WhatsApp number and
-- an already-computed password hash, each validated again here.
CREATE FUNCTION register_tenant_self_service(
  p_email text, p_owner_name text, p_password_hash text, p_store_name text, p_whatsapp text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  owner_name text := btrim(coalesce(p_owner_name, ''));
  store_name text := btrim(coalesce(p_store_name, ''));
  new_user text := replace(gen_random_uuid()::text, '-', '');
  new_tenant uuid := gen_random_uuid();
  previous_user text := current_setting('app.user_id', true);
  previous_tenant text := current_setting('app.tenant_id', true);
BEGIN
  IF char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(owner_name) NOT BETWEEN 2 AND 120 OR owner_name ~ '[[:cntrl:]]'
    OR char_length(store_name) NOT BETWEEN 2 AND 120 OR store_name ~ '[[:cntrl:]]'
    OR p_whatsapp IS NULL OR p_whatsapp !~ '^0[2-9][0-9]{7,11}$'
    OR p_password_hash IS NULL OR char_length(p_password_hash) NOT BETWEEN 16 AND 512
  THEN
    RAISE EXCEPTION 'Self-registration input is invalid.' USING ERRCODE = '22023';
  END IF;
  -- An existing account is not an error the caller may surface: it returns NULL,
  -- and the concurrent case surfaces as the users.email unique violation.
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(users.email) = normalized_email) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.users (id, name, email, email_verified, status)
  VALUES (new_user, owner_name, normalized_email, false, 'ACTIVE');
  INSERT INTO public.accounts (id, account_id, provider_id, issuer, user_id, password)
  VALUES (replace(gen_random_uuid()::text, '-', ''), new_user, 'credential', 'local:credential', new_user, p_password_hash);
  INSERT INTO public.tenants (id, name, status, mengantar_credential_policy, contact_whatsapp)
  VALUES (new_tenant, store_name, 'PROVISIONING', 'PRIVATE_ONLY', p_whatsapp);

  PERFORM set_config('app.user_id', new_user, true);
  PERFORM set_config('app.tenant_id', new_tenant::text, true);
  INSERT INTO public.memberships (tenant_id, user_id, role, status)
  VALUES (new_tenant, new_user, 'TENANT_ADMIN', 'ACTIVE');
  -- The application has no outlet-creation path; a store starts with one outlet
  -- named after it, which the admin configures (PR-60).
  INSERT INTO public.outlets (tenant_id, name) VALUES (new_tenant, store_name);
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, to_status, metadata)
  VALUES (new_user, 'TENANT_MEMBER', new_tenant, 'TENANT_SELF_REGISTERED', 'TENANT', new_tenant::text, 'SUCCESS',
    'PROVISIONING', jsonb_build_object('credentialPolicy', 'PRIVATE_ONLY'));
  PERFORM set_config('app.user_id', coalesce(previous_user, ''), true);
  PERFORM set_config('app.tenant_id', coalesce(previous_tenant, ''), true);
  RETURN new_tenant;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION register_tenant_self_service(text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION register_tenant_self_service(text, text, text, text, text) TO geraicuan_app;
--> statement-breakpoint

-- 7. The review function: a Super Admin moves a PROVISIONING tenant to ACTIVE
-- (approval, owner email verified) or ARCHIVED (rejection with a reason).
CREATE FUNCTION review_tenant_registration(
  target uuid, decision text, reason text, attempt_id uuid
) RETURNS TABLE (tenant_name text, owner_email text, owner_name text, to_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  trimmed_reason text := nullif(btrim(coalesce(reason, '')), '');
  next_status text;
  found_tenant record;
  found_owner record;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles p JOIN public.users u ON u.id = p.user_id
    WHERE p.user_id = actor AND p.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Registration review is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF target IS NULL OR attempt_id IS NULL OR decision IS NULL OR decision NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Registration review input is invalid.' USING ERRCODE = '22023';
  END IF;
  IF decision = 'REJECT' AND (trimmed_reason IS NULL OR char_length(trimmed_reason) > 500 OR trimmed_reason ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'A rejection reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.name, t.status INTO found_tenant FROM public.tenants t WHERE t.id = target FOR UPDATE;
  IF NOT FOUND OR found_tenant.status <> 'PROVISIONING' THEN
    RAISE EXCEPTION 'Tenant is not awaiting approval.' USING ERRCODE = '55000';
  END IF;
  SELECT u.email, u.name, u.email_verified INTO found_owner
  FROM public.memberships m JOIN public.users u ON u.id = m.user_id
  WHERE m.tenant_id = target AND m.role = 'TENANT_ADMIN'
  ORDER BY m.created_at, m.id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant has no owner.' USING ERRCODE = '55000';
  END IF;
  IF decision = 'APPROVE' AND NOT found_owner.email_verified THEN
    RAISE EXCEPTION 'Owner email is not verified.' USING ERRCODE = '55000';
  END IF;

  next_status := CASE decision WHEN 'APPROVE' THEN 'ACTIVE' ELSE 'ARCHIVED' END;
  UPDATE public.tenants SET status = next_status, updated_at = now()
  WHERE id = target AND status = 'PROVISIONING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant is not awaiting approval.' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, from_status, to_status, metadata)
  VALUES (actor, 'SUPER_ADMIN', target,
    CASE decision WHEN 'APPROVE' THEN 'TENANT_REGISTRATION_APPROVED' ELSE 'TENANT_REGISTRATION_REJECTED' END,
    'TENANT', target::text, 'SUCCESS', 'PROVISIONING', next_status,
    CASE decision WHEN 'APPROVE' THEN jsonb_build_object('attemptId', attempt_id)
      ELSE jsonb_build_object('attemptId', attempt_id, 'reason', trimmed_reason) END);

  tenant_name := found_tenant.name;
  owner_email := found_owner.email;
  owner_name := found_owner.name;
  to_status := next_status;
  RETURN NEXT;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION review_tenant_registration(uuid, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION review_tenant_registration(uuid, text, text, uuid) TO geraicuan_app;
--> statement-breakpoint

-- 8. Only the owning functions write the new actions or leave PROVISIONING.
CREATE POLICY audit_events_tenant_registration_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action NOT IN ('TENANT_SELF_REGISTERED', 'TENANT_REGISTRATION_APPROVED', 'TENANT_REGISTRATION_REJECTED')
    OR (action = 'TENANT_SELF_REGISTERED' AND CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'register_tenant_self_service(text,text,text,text,text)'::regprocedure::oid))
    OR (action IN ('TENANT_REGISTRATION_APPROVED', 'TENANT_REGISTRATION_REJECTED') AND CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid))
  );
--> statement-breakpoint
-- Lets the registration function's owner insert when that owner is not a
-- superuser or BYPASSRLS role; the row itself must be the only shape it writes.
CREATE POLICY tenants_self_registration_insert ON tenants
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'register_tenant_self_service(text,text,text,text,text)'::regprocedure::oid)
    AND status = 'PROVISIONING' AND mengantar_credential_policy = 'PRIVATE_ONLY'
  );
--> statement-breakpoint
CREATE POLICY memberships_self_registration_insert ON memberships
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'register_tenant_self_service(text,text,text,text,text)'::regprocedure::oid)
    AND role = 'TENANT_ADMIN' AND status = 'ACTIVE'
    AND user_id = NULLIF(current_setting('app.user_id', true), '')
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
--> statement-breakpoint
-- The same for the review function's owner: it reads the tenant and its owner
-- and moves the tenant out of PROVISIONING, and only that.
CREATE POLICY tenants_registration_review_read ON tenants
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid));
--> statement-breakpoint
CREATE POLICY tenants_registration_review_update ON tenants
  AS PERMISSIVE FOR UPDATE TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid) AND status = 'PROVISIONING')
  WITH CHECK (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid) AND status IN ('ACTIVE', 'ARCHIVED'));
--> statement-breakpoint
CREATE POLICY memberships_registration_review_read ON memberships
  AS PERMISSIVE FOR SELECT TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid));
--> statement-breakpoint
CREATE FUNCTION guard_tenant_registration_transition() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF OLD.status = 'PROVISIONING' AND NEW.status IS DISTINCT FROM OLD.status
    AND CURRENT_USER <> (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'review_tenant_registration(uuid,text,text,uuid)'::regprocedure::oid)
  THEN
    RAISE EXCEPTION 'A registration leaves PROVISIONING only through review.' USING ERRCODE = '42501';
  END IF;
  IF NEW.mengantar_credential_policy IS DISTINCT FROM OLD.mengantar_credential_policy THEN
    RAISE EXCEPTION 'A tenant credential policy is immutable.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION guard_tenant_registration_transition() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER tenants_registration_transition_guard
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_registration_transition();
--> statement-breakpoint

-- 9. The Super Admin approval queue reads stores awaiting approval with what
-- they registered, behind the same platform-admin gate as the monitoring views.
CREATE VIEW platform_registration_queue
WITH (security_barrier = true)
AS
SELECT
  t.id AS tenant_id,
  t.name AS store_name,
  t.contact_whatsapp,
  t.mengantar_credential_policy,
  t.created_at AS registered_at,
  owner_user.name AS owner_name,
  owner_user.email AS owner_email,
  owner_user.email_verified AS owner_email_verified
FROM tenants t
JOIN LATERAL (
  SELECT u.name, u.email, u.email_verified
  FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE m.tenant_id = t.id AND m.role = 'TENANT_ADMIN'
  ORDER BY m.created_at, m.id
  LIMIT 1
) owner_user ON true
WHERE t.status = 'PROVISIONING'
  AND current_setting('app.platform_admin', true) = 'true';
--> statement-breakpoint
REVOKE ALL ON platform_registration_queue FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON platform_registration_queue TO geraicuan_app;
