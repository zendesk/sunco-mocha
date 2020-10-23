'use strict';

const {resolveFixturePath} = require('../helpers');
const sinon = require('sinon');
const rewiremock = require('rewiremock/node');
const path = require('path');

describe('dependency resolution', function() {
  /**
   * @type {typeof import('../../../lib/cli/resolver').resolveDependencies}
   */
  let resolveDependencies;
  /**
   * @type {{[key: string]: sinon.SinonStub}}
   */
  let stubs;

  beforeEach(function() {
    stubs = {
      warn: sinon.stub(),
      existsSync: sinon.stub(),
      defineConstants: sinon.stub()
    };

    // this is an integration test, but we don't need to spawn a mocha instance.
    // we do want to stub out some fs-touching methods to make the tests easier though
    /**
     * @type {typeof import('../../../lib/cli/resolver')}
     */
    const resolver = rewiremock.proxy(
      () => require('../../../lib/cli/resolver'),
      r => ({
        fs: r
          .with({
            // tests can modify this stub to change its behavior
            existsSync: stubs.existsSync
          })
          .callThrough(),
        '../../../lib/utils': r
          .with({
            // this causes the code to look for these filenames instead of the default
            // (e.g., `tsconfig.json` and `webpack.config.js`)
            defineConstants: stubs.defineConstants.returns({
              DEFAULT_TS_CONFIG_FILENAME: 'tsconfig.fixture.json',
              DEFAULT_WEBPACK_CONFIG_FILENAME: 'webpack.config.fixture.js'
            })
          })
          .directChildOnly()
          .callThrough()
      })
    );

    resolveDependencies = resolver.resolveDependencies;
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('when provided a `.json` file', function() {
    it('should return an empty Set', function() {
      expect(
        resolveDependencies(require.resolve('../../../package.json')),
        'to be empty'
      );
    });
  });

  describe('when provided a TypeScript file', function() {
    describe('when provided a path to a TS config file', function() {
      it('should find dependencies', function() {
        // this should _actually work_; no magic stubs here
        expect(
          resolveDependencies(resolveFixturePath('cli/index.fixture.ts'), {
            tsConfigPath: resolveFixturePath('cli/tsconfig.fixture.json')
          }),
          'to satisfy',
          new Set([/glob/, /tsconfig\.fixture\.json/])
        );
      });

      it('should not look for a default TS config file', function() {
        expect(stubs.existsSync, 'was not called');
      });
    });

    describe('when not provided a path to TS config file', function() {
      describe('when file contains a missing module', function() {
        let result;

        beforeEach(function() {
          result = resolveDependencies(
            resolveFixturePath('cli/unknown-dep.fixture.ts')
          );
        });

        it('should return an empty set', function() {
          expect(result, 'to be empty');
        });
      });

      describe('when TS config file not in `cwd`', function() {
        beforeEach(function() {
          resolveDependencies(resolveFixturePath('cli/index.fixture.ts'));
        });

        it('should look for a TS config file in cwd', function() {
          expect(stubs.existsSync, 'to have a call satisfying', [
            path.join(process.cwd(), 'tsconfig.fixture.json')
          ]);
        });
      });

      describe('when TS config file is in `cwd`', function() {
        beforeEach(function() {
          stubs.existsSync.returns(true);
        });

        it('should use the found TS config file', function() {
          const fixture = resolveFixturePath('cli/index.fixture.ts');
          expect(
            resolveDependencies(fixture, {
              cwd: path.dirname(fixture) // cwd is needed to find default config file
            }),
            'to satisfy',
            new Set([/node_modules\/glob/, /tsconfig\.fixture\.json/])
          );
        });
      });
    });
  });

  describe('when provided a JavaScript file', function() {
    describe('when file contains a syntax error', function() {
      let result;

      beforeEach(function() {
        result = resolveDependencies(resolveFixturePath('cli/syntax'));
      });

      it('should return an empty set', function() {
        expect(result, 'to be empty');
      });
    });

    describe('when not provided a path to a Webpack config file', function() {
      let result;
      let fixture;

      beforeEach(function() {
        fixture = resolveFixturePath('cli/webpack');
        result = resolveDependencies(fixture, {
          cwd: path.dirname(fixture) // cwd is needed to find the default config file
        });
      });

      it('should resolve non-relative modules from nearest module directory', function() {
        // this differs from the test using webpack.config.fixture.js, which points
        // to a specific module directory in the fixture dir (`mode_nodules`) and has
        // a different `strip-ansi`
        expect(
          result,
          'to satisfy',
          new Set([/node_modules\/strip-ansi/, /webpack-dep\.fixture\.js/])
        );
      });

      it('should look for a Webpack config file in cwd', function() {
        expect(stubs.existsSync, 'to have a call satisfying', [
          new RegExp(
            `${path.join(path.dirname(fixture), 'webpack.config.fixture.js')}`
          )
        ]);
      });
    });

    describe('when provided a path to a Webpack config file', function() {
      let result;

      beforeEach(function() {
        const fixture = resolveFixturePath('cli/webpack.fixture.js');
        result = resolveDependencies(fixture, {
          webpackConfigPath: resolveFixturePath('cli/webpack.config.fixture.js')
        });
      });

      it('should not look for a default Webpack config file', function() {
        expect(stubs.existsSync, 'was not called');
      });

      it('should find dependencies as declared by webpack config', function() {
        expect(
          result,
          'to satisfy',
          new Set([
            /webpack\.config\.fixture\.js/,
            /mode_nodules\/strip-ansi/,
            /webpack-dep\.fixture\.js/
          ])
        );
      });
    });

    describe('when a default Webpack config file is in `cwd`', function() {
      beforeEach(function() {
        stubs.existsSync.returns(true);
      });

      it('should use the found Webpack config file', function() {
        expect(
          resolveDependencies(
            resolveFixturePath('cli/webpack.fixture.js'),
            // change cwd to the directory of the fixture webpack config file
            {cwd: path.join(__dirname, '..', 'fixtures', 'cli')}
          ),
          'to satisfy',
          new Set([
            /webpack-dep\.fixture\.js/,
            /strip-ansi/,
            /webpack\.config\.fixture\.js/
          ])
        );
      });
    });
  });

  describe('ignored dependencies', function() {
    describe('when provided a set of globs to ignore', function() {
      it('should not return files matching the globs', function() {
        expect(
          resolveDependencies(require.resolve('../../../lib/mocha'), {
            ignore: new Set(['**/node_modules/**'])
          }),
          'as array',
          'to have items satisfying',
          expect.it('not to match', /node_modules/)
        );
      });
    });

    describe('when provided an array of globs to ignore', function() {
      it('should not return files matching the globs', function() {
        expect(
          resolveDependencies(require.resolve('../../../lib/mocha'), {
            ignore: ['**/node_modules/**']
          }),
          'as array',
          'to have items satisfying',
          expect.it('not to match', /node_modules/)
        );
      });
    });

    describe('when provided a string glob to ignore', function() {
      it('should not return files matching the glob', function() {
        expect(
          resolveDependencies(require.resolve('../../../lib/mocha'), {
            ignore: '**/node_modules/**'
          }),
          'as array',
          'to have items satisfying',
          expect.it('not to match', /node_modules/)
        );
      });
    });
  });
});
