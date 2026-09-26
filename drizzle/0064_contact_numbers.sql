-- T-241: per-tenant contact numbers for `/app/kontak/<peran>/<n>` (no UUID, name or phone in the
-- URL) and an optional peran/kategori. Mirrors PR-44's shipment numbering (0040): the numbering
-- state lives in tenant_contact_counters (no RLS, no runtime privilege) and an owner-run SECURITY
-- DEFINER before-insert trigger allocates. Existing contacts are numbered per tenant in creation
-- order (id breaks ties). The runtime role gets no UPDATE on contact_number, so a number never
-- moves; category is added to its column-scoped UPDATE grant (0035).
-- The migration runner must execute this file in one transaction.
LOCK TABLE public.contacts IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "tenant_contact_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "tenant_contact_counters_last_number_valid" CHECK (last_number >= 1)
);
--> statement-breakpoint
ALTER TABLE "tenant_contact_counters" ADD CONSTRAINT "tenant_contact_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_number" integer DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "category" text;--> statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id)::integer AS number
  FROM public.contacts
)
UPDATE public.contacts c SET contact_number = n.number FROM numbered n WHERE c.id = n.id;--> statement-breakpoint
INSERT INTO public.tenant_contact_counters (tenant_id, last_number)
SELECT tenant_id, max(contact_number) FROM public.contacts GROUP BY tenant_id;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "contact_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_number_key" UNIQUE("tenant_id","contact_number");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_number_valid" CHECK (contact_number >= 1);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_category_valid" CHECK (category IS NULL OR category IN (
        'PIC_UTAMA',
        'STAF_GUDANG',
        'DROPSHIPPER',
        'PENGRAJIN',
        'OPERASIONAL_CABANG',
        'ADMIN_PENGIRIMAN',
        'RESELLER',
        'PELANGGAN_TETAP',
        'PEMBELI_BARU'
      ));
--> statement-breakpoint
-- Any supplied contact_number is overwritten: the database, not the caller, owns the number.
-- The contact row's own RLS WITH CHECK still decides whether the insert (and so this allocation,
-- which rolls back with it) is allowed.
CREATE FUNCTION public.allocate_contact_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.tenant_contact_counters AS counter (tenant_id, last_number)
  VALUES (NEW.tenant_id, 1)
  ON CONFLICT (tenant_id) DO UPDATE SET last_number = counter.last_number + 1
  RETURNING counter.last_number INTO NEW.contact_number;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contacts_allocate_number BEFORE INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.allocate_contact_number();
--> statement-breakpoint
REVOKE ALL ON public.tenant_contact_counters FROM PUBLIC, geraicuan_app;
REVOKE ALL ON FUNCTION public.allocate_contact_number() FROM PUBLIC, geraicuan_app;
GRANT UPDATE (category) ON public.contacts TO geraicuan_app;
