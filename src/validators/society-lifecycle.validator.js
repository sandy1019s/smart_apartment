const Joi = require('joi');

const uuid = Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required();

const complexIdParamsSchema = Joi.object({ id: uuid });
const updateComplexSchema = Joi.object({
  name: Joi.string().trim().min(2).max(255),
  address: Joi.string().trim().max(500).allow('', null),
}).min(1);
const lifecycleTransitionSchema = Joi.object({
  action: Joi.string().valid('suspend', 'reactivate', 'archive', 'restore').required(),
  confirm_name: Joi.string().max(255).when('action', {
    is: 'archive', then: Joi.required(), otherwise: Joi.forbidden(),
  }),
});

module.exports = { complexIdParamsSchema, updateComplexSchema, lifecycleTransitionSchema };
