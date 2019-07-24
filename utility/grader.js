'use strict';

var calculateContribution = function (average = 0, weight = 0) {
  return Number(weight) - Number(average);
};

const RiskGrader = class RiskGrader {
  constructor () {
    this.rules = [];
    this.constantWeight = 0;
    this.contributions = [];
  }
  insert(evaluation, output, output_type, isConstant, rule_name, rule_type) {
    if (isConstant) {
      this.constantWeight += output.weight;
      this.contributions.push({
        contribution: output.weight,
        label: rule_name,
      });
    }    else this.rules.push(Object.assign({}, { evaluation, }, { weight_type: output_type, }, { weight: output, }, { rule_name, }, { rule_type, }));
  }
  score (state, meta_data, loan_index = 0) {
    let totalWeight = this.constantWeight;
    let top = [];
    let contributionIndex = [];
    let sorted_rules = {};
    this.rules.forEach(rule => {
      let r = Object.assign({}, rule);
      if (sorted_rules[ r.rule_name ] && !Array.isArray(sorted_rules[ r.rule_name ])) sorted_rules[ r.rule_name ] = [ sorted_rules[ r.rule_name ], r, ];
      else if (sorted_rules[ r.rule_name ] && Array.isArray(sorted_rules[ r.rule_name ])) sorted_rules[ r.rule_name ].push(r);
      else if (!r.rule_name) {
        r.rule_name = 'solo';
        sorted_rules[ r.rule_name ] = rule;
      } else sorted_rules[ r.rule_name ] = rule;
    });
    for (let rule in sorted_rules) {
      rule = sorted_rules[ rule ];
      if (Array.isArray(rule)) {
        if(rule[0].weight_type === 'variable' && state[ rule[0].weight ] === undefined) {
          throw new Error(`The Variable ${rule[0].weight} is required by a Rule but is not defined.`)
        }
        let results = rule.map(r => r.evaluation(state));
        let passed;
        let variable_weight = (rule[0].weight_type === 'variable') ? state[ rule[0].weight ] : rule[0].weight;
        if (rule[ 0 ].rule_type === 'AND') passed = results.every(r => r === true);
        if (rule[ 0 ].rule_type === 'OR') passed = results.indexOf(true) !== -1;

        let result = {
          contribution: calculateContribution(rule[ 0 ].average_weight, (passed) ? variable_weight : 0),
          label: rule[0].rule_name,
        };

        if (contributionIndex.indexOf(result.label) !== -1) {
          let index = contributionIndex.indexOf(result.label);
          if (passed) totalWeight += variable_weight;
          top[ index ].contribution += result.contribution;
        } else {
          
          contributionIndex.push(result.label);
          if (passed) totalWeight += variable_weight;
          top.push(result);
        }
      
      } else {
        let passed = rule.evaluation(state);
        if(rule.weight_type && rule.weight_type === 'variable' && isNaN(state[ rule.weight ])) {
          throw new Error(`The Variable ${rule.weight} is required by a Rule but is not defined.`)
        }
        let variable_weight = (rule && rule.weight_type && rule.weight_type === 'variable') ? state[ rule.weight ] : rule.weight;
        variable_weight = variable_weight || 0;
        let result = {
          contribution: calculateContribution(rule.average_weight, (passed) ? variable_weight : 0),
          label: rule.rule_name,
        };

        if (contributionIndex.indexOf(result.label) !== -1) {
          let index = contributionIndex.indexOf(result.label);
          if (passed) totalWeight += variable_weight;
          top[ index ].contribution += result.contribution;
        } else {
          contributionIndex.push(result.label);
          if (passed) totalWeight += variable_weight;
          top.push(result);
        }
      } 
    }
    return {
      base_score: totalWeight,
      contributions: top.sort((a, b) => b.contribution - a.contribution),
    };
  }
  adjustment (score, state, base_score, loan_index) {
    let combinedState = Object.assign({}, { score, }, state);
    let result = this.score(combinedState, null, loan_index);
    return {
      score_adjustment: (result.score_cap && !isNaN(Number(result.score_cap)) && ((result.base_score + base_score) > result.score_cap)) ? (result.score_cap - base_score) : result.base_score,
      contributions: result.contributions,
    };
  }
};

module.exports = RiskGrader;