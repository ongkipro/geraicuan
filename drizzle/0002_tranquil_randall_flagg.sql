ALTER TABLE "audit_events" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "from_status" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "to_status" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_outcome_valid" CHECK (outcome IN ('SUCCESS', 'DENIED'));