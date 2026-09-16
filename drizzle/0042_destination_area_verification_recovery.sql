-- B3 fix: every shipment_drafts row written before 0041 has
-- destination_area_verified_at permanently NULL, which
-- buildMengantarOrderPayload refuses forever. 0035's column-scoped UPDATE
-- grant predates that column and does not cover it, so the application had
-- no privilege to stamp it even once it re-checks the area with Mengantar.
-- This is purely additive: it extends the existing column-level UPDATE grant
-- on shipment_drafts, it does not touch any other privilege, RLS policy, or
-- constraint.
GRANT UPDATE (destination_area_verified_at, updated_at) ON shipment_drafts TO geraicuan_app;
