'use strict';
const vm = require('vm');
const path = require('path');
const Conditional = require('@digifi-los/comparison').Conditional;
const Promisie = require('promisie');
const utility = require(path.join(__dirname, '../utility'));

/**
 * Handles coverting values to string representations consumable by the VM script
 * @param  {*} value Value to convert for the VM
 * @return {string|number}       Converted value
 */
var handleValueAssignment = function (value) {
  if (typeof value === 'string' && value.includes('state[')) return value;
  if (typeof value === 'string') return `'${value}'`;
  else if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.reduce((result, v, index) => {
      result += ((typeof v === 'string') ? `'${v}'` : v) + ((index !== value.length - 1) ? ', ' : '');
      return result;
    }, '[') + ']';
  } else if (value && typeof value === 'object') return JSON.stringify(value);
  else return value;
};

/**
 * Converts a configuration to the stringified function value that will be used as evaluation in a rule being inserted in the RiskGrader
 * @param {Object} rule The configurable used to dynamically generate the evaluation function for a RiskGrader rule
 * @param {string} rule.state_property_attibute The flattened path to the field which is being used in the evaluation
 * @param {*} rule.value_comparison The value to compare the state_property_attibute against in all evaluations other than RANGE
 * @param {number} [rule.value_minimum] The lower boundary value to be used in a RANGE comparison
 * @param {number} [rule.value_maximum] The upper boundary value to be used in a RANGE comparison
 * @param {string} rule.condition_test The type of evaluation to be used
 * @return {string} The stringified evaluation function
 */
var generateEvaluation = function (rule) {
  let { variable_name, value_comparison, condition_test, value_minimum, value_maximum, value_comparison_type, value_minimum_type, value_maximum_type, } = rule;

  let condition1 = condition_test.toLowerCase().replace(/\s+/g, '');
  let condition2;


  value_comparison = (value_comparison && value_comparison_type === 'variable') ? `state['${value_comparison}']` : value_comparison;

  value_minimum = (value_minimum && value_minimum_type === 'variable') ? `state['${value_minimum}']` : value_minimum;

  value_maximum = (value_maximum && value_maximum_type === 'variable') ? `state['${value_maximum}']` : value_maximum;

  let result = 'function (state) {\r\n';
  result += '\ttry {\r\n';
  let property = `state${(variable_name.indexOf('[') !== 0) ? '.' + variable_name : variable_name}`;
  
  result += `if(${property} === undefined) throw new Error("The Variable ${variable_name} is required by a Rule but is not defined.");\r\n`
  result += `if(/range/i.test("${condition_test}") && ${handleValueAssignment(value_minimum)} === undefined) throw new Error("The Variable ${rule.value_minimum} is required by a Rule but is not defined.");\r\n`
  result += `if(/range/i.test("${condition_test}") && ${handleValueAssignment(value_maximum)} === undefined) throw new Error("The Variable ${rule.value_maximum} is required by a Rule but is not defined.");\r\n`
  result += `if(!(/range/i.test("${condition_test}")) && !(/null/i.test("${condition_test}")) && ${handleValueAssignment(value_comparison)} === undefined) throw new Error("The Variable ${rule.value_comparison} is required by a Rule but is not defined.");\r\n`
  
  
  result += `\t\treturn compare(${property}).${condition1}`;
  if (condition2) result += `.${condition2}`;
  result += `(${(/range/i.test(condition_test)) ? (handleValueAssignment(value_minimum) + ', ' + handleValueAssignment(value_maximum)) : handleValueAssignment(value_comparison)});`;
  result += '\t} catch (e) {\r\n';
  result += '\t\tthrow e;\r\n\t}\r\n';
  result += '}';
  return result;

};

/**
 * Creates a RiskGrader instance and dynamically generates evaluation functions and inserts them as rules
 * @param  {Object} ruleset Object containing the rules array
 * @param  {Function} compare Bound Conditional.compare method used for convenient expression of comparisons
 * @return {Object} Returns an instance of the RiskGrader class that has had rules inserted
 */
var createRiskGrader = function (configurations) {
  let { segment, compare } = configurations;
  let rules = segment.ruleset;
  let context = { compare, risk_grader: new utility.Grader(), };
  let string_evaluator = rules.reduce((script, rule) => {
    if (rule.variable_name.toLowerCase() === 'constant') {
      context.risk_grader.insert(null, { weight: rule.condition_output.weight, }, { output_type: 'value', }, true, rule.rule_name, rule.rule_type);
    } else {
      script += `risk_grader.insert(${generateEvaluation(rule)},${handleValueAssignment(rule.condition_output.weight)}, ${(rule.condition_output_types && rule.condition_output_types.weight === "variable") ? "'variable'" : "'value'"
        }, null, ${handleValueAssignment(rule.rule_name)}, ${handleValueAssignment(rule.rule_type)});\r\n`;
    }
    return script;
  }, '"use strict";\r\n');
  vm.createContext(context);
  let evaluate = new vm.Script(string_evaluator);
  evaluate.runInContext(context);
  return context.risk_grader;
};

/**
 * Creates an evaluator function
 * @param {Object} segment Configuration details for script and context of a vm that will be evaluated
 * @param {boolean} numeric If true percision evalutions will be performed on all numerical comparisons (uses the numeric npm package)
 * @param {string} external_product An external product id assigned to the output to identify the product for which the evaluation was executed
 * @return {Function} Segment evaluator function
 */
var createEvaluator = function (segment, module_name) {
  let conditional = new Conditional({});
  let compare = conditional.compare.bind(conditional);
  let riskGrader = createRiskGrader({ segment, compare });
  /**
   * Evaluates current state against the defined segment rules
   * @param {state} state State data used in evaluation of segment
   * @return {Object} Returns the base score object that has been generated by the score evaluation
   */
  let evaluator = function evaluator(state) {
    let _state;
    let evaluated;
    let result;
    try {
      if (segment.output_variable === undefined) {
        throw new Error('Output Variable is required for scorecard but is not defined.');
      } else {
        _state = Object.assign({}, state);
        evaluated = riskGrader.score(_state, segment);
        result = Object.assign({
          name: module_name,
          type: 'Scorecard',
          output_variable: segment.output_variable,
          segment: segment.name,
          rules: evaluated.contributions.map(contribution => {
            return {
              name: contribution.label,
              weight: contribution.contribution,
            }
          }),
        });
        result[ `${segment.output_variable}` ] = (evaluated.base_score) ? evaluated.base_score : 0;
        if (segment.sync === true) return result;
        return Promisie.resolve(result);
      }
    } catch (e) {
      state.error = {
        code: '',
        message: e.message
      };
      if (segment.sync === true) return { error: e, result, };
      return Promisie.resolve({ error: e.message, result, });
    }
  };
  evaluator.score = riskGrader.score.bind(riskGrader);
  evaluator.adjustment = riskGrader.adjustment.bind(riskGrader);
  return evaluator;
};

module.exports = createEvaluator;