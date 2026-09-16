-- T-169 / PR-57: Mengantar-reported delivery states reach the shipment
-- lifecycle. `provider_order_status_observations` already stored what the
-- provider said during a settlement pull; it now also stores what that report
-- did to the shipment, so a transition is auditable from the evidence that
-- caused it and an unrecognised provider value leaves a record instead of
-- silently doing nothing.
--
-- Additive only, and all three columns are nullable: every row written before
-- this migration is a pure observation from a pull that transitioned nothing,
-- and this repository never rewrites stored provider evidence.
--
-- No policy or grant moves. The table keeps SELECT + INSERT for geraicuan_app
-- and its existing Tenant Admin policies; the lifecycle write itself lands on
-- `shipments`, whose column-scoped UPDATE(status, cogs_amount_idr, updated_at)
-- grant already exists. Deliberately **no** transition rule is encoded in
-- row-level security: DATA-11 records how an INSERT policy that hardcoded a
-- value the application computes shipped a blocker, and the mapping here
-- changes whenever a new provider status is observed.
ALTER TABLE "provider_order_status_observations" ADD COLUMN "from_status" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "mapped_status" text;--> statement-breakpoint
ALTER TABLE "provider_order_status_observations" ADD COLUMN "transition_outcome" text;--> statement-breakpoint
-- A row may not claim a transition it cannot evidence: an applied, unchanged or
-- refused decision names both where the shipment stood and what the provider
-- value mapped to, and only the two "nothing to write" outcomes carry no
-- mapping.
ALTER TABLE "provider_order_status_observations"
  ADD CONSTRAINT "provider_order_status_observations_transition_valid" CHECK (
    (transition_outcome IS NULL AND from_status IS NULL AND mapped_status IS NULL)
    OR (
      transition_outcome IN ('APPLIED', 'UNCHANGED', 'REFUSED', 'NO_LIFECYCLE_STATE', 'UNRECOGNISED')
      AND from_status IS NOT NULL
      AND (mapped_status IS NULL) = (transition_outcome IN ('NO_LIFECYCLE_STATE', 'UNRECOGNISED'))
    )
  );
