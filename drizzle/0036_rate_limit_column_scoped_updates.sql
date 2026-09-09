-- Both rate-limit tables are upserted on their natural key and their DO UPDATE
-- writes only the counter and the window timestamp. Granting UPDATE on the key
-- columns let the application rewrite which tenant or actor a limit belongs to.
REVOKE UPDATE ON shipment_rate_limits, mengantar_credential_rate_limits FROM geraicuan_app;--> statement-breakpoint
GRANT UPDATE (count, last_request) ON shipment_rate_limits TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (count, last_request) ON mengantar_credential_rate_limits TO geraicuan_app;
