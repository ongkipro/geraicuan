-- A table-wide UPDATE grant cannot be narrowed by revoking single columns, so
-- 0034's column revokes were silently no-ops on these tables. Drop the
-- table-level grant, then grant back only the columns the application writes.
-- Identity and ownership columns stay unwritable, so a tenant move is refused
-- by privilege rather than only by a policy's WITH CHECK.
REVOKE UPDATE ON tenants, outlets, contacts, contact_addresses, shipments, shipment_drafts, mengantar_connections, managed_secret_payloads FROM geraicuan_app;--> statement-breakpoint
GRANT UPDATE (name, status, updated_at) ON tenants TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (
  name, default_pickup_address_id, default_pickup_address_label,
  default_origin_area_id, default_origin_area_label,
  mengantar_authority_version, updated_at
) ON outlets TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (name, phone, is_sender, is_recipient, archived_at, updated_at) ON contacts TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (
  label, address, destination_area_id, destination_area_label,
  is_primary, archived_at, updated_at
) ON contact_addresses TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (status, cogs_amount_idr, updated_at) ON shipments TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (
  declared_value_idr, cogs_amount_idr, destination_area_id, destination_area_label,
  is_cod, package_content, package_height_cm, package_length_cm, package_quantity,
  package_weight_grams, package_width_cm, updated_at
) ON shipment_drafts TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (secret_reference, updated_at) ON mengantar_connections TO geraicuan_app;--> statement-breakpoint
GRANT UPDATE (ciphertext, nonce, authentication_tag, key_version, reference, updated_at) ON managed_secret_payloads TO geraicuan_app;
