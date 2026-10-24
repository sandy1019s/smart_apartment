jest.mock('../src/config/db', () => ({ query: jest.fn(), getClient: jest.fn() }));
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('test-password-hash') }));

const express = require('express');
const request = require('supertest');
const { query, getClient } = require('../src/config/db');
const auditLogger = require('../src/utils/auditLogger');
const { signAccessToken } = require('../src/utils/jwt');
const { errorHandler } = require('../src/middlewares/error.middleware');
const superAdminRoutes = require('../src/routes/super-admin.routes');

const app = express();
app.use(express.json());
app.use('/super-admin', superAdminRoutes);
app.use(errorHandler);

const superAdminId = 'e45b0efa-7881-4f16-bf55-2c3b563847c9';
const userId = 'a20e3406-dad5-4b68-aacb-fc36cff4e2ad';
const complexId = 'fd08ca86-ad05-4a0a-929e-579cbff4e9c0';
const name = 'Lake View Society';
const token = (role = 'super_admin', id = superAdminId) => {
  process.env.JWT_ACCESS_SECRET = 'society-lifecycle-test-secret';
  return `Bearer ${signAccessToken({ id, role, email: `${role}@example.test` })}`;
};

const clientWith = (steps) => ({
  query: jest.fn(async (sql) => {
    const next = steps.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(sql);
    return next || { rows: [] };
  }),
  release: jest.fn(),
});

