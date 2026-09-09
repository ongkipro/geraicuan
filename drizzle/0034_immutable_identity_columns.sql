ALTER TABLE tenants FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE UPDATE (id, created_at) ON tenants FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (id, tenant_id, created_at) ON outlets FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (id, tenant_id, created_at) ON contacts FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (id, tenant_id, created_at, contact_id) ON contact_addresses FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (id, tenant_id, created_at, outlet_id) ON shipments FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (tenant_id, created_at, shipment_id) ON shipment_drafts FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (id, tenant_id, created_at, outlet_id) ON mengantar_connections FROM geraicuan_app;--> statement-breakpoint
REVOKE UPDATE (tenant_id, created_at, outlet_id, purpose) ON managed_secret_payloads FROM geraicuan_app;
