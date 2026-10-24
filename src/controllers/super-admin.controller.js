const { query } = require('../config/db');
const { AppError } = require('../middlewares/error.middleware');
const bcrypt = require('bcrypt');
const auditLogger = require('../utils/auditLogger');

async function withTransaction(work) {
  const client = await require('../config/db').getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function writeSocietyAudit(req, event, complex) {
  auditLogger.info({
    action: `society_${event}`,
    actorId: req.user.id,
    actorRole: req.user.role,
    entityType: 'complex',
    entityId: complex.id,
    societyName: complex.name,
    lifecycleStatus: complex.lifecycle_status,
  });
}

// GET /super-admin/dashboard — Platform-wide stats
exports.getDashboard = async (req, res, next) => {
  try {
    const [complexesRes, usersRes, complexListRes] = await Promise.all([
      query('SELECT COUNT(*) FROM complexes'),
      query('SELECT COUNT(*) FROM users'),
      query(`
        SELECT c.id, c.name, c.address, c.created_at,
               c.lifecycle_status, c.archived_at, c.archived_from_status,
               COUNT(u.id) FILTER (WHERE u.role != 'super_admin') AS total_users,
               COALESCE(
                 json_agg(
                   json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email, 'is_active', u.is_active)
                 ) FILTER (WHERE u.role = 'admin'),
                 '[]'
               ) AS admins,
               (SELECT cs.status
                  FROM community_subscriptions cs
                 WHERE cs.complex_id = c.id
                 ORDER BY cs.started_at DESC, cs.created_at DESC
                 LIMIT 1) AS subscription_status
        FROM complexes c
        LEFT JOIN users u ON u.complex_id = c.id
        GROUP BY c.id
        ORDER BY c.name ASC
      `),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total_complexes: parseInt(complexesRes.rows[0].count),
        total_users: parseInt(usersRes.rows[0].count),
        complexes: complexListRes.rows.map(r => ({
          id: r.id,
          name: r.name,
          address: r.address,
          total_users: parseInt(r.total_users),
          admins: r.admins,
          created_at: r.created_at,
          lifecycle_status: r.lifecycle_status,
          archived_at: r.archived_at,
          subscription_status: r.subscription_status,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /super-admin/complexes/:id — Society detail, including supported fields.
exports.getComplex = async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT c.id, c.name, c.address, c.created_at, c.lifecycle_status,
             c.archived_at, c.archived_from_status,
             COUNT(DISTINCT u.id) FILTER (WHERE u.role <> 'super_admin')::int AS total_users,
             COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email, 'is_active', u.is_active))
               FILTER (WHERE u.role = 'admin'), '[]'::json) AS admins,
             (SELECT cs.status FROM community_subscriptions cs WHERE cs.complex_id = c.id
               ORDER BY cs.started_at DESC, cs.created_at DESC LIMIT 1) AS subscription_status
        FROM complexes c
        LEFT JOIN users u ON u.complex_id = c.id
       WHERE c.id = $1
       GROUP BY c.id
    `, [req.params.id]);
    if (!rows.length) return next(new AppError('Society not found', 404));
    res.status(200).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// PATCH /super-admin/complexes/:id — Update only editable society fields.
exports.updateComplex = async (req, res, next) => {
  try {
    const { name, address } = req.body;
    const { rows } = await query(`
      UPDATE complexes SET
        name = CASE WHEN $2::boolean THEN $3::varchar ELSE name END,
        address = CASE WHEN $4::boolean THEN $5::text ELSE address END
       WHERE id = $1
       RETURNING id, name, address, created_at, lifecycle_status, archived_at, archived_from_status
    `, [req.params.id, Object.hasOwn(req.body, 'name'), name ?? null,
      Object.hasOwn(req.body, 'address'), address ?? null]);
    if (!rows.length) return next(new AppError('Society not found', 404));
    writeSocietyAudit(req, 'updated', rows[0]);
    res.status(200).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// POST /super-admin/complexes/:id/lifecycle — Soft lifecycle transitions only.
exports.transitionComplexLifecycle = async (req, res, next) => {
  try {
    const { action, confirm_name: confirmName } = req.body;
    if (!['suspend', 'reactivate', 'archive', 'restore'].includes(action)) {
      return next(new AppError('Unsupported society lifecycle action', 400));
    }
    const complex = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT id, name, lifecycle_status, archived_from_status FROM complexes WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!current.rows.length) throw new AppError('Society not found', 404);
      const society = current.rows[0];
      let nextStatus;
      let archiveFrom = null;
      if (action === 'suspend' && society.lifecycle_status === 'active') nextStatus = 'suspended';
      else if (action === 'reactivate' && society.lifecycle_status === 'suspended') nextStatus = 'active';
      else if (action === 'archive' && ['active', 'suspended'].includes(society.lifecycle_status)) {
        if (confirmName !== society.name) throw new AppError('Type the exact society name to confirm archiving', 400);
        nextStatus = 'archived';
        archiveFrom = society.lifecycle_status;
      } else if (action === 'restore' && society.lifecycle_status === 'archived') {
        if (!['active', 'suspended'].includes(society.archived_from_status)) {
          throw new AppError('Archived society has no valid prior lifecycle state; restore was refused', 409);
        }
        nextStatus = society.archived_from_status;
      } else {
        throw new AppError(`Cannot ${action} a society with ${society.lifecycle_status} status`, 409);
      }

      const { rows } = await client.query(`
        UPDATE complexes SET lifecycle_status = $2::varchar,
               archived_at = CASE WHEN $2::varchar = 'archived' THEN now() ELSE NULL END,
               archived_from_status = $3::varchar
         WHERE id = $1::uuid
         RETURNING id, name, address, created_at, lifecycle_status, archived_at, archived_from_status
      `, [society.id, nextStatus, archiveFrom]);
      return rows[0];
    });
    const pastTense = { suspend: 'suspended', reactivate: 'reactivated', archive: 'archived', restore: 'restored' }[action];
    writeSocietyAudit(req, pastTense, complex);
    res.status(200).json({ success: true, data: complex, message: `Society ${pastTense} successfully` });
  } catch (err) { next(err); }
};

// DELETE /super-admin/complexes/:id/admins/:adminId — Remove only the selected
// administrator's society association; keep their account and role intact.
exports.removeComplexAdmin = async (req, res, next) => {
  try {
    const { rows } = await query(`
      UPDATE users
         SET complex_id = NULL, updated_at = now()
       WHERE id = $1::uuid
         AND complex_id = $2::uuid
         AND role = 'admin'
       RETURNING id, full_name, email, role, complex_id
    `, [req.params.adminId, req.params.id]);
    if (!rows.length) return next(new AppError('Administrator is not assigned to this society', 404));

    auditLogger.info({
      action: 'society_admin_removed',
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: 'user',
      entityId: rows[0].id,
      complexId: req.params.id,
    });
    res.status(200).json({
      success: true,
      data: rows[0],
      message: 'Administrator removed from society; the account remains intact',
    });
  } catch (err) { next(err); }
};

// POST /super-admin/complexes — Create a new society
exports.createComplex = async (req, res, next) => {
  try {
    const { name, address } = req.body;
    const { rows } = await query(
      'INSERT INTO complexes (name, address) VALUES ($1, $2) RETURNING *',
      [name, address]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /super-admin/admins — Create an admin user for a complex
exports.createAdmin = async (req, res, next) => {
  try {
    const { email, phone, password, full_name, complex_id } = req.body;

    if (!complex_id) {
      return next(new AppError('complex_id is required', 400));
    }

    // Verify complex exists
    const complexCheck = await query(
      "SELECT id FROM complexes WHERE id = $1 AND lifecycle_status = 'active'",
      [complex_id]
    );
    if (complexCheck.rows.length === 0) {
      return next(new AppError('Active society not found', 404));
    }

    const userCheck = await query('SELECT id FROM users WHERE email = $1 OR phone = $2', [email, phone]);
    if (userCheck.rows.length > 0) {
      return next(new AppError('User with this email or phone already exists', 400));
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, complex_id) 
       VALUES ($1, $2, $3, $4, 'admin', $5) RETURNING id, email, full_name, role, complex_id`,
      [email, phone, password_hash, full_name, complex_id]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};
