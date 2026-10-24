const { query, getClient } = require('../config/db');
const { AppError } = require('../middlewares/error.middleware');
const { ensureSocietyNoticeNotifications } = require('../services/notification.service');
const { hasActiveTenantUnitInNoticeComplex, noticeScopePredicate } = require('../utils/society-notice-scope');

const NOTICE_TYPE = 'society_notice';

function recipientCte(complexParam) {
  return `WITH eligible_notice_recipients AS (
    -- Preserve the existing resident delivery path.
    SELECT u.id AS user_id
      FROM users u
      JOIN complexes recipient_complex ON recipient_complex.id = u.complex_id
     WHERE u.role = 'resident' AND u.is_active = true AND u.complex_id = $${complexParam}
       AND recipient_complex.lifecycle_status = 'active'
    UNION
    -- A current tenant must have an active tenant relation to a unit in this complex.
    SELECT u.id AS user_id
      FROM user_units uu
      JOIN users u ON u.id = uu.user_id
      JOIN units un ON un.id = uu.unit_id
      JOIN buildings b ON b.id = un.building_id
      JOIN complexes recipient_complex ON recipient_complex.id = b.complex_id
     WHERE u.role IN ('resident', 'tenant') AND u.is_active = true
       AND uu.relation::text = 'tenant' AND uu.moved_out_at IS NULL
       AND recipient_complex.lifecycle_status = 'active'
       AND b.complex_id = $${complexParam}
  )`;
}

