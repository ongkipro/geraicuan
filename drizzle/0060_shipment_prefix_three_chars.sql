-- T-225 / D-21: a new or changed shipment prefix is 2-3 capitals or digits
-- (e.g. PHI, A29), and sign-up stores the prefix the owner chose. Additive: no
-- existing row is touched, the 0040 column CHECK (2-5) stays, and a legacy 4-5
-- character prefix remains valid and readable.
--
-- Why a trigger and not `CHECK (...) NOT VALID`: PostgreSQL checks a NOT VALID
-- CHECK on every later INSERT *and UPDATE* of a row, including updates that do
-- not touch the prefix. `allocate_shipment_reference` updates `last_number` on
-- every shipment, so a tenant holding a legacy 4-5 character prefix could no
-- longer create any shipment. The trigger checks only rows whose prefix is new
-- or changing.
CREATE FUNCTION public.guard_new_shipment_prefix() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.shipment_prefix IS DISTINCT FROM OLD.shipment_prefix)
    AND (NEW.shipment_prefix IS NULL OR NEW.shipment_prefix !~ '^[A-Z0-9]{2,3}$') THEN
    -- 22023 is what `set_tenant_shipment_prefix` raises for an invalid prefix, so
    -- the application maps both to the same "invalid prefix" answer.
    RAISE EXCEPTION 'Shipment prefix is invalid.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_new_shipment_prefix() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER tenant_shipment_counters_new_prefix_guard
BEFORE INSERT OR UPDATE OF shipment_prefix ON public.tenant_shipment_counters
FOR EACH ROW EXECUTE FUNCTION public.guard_new_shipment_prefix();
--> statement-breakpoint
-- Sign-up with the chosen prefix. The 0051/0052 function is called unchanged, so
-- every policy that names `register_tenant_self_service(text,text,text,text,text)`
-- keeps its meaning. The prefix row is written unlocked: the owner may still
-- change it in Pengaturan, and the tenant's first shipment locks it (DATA-10).
-- An address that already has an account creates nothing here either.
CREATE FUNCTION public.register_tenant_self_service_with_prefix(
  p_email text, p_owner_name text, p_password_hash text, p_store_name text, p_whatsapp text, p_shipment_prefix text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  new_tenant uuid;
BEGIN
  IF p_shipment_prefix IS NULL OR p_shipment_prefix !~ '^[A-Z0-9]{2,3}$' THEN
    RAISE EXCEPTION 'Self-registration input is invalid.' USING ERRCODE = '22023';
  END IF;
  new_tenant := public.register_tenant_self_service(p_email, p_owner_name, p_password_hash, p_store_name, p_whatsapp);
  IF new_tenant IS NOT NULL THEN
    INSERT INTO public.tenant_shipment_counters (tenant_id, shipment_prefix) VALUES (new_tenant, p_shipment_prefix);
  END IF;
  RETURN new_tenant;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.register_tenant_self_service_with_prefix(text, text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_tenant_self_service_with_prefix(text, text, text, text, text, text) TO geraicuan_app;
