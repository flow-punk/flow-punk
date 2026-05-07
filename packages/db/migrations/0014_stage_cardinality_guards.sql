-- Stage cardinality guards shared by indie and managed tenant DBs.
-- Repos enforce the same rules for clearer errors; triggers are the DB floor.

CREATE TRIGGER stages_active_max_12_before_insert
BEFORE INSERT ON stages
WHEN NEW.status = 'active'
BEGIN
  SELECT RAISE(ABORT, 'stage_limit_exceeded')
  WHERE (
    SELECT COUNT(*)
    FROM stages
    WHERE pipeline_id = NEW.pipeline_id
      AND status = 'active'
  ) >= 12;
END;

CREATE TRIGGER stages_soft_delete_guard_before_update
BEFORE UPDATE OF status ON stages
WHEN OLD.status = 'active' AND NEW.status = 'deleted'
BEGIN
  SELECT RAISE(ABORT, 'stage_has_active_deals')
  WHERE EXISTS (
    SELECT 1
    FROM deals
    WHERE stage_id = OLD.id
      AND status = 'active'
  );

  SELECT RAISE(ABORT, 'pipeline_min_stage_count')
  WHERE (
    SELECT COUNT(*)
    FROM stages
    WHERE pipeline_id = OLD.pipeline_id
      AND status = 'active'
  ) <= 2;
END;

CREATE TRIGGER stages_no_hard_delete
BEFORE DELETE ON stages
BEGIN
  SELECT RAISE(ABORT, 'stages_must_be_soft_deleted');
END;
