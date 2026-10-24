import api from './axios'

export const getSuperAdminDashboard = async () => {
  const res = await api.get('/super-admin/dashboard')
  return res.data
}

export const createComplex = async (data) => {
  const res = await api.post('/super-admin/complexes', data)
  return res.data
}

export const getComplex = async (id) => (await api.get(`/super-admin/complexes/${id}`)).data
export const updateComplex = async (id, data) => (await api.patch(`/super-admin/complexes/${id}`, data)).data
export const transitionComplexLifecycle = async (id, data) => (await api.post(`/super-admin/complexes/${id}/lifecycle`, data)).data

export const createAdmin = async (data) => {
  const res = await api.post('/super-admin/admins', data)
  return res.data
}

export const getMonetizationDashboard = async (params) => {
  const res = await api.get('/super-admin/monetization', { params })
  return res.data
}

export const getMonetizationPlans = async () => {
  const res = await api.get('/super-admin/monetization/plans')
  return res.data
}

export const createMonetizationPlan = async (data) => {
  const res = await api.post('/super-admin/monetization/plans', data)
  return res.data
}

export const updateMonetizationPlan = async (id, data) => {
  const res = await api.patch(`/super-admin/monetization/plans/${id}`, data)
  return res.data
}

export const getMonetizationSubscriptions = async (params) => {
  const res = await api.get('/super-admin/monetization/subscriptions', { params })
  return res.data
}

export const getMonetizationSubscription = async (id) => {
  const res = await api.get(`/super-admin/monetization/subscriptions/${id}`)
  return res.data
}

export const createMonetizationSubscription = async (data) => {
  const res = await api.post('/super-admin/monetization/subscriptions', data)
  return res.data
}

export const updateMonetizationSubscription = async (id, data) => {
  const res = await api.patch(`/super-admin/monetization/subscriptions/${id}`, data)
  return res.data
}

export const getMonetizationReport = async (params) => {
  const res = await api.get('/super-admin/monetization/reports', { params })
  return res.data
}

export const getPrivacyRequestInbox = async () => {
  const { data } = await api.get('/privacy/requests/admin')
  return data
}

export const updatePrivacyRequest = async (id, payload) => {
  const { data } = await api.patch(`/privacy/requests/admin/${id}`, payload)
  return data
}
