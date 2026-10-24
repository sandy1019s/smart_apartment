const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_society_lifecycle.sql'), 'utf8');

describe('society lifecycle migration safety', () => {
  it('adds distinct lifecycle and archive-origin fields with safe defaults and consistency constraints', () => {
    expect(sql).toContain("ADD COLUMN lifecycle_status VARCHAR(16) NOT NULL DEFAULT 'active'");
    expect(sql).toContain('ADD COLUMN archived_at TIMESTAMPTZ');
    expect(sql).toContain('ADD COLUMN archived_from_status VARCHAR(16)');
    expect(sql).toContain("lifecycle_status IN ('active', 'suspended', 'archived')");
    expect(sql).toContain("archived_from_status IN ('active', 'suspended')");
  });

  it('contains no data deletion, cascade action, or table reset', () => {
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP|CASCADE)\b/i);
    expect(sql).toMatch(/CREATE INDEX complexes_lifecycle_status_name_idx/);
  });
});
