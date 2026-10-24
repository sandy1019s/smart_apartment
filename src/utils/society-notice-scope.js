/**
 * SQL predicate for an active tenant association to the complex of notice `n`.
 * The caller supplies a trusted SQL expression for the user id (never request
 * text); tenant identity is the user_units relation, not a users.role value.
 */
function hasActiveTenantUnitInNoticeComplex(userIdExpression) {
  return `EXISTS (
    SELECT 1
      FROM user_units notice_uu
      JOIN units notice_unit ON notice_unit.id = notice_uu.unit_id
      JOIN buildings notice_building ON notice_building.id = notice_unit.building_id
      JOIN complexes notice_complex ON notice_complex.id = notice_building.complex_id
     WHERE notice_uu.user_id = ${userIdExpression}
       AND notice_uu.relation::text = 'tenant'
       AND notice_uu.moved_out_at IS NULL
       AND notice_complex.lifecycle_status = 'active'
       AND notice_building.complex_id = n.complex_id
  )`;
}

/**
 * Residents may use their assigned complex, with current tenant assignments as
 * an additional route. Tenant-role accounts are scoped only by an active unit
 * association; their users.complex_id alone never grants access.
 */
function noticeScopePredicate(userRole, userIdExpression, complexIdExpression) {
  const activeTenantScope = hasActiveTenantUnitInNoticeComplex(userIdExpression);
  const activeAssignedComplex = `EXISTS (
    SELECT 1 FROM complexes notice_assigned_complex
     WHERE notice_assigned_complex.id = n.complex_id
       AND notice_assigned_complex.lifecycle_status = 'active'
  )`;
  if (userRole === 'tenant') return `(${activeAssignedComplex} AND ${activeTenantScope})`;
  return `(${activeAssignedComplex} AND (n.complex_id = ${complexIdExpression} OR ${activeTenantScope}))`;
}

module.exports = { hasActiveTenantUnitInNoticeComplex, noticeScopePredicate };
