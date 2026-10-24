jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../src/services/notification.service', () => ({
  ensureSocietyNoticeNotifications: jest.fn().mockResolvedValue(undefined),
  isMissingSocietyNoticesTable: (error) => error?.code === '42P01'
    && typeof error.message === 'string'
    && /relation\s+(?:"(?:public\.)?notices"|(?:public\.)?notices)\s+does not exist/i.test(error.message),
}));

const express = require('express');
const request = require('supertest');
const { query, getClient } = require('../src/config/db');
const { ensureSocietyNoticeNotifications } = require('../src/services/notification.service');
const { signAccessToken } = require('../src/utils/jwt');
const { errorHandler } = require('../src/middlewares/error.middleware');
const noticeRoutes = require('../src/routes/notice.routes');
const notificationRoutes = require('../src/routes/notification.routes');

const complexA = '0e88eb04-1eef-4bce-91f9-37c898018f3a';
const complexB = '2b49a5e2-f88f-4fbe-8a04-543d9ff2f104';
const adminId = 'ac91eccb-6ad0-4ed3-8485-af2fc6711011';
const residentId = '74d2d29c-4740-4c45-a20a-61b3ce529548';
const noticeId = '8e2d1e31-7cf7-4a23-9f21-8270e3628c3c';

const app = express();
app.use(express.json());
app.use('/notices', noticeRoutes);
app.use('/notifications', notificationRoutes);
app.use(errorHandler);

