const { query } = require('../config/db');
const { sendEmail, sendSMS } = require('../utils/notifications');
const logger = require('../utils/logger');
const { hasActiveTenantUnitInNoticeComplex } = require('../utils/society-notice-scope');

/**
 * Central notification service.
 * Inserts a notification into the DB, emits via Socket.IO, and optionally sends email/SMS.
 *
 * @param {object} io - Socket.IO server instance (can be null)
 * @param {string} userId - target user UUID
 * @param {string} type - 'payment_reminder' | 'visitor_arrival' | 'emergency_alert'
 * @param {string} title - notification headline
 * @param {string} message - notification body
 * @param {object} [metadata] - optional JSON metadata
 */
async function notify(io, userId, type, title, message, metadata = {}) {
  try {
    // 1. Insert into DB
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, message, JSON.stringify(metadata)]
    );

    const notification = rows[0];

    // 2. Emit via Socket.IO (user-specific room)
    if (io) {
      io.to(`user:${userId}`).emit('notification', notification);
    }

    // 3. Fire-and-forget email/SMS
    const userRes = await query('SELECT email, phone FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      if (user.email) sendEmail(user.email, title, `<p>${message}</p>`).catch(() => {});
      if (user.phone) sendSMS(user.phone, `${title}: ${message}`).catch(() => {});
    }

    return notification;
  } catch (err) {
    logger.error('Notification service error', { errorName: err.name, errorCode: err.code });
    // Don't throw — notifications should never crash the main flow
    return null;
  }
}

/**
 * Bulk notify multiple users (fire-and-forget).
 */
async function notifyMany(io, userIds, type, title, message, metadata = {}) {
  return Promise.allSettled(
    userIds.map(uid => notify(io, uid, type, title, message, metadata))
  );
}

async function ensureSocietyNoticeNotifications(user) {
  if (!user || !['resident', 'tenant'].includes(user.role) || !user.id) return;
  await query(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     SELECT $1, $2, n.title, n.message,
            jsonb_build_object(
              'notice_id', n.id,
              'category', n.category,
              'priority', n.priority,
              'starts_at', n.starts_at,
              'ends_at', n.ends_at,
              'status', n.status
            )
       FROM notices n
      WHERE n.status = 'sent'
        AND EXISTS (
          SELECT 1 FROM complexes notice_complex
           WHERE notice_complex.id = n.complex_id
             AND notice_complex.lifecycle_status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM users notice_user
           WHERE notice_user.id = $1
             AND notice_user.role IN ('resident', 'tenant')
             AND notice_user.is_active = true
           AND ((notice_user.role = 'resident' AND notice_user.complex_id = n.complex_id)
                  OR ${hasActiveTenantUnitInNoticeComplex('notice_user.id')})
        )
     ON CONFLICT (user_id, (metadata ->> 'notice_id'))
       WHERE type = 'society_notice' AND metadata ? 'notice_id'
     DO NOTHING`,
    [user.id, 'society_notice']
  );
}

function isMissingSocietyNoticesTable(error) {
  return error?.code === '42P01'
    && typeof error.message === 'string'
    && /relation\s+(?:"(?:public\.)?notices"|(?:public\.)?notices)\s+does not exist/i.test(error.message);
}

module.exports = { notify, notifyMany, ensureSocietyNoticeNotifications, isMissingSocietyNoticesTable };
