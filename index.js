'use strict';
const { create, } = require('./lib/index');
const Promisie = require('promisie');

/**
 * Creates score evaluators
 * @param {Object} options configurable options for the generation of score evaluators
 * @param {Object|Object[]} options.segments either a single minimum requirement configuration or an array of configurations
 * @param {boolean} options.numeric specifies if numeric package should be used in numerical evaluations
 * @param {string} options.external_product an external product id that should be assigned as the product with each resulting evaluation output
 * @return {Object|Function} A single evaluator or an object containing evalutors indexed by name
 */
var generate = function (options, cb) {
  try {
    let evaluations;
    let { segments, module_name, } = options;
    if (!Array.isArray(options.segments)) evaluations = create(options.segments, module_name);
    else {
      evaluations = options.segments.reduce((result, configuration) => {
        result[configuration.name] = create(configuration, module_name);
        return result;
      }, {});
    }
    return (typeof cb === 'function') ? cb(null, evaluations) : Promisie.resolve(evaluations);
  } catch (e) {
    return (typeof cb === 'function') ? cb(e) : Promisie.reject(e);
  }
};

module.exports = generate;
