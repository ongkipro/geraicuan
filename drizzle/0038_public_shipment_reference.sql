-- Additive upgrade; the migration runner must execute this file in one transaction.
LOCK TABLE public.users, public.shipments IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "shipment_reference_counters" (
	"reference_user_number" integer NOT NULL,
	"reference_date" date NOT NULL,
	"last_sequence" integer NOT NULL,
	CONSTRAINT "shipment_reference_counters_reference_user_number_reference_date_pk" PRIMARY KEY("reference_user_number","reference_date"),
	CONSTRAINT "shipment_reference_counters_owner_valid" CHECK (reference_user_number = 0 OR reference_user_number >= 10000),
	CONSTRAINT "shipment_reference_counters_sequence_positive" CHECK (last_sequence > 0)
);

--> statement-breakpoint
ALTER TABLE public.users ADD COLUMN public_number integer;
WITH numbered AS (
  SELECT id, (9999 + row_number() OVER (ORDER BY created_at, id))::integer AS number
  FROM public.users
)
UPDATE public.users u SET public_number = n.number FROM numbered n WHERE u.id = n.id;
ALTER TABLE public.users ALTER COLUMN public_number SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN public_number ADD GENERATED ALWAYS AS IDENTITY
  (SEQUENCE NAME public.users_public_number_seq MINVALUE 10000 START WITH 10000 NO CYCLE);
SELECT pg_catalog.setval('public.users_public_number_seq',
  COALESCE((SELECT max(public_number) FROM public.users), 10000),
  EXISTS (SELECT 1 FROM public.users));
--> statement-breakpoint
ALTER TABLE public.shipments
  ADD COLUMN created_by_user_id text,
  ADD COLUMN public_reference text DEFAULT NULL,
  ADD COLUMN reference_user_number integer DEFAULT NULL,
  ADD COLUMN reference_date date DEFAULT NULL,
  ADD COLUMN daily_sequence integer DEFAULT NULL;
-- No historical creator was recorded. Never infer one from current membership.
WITH numbered AS (
  SELECT id, (created_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
    row_number() OVER (
      PARTITION BY (created_at AT TIME ZONE 'Asia/Jakarta')::date
      ORDER BY created_at, id
    )::integer AS sequence
  FROM public.shipments
)
UPDATE public.shipments s
SET reference_user_number = 0, reference_date = n.day, daily_sequence = n.sequence,
    public_reference = '00000-' || to_char(n.day, 'YYMMDD') || '-'
      || lpad(n.sequence::text, greatest(3, length(n.sequence::text)), '0')
FROM numbered n WHERE s.id = n.id;
INSERT INTO public.shipment_reference_counters (reference_user_number, reference_date, last_sequence)
SELECT reference_user_number, reference_date, max(daily_sequence)
FROM public.shipments GROUP BY reference_user_number, reference_date;
ALTER TABLE public.shipments
  ALTER COLUMN public_reference SET NOT NULL,
  ALTER COLUMN reference_user_number SET NOT NULL,
  ALTER COLUMN reference_date SET NOT NULL,
  ALTER COLUMN daily_sequence SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_public_reference_key" UNIQUE("public_reference");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_reference_owner_date_sequence_key" UNIQUE("reference_user_number","reference_date","daily_sequence");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_public_number_unique" UNIQUE("public_number");
ALTER TABLE public.users ADD CONSTRAINT users_public_number_minimum CHECK (public_number >= 10000);--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_reference_owner_valid" CHECK ((created_by_user_id IS NULL AND reference_user_number = 0) OR (created_by_user_id IS NOT NULL AND reference_user_number >= 10000));--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_daily_sequence_positive" CHECK (daily_sequence > 0);
--> statement-breakpoint
CREATE FUNCTION public.allocate_shipment_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  owner_number integer;
  allocated_sequence integer;
  day date := (NEW.created_at AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  IF actor IS NULL THEN
    -- Missing context is supported only for migration/owner synthetic fixtures.
    IF NEW.created_by_user_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = session_user AND (rolsuper OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION 'Shipment creator context is required.' USING ERRCODE = '42501';
    END IF;
    owner_number := 0;
  ELSE
    IF NEW.created_by_user_id IS NOT NULL AND NEW.created_by_user_id <> actor THEN
      RAISE EXCEPTION 'Shipment creator does not match context.' USING ERRCODE = '42501';
    END IF;
    SELECT u.public_number INTO owner_number
    FROM public.users u
    JOIN public.memberships m ON m.user_id = u.id AND m.tenant_id = NEW.tenant_id
    JOIN public.tenants t ON t.id = m.tenant_id
    JOIN public.outlets o ON o.tenant_id = t.id AND o.id = NEW.outlet_id
    WHERE u.id = actor AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND t.status = 'ACTIVE';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shipment creator is not authorized.' USING ERRCODE = '42501';
    END IF;
    NEW.created_by_user_id := actor;
  END IF;
  INSERT INTO public.shipment_reference_counters AS counter
    (reference_user_number, reference_date, last_sequence)
  VALUES (owner_number, day, 1)
  ON CONFLICT (reference_user_number, reference_date) DO UPDATE
    SET last_sequence = counter.last_sequence + 1
  RETURNING last_sequence INTO allocated_sequence;
  NEW.reference_user_number := owner_number;
  NEW.reference_date := day;
  NEW.daily_sequence := allocated_sequence;
  NEW.public_reference := lpad(owner_number::text, greatest(5, length(owner_number::text)), '0')
    || '-' || to_char(day, 'YYMMDD') || '-'
    || lpad(allocated_sequence::text, greatest(3, length(allocated_sequence::text)), '0');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipments_allocate_public_reference BEFORE INSERT ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.allocate_shipment_reference();
--> statement-breakpoint
CREATE FUNCTION public.protect_public_reference_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.public_number IS DISTINCT FROM OLD.public_number THEN
      RAISE EXCEPTION 'Public user number is immutable.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF ROW(NEW.created_by_user_id, NEW.public_reference, NEW.reference_user_number, NEW.reference_date, NEW.daily_sequence)
      IS DISTINCT FROM ROW(OLD.created_by_user_id, OLD.public_reference, OLD.reference_user_number, OLD.reference_date, OLD.daily_sequence) THEN
      RAISE EXCEPTION 'Shipment reference is immutable.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_protect_public_number BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_public_reference_identity();
CREATE TRIGGER shipments_protect_public_reference BEFORE UPDATE ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.protect_public_reference_identity();
--> statement-breakpoint
REVOKE ALL ON public.shipment_reference_counters FROM PUBLIC, geraicuan_app;
REVOKE ALL ON FUNCTION public.allocate_shipment_reference() FROM PUBLIC, geraicuan_app;
REVOKE ALL ON FUNCTION public.protect_public_reference_identity() FROM PUBLIC, geraicuan_app;
REVOKE ALL ON SEQUENCE public.users_public_number_seq FROM PUBLIC, geraicuan_app;
