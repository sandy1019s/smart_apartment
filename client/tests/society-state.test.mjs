import test from 'node:test'
import assert from 'node:assert/strict'
import { applyConfirmedAdminRemoval, archiveNameMatches, filterSocieties } from '../src/pages/super-admin/societyState.mjs'

const societies = [
  { id: 'active', name: 'Lake View', address: 'Central Road', lifecycle_status: 'active', admins: [{ email: 'a@example.com' }] },
  { id: 'suspended', name: 'Palm Grove', lifecycle_status: 'suspended' },
  { id: 'archived', name: 'Old Garden', lifecycle_status: 'archived' },
]

test('society search finds names, addresses and assigned administrator fields with lifecycle filtering', () => {
  assert.deepEqual(filterSocieties(societies, { search: ' central ', lifecycleStatus: 'active' }).map(({ id }) => id), ['active'])
  assert.deepEqual(filterSocieties(societies, { search: 'a@example.com' }).map(({ id }) => id), ['active'])
  assert.deepEqual(filterSocieties(societies, { lifecycleStatus: 'archived' }).map(({ id }) => id), ['archived'])
  assert.deepEqual(filterSocieties([{ ...societies[0], subscription_status: 'trial' }], { subscriptionStatus: 'trial' }).map(({ id }) => id), ['active'])
})

test('archive confirmation requires an exact case-sensitive society name', () => {
  assert.equal(archiveNameMatches('Lake View', 'Lake View'), true)
  assert.equal(archiveNameMatches('lake view', 'Lake View'), false)
  assert.equal(archiveNameMatches('Lake View ', 'Lake View'), false)
})

test('confirmed admin removal updates only the selected society admin after backend success', () => {
  const admins = [
    { id: 'admin-1', full_name: 'First Admin' },
    { id: 'admin-2', full_name: 'Second Admin' },
  ]

  assert.deepEqual(applyConfirmedAdminRemoval(admins, { success: true }, 'admin-1'), [admins[1]])
  assert.deepEqual(applyConfirmedAdminRemoval(admins, { success: false }, 'admin-1'), admins)
  assert.deepEqual(applyConfirmedAdminRemoval(admins, null, 'admin-1'), admins)
})