const authHeader = (user) => {
  process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-notices';
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, email: `${user.role}@example.test` })}`;
};

const dbUser = (id, role, complex_id) => ({ id, role, complex_id, is_active: true });
const makeClient = (calls) => ({
  query: jest.fn(),
  release: jest.fn(),
  ...calls,
});

describe('Society notices authorization and delivery', () => {
  beforeEach(() => {
    query.mockReset();
    getClient.mockReset();
    ensureSocietyNoticeNotifications.mockReset().mockResolvedValue(undefined);
    app.set('io', { to: jest.fn(() => ({ emit: jest.fn() })) });
  });

  it('creates a draft using the complex on the authenticated admin record, ignoring a supplied complex id', async () => {
    const createdNotice = { id: noticeId, complex_id: complexA, created_by: adminId, status: 'draft' };
    query
      .mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] })
      .mockResolvedValueOnce({ rows: [createdNotice] });

    const res = await request(app)
      .post('/notices')
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }))
      .send({
        complex_id: complexB,
        title: 'Water Tank Cleaning',
        message: 'Water supply will be interrupted for scheduled cleaning.',
        category: 'water_supply',
        priority: 'important',
        starts_at: '2026-10-06T10:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO notices');
    expect(query.mock.calls[1][1][0]).toBe(complexA);
    expect(query.mock.calls[1][1][1]).toBe(adminId);
    expect(query.mock.calls[1][1][0]).not.toBe(complexB);
  });

  it('rejects invalid notice categories before attempting to create a draft', async () => {
    query.mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] });

    const res = await request(app)
      .post('/notices')
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }))
      .send({
        title: 'Unrecognized notice',
        message: 'This should be rejected before it is stored.',
        category: 'not-a-category',
        starts_at: '2026-10-06T10:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns a safe unavailable response when notice creation hits the unapplied-schema error', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] })
      .mockRejectedValueOnce(Object.assign(new Error('relation "notices" does not exist'), { code: '42P01' }));

    const res = await request(app)
      .post('/notices')
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }))
      .send({
        title: 'Water Tank Cleaning',
        message: 'Water supply will be interrupted for scheduled cleaning.',
        category: 'water_supply',
        priority: 'important',
        starts_at: '2026-10-06T10:00:00.000Z',
      });

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('required database setup is incomplete');
    expect(JSON.stringify(res.body)).not.toContain('relation "notices"');
  });

  it('returns a safe unavailable response when the admin notice list table is missing', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] })
      .mockRejectedValueOnce(Object.assign(new Error('relation "notices" does not exist'), { code: '42P01' }));

    const res = await request(app)
      .get('/notices')
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }));

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('required database setup is incomplete');
  });

  it('does not let an admin read a notice from another complex', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/notices/${noticeId}`)
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }));

    expect(res.status).toBe(404);
    expect(query.mock.calls[1][0]).toContain('n.id = $1 AND n.complex_id = $2');
    expect(query.mock.calls[1][1]).toEqual([noticeId, complexA, 'society_notice']);
  });

  it('scopes a resident notice list to the resident complex and user notification records', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [{ id: noticeId, complex_id: complexB, is_read: false }] });

    const res = await request(app)
      .get('/notices')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(200);
    expect(ensureSocietyNoticeNotifications).toHaveBeenCalledWith(dbUser(residentId, 'resident', complexB));
    expect(query.mock.calls[1][0]).toContain('nt.user_id = $1');
    expect(query.mock.calls[1][0]).toContain('n.complex_id = $2');
    expect(query.mock.calls[1][0]).toContain("notice_assigned_complex.lifecycle_status = 'active'");
    expect(query.mock.calls[1][1]).toEqual([residentId, complexB, 'society_notice']);
  });

  it('allows a resident-role tenant to retrieve notices for a current tenant unit association', async () => {
    const tenantResident = dbUser(residentId, 'resident', null);
    query
      .mockResolvedValueOnce({ rows: [tenantResident] })
      .mockResolvedValueOnce({ rows: [{ id: noticeId, complex_id: complexB, is_read: false }] });

    const res = await request(app)
      .get('/notices')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(200);
    const listCall = query.mock.calls[1];
    expect(listCall[0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(listCall[0]).toContain('notice_uu.moved_out_at IS NULL');
    expect(listCall[0]).toContain('notice_building.complex_id = n.complex_id');
    expect(listCall[0]).toContain("notice_complex.lifecycle_status = 'active'");
    expect(listCall[0]).toContain('nt.user_id = $1');
    expect(listCall[1]).toEqual([residentId, null, 'society_notice']);
  });

  it('hides a notice from another complex from a resident detail request', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/notices/${noticeId}`)
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(404);
    expect(query.mock.calls[1][0]).toContain('nt.user_id = $1');
    expect(query.mock.calls[1][0]).toContain('n.id = $2');
    expect(query.mock.calls[1][0]).toContain('n.complex_id = $3');
    expect(query.mock.calls[1][0]).toContain("notice_assigned_complex.lifecycle_status = 'active'");
    expect(query.mock.calls[1][0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(query.mock.calls[1][1]).toEqual([residentId, noticeId, complexB, 'society_notice']);
  });

  it('rejects unauthorized roles before any notice data is read', async () => {
    const superAdminId = 'b3621f19-4ba8-4cba-95d2-b5d0e8978a6d';
    query.mockResolvedValueOnce({ rows: [dbUser(superAdminId, 'super_admin', null)] });

    const res = await request(app)
      .get('/notices')
      .set('Authorization', authHeader({ id: superAdminId, role: 'super_admin' }));

    expect(res.status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('authorizes a tenant role to list only notices for its current unit association', async () => {
    const tenantRoleId = '8ac0465e-3d50-4e87-b6dc-179c166027a4';
    query
      .mockResolvedValueOnce({ rows: [dbUser(tenantRoleId, 'tenant', null)] })
      .mockResolvedValueOnce({ rows: [{ id: noticeId, complex_id: complexA, is_read: false }] });

    const res = await request(app)
      .get('/notices')
      .set('Authorization', authHeader({ id: tenantRoleId, role: 'tenant' }));

    expect(res.status).toBe(200);
    expect(query.mock.calls[1][0]).toContain('nt.user_id = $1');
    expect(query.mock.calls[1][0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(query.mock.calls[1][0]).toContain('notice_uu.moved_out_at IS NULL');
    expect(query.mock.calls[1][0]).toContain('notice_building.complex_id = n.complex_id');
    expect(ensureSocietyNoticeNotifications).toHaveBeenCalledWith(dbUser(tenantRoleId, 'tenant', null));
  });

  it('sends to active resident and current tenant-unit recipients scoped to the assigned complex', async () => {
    const draft = { id: noticeId, complex_id: complexA, status: 'draft' };
    const sent = { ...draft, status: 'sent', sent_at: new Date() };
    const deliveries = [
      { id: 'notification-1', user_id: residentId, type: 'society_notice' },
      { id: 'notification-2', user_id: '9f23a678-8935-4f97-a6dc-064f3bc1d3da', type: 'society_notice' },
    ];
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [draft] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: deliveries })
      .mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] });
    getClient.mockResolvedValueOnce(client);

    const res = await request(app)
      .post(`/notices/${noticeId}/send`)
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data.delivery_count).toBe(2);
    expect(client.query.mock.calls[2][1]).toEqual([complexA]);
    const countCall = client.query.mock.calls[2];
    expect(countCall[0]).toContain('WITH eligible_notice_recipients AS');
    expect(countCall[0]).toContain('SELECT COUNT(*)::int AS count FROM eligible_notice_recipients');
    expect(countCall[0]).toContain('UNION');
    expect(countCall[0]).toContain("uu.relation::text = 'tenant'");
    expect(countCall[0]).toContain('uu.moved_out_at IS NULL');
    expect(countCall[0]).toContain('b.complex_id = $1');
    expect(countCall[0]).toContain('u.is_active = true');
    const deliveryCall = client.query.mock.calls[4];
    expect(deliveryCall[0]).toContain('u.complex_id = $9');
    expect(deliveryCall[0]).toContain('FROM user_units uu');
    expect(deliveryCall[0]).toContain('JOIN users u ON u.id = uu.user_id');
    expect(deliveryCall[0]).toContain('JOIN units un ON un.id = uu.unit_id');
    expect(deliveryCall[0]).toContain('JOIN buildings b ON b.id = un.building_id');
    expect(deliveryCall[0]).toContain("uu.relation::text = 'tenant'");
    expect(deliveryCall[0]).toContain('uu.moved_out_at IS NULL');
    expect(deliveryCall[0]).toContain('b.complex_id = $9');
    expect(deliveryCall[0].match(/u\.is_active = true/g)).toHaveLength(2);
    expect(deliveryCall[0]).toContain('ON CONFLICT');
    expect(deliveryCall[0]).toContain('DO NOTHING');
    expect(deliveryCall[0]).toContain("'notice_id', $1::uuid");
    expect(deliveryCall[0]).toContain("'category', $5::text");
    expect(deliveryCall[0]).toContain("'priority', $6::text");
    expect(deliveryCall[0]).toContain("'starts_at', $7::timestamptz");
    expect(deliveryCall[0]).toContain("'ends_at', $8::timestamptz");
    expect(deliveryCall[1][8]).toBe(complexA);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', expect.any(String), expect.any(String), expect.any(String), expect.any(String), 'COMMIT']);
    expect(app.get('io').to).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back notice delivery when PostgreSQL cannot infer a notification parameter type', async () => {
    const databaseError = Object.assign(new Error('could not determine data type of parameter $1'), { code: '42P18' });
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: noticeId, complex_id: complexA, status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: noticeId, complex_id: complexA, status: 'sent' }] })
      .mockRejectedValueOnce(databaseError)
      .mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] });
    getClient.mockResolvedValueOnce(client);

    const res = await request(app)
      .post(`/notices/${noticeId}/send`)
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }));

    expect(res.status).toBe(500);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', expect.any(String), expect.any(String), expect.any(String), expect.any(String), 'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(res.body.message).toBe('A server error occurred. Please try again shortly.');
  });

  it('rolls back a send when the assigned complex has no active residents', async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: noticeId, complex_id: complexA, status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] });
    getClient.mockResolvedValueOnce(client);

    const res = await request(app)
      .post(`/notices/${noticeId}/send`)
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }));

    expect(res.status).toBe(409);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', expect.any(String), expect.any(String), 'ROLLBACK']);
    expect(app.get('io').to).not.toHaveBeenCalled();
  });

  it('reflects edits on the existing per-resident notification rows without re-delivering', async () => {
    const current = { id: noticeId, complex_id: complexA, status: 'sent', starts_at: new Date('2026-10-06T10:00:00Z'), ends_at: null };
    const updated = { ...current, title: 'Updated water cleaning', message: 'New timing', starts_at: new Date('2026-10-06T11:00:00Z') };
    const notification = { id: 'notification-1', user_id: residentId, is_read: false, type: 'society_notice' };
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [notification] })
      .mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] });
    getClient.mockResolvedValueOnce(client);

    const res = await request(app)
      .patch(`/notices/${noticeId}`)
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }))
      .send({ title: 'Updated water cleaning', message: 'New timing' });

    expect(res.status).toBe(200);
    expect(client.query.mock.calls[1][0]).toContain('WHERE id = $1 AND complex_id = $2 FOR UPDATE');
    expect(client.query.mock.calls[3][0]).toContain('UPDATE notifications nt SET');
    expect(client.query.mock.calls[3][0]).toContain("nt.metadata ->> 'notice_id' = n.id::text");
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO notifications'))).toBe(false);
    expect(app.get('io').to).toHaveBeenCalledTimes(1);
  });

  it('cancels a notice and updates the already-delivered resident notifications', async () => {
    const current = { id: noticeId, complex_id: complexA, status: 'sent' };
    const cancelled = { ...current, status: 'cancelled', cancelled_at: new Date() };
    const notification = { id: 'notification-1', user_id: residentId, is_read: false, type: 'society_notice', metadata: { status: 'cancelled' } };
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [cancelled] })
      .mockResolvedValueOnce({ rows: [notification] })
      .mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [dbUser(adminId, 'admin', complexA)] });
    getClient.mockResolvedValueOnce(client);

    const res = await request(app)
      .post(`/notices/${noticeId}/cancel`)
      .set('Authorization', authHeader({ id: adminId, role: 'admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(client.query.mock.calls[1][0]).toContain('WHERE id = $1 AND complex_id = $2 FOR UPDATE');
    expect(client.query.mock.calls[3][0]).toContain("metadata = nt.metadata || jsonb_build_object('status', 'cancelled')");
    expect(client.query.mock.calls[3][1]).toEqual([noticeId, 'society_notice']);
    expect(app.get('io').to).toHaveBeenCalledTimes(1);
  });

  it('lets a resident mark only their own same-complex notice delivery as read', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [{ id: 'notification-1', user_id: residentId, is_read: true }] });

    const res = await request(app)
      .patch(`/notices/${noticeId}/read`)
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(200);
    expect(ensureSocietyNoticeNotifications).toHaveBeenCalledWith(dbUser(residentId, 'resident', complexB));
    expect(query.mock.calls[1][0]).toContain('nt.user_id = $1');
    expect(query.mock.calls[1][0]).toContain('n.complex_id = $3');
    expect(query.mock.calls[1][0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(query.mock.calls[1][1]).toEqual([residentId, noticeId, complexB, 'society_notice']);
  });

  it('lets a current tenant-unit recipient mark their own notice as read', async () => {
    const tenantResident = dbUser(residentId, 'resident', null);
    query
      .mockResolvedValueOnce({ rows: [tenantResident] })
      .mockResolvedValueOnce({ rows: [{ id: 'notification-1', user_id: residentId, is_read: true }] });

    const res = await request(app)
      .patch(`/notices/${noticeId}/read`)
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(200);
    expect(query.mock.calls[1][0]).toContain('nt.user_id = $1');
    expect(query.mock.calls[1][0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(query.mock.calls[1][0]).toContain('notice_building.complex_id = n.complex_id');
    expect(query.mock.calls[1][1]).toEqual([residentId, noticeId, null, 'society_notice']);
  });

  it('filters notice records from another complex out of the notification list and unread badge', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [] });

    const badge = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));
    const list = await request(app)
      .get('/notifications')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(badge.status).toBe(200);
    expect(list.status).toBe(200);
    expect(query.mock.calls[1][0]).toContain('n.complex_id = $2');
    expect(query.mock.calls[1][0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(query.mock.calls[1][0]).toContain('notice_building.complex_id = n.complex_id');
    expect(query.mock.calls[1][1]).toEqual([residentId, complexB]);
    expect(query.mock.calls[3][0]).toContain('n.complex_id = $2');
    expect(query.mock.calls[3][0]).toContain("notice_uu.relation::text = 'tenant'");
    expect(query.mock.calls[3][0]).toContain('notice_building.complex_id = n.complex_id');
    expect(query.mock.calls[3][1]).toEqual([residentId, complexB]);
  });

  it('preserves the existing unread badge when the society notices table is not installed yet', async () => {
    const missingNoticesTable = Object.assign(new Error('relation "notices" does not exist'), { code: '42P01' });
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] });
    ensureSocietyNoticeNotifications.mockRejectedValueOnce(missingNoticesTable);

    const res = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(query.mock.calls[1][0]).toContain('nt.type <> $2');
    expect(query.mock.calls[1][1]).toEqual([residentId, 'society_notice']);
  });

  it('preserves ordinary notifications when listing while the society notices table is not installed', async () => {
    const existingNotification = { id: 'ordinary-notification', type: 'visitor_arrival' };
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [existingNotification] });
    ensureSocietyNoticeNotifications.mockRejectedValueOnce(
      Object.assign(new Error('relation "notices" does not exist'), { code: '42P01' })
    );

    const res = await request(app)
      .get('/notifications')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([existingNotification]);
    expect(query.mock.calls[1][0]).toContain('nt.type <> $2');
    expect(query.mock.calls[1][1]).toEqual([residentId, 'society_notice']);
  });

  it('does not let a resident mark a prior-complex notice notification as read', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(residentId, 'resident', complexB)] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/notifications/notification-from-old-complex/read')
      .set('Authorization', authHeader({ id: residentId, role: 'resident' }));

    expect(res.status).toBe(404);
    expect(query.mock.calls[1][0]).toContain('n.complex_id = $3');
    expect(query.mock.calls[1][1]).toEqual(['notification-from-old-complex', residentId, complexB]);
  });
});
