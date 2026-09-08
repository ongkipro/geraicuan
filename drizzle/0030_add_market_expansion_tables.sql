CREATE TABLE "shipment_rts_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_rts_events_status_valid" CHECK (status IN ('RTS_QUEUED', 'RTS_IN_TRANSIT', 'RTS_RECEIVED'))
);
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_status_valid";--> statement-breakpoint
ALTER TABLE "shipment_drafts" ADD COLUMN "cogs_amount_idr" integer;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "cogs_amount_idr" integer;--> statement-breakpoint
ALTER TABLE "shipment_rts_events" ADD CONSTRAINT "shipment_rts_events_shipment_tenant_fkey" FOREIGN KEY ("shipment_id","tenant_id") REFERENCES "public"."shipments"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_rts_events_tenant_shipment_idx" ON "shipment_rts_events" USING btree ("tenant_id","shipment_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_status_valid" CHECK (status IN (
        'DRAFT',
        'ESTIMATED',
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED',
        'RTS_QUEUED',
        'RTS_IN_TRANSIT',
        'RTS_RECEIVED'
      ));