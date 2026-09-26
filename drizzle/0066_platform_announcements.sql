-- T-244 (PR-91, D-31): Info terbaru — platform-wide announcements and per-user read receipts.
-- Additive: two new tables, and the audit action list gains three values (the CHECK is re-created
-- as a superset, so every existing row still passes). No existing row is touched.
-- The runtime role only SELECTs announcements (gerai members: published rows; the platform
-- context: every row) and SELECT/INSERTs its own receipts. Two SECURITY DEFINER functions are the
-- only writers; each re-checks an active Super Admin in the platform context and appends the
-- audit event in the same statement (pattern of 0058).
CREATE TABLE "platform_announcement_reads" (
	"user_id" text NOT NULL,
	"announcement_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_announcement_reads_pkey" PRIMARY KEY("user_id","announcement_id")
);
--> statement-breakpoint
CREATE TABLE "platform_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_announcements_title_valid" CHECK (char_length(btrim(title)) BETWEEN 1 AND 120 AND title !~ '[[:cntrl:]]'),
	CONSTRAINT "platform_announcements_body_valid" CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000 AND body !~ '[\x01-\x09\x0b-\x1f\x7f]'),
	CONSTRAINT "platform_announcements_category_valid" CHECK (category IN ('FITUR_BARU', 'INFO_KURIR', 'JADWAL', 'PEMELIHARAAN', 'LAINNYA'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_valid";--> statement-breakpoint
ALTER TABLE "platform_announcement_reads" ADD CONSTRAINT "platform_announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_announcement_reads" ADD CONSTRAINT "platform_announcement_reads_announcement_id_platform_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."platform_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_announcements_published_idx" ON "platform_announcements" USING btree ("published_at");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_valid" CHECK (action IN (
        'TENANT_CREATED',
        'TENANT_SUSPENDED',
        'TENANT_REACTIVATED',
        'PLATFORM_MONITORING_VIEWED',
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED',
        'OUTLET_SETTINGS_CHANGED',
        'MENGANTAR_CREDENTIAL_CREATED',
        'MENGANTAR_CREDENTIAL_REPLACED',
        'MENGANTAR_PLATFORM_DEFAULT_RESTORED',
        'SHIPMENT_PREFIX_LOCKED',
        'SHIPMENT_PREFIX_UNLOCKED',
        'TENANT_SELF_REGISTERED',
        'TENANT_REGISTRATION_APPROVED',
        'TENANT_REGISTRATION_REJECTED',
        'TENANT_CONTACT_UPDATED',
        'ANNOUNCEMENT_SAVED',
        'ANNOUNCEMENT_PUBLISHED',
        'ANNOUNCEMENT_UNPUBLISHED'
      ));
--> statement-breakpoint
REVOKE ALL ON platform_announcements FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON platform_announcement_reads FROM PUBLIC;
--> statement-breakpoint
-- The runtime role reads announcements (RLS below decides which) and never writes them.
GRANT SELECT ON platform_announcements TO geraicuan_app;
--> statement-breakpoint
-- Read receipts are insert-only: a receipt is never moved, re-dated or removed by the runtime.
GRANT SELECT, INSERT ON platform_announcement_reads TO geraicuan_app;
--> statement-breakpoint
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_announcements FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_announcement_reads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_announcement_reads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A gerai member (either role; an approved or pending gerai) sees published announcements only.
CREATE POLICY platform_announcements_member_read ON platform_announcements
  FOR SELECT
  USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM memberships
      JOIN users ON users.id = memberships.user_id
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.user_id = current_setting('app.user_id', true)
        AND memberships.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
        AND users.status = 'ACTIVE'
        AND tenants.status IN ('ACTIVE', 'PROVISIONING')
    )
  );
--> statement-breakpoint
-- The Admin platform (platform context) sees every announcement, drafts included.
CREATE POLICY platform_announcements_platform_read ON platform_announcements
  FOR SELECT
  USING (
    current_setting('app.platform_admin', true) = 'true'
    AND EXISTS (
      SELECT 1 FROM platform_roles
      JOIN users ON users.id = platform_roles.user_id
      WHERE platform_roles.user_id = current_setting('app.user_id', true)
        AND platform_roles.role = 'SUPER_ADMIN'
        AND users.status = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY platform_announcement_reads_own_select ON platform_announcement_reads
  FOR SELECT
  USING (user_id = current_setting('app.user_id', true));
--> statement-breakpoint
-- A member records only their own receipt, and only for an announcement they can see published.
CREATE POLICY platform_announcement_reads_own_insert ON platform_announcement_reads
  FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM platform_announcements
      WHERE platform_announcements.id = platform_announcement_reads.announcement_id
        AND platform_announcements.published_at IS NOT NULL
    )
  );
