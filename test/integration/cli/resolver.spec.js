'use strict';

const {resolveFixturePath} = require('../helpers');
const sinon = require('sinon');
const rewiremock = require('rewiremock/node');

describe('dependency resolution', function() {
  let resolveDependencies;
  let warnStub;

  beforeEach(function() {
    warnStub = sinon.stub();

    // this is an integration test, but we don't need to spawn a mocha instance.
    // we do, however, want to capture some output, so that's why this is here.
    const resolver = rewiremock.proxy(
      () => require('../../../lib/cli/resolver'),
      r => ({
        '../../../lib/errors': r
          .with({
            warn: warnStub
          })
          .callThrough()
      })
    );
    resolveDependencies = resolver.resolveDependencies;
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('when provided a .json file', function() {
    it('should return an empty array', function() {
      expect(
        [...resolveDependencies(require.resolve('../../../package.json'))],
        'to be empty'
      );
    });
  });

  describe('when provided a TypeScript file', function() {
    describe('when provided a path to a `tsconfig.json`', function() {
      it('should find dependencies', function() {
        expect(
          [
            ...resolveDependencies(resolveFixturePath('cli/index.fixture.ts'), {
              tsConfig: resolveFixturePath('cli/tsconfig.fixture.json')
            })
          ],
          'to have an item satisfying',
          /glob/
        );
      });
    });

    describe('when not provided a path to `tsconfig.json`', function() {
      let result;

      beforeEach(function() {
        result = [
          ...resolveDependencies(resolveFixturePath('cli/index.fixture.ts'))
        ];
      });

      it('should return an empty Set', function() {
        expect(result, 'to be empty');
      });

      it('should warn', function() {
        expect(warnStub, 'was called once');
      });

      it('should look for a tsconfig.json');

      describe('when a tsconfig.json is in `cwd`', function() {
        it('should use the default tsconfig.json it found');
      });
    });
  });

  describe('when provided a JavaScript file', function() {
    it('should look for a webpack.config.js');

    describe('when provided a webpack config path', function() {
      it('should not look for a webpack.config.js');
    });

    describe('when a webpack.config.js is in `cwd`', function() {
      it('should use the default webpack.config.js it found');
    });
  });

  describe('ignored dependencies', function() {
    describe('when provided a set of globs to ignore', function() {
      it('should not return files matching the globs', function() {
        expect(
          [
            ...resolveDependencies(require.resolve('../../../lib/mocha'), {
              ignore: new Set(['**/node_modules/**'])
            })
          ],
          'to have items satisfying',
          expect.it('not to match', /node_modules/)
        );
      });
    });

    describe('when provided an array of globs to ignore', function() {
      it('should not return files matching the globs', function() {
        expect(
          [
            ...resolveDependencies(require.resolve('../../../lib/mocha'), {
              ignore: ['**/node_modules/**']
            })
          ],
          'to have items satisfying',
          expect.it('not to match', /node_modules/)
        );
      });
    });

    describe('when provided a string glob to ignore', function() {
      it('should not return files matching the glob', function() {
        expect(
          [
            ...resolveDependencies(require.resolve('../../../lib/mocha'), {
              ignore: '**/node_modules/**'
            })
          ],
          'to have items satisfying',
          expect.it('not to match', /node_modules/)
        );
      });
    });
  });
});
