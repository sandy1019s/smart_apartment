-- Society lifecycle metadata. Existing societies default to active; this
-- extension preserves all society, user, unit, notification, and billing rows.
ALTER TABLE complexes
  ADD COLUMN lifecycle_status VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_from_status VARCHAR(16);

ALTER TABLE complexes
  ADD CONSTRAINT complexes_lifecycle_status_check
    CHECK (lifecycle_status IN ('active', 'suspended', 'archived')),
  ADD CONSTRAINT complexes_archive_state_check
    CHECK (
      (lifecycle_status = 'archived'
        AND archived_at IS NOT NULL
        AND archived_from_status IN ('active', 'suspended'))
      OR
      (lifecycle_status <> 'archived'
        AND archived_at IS NULL
        AND archived_from_status IS NULL)
    );

CREATE INDEX complexes_lifecycle_status_name_idx
  ON complexes (lifecycle_status, lower(name));