--> statement-breakpoint
-- The only writer: creates or edits one announcement, published now or kept as draft, for an
-- active Super Admin in the platform context, and audits the write in the same statement.
-- Publishing keeps the first publication time of an announcement that is already live.
CREATE FUNCTION public.save_platform_announcement(
  target uuid,
  requested_title text,
  requested_body text,
  requested_category text,
  requested_pinned boolean,
  requested_publish boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  previous_published timestamptz;
  saved uuid;
  audit_action text;
BEGIN
  IF actor IS NULL OR current_setting('app.platform_admin', true) IS DISTINCT FROM 'true' OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles pr
    JOIN public.users u ON u.id = pr.user_id
    WHERE pr.user_id = actor AND pr.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Announcement write is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF requested_pinned IS NULL OR requested_publish IS NULL THEN
    RAISE EXCEPTION 'Announcement flags are required.' USING ERRCODE = '22023';
  END IF;
  IF target IS NULL THEN
    INSERT INTO public.platform_announcements (title, body, category, pinned, published_at, created_by)
    VALUES (requested_title, requested_body, requested_category, requested_pinned,
      CASE WHEN requested_publish THEN now() END, actor)
    RETURNING id INTO saved;
    audit_action := CASE WHEN requested_publish THEN 'ANNOUNCEMENT_PUBLISHED' ELSE 'ANNOUNCEMENT_SAVED' END;
  ELSE
    SELECT id, published_at INTO saved, previous_published
    FROM public.platform_announcements WHERE id = target FOR UPDATE;
    IF saved IS NULL THEN
      RAISE EXCEPTION 'Announcement not found.' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.platform_announcements
    SET title = requested_title,
      body = requested_body,
      category = requested_category,
      pinned = requested_pinned,
      published_at = CASE WHEN requested_publish THEN coalesce(previous_published, now()) END,
      updated_at = now()
    WHERE id = target;
    audit_action := CASE
      WHEN requested_publish AND previous_published IS NULL THEN 'ANNOUNCEMENT_PUBLISHED'
      WHEN NOT requested_publish AND previous_published IS NOT NULL THEN 'ANNOUNCEMENT_UNPUBLISHED'
      ELSE 'ANNOUNCEMENT_SAVED'
    END;
  END IF;
  -- The body is not copied into the audit trail; the announcement row is the record.
  INSERT INTO public.audit_events (actor_id, actor_role, action, target_type, target_id, outcome, metadata)
  VALUES (actor, 'SUPER_ADMIN', audit_action, 'PLATFORM', saved::text, 'SUCCESS',
    jsonb_build_object('category', requested_category, 'pinned', requested_pinned, 'published', requested_publish));
  RETURN saved;
END;
$$;
--> statement-breakpoint
-- Takes a published announcement back to draft (gerai no longer see it). A draft is unchanged
-- and writes no audit event.
CREATE FUNCTION public.unpublish_platform_announcement(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor text := nullif(current_setting('app.user_id', true), '');
  found_id uuid;
  previous_published timestamptz;
BEGIN
  IF actor IS NULL OR current_setting('app.platform_admin', true) IS DISTINCT FROM 'true' OR NOT EXISTS (
    SELECT 1 FROM public.platform_roles pr
    JOIN public.users u ON u.id = pr.user_id
    WHERE pr.user_id = actor AND pr.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Announcement write is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT id, published_at INTO found_id, previous_published
  FROM public.platform_announcements WHERE id = target FOR UPDATE;
  IF found_id IS NULL THEN
    RAISE EXCEPTION 'Announcement not found.' USING ERRCODE = 'P0002';
  END IF;
  IF previous_published IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.platform_announcements SET published_at = NULL, updated_at = now() WHERE id = target;
  INSERT INTO public.audit_events (actor_id, actor_role, action, target_type, target_id, outcome, metadata)
  VALUES (actor, 'SUPER_ADMIN', 'ANNOUNCEMENT_UNPUBLISHED', 'PLATFORM', target::text, 'SUCCESS',
    jsonb_build_object('published', false));
END;
$$;
--> statement-breakpoint
-- The function owner writes the rows when it is not a superuser or BYPASSRLS role (FORCE RLS);
-- the runtime role never is that owner, and has no INSERT or UPDATE grant on the table at all.
CREATE POLICY platform_announcements_function_write ON platform_announcements
  AS PERMISSIVE FOR ALL TO public
  USING (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.save_platform_announcement(uuid, text, text, text, boolean, boolean)'::regprocedure::oid))
  WITH CHECK (CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.save_platform_announcement(uuid, text, text, text, boolean, boolean)'::regprocedure::oid));
--> statement-breakpoint
-- Only the functions (their owner) may append the announcement audit actions; the runtime role cannot forge them.
CREATE POLICY audit_events_announcement_guard ON audit_events
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    action NOT IN ('ANNOUNCEMENT_SAVED', 'ANNOUNCEMENT_PUBLISHED', 'ANNOUNCEMENT_UNPUBLISHED')
    OR CURRENT_USER = (SELECT pg_catalog.pg_get_userbyid(pg_proc.proowner) FROM pg_catalog.pg_proc WHERE pg_proc.oid = 'public.save_platform_announcement(uuid, text, text, text, boolean, boolean)'::regprocedure::oid)
  );
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.save_platform_announcement(uuid, text, text, text, boolean, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.unpublish_platform_announcement(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.save_platform_announcement(uuid, text, text, text, boolean, boolean) TO geraicuan_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.unpublish_platform_announcement(uuid) TO geraicuan_app;
