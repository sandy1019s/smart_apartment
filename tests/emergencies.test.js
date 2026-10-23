jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { query } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { errorHandler } = require('../src/middlewares/error.middleware');
const serviceRoutes = require('../src/routes/services.routes');

const complexId = '0e88eb04-1eef-4bce-91f9-37c898018f3a';
const otherComplexId = '2b49a5e2-f88f-4fbe-8a04-543d9ff2f104';
const reporterId = '74d2d29c-4740-4c45-a20a-61b3ce529548';
const staffId = 'ac91eccb-6ad0-4ed3-8485-af2fc6711011';
const otherResidentId = '65a9e78c-00f7-4cbf-99a4-34eeaa20112d';
const alertId = '8e2d1e31-7cf7-4a23-9f21-8270e3628c3c';

const app = express();
app.use(express.json());
app.use('/services', serviceRoutes);
app.use(errorHandler);

const authHeader = (user) => {
  process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-emergencies';
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, email: `${user.role}@example.test` })}`;
};

const dbUser = (id, role, userComplexId) => ({
  id, role, complex_id: userComplexId, is_active: true,
});

describe('Emergency alert resolution', () => {
  let emit;
  beforeEach(() => {
    query.mockReset();
    emit = jest.fn();
    app.set('io', { to: jest.fn(() => ({ emit })) });
  });

  it('allows the reporter to resolve their alert and emits the resolution event', async () => {
    const resolvedAlert = { id: alertId, user_id: reporterId, status: 'resolved' };
    query
      .mockResolvedValueOnce({ rows: [dbUser(reporterId, 'resident', complexId)] })
      .mockResolvedValueOnce({ rows: [resolvedAlert] });

    const response = await request(app)
      .patch(`/services/emergencies/${alertId}`)
      .set('Authorization', authHeader({ id: reporterId, role: 'resident' }))
      .send({ status: 'resolved' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: resolvedAlert });
    expect(query.mock.calls[1][0]).toContain("$4::text IN ('admin', 'security')");
    expect(query.mock.calls[1][0]).toContain('$5::uuid IS NOT NULL');
    expect(query.mock.calls[1][0]).toContain('reporter.complex_id = $5::uuid');
    expect(query.mock.calls[1][1]).toEqual(['resolved', alertId, reporterId, 'resident', complexId]);
    expect(emit).toHaveBeenCalledWith('emergency_resolved', { id: alertId, status: 'resolved' });
  });

  it('allows authorized staff to resolve an alert in their own complex', async () => {
    const resolvedAlert = { id: alertId, user_id: reporterId, status: 'resolved' };
    query
      .mockResolvedValueOnce({ rows: [dbUser(staffId, 'admin', complexId)] })
      .mockResolvedValueOnce({ rows: [resolvedAlert] });

    const response = await request(app)
      .patch(`/services/emergencies/${alertId}`)
      .set('Authorization', authHeader({ id: staffId, role: 'admin' }))
      .send({ status: 'resolved' });

    expect(response.status).toBe(200);
    expect(query.mock.calls[1][1]).toEqual(['resolved', alertId, staffId, 'admin', complexId]);
    expect(query.mock.calls[1][0]).toContain('reporter.complex_id = $5::uuid');
    expect(emit).toHaveBeenCalledWith('emergency_resolved', { id: alertId, status: 'resolved' });
  });

  it('rejects another resident resolving an alert outside their ownership', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(otherResidentId, 'resident', otherComplexId)] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .patch(`/services/emergencies/${alertId}`)
      .set('Authorization', authHeader({ id: otherResidentId, role: 'resident' }))
      .send({ status: 'resolved' });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns a controlled error and does not emit success when the database fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [dbUser(reporterId, 'resident', complexId)] })
      .mockRejectedValueOnce(Object.assign(new Error('could not determine data type of parameter $4'), {
        code: '42P08',
      }));

    const response = await request(app)
      .patch(`/services/emergencies/${alertId}`)
      .set('Authorization', authHeader({ id: reporterId, role: 'resident' }))
      .send({ status: 'resolved' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, status: 'error', message: 'A server error occurred. Please try again shortly.' });
    expect(emit).not.toHaveBeenCalled();
  });
});