async function withTransaction(work) {
  const client = await getClient();
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

function emitNotifications(io, event, notifications) {
  if (!io) return;
  for (const notification of notifications) {
    io.to(`user:${notification.user_id}`).emit(event, notification);
  }
}

async function deliverNotice(client, notice) {
  const { rows } = await client.query(
    `${recipientCte(9)}
     INSERT INTO notifications (user_id, type, title, message, metadata)
     SELECT recipient.user_id, $2, $3, $4,
            jsonb_build_object(
              'notice_id', $1::uuid,
              'category', $5::text,
              'priority', $6::text,
              'starts_at', $7::timestamptz,
              'ends_at', $8::timestamptz,
              'status', 'sent'
            )
       FROM eligible_notice_recipients recipient
     ON CONFLICT (user_id, (metadata ->> 'notice_id'))
       WHERE type = 'society_notice' AND metadata ? 'notice_id'
     DO NOTHING
     RETURNING *`,
    [notice.id, NOTICE_TYPE, notice.title, notice.message, notice.category,
      notice.priority, notice.starts_at, notice.ends_at, notice.complex_id]
  );
  return rows;
}

exports.listNotices = async (req, res, next) => {
  try {
    if (req.user.role === 'admin' && !req.user.complex_id) {
      return next(new AppError('You must be assigned to a complex', 403));
    }

    if (req.user.role !== 'admin') {
      await ensureSocietyNoticeNotifications(req.user);
      const { rows } = await query(
        `SELECT n.*, nt.id AS notification_id, nt.is_read, nt.created_at AS delivered_at
           FROM notices n
           JOIN notifications nt
             ON nt.user_id = $1
            AND nt.type = $3
            AND nt.metadata ->> 'notice_id' = n.id::text
          WHERE ${noticeScopePredicate(req.user.role, '$1', '$2')}
            AND n.status IN ('sent', 'cancelled')
          ORDER BY (n.status = 'cancelled') ASC, n.starts_at ASC, n.created_at DESC
          LIMIT 100`,
        [req.user.id, req.user.complex_id, NOTICE_TYPE]
      );
      return res.status(200).json({ success: true, data: rows });
    }

    const { rows } = await query(
      `SELECT n.*,
              COUNT(nt.id)::int AS delivery_count,
              COUNT(nt.id) FILTER (WHERE nt.is_read = true)::int AS read_count
         FROM notices n
         LEFT JOIN notifications nt
           ON nt.type = $2 AND nt.metadata ->> 'notice_id' = n.id::text
        WHERE n.complex_id = $1
        GROUP BY n.id
        ORDER BY n.created_at DESC
        LIMIT 100`,
      [req.user.complex_id, NOTICE_TYPE]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getNotice = async (req, res, next) => {
  try {
    if (req.user.role === 'admin' && !req.user.complex_id) {
      return next(new AppError('You must be assigned to a complex', 403));
    }
    if (req.user.role !== 'admin') {
      await ensureSocietyNoticeNotifications(req.user);
      const { rows } = await query(
        `SELECT n.*, nt.id AS notification_id, nt.is_read, nt.created_at AS delivered_at
           FROM notices n
           JOIN notifications nt
             ON nt.user_id = $1 AND nt.type = $4
            AND nt.metadata ->> 'notice_id' = n.id::text
          WHERE n.id = $2
            AND ${noticeScopePredicate(req.user.role, '$1', '$3')}
            AND n.status IN ('sent', 'cancelled')`,
        [req.user.id, req.params.id, req.user.complex_id, NOTICE_TYPE]
      );
      if (!rows.length) return next(new AppError('Notice not found', 404));
      return res.status(200).json({ success: true, data: rows[0] });
    }

    const { rows } = await query(
      `SELECT n.*,
              COUNT(nt.id)::int AS delivery_count,
              COUNT(nt.id) FILTER (WHERE nt.is_read = true)::int AS read_count
         FROM notices n
         LEFT JOIN notifications nt ON nt.type = $3 AND nt.metadata ->> 'notice_id' = n.id::text
        WHERE n.id = $1 AND n.complex_id = $2
        GROUP BY n.id`,
      [req.params.id, req.user.complex_id, NOTICE_TYPE]
    );
    if (!rows.length) return next(new AppError('Notice not found', 404));
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.createNotice = async (req, res, next) => {
  try {
    if (!req.user.complex_id) return next(new AppError('You must be assigned to a complex', 403));
    const { title, message, category, priority, starts_at, ends_at } = req.body;
    if (ends_at && new Date(ends_at) < new Date(starts_at)) {
      return next(new AppError('End date and time must be after the start date and time', 400));
    }
    const { rows } = await query(
      `INSERT INTO notices
         (complex_id, created_by, title, message, category, priority, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.complex_id, req.user.id, title, message, category, priority, starts_at, ends_at ?? null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateNotice = async (req, res, next) => {
  try {
    if (!req.user.complex_id) return next(new AppError('You must be assigned to a complex', 403));
    const updated = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM notices WHERE id = $1 AND complex_id = $2 FOR UPDATE',
        [req.params.id, req.user.complex_id]
      );
      if (!current.rows.length) throw new AppError('Notice not found', 404);
      const notice = current.rows[0];
      if (notice.status === 'cancelled') throw new AppError('Cancelled notices cannot be edited', 409);

      const startsAt = req.body.starts_at ?? notice.starts_at;
      const endsAt = Object.hasOwn(req.body, 'ends_at') ? req.body.ends_at : notice.ends_at;
      if (endsAt && new Date(endsAt) < new Date(startsAt)) {
        throw new AppError('End date and time must be after the start date and time', 400);
      }

      const { rows } = await client.query(
        `UPDATE notices SET
           title = CASE WHEN $3 THEN $4 ELSE title END,
           message = CASE WHEN $5 THEN $6 ELSE message END,
           category = CASE WHEN $7 THEN $8 ELSE category END,
           priority = CASE WHEN $9 THEN $10 ELSE priority END,
           starts_at = CASE WHEN $11 THEN $12 ELSE starts_at END,
           ends_at = CASE WHEN $13 THEN $14 ELSE ends_at END,
           updated_at = now()
         WHERE id = $1 AND complex_id = $2
         RETURNING *`,
        [req.params.id, req.user.complex_id,
          Object.hasOwn(req.body, 'title'), req.body.title ?? null,
          Object.hasOwn(req.body, 'message'), req.body.message ?? null,
          Object.hasOwn(req.body, 'category'), req.body.category ?? null,
          Object.hasOwn(req.body, 'priority'), req.body.priority ?? null,
          Object.hasOwn(req.body, 'starts_at'), req.body.starts_at ?? null,
          Object.hasOwn(req.body, 'ends_at'), endsAt]
      );
      if (rows[0].status === 'sent') {
        await client.query(
          `UPDATE notifications nt SET
             title = n.title,
             message = n.message,
             metadata = nt.metadata || jsonb_build_object(
               'category', n.category, 'priority', n.priority,
               'starts_at', n.starts_at, 'ends_at', n.ends_at, 'status', n.status
             )
           FROM notices n
          WHERE n.id = $1 AND nt.type = $2 AND nt.metadata ->> 'notice_id' = n.id::text`,
          [rows[0].id, NOTICE_TYPE]
        );
      }
      const notifications = rows[0].status === 'sent'
        ? (await client.query(
          `SELECT * FROM notifications WHERE type = $2 AND metadata ->> 'notice_id' = $1`,
          [rows[0].id, NOTICE_TYPE]
        )).rows
        : [];
      return { notice: rows[0], notifications };
    });
    emitNotifications(req.app.get('io'), 'notification_updated', updated.notifications);
    res.status(200).json({ success: true, data: updated.notice });
  } catch (error) {
    next(error);
  }
};

exports.sendNotice = async (req, res, next) => {
  try {
    if (!req.user.complex_id) return next(new AppError('You must be assigned to a complex', 403));
    const result = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM notices WHERE id = $1 AND complex_id = $2 FOR UPDATE',
        [req.params.id, req.user.complex_id]
      );
      if (!current.rows.length) throw new AppError('Notice not found', 404);
      if (current.rows[0].status !== 'draft') throw new AppError('Only draft notices can be sent', 409);

      const recipients = await client.query(
        `${recipientCte(1)} SELECT COUNT(*)::int AS count FROM eligible_notice_recipients`,
        [req.user.complex_id]
      );
      if (!recipients.rows[0].count) throw new AppError('There are no active residents or current unit tenants in this complex to receive the notice', 409);

      const { rows } = await client.query(
        `UPDATE notices SET status = 'sent', sent_at = now(), updated_at = now()
          WHERE id = $1 AND complex_id = $2 RETURNING *`,
        [req.params.id, req.user.complex_id]
      );
      const notifications = await deliverNotice(client, rows[0]);
      return { notice: rows[0], notifications };
    });
    emitNotifications(req.app.get('io'), 'notification', result.notifications);
    res.status(200).json({
      success: true,
      data: { ...result.notice, delivery_count: result.notifications.length },
      message: 'Notice sent to active residents and current unit tenants in your complex',
    });
  } catch (error) {
    next(error);
  }
};

exports.cancelNotice = async (req, res, next) => {
  try {
    if (!req.user.complex_id) return next(new AppError('You must be assigned to a complex', 403));
    const result = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM notices WHERE id = $1 AND complex_id = $2 FOR UPDATE',
        [req.params.id, req.user.complex_id]
      );
      if (!current.rows.length) throw new AppError('Notice not found', 404);
      if (current.rows[0].status === 'cancelled') throw new AppError('Notice is already cancelled', 409);

      const { rows } = await client.query(
        `UPDATE notices SET status = 'cancelled', cancelled_at = now(), updated_at = now()
          WHERE id = $1 AND complex_id = $2 RETURNING *`,
        [req.params.id, req.user.complex_id]
      );
      const notifications = (await client.query(
        `UPDATE notifications nt SET
           title = n.title || ' (Cancelled)',
           message = 'This notice has been cancelled. ' || n.message,
           metadata = nt.metadata || jsonb_build_object('status', 'cancelled')
         FROM notices n
        WHERE n.id = $1 AND nt.type = $2 AND nt.metadata ->> 'notice_id' = n.id::text
        RETURNING nt.*`,
        [rows[0].id, NOTICE_TYPE]
      )).rows;
      return { notice: rows[0], notifications };
    });
    emitNotifications(req.app.get('io'), 'notification_updated', result.notifications);
    res.status(200).json({ success: true, data: result.notice, message: 'Notice cancelled' });
  } catch (error) {
    next(error);
  }
};

exports.markNoticeRead = async (req, res, next) => {
  try {
    await ensureSocietyNoticeNotifications(req.user);
    const { rows } = await query(
      `UPDATE notifications nt SET is_read = true
        FROM notices n
       WHERE nt.user_id = $1 AND nt.type = $4
         AND nt.metadata ->> 'notice_id' = n.id::text
         AND n.id = $2
         AND ${noticeScopePredicate(req.user.role, '$1', '$3')}
         AND n.status IN ('sent', 'cancelled')
       RETURNING nt.*`,
      [req.user.id, req.params.id, req.user.complex_id, NOTICE_TYPE]
    );
    if (!rows.length) return next(new AppError('Notice not found', 404));
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};
