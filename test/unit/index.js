'use strict';
const chai = require('chai');
const expect = chai.expect;
const Promisie = require('promisie');
const MOCKS = require('../mocks');
const path = require('path');
const CREATE_EVALUATOR = require(path.join(__dirname, '../../lib')).create;

chai.use(require('chai-spies'));

describe('scorecard module', function () {
  describe('basic assumptions', function () {
    it('should have a create method that is a function', () => {
      expect(CREATE_EVALUATOR).to.be.a('function');
    });
    it('should accept a segment as an arguments and generate an evaluator', () => {
      let evaluator = CREATE_EVALUATOR(MOCKS.DEFAULT, 'scorecard_segment');
      expect(evaluator).to.be.a('function');
    });
    it('should error if no output variable is defined for the weight', async function () {
      let evaluator = CREATE_EVALUATOR({
        "name": "default_segment",
        "ruleset": [
        ]
      }, 'scorecard_segment');
      let result = await evaluator({});
      expect(result.error).to.have.string('Output Variable is required for scorecard but is not defined.');
      expect(result.result).to.be.undefined;
    });
  });

  describe('evaluation of simple rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.BASIC, 'scorecard_segment');
      done();
    });
    it('should return the aggregated weight when all evaluations result in true', async function () {
      let result = await evaluation({
        age: 19,
        applicant_state: 'NJ',
        debt_to_income: 0.05,
        income: 80000,
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(200);
    });
    it('should return the initial weight when evaluation results in false', async function () {
      let result = await evaluation({
        age: 16,
        applicant_state: 'MI',
        debt_to_income: 0.4,
        income: 35000,
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(100);
    });
    it('should properly handle an error', async function () {
      let result = await evaluation({
        age: 17,
      });
      expect(result.error).to.have.string('The Variable debt_to_income is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
  });

  describe('evaluation of complex rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.COMPLEX, 'scorecard_segment');
      done();
    });
    it('should return highest possible weight when all evaluations result in true', async function () {
      let result = await evaluation({
        age: 25,
        is_employed: true,
        annual_income: 80000,
        fico_score: 800,
        checking_account_balance: 100000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(1600);
    });
    it('should still return highest possible weight even when one of OR evaluation results in false', async function () {
      let result = await evaluation({
        age: 25,
        is_employed: true,
        annual_income: 0,
        fico_score: 800,
        checking_account_balance: 500000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(1600);
    });
    it('should not add the weight if all of the OR evaluations result in false', async function () {
      let result = await evaluation({
        age: 50,
        is_employed: true,
        annual_income: 10000,
        fico_score: 650,
        checking_account_balance: 1000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(1400);
    });
    it('should not add the weight when one of the AND evaluation results in false', async function () {
      let result = await evaluation({
        age: 25,
        is_employed: false,
        annual_income: 80000,
        fico_score: 800,
        checking_account_balance: 100000,
        move_in_date: "2018-08-20T00:00:00.000Z"
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(1500);
    });
  });

  describe('evaluation of dynamic value rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.DYNAMIC, 'scorecard_segment');
      done();
    });
    it('should do range comparison against the variables on the state', async function () {
      let result = await evaluation({
        is_employed: true,
        dynamic_weight: 25,
        dynamic_interest_rate_min: 0.07,
        dynamic_interest_rate_max: 0.2,
        calculated_interest_rate: 0.25,
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(25);
      let second_result = await evaluation({
        is_employed: false,
        dynamic_weight: 25,
        dynamic_interest_rate_min: 0.07,
        dynamic_interest_rate_max: 0.2,
        calculated_interest_rate: 0.19,
      });
      expect(second_result.output_variable).to.equal('total_weight');
      expect(second_result[ 'total_weight' ]).to.equal(500);
    });
    it('should error when missing a variable for range comparison', async function () {
      let result = await evaluation({
        is_employed: false,
        dynamic_weight: 25,
        dynamic_interest_rate_max: 0.2,
        calculated_interest_rate: 0.19,
      });
      expect(result.error).to.have.string('The Variable dynamic_interest_rate_min is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
    it('should error when missing a variable for weight', async function () {
      evaluation = CREATE_EVALUATOR({
        "name": "segment_1",
        "output_variable": "total_weight",
        "ruleset": [
          {
            "rule_name": "rule_0",
            "condition_test": "GT",
            "value_comparison": "min_age",
            "value_comparison_type": "variable",
            "variable_name": "age",
            "condition_output": {
              "weight": "custom_weight",
            },
            "condition_output_types": {
              "weight": "variable",
            }
          }
        ]
      }, 'scorecard_segment');
      let result = await evaluation({
        age: 20,
        min_age: 18,
      });
      expect(result.error).to.have.string('The Variable custom_weight is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
    it('should do comparison against the variables on the state', async function () {
      evaluation = CREATE_EVALUATOR({
        "name": "segment_1",
        "output_variable": "total_weight",
        "ruleset": [
          {
            "rule_name": "rule_0",
            "condition_test": "GT",
            "value_comparison": "min_age",
            "value_comparison_type": "variable",
            "variable_name": "age",
            "condition_output": {
              "weight": 35,
            }
          }
        ]
      }, 'scorecard_segment');
      let result = await evaluation({
        min_age: 18,
        age: 12,
      });
      expect(result.output_variable).to.equal('total_weight');
      expect(result[ 'total_weight' ]).to.equal(0);
      let second_result = await evaluation({
        min_age: 18,
        age: 20,
      });
      expect(second_result.output_variable).to.equal('total_weight');
      expect(second_result[ 'total_weight' ]).to.equal(35);
    });
    it('should error when missing a variable for value comparison', async function () {
      let result = await evaluation({
        age: 20,
      });
      expect(result.error).to.have.string('The Variable min_age is required by a Rule but is not defined.');
      expect(result.result).to.be.undefined;
    });
  });
});