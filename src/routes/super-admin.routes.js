const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/super-admin.controller');
const monetizationController = require('../controllers/monetization.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { validate, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const {
  dashboardQuerySchema,
  planSchema,
  updatePlanSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  reportQuerySchema,
} = require('../validators/monetization.validator');
const { createComplexSchema, createAdminSchema } = require('../validators/admin.validator');
const { complexIdParamsSchema, complexAdminParamsSchema, updateComplexSchema, lifecycleTransitionSchema } = require('../validators/society-lifecycle.validator');

router.use(requireAuth);
router.use(requireRole(['super_admin']));

router.get('/dashboard', superAdminController.getDashboard);
router.post('/complexes', validate(createComplexSchema), superAdminController.createComplex);
router.get('/complexes/:id', validateParams(complexIdParamsSchema), superAdminController.getComplex);
router.patch('/complexes/:id', validateParams(complexIdParamsSchema), validate(updateComplexSchema), superAdminController.updateComplex);
router.post('/complexes/:id/lifecycle', validateParams(complexIdParamsSchema), validate(lifecycleTransitionSchema), superAdminController.transitionComplexLifecycle);
router.delete('/complexes/:id/admins/:adminId', validateParams(complexAdminParamsSchema), superAdminController.removeComplexAdmin);
router.post('/admins', validate(createAdminSchema), superAdminController.createAdmin);

router.get('/monetization', validateQuery(dashboardQuerySchema), monetizationController.getDashboard);
router.get('/monetization/reports', validateQuery(reportQuerySchema), monetizationController.getReport);
router.get('/monetization/plans', monetizationController.listPlans);
router.post('/monetization/plans', validate(planSchema), monetizationController.createPlan);
router.patch('/monetization/plans/:id', validate(updatePlanSchema), monetizationController.updatePlan);
router.get('/monetization/subscriptions', validateQuery(dashboardQuerySchema), monetizationController.listSubscriptions);
router.post('/monetization/subscriptions', validate(createSubscriptionSchema), monetizationController.createSubscription);
router.get('/monetization/subscriptions/:id', monetizationController.getSubscription);
router.patch('/monetization/subscriptions/:id', validate(updateSubscriptionSchema), monetizationController.updateSubscription);

module.exports = router;
