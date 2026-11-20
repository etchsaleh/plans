-- availability_snapshots is an audit log: rows may be inserted, never changed or removed.
CREATE OR REPLACE FUNCTION forbid_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'availability_snapshots is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER availability_snapshots_append_only
  BEFORE UPDATE OR DELETE ON availability_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_snapshot_mutation();
