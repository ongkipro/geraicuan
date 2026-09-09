REVOKE DELETE ON shipments, shipment_drafts, outlets, contacts, contact_addresses FROM geraicuan_app;--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
