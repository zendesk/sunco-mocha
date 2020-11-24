'use strict';

const {version} = require('../package.json');

const JSON_RESULT = 'JSONResult';
const RAW_RESULT = 'RawResult';
const SUMMARIZED_RESULT = 'SummarizedResult';
const JSON_RESULTS = 'JSONResults';
const JSON_SERIALIZABLE_MAP = 'JSONSerializableMap';

module.exports = {
  name: 'unexpected-mocha-internal',
  version,
  installInto(expect) {
    expect
      .addType({
        name: RAW_RESULT,
        base: 'object',
        identify(v) {
          return (
            this.baseType.identify(v) &&
            typeof v.output === 'string' &&
            'code' in v && // may be null
            Array.isArray(v.args) &&
            typeof v.command === 'string'
          );
        }
      })
      .addType({
        name: JSON_RESULT,
        base: RAW_RESULT,
        identify(v) {
          return (
            this.baseType.identify(v) &&
            typeof v.stats === 'object' &&
            Array.isArray(v.failures) &&
            Array.isArray(v.passes) &&
            Array.isArray(v.tests) &&
            Array.isArray(v.pending)
          );
        }
      })
      .addType({
        name: SUMMARIZED_RESULT,
        base: RAW_RESULT,
        identify(v) {
          return (
            this.baseType.identify(v) &&
            typeof v.passing === 'number' &&
            typeof v.failing === 'number' &&
            typeof v.pending === 'number'
          );
        }
      })
      .addType({
        name: JSON_SERIALIZABLE_MAP,
        base: 'Map',
        identify(v) {
          return this.baseType.identify(v) && typeof v.toJSON === 'function';
        }
      })
      .addType({
        name: JSON_RESULTS,
        base: 'array',
        identify(v) {
          const JSONResult = expect.getType(JSON_RESULT);
          return (
            this.baseType.identify(v) && v.every(i => JSONResult.identify(i))
          );
        }
      })
      .addAssertion(
        `<${JSON_RESULT}> [not] to have (passed|succeeded)`,
        function(expect, result) {
          expect(result, 'to satisfy', {
            code: expect.it('[not] to be', 0),
            stats: {
              failures: expect.it('[not] to be', 0)
            },
            failures: expect.it('[not] to be empty')
          });
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}|${RAW_RESULT}> [not] to have (passed|succeeded)`,
        (expect, result) => {
          expect(result, '[not] to have property', 'code', 0);
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}|${RAW_RESULT}> [not] to have completed with [exit] code <number>`,
        (expect, result, code) => {
          expect(result.code, '[not] to be', code);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have passed (with|having) count <number>`,
        (expect, result, count) => {
          expect(result, '[not] to pass').and('[not] to satisfy', {
            stats: {passes: expect.it('to be', count)}
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed (with|having) count <number>`,
        (expect, result, count) => {
          expect(result, '[not] to have failed').and('[not] to satisfy', {
            stats: {failures: expect.it('to be', count)}
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed`,
        (expect, result) => {
          expect(result, '[not] to satisfy', {
            code: expect.it('to be greater than', 0),
            stats: {
              failures: expect.it('to be greater than', 0)
            },
            failures: expect.it('to be non-empty')
          });
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}|${RAW_RESULT}> [not] to have failed`,
        (expect, result) => {
          expect(result, '[not] to satisfy', {
            code: expect.it('to be greater than', 0)
          });
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}|${RAW_RESULT}> [not] to have failed (with|having) output <any>`,
        (expect, result, output) => {
          expect(result, '[not] to satisfy', {
            code: expect.it('to be greater than', 0),
            output: output
          });
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}|${RAW_RESULT}> [not] to have passed (with|having) output <any>`,
        (expect, result, output) => {
          expect(result, '[not] to satisfy', {
            code: 0,
            output: output
          });
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}> [not] to have failed [test] count <number>`,
        (expect, result, count) => {
          expect(result.failing, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}> [not] to have passed [test] count <number>`,
        (expect, result, count) => {
          expect(result.passing, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${SUMMARIZED_RESULT}> [not] to have pending [test] count <number>`,
        (expect, result, count) => {
          expect(result.pending, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have test count <number>`,
        (expect, result, count) => {
          expect(result.stats.tests, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed [test] count <number>`,
        (expect, result, count) => {
          expect(result.stats.failures, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have passed [test] count <number>`,
        (expect, result, count) => {
          expect(result.stats.passes, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have pending [test] count <number>`,
        (expect, result, count) => {
          expect(result.stats.pending, '[not] to be', count);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have run (test|tests) <string+>`,
        (expect, result, ...titles) => {
          titles.forEach(title => {
            expect(
              result,
              '[not] to have a value satisfying',
              expect.it(
                'to have an item satisfying',
                expect
                  .it('to have property', 'title', title)
                  .or('to have property', 'fullTitle', title)
              )
            );
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed (test|tests) <string+>`,
        (expect, result, ...titles) => {
          titles.forEach(title => {
            expect(
              result.failures,
              '[not] to have an item satisfying',
              expect
                .it('to have property', 'title', title)
                .or('to have property', 'fullTitle', title)
            );
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed with (error|errors) <any+>`,
        (expect, result, ...errors) => {
          errors.forEach(error => {
            expect(result, '[not] to have failed').and('[not] to satisfy', {
              failures: expect.it('to have an item satisfying', {
                err: expect
                  .it('to satisfy', error)
                  .or('to satisfy', {message: error})
              })
            });
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have (error|errors) <any+>`,
        (expect, result, ...errors) => {
          errors.forEach(error => {
            expect(result, '[not] to satisfy', {
              failures: expect.it('to have an item satisfying', {
                err: expect
                  .it('to satisfy', error)
                  .or('to satisfy', {message: error})
              })
            });
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have passed (test|tests) <string+>`,
        (expect, result, ...titles) => {
          titles.forEach(title => {
            expect(result.passes, '[not] to have an item satisfying', {
              title: title
            });
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have test order <string> <array>`,
        (expect, result, state, titles) => {
          expect(
            result[state].slice(0, titles.length),
            '[not] to satisfy',
            titles.map(function(title) {
              return typeof title === 'string' ? {title: title} : title;
            })
          );
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have passed test order <array>`,
        (expect, result, titles) => {
          expect(result, '[not] to have test order', 'passes', titles);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have passed test order <string+>`,
        (expect, result, ...titles) => {
          expect(result, '[not] to have test order', 'passes', titles);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed test order <array>`,
        (expect, result, titles) => {
          expect(result, '[not] to have test order', 'failures', titles);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed test order <string+>`,
        (expect, result, ...titles) => {
          expect(result, '[not] to have test order', 'failures', titles);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have pending test order <array>`,
        (expect, result, titles) => {
          expect(result, '[not] to have test order', 'pending', titles);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have pending test order <string+>`,
        (expect, result, ...titles) => {
          expect(result, '[not] to have test order', 'pending', titles);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have pending tests`,
        (expect, result) => {
          expect(result.stats.pending, '[not] to be greater than', 0);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have passed tests`,
        (expect, result) => {
          expect(result.stats.passes, '[not] to be greater than', 0);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have failed tests`,
        (expect, result) => {
          expect(result.stats.failed, '[not] to be greater than', 0);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have tests`,
        (expect, result) => {
          expect(result.stats.tests, '[not] to be greater than', 0);
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have retried test <string>`,
        (expect, result, title) => {
          expect(result.tests, '[not] to have an item satisfying', {
            title: title,
            currentRetry: expect.it('to be positive')
          });
        }
      )
      .addAssertion(
        `<${JSON_RESULT}> [not] to have retried test <string> <number>`,
        (expect, result, title, count) => {
          expect(result.tests, '[not] to have an item satisfying', {
            title: title,
            currentRetry: count
          });
        }
      )
      .addAssertion(
        `<${RAW_RESULT}|${SUMMARIZED_RESULT}> [not] to contain [output] <any>`,
        (expect, result, output) => {
          expect(result.output, '[not] to satisfy', output);
        }
      )
      .addAssertion(
        `<${RAW_RESULT}|SummarizedResult|JSONResult> to have [exit] code <number>`,
        (expect, result, code) => {
          expect(result.code, 'to be', code);
        }
      )
      .addAssertion(
        `<${JSON_SERIALIZABLE_MAP}> as JSON <assertion>`,
        (expect, subject) => {
          expect.errorMode = 'nested';
          expect.shift(subject.toJSON());
        }
      )
      .addAssertion('<Set> as array <assertion>', (expect, subject) => {
        expect.errorMode = 'nested';
        expect.shift([...subject]);
      })
      .addAssertion(
        `<${JSON_RESULTS}> [not] to have run times <number>`,
        (expect, subject, number) => {
          expect(subject, '[not] to have length', number);
        }
      )
      .addAssertion(
        `<${JSON_RESULTS}> [not] to have run once`,
        (expect, subject) => {
          expect(subject, '[not] to have length', 1);
        }
      )
      .addAssertion(
        `<${JSON_RESULTS}> [not] to have run twice`,
        (expect, subject) => {
          expect(subject, '[not] to have length', 2);
        }
      )
      .addAssertion(
        `<${JSON_RESULTS}> [not] to have run thrice`,
        (expect, subject) => {
          expect(subject, '[not] to have length', 3);
        }
      );
  }
};
