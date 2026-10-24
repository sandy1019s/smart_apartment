const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../config/db');

exports.requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // Verify user still exists and is active
    const { rows } = await query(`SELECT u.id, u.role, u.is_active, u.complex_id, u.vendor_category,
                                        c.lifecycle_status AS complex_lifecycle_status
                                   FROM users u LEFT JOIN complexes c ON c.id = u.complex_id
                                  WHERE u.id = $1`, [decoded.id]);
    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    req.user = rows[0];
    const hasOtherActiveSociety = ['suspended', 'archived'].includes(req.user.complex_lifecycle_status)
      && ['resident', 'tenant'].includes(req.user.role)
      ? await query(`
          SELECT EXISTS (
            SELECT 1 FROM user_units uu
            JOIN units un ON un.id = uu.unit_id
            JOIN buildings b ON b.id = un.building_id
            JOIN complexes active_complex ON active_complex.id = b.complex_id
           WHERE uu.user_id = $1 AND uu.moved_out_at IS NULL
             AND active_complex.lifecycle_status = 'active'
             AND active_complex.id <> $2
          ) AS has_active_society
        `, [req.user.id, req.user.complex_id]).then(({ rows: associations }) => associations[0]?.has_active_society === true)
      : false;
    if (req.user.role !== 'super_admin'
      && ['suspended', 'archived'].includes(req.user.complex_lifecycle_status)
      && !hasOtherActiveSociety) {
      return res.status(403).json({
        success: false,
        message: req.user.complex_lifecycle_status === 'suspended'
          ? 'This society is suspended. Contact SyncLiving support for assistance.'
          : 'This society is archived and unavailable for normal operations.',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

exports.requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};
