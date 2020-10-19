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
        '../../../lib/errors': r
          .with({
            warn: stubs.warn
          })
          .callThrough(),
        fs: r
          .with({
            existsSync: stubs.existsSync
          })
          .callThrough(),
        '../../../lib/utils': r
          .with({
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
          [
            ...resolveDependencies(resolveFixturePath('cli/index.fixture.ts'), {
              tsConfigPath: resolveFixturePath('cli/tsconfig.fixture.json')
            })
          ],
          'to have an item satisfying',
          /glob/
        ).and('to have an item satisfying', /tsconfig\.fixture\.json/);
      });

      it('should not look for a default TS config file', function() {
        expect(stubs.existsSync, 'was not called');
      });
    });

    describe('when not provided a path to TS config file', function() {
      describe('when TS config file not in `cwd`', function() {
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
          expect(stubs.warn, 'to have a call satisfying', [/could not find/])
            .and('to have a call satisfying', [
              /could not resolve module/,
              'glob'
            ])
            .and('was called twice');
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
          expect(
            [
              ...resolveDependencies(
                resolveFixturePath('cli/index.fixture.ts'),
                // change cwd to the directory of the fixture tsconfig file
                {cwd: path.join(__dirname, '..', 'fixtures', 'cli')}
              )
            ],
            'to have an item satisfying',
            /glob/
          ).and('to have an item satisfying', /tsconfig\.fixture\.json$/);
        });
      });
    });
  });

  describe('when provided a JavaScript file', function() {
    describe('when not provided a path to a Webpack config file', function() {
      let result;

      beforeEach(function() {
        result = [
          ...resolveDependencies(resolveFixturePath('cli/webpack.fixture.js'), {
            cwd: path.join(__dirname, '..', 'fixtures', 'cli')
          })
        ];
      });

      it('should return the dependencies', function() {
        expect(result, 'to have an item satisfying', /strip-ansi/);
      });

      it('should look for a Webpack config file in cwd', function() {
        expect(stubs.existsSync, 'to have a call satisfying', [
          new RegExp(
            `${path.join(
              __dirname,
              '..',
              'fixtures',
              'cli',
              'webpack.config.fixture.js'
            )}`
          )
        ]);
      });
    });

    describe('when provided a path to a Webpack config file', function() {
      let result;

      beforeEach(function() {
        result = resolveDependencies(
          resolveFixturePath('cli/webpack.fixture.js'),
          {
            webpackConfigPath: resolveFixturePath(
              'cli/webpack.config.fixture.js'
            )
            // cwd: path.join(__dirname, '..', 'fixtures', 'cli')
          }
        );
      });

      it('should not look for a default Webpack config file', function() {
        expect(stubs.existsSync, 'was not called');
      });

      it('should find dependencies', function() {
        expect(
          result,
          'as array',
          'to have an item satisfying',
          /strip-ansi/
        ).and(
          'as array',
          'to have an item satisfying',
          /webpack\.config\.fixture\.js/
        );
      });
    });

    describe('when a default Webpack config file is in `cwd`', function() {
      beforeEach(function() {
        stubs.existsSync.returns(true);
      });

      it('should use the found Webpack config file', function() {
        expect(
          [
            ...resolveDependencies(
              resolveFixturePath('cli/webpack.fixture.js'),
              // change cwd to the directory of the fixture webpack config file
              {cwd: path.join(__dirname, '..', 'fixtures', 'cli')}
            )
          ],
          'to have an item satisfying',
          /strip-ansi/
        ).and('to have an item satisfying', /webpack\.config\.fixture\.js$/);
      });
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