describe('Super Admin society lifecycle', () => {
  beforeEach(() => {
    query.mockReset();
    getClient.mockReset();
    jest.spyOn(auditLogger, 'info').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects unauthenticated lifecycle requests before querying society data', async () => {
    const response = await request(app).post(`/super-admin/complexes/${complexId}/lifecycle`).send({ action: 'suspend' });
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rejects ordinary users and society admins from lifecycle APIs', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: userId, role: 'admin', is_active: true, complex_id: complexId }] });
    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token('admin', userId))
      .send({ action: 'suspend' });
    expect(response.status).toBe(403);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('blocks normal API access for a suspended primary society without deactivating its user account', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: userId, role: 'admin', is_active: true, complex_id: complexId,
      complex_lifecycle_status: 'suspended',
    }] });
    const response = await request(app)
      .get('/super-admin/dashboard')
      .set('Authorization', token('admin', userId));
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/suspended/i);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('c.lifecycle_status AS complex_lifecycle_status');
  });

  it('does not block a resident account that has another active unit association', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: userId, role: 'resident', is_active: true, complex_id: complexId,
        complex_lifecycle_status: 'archived',
      }] })
      .mockResolvedValueOnce({ rows: [{ has_active_society: true }] });
    const response = await request(app)
      .get('/super-admin/dashboard')
      .set('Authorization', token('resident', userId));
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/insufficient privileges/i);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("active_complex.lifecycle_status = 'active'");
  });

  it('suspends only the society row and records the action without changing account state', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'active', archived_from_status: null }] },
      { rows: [{ id: complexId, name, lifecycle_status: 'suspended', archived_at: null, archived_from_status: null }] },
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);

    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'suspend' });

    expect(response.status).toBe(200);
    expect(response.body.data.lifecycle_status).toBe('suspended');
    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    expect(client.query.mock.calls[2][0]).toContain('UPDATE complexes SET lifecycle_status = $2::varchar');
    expect(client.query.mock.calls[2][0]).toContain("CASE WHEN $2::varchar = 'archived'");
    expect(client.query.mock.calls[2][1]).toEqual([complexId, 'suspended', null]);
    expect(client.query.mock.calls.some(([sql]) => /\bDELETE\b|TRUNCATE|DROP\s+TABLE/i.test(sql))).toBe(false);
    expect(auditLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'society_suspended', actorId: superAdminId, entityId: complexId,
    }));
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns a controlled database error and rolls back a failed suspension update', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'active', archived_from_status: null }] },
      Object.assign(new Error('inconsistent types deduced for parameter $2'), { code: '42P08' }),
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);

    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'suspend' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      status: 'error',
      message: 'A server error occurred. Please try again shortly.',
    });
    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'ROLLBACK']);
    expect(auditLogger.info).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'society_suspended' }));
  });

  it('shows society details and subscription state without changing existing assignment records', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [{
        id: complexId, name, lifecycle_status: 'active', total_users: 4,
        admins: [
          { id: userId, full_name: 'Society Admin', email: 'admin@example.com', is_active: true },
          { id: '78baae22-8302-4f93-8020-c0f3294b75d0', full_name: 'Second Admin', email: 'second@example.com', is_active: true },
        ],
        subscription_status: 'trial',
      }] });
    const response = await request(app)
      .get(`/super-admin/complexes/${complexId}`)
      .set('Authorization', token());
    expect(response.status).toBe(200);
    expect(response.body.data.subscription_status).toBe('trial');
    expect(response.body.data.admins[0].id).toBe(userId);
    expect(response.body.data.admins).toHaveLength(2);
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN users u ON u.complex_id = c.id');
    expect(query.mock.calls[1][0]).toContain('community_subscriptions');
  });

  it('removes only the selected administrator association and preserves the account and role', async () => {
    const removedAdmin = { id: userId, full_name: 'Society Admin', email: 'admin@example.com', role: 'admin', complex_id: null };
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [removedAdmin] });

    const response = await request(app)
      .delete(`/super-admin/complexes/${complexId}/admins/${userId}`)
      .set('Authorization', token());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: removedAdmin });
    expect(query.mock.calls[1][0]).toContain('UPDATE users');
    expect(query.mock.calls[1][0]).toContain('SET complex_id = NULL, updated_at = now()');
    expect(query.mock.calls[1][0]).toContain('WHERE id = $1::uuid');
    expect(query.mock.calls[1][0]).toContain('AND complex_id = $2::uuid');
    expect(query.mock.calls[1][0]).toContain("AND role = 'admin'");
    expect(query.mock.calls[1][0]).not.toMatch(/DELETE|UPDATE users SET role|user_units|complexes/i);
    expect(query.mock.calls[1][1]).toEqual([userId, complexId]);
    expect(auditLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'society_admin_removed', actorId: superAdminId, entityId: userId, complexId,
    }));
  });

  it('rejects administrator removal by non-super-admin users', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: userId, role: 'admin', is_active: true, complex_id: complexId }] });

    const response = await request(app)
      .delete(`/super-admin/complexes/${complexId}/admins/${userId}`)
      .set('Authorization', token('admin', userId));

    expect(response.status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects removal when the selected administrator is not assigned to that society', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete(`/super-admin/complexes/${complexId}/admins/${userId}`)
      .set('Authorization', token());

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(query.mock.calls[1][0]).toContain('AND complex_id = $2::uuid');
    expect(auditLogger.info).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'society_admin_removed' }));
  });

  it('handles an already removed administrator without reporting success', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete(`/super-admin/complexes/${complexId}/admins/${userId}`)
      .set('Authorization', token());

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(auditLogger.info).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'society_admin_removed' }));
  });

  it('edits only allowed society fields and ignores client-supplied lifecycle status', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: complexId, name: 'Lake View East', address: 'East Road', lifecycle_status: 'active' }] });
    const response = await request(app)
      .patch(`/super-admin/complexes/${complexId}`)
      .set('Authorization', token())
      .send({ name: 'Lake View East', address: 'East Road', lifecycle_status: 'archived', id: userId });
    expect(response.status).toBe(200);
    expect(response.body.data.lifecycle_status).toBe('active');
    expect(query.mock.calls[1][0].split('WHERE')[0]).not.toMatch(/lifecycle_status/i);
    expect(query.mock.calls[1][1]).toEqual([complexId, true, 'Lake View East', true, 'East Road']);
  });

  it('requires exact society-name confirmation and rolls back a rejected archive attempt', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'active', archived_from_status: null }] },
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);

    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'archive', confirm_name: 'lake view society' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/exact society name/i);
    expect(client.query.mock.calls.map(([sql]) => sql.trim())).toEqual([
      'BEGIN',
      'SELECT id, name, lifecycle_status, archived_from_status FROM complexes WHERE id = $1 FOR UPDATE',
      'ROLLBACK',
    ]);
  });

  it('archives with the exact society name and records the previous state without touching billing or membership rows', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'suspended', archived_from_status: null }] },
      { rows: [{ id: complexId, name, lifecycle_status: 'archived', archived_at: new Date(), archived_from_status: 'suspended' }] },
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);
    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'archive', confirm_name: name });
    expect(response.status).toBe(200);
    expect(response.body.data.lifecycle_status).toBe('archived');
    expect(client.query.mock.calls[2][1]).toEqual([complexId, 'archived', 'suspended']);
    expect(client.query.mock.calls[2][0]).not.toMatch(/subscription|users|buildings|units|notifications|payments/i);
    expect(client.query.mock.calls.some(([sql]) => /\bDELETE\b|TRUNCATE|DROP\s+TABLE/i.test(sql))).toBe(false);
  });

  it('rejects repeated suspension and rolls back without creating duplicate lifecycle state', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'suspended', archived_from_status: null }] },
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);
    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'suspend' });
    expect(response.status).toBe(409);
    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
  });

  it('restores an archived suspended society to suspended, preserving the recorded prior state', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'archived', archived_from_status: 'suspended' }] },
      { rows: [{ id: complexId, name, lifecycle_status: 'suspended', archived_at: null, archived_from_status: null }] },
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);

    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'restore' });

    expect(response.status).toBe(200);
    expect(response.body.data.lifecycle_status).toBe('suspended');
    expect(client.query.mock.calls[2][1]).toEqual([complexId, 'suspended', null]);
  });

  it('fails closed if archived state has no valid prior lifecycle value', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    const client = clientWith([
      { rows: [] },
      { rows: [{ id: complexId, name, lifecycle_status: 'archived', archived_from_status: null }] },
      { rows: [] },
    ]);
    getClient.mockResolvedValueOnce(client);
    const response = await request(app)
      .post(`/super-admin/complexes/${complexId}/lifecycle`)
      .set('Authorization', token())
      .send({ action: 'restore' });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/prior lifecycle state/i);
    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
  });

  it('prevents new admin assignment to non-active societies without deleting or reassigning users', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] });
    query.mockResolvedValueOnce({ rows: [] });
    const response = await request(app)
      .post('/super-admin/admins')
      .set('Authorization', token())
      .send({
        email: 'new-admin@example.com', phone: '9876543210', password: 'strong-test-password-123',
        full_name: 'New Admin', complex_id: complexId,
      });
    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/active society/i);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps the existing Add Society workflow and returns the default active lifecycle status', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: complexId, name, address: 'Central Road', lifecycle_status: 'active' }] });
    const response = await request(app)
      .post('/super-admin/complexes')
      .set('Authorization', token())
      .send({ name, address: 'Central Road' });
    expect(response.status).toBe(201);
    expect(response.body.data.lifecycle_status).toBe('active');
    expect(query.mock.calls[1][0]).toContain('INSERT INTO complexes');
  });

  it('keeps the existing admin assignment flow for an active society', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: superAdminId, role: 'super_admin', is_active: true, complex_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: complexId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: userId, role: 'admin', complex_id: complexId }] });
    const response = await request(app)
      .post('/super-admin/admins')
      .set('Authorization', token())
      .send({
        email: 'new-admin@example.com', phone: '9876543210', password: 'strong-test-password-123',
        full_name: 'New Admin', complex_id: complexId,
      });
    expect(response.status).toBe(201);
    expect(response.body.data.complex_id).toBe(complexId);
    expect(query.mock.calls[1][0]).toContain("lifecycle_status = 'active'");
    expect(query.mock.calls[3][0]).toContain("'admin'");
  });
});
