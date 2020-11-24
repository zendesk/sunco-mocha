'use strict';

const fs = require('fs-extra');
const path = require('path');
const {
  copyFixture,
  runMochaWatchJSONAsync,
  sleep,
  runMochaWatchAsync,
  touchFile,
  replaceFileContents,
  createTempDir,
  DEFAULT_FIXTURE
} = require('../helpers');

describe('--watch', function() {
  describe('when enabled', function() {
    /**
     * @type {string}
     */
    let tempDir;
    /**
     * @type {import('../helpers').RemoveTempDirCallback}
     */
    let cleanup;

    this.slow(5000);

    beforeEach(async function() {
      const {dirpath, removeTempDir} = await createTempDir();
      tempDir = dirpath;
      cleanup = removeTempDir;
    });

    afterEach(function() {
      cleanup();
    });

    describe('when in parallel mode', function() {
      describe('when test file has changed', function() {
        it('should rerun test', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          return expect(
            runMochaWatchJSONAsync(['--parallel', testFile], tempDir, () => {
              touchFile(testFile);
            }),
            'when fulfilled',
            'to have run twice'
          );
        });
      });
    });

    describe('when --watch-files provided', function() {
      describe('when file matching --watch-files has changed', async function() {
        it('should rerun all tests', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          const watchedFile = path.join(tempDir, 'dir/file.xyz');
          touchFile(watchedFile);

          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--watch-files', 'dir/*.xyz'],
              tempDir,
              () => {
                touchFile(watchedFile);
              }
            ),
            'when fulfilled',
            'to have run twice'
          );
        });
      });

      describe('when file matching --watch-files has added', function() {
        it('should rerun all tests', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          const watchedFile = path.join(tempDir, 'lib/file.xyz');
          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--watch-files', '**/*.xyz'],
              tempDir,
              () => {
                touchFile(watchedFile);
              }
            ),
            'when fulfilled',
            'to have run twice'
          );
        });
      });

      describe('when file matching --watch-files is removed', function() {
        it('should rerun all tests', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          const watchedFile = path.join(tempDir, 'lib/file.xyz');
          touchFile(watchedFile);

          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--watch-files', 'lib/**/*.xyz'],
              tempDir,
              () => {
                fs.removeSync(watchedFile);
              }
            ),
            'when fulfilled',
            'to have run twice'
          );
        });
      });

      describe('when file not matching --watch-files has changed', function() {
        it('does not rerun tests', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          const watchedFile = path.join(tempDir, 'dir/file.js');
          touchFile(watchedFile);

          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--watch-files', 'dir/*.xyz'],
              tempDir,
              () => {
                touchFile(watchedFile);
              }
            ),
            'when fulfilled',
            'to have run once'
          );
        });
      });

      describe('when --watch-ignore provided', function() {
        it('does not rerun tests when they change', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          const watchedFile = path.join(tempDir, 'dir/file-to-ignore.xyz');
          touchFile(watchedFile);

          return expect(
            runMochaWatchJSONAsync(
              [
                testFile,
                '--watch-files',
                'dir/*.xyz',
                '--watch-ignore',
                'dir/*ignore*'
              ],
              tempDir,
              () => {
                touchFile(watchedFile);
              }
            ),
            'when fulfilled',
            'to have run once'
          );
        });
      });

      it('reloads test files when they change', async function() {
        const testFile = path.join(tempDir, 'test.js');
        copyFixture('options/watch/test-file-change', testFile);

        return expect(
          runMochaWatchJSONAsync(
            [testFile, '--watch-files', '**/*.js'],
            tempDir,
            () => {
              replaceFileContents(
                testFile,
                'testShouldFail = true',
                'testShouldFail = false'
              );
            }
          ),
          'when fulfilled',
          'to satisfy',
          [
            expect.it('to have passed count', 0).and('to have failed count', 1),
            expect.it('to have passed count', 1).and('to have failed count', 0)
          ]
        ).and('when fulfilled', 'to have run twice');
      });

      it('reloads test dependencies when they change', async function() {
        const testFile = path.join(tempDir, 'test.js');
        copyFixture('options/watch/test-with-dependency', testFile);

        const dependency = path.join(tempDir, 'lib', 'dependency.js');
        copyFixture('options/watch/dependency', dependency);

        return expect(
          runMochaWatchJSONAsync(
            [testFile, '--watch-files', 'lib/**/*.js'],
            tempDir,
            () => {
              replaceFileContents(
                dependency,
                'module.exports.testShouldFail = false',
                'module.exports.testShouldFail = true'
              );
            }
          ),
          'when fulfilled',
          'to have run twice'
        ).and('when fulfilled', 'to satisfy', [
          expect.it('to have passed count', 1).and('to have failed count', 0),
          expect.it('to have passed count', 0).and('to have failed count', 1)
        ]);
      });
    });

    describe('when --watch-files not provided', function() {
      describe('when a test file is changed', function() {
        it('should rerun the test file', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          return expect(
            runMochaWatchJSONAsync([testFile], tempDir, () => {
              touchFile(testFile);
            }),
            'when fulfilled',
            'to have run twice'
          );
        });
      });

      describe('when a new test file is added', function() {
        it('should run the new test file only', async function() {
          const testFile = path.join(tempDir, 'test/a.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          return expect(
            runMochaWatchJSONAsync(['test/**/*.js'], tempDir, () => {
              const addedTestFile = path.join(tempDir, 'test/b.js');
              copyFixture('passing', addedTestFile);
            }),
            'when fulfilled',
            'to satisfy',
            [
              expect.it('to have passed count', 1),
              expect.it('to have passed count', 2)
            ]
          ).and('when fulfilled', 'to have run twice');
        });
      });

      describe('when "rs <return>" typed', function() {
        it('reruns all tests', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          return expect(
            runMochaWatchJSONAsync([testFile], tempDir, mochaProcess => {
              mochaProcess.stdin.write('rs\n');
            }),
            'when fulfilled',
            'to have run twice'
          );
        });
      });
    });

    describe('when `--extension` provided', function() {
      describe('when file matching `--extension` is changed', function() {
        it('should rerun all tests', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture('options/watch/required-extension.fixture.js', testFile);
          const watchedFile = path.join(tempDir, 'file.xyz');
          touchFile(watchedFile);

          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--extension', 'xyz,js'],
              tempDir,
              () => {
                touchFile(watchedFile);
              }
            ),
            'when fulfilled',
            'to have run twice'
          );
        });

        describe('when matching file begins with a dot (.)', function() {
          it('reruns affected test test', async function() {
            const testFile = path.join(tempDir, 'test.js');
            copyFixture(
              'options/watch/required-dot-extension.fixture.js',
              testFile
            );

            const watchedFile = path.join(tempDir, '.file.xyz');
            touchFile(watchedFile);

            return expect(
              runMochaWatchJSONAsync(
                [testFile, '--extension', 'xyz,js'],
                tempDir,
                () => {
                  touchFile(watchedFile);
                }
              ),
              'when fulfilled',
              'to have items satisfying',
              expect.it(
                'to have passed test',
                'should run even if the file it depends upon begins with a dot'
              )
            ).and('when fulfilled', 'to have run twice');
          });
        });

        it('ignores files in "node_modules" and ".git" by default', async function() {
          const testFile = path.join(tempDir, 'test.js');
          copyFixture(DEFAULT_FIXTURE, testFile);

          const nodeModulesFile = path.join(
            tempDir,
            'node_modules',
            'file.xyz'
          );
          const gitFile = path.join(tempDir, '.git', 'file.xyz');

          touchFile(gitFile);
          touchFile(nodeModulesFile);

          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--extension', 'xyz,js'],
              tempDir,
              () => {
                touchFile(gitFile);
                touchFile(nodeModulesFile);
              }
            ),
            'when fulfilled',
            'to have run once'
          );
        });
      });
    });

    // Regression test for https://github.com/mochajs/mocha/issues/2027
    it('respects --fgrep on re-runs', async function() {
      const testFile = path.join(tempDir, 'test.js');
      copyFixture('options/grep', testFile);

      return expect(
        runMochaWatchJSONAsync([testFile, '--fgrep', 'match'], tempDir, () => {
          touchFile(testFile);
        }),
        'when fulfilled',
        'to have run twice'
      ).and(
        'when fulfilled',
        'to have items satisfying',
        expect.it('to have passed count', 2)
      );
    });

    describe('with required hooks', function() {
      /**
       * Helper for setting up hook tests
       *
       * @param {string} hookName name of hook to test
       * @return {function}
       */
      function setupHookTest(hookName) {
        return async function() {
          const testFile = path.join(tempDir, 'test.js');
          const hookFile = path.join(tempDir, 'hook.js');

          copyFixture('__default__', testFile);
          copyFixture('options/watch/hook', hookFile);

          replaceFileContents(hookFile, '<hook>', hookName);

          return expect(
            runMochaWatchJSONAsync(
              [testFile, '--require', hookFile],
              tempDir,
              () => {
                touchFile(testFile);
              }
            ),
            'when fulfilled',
            'to have run twice'
          ).and(
            'when fulfilled',
            'to have items satisfying',
            expect.it('to have failed count', 1)
          );
        };
      }

      it('mochaHooks.beforeAll runs as expected', setupHookTest('beforeAll'));
      it('mochaHooks.beforeEach runs as expected', setupHookTest('beforeEach'));
      it('mochaHooks.afterAll runs as expected', setupHookTest('afterAll'));
      it('mochaHooks.afterEach runs as expected', setupHookTest('afterEach'));
    });

    it('should not leak event listeners', function() {
      this.timeout(20000);
      const testFile = path.join(tempDir, 'test.js');
      copyFixture(DEFAULT_FIXTURE, testFile);

      return expect(
        runMochaWatchAsync(
          [testFile],
          {cwd: tempDir, stdio: 'pipe'},
          async () => {
            // we want to cause _n + 1_ reruns, which should cause the warning
            // to occur if the listeners aren't properly destroyed
            const iterations = new Array(process.getMaxListeners() + 1);
            // eslint-disable-next-line no-unused-vars
            for await (const _ of iterations) {
              touchFile(testFile);
              await sleep(1000);
            }
          }
        ),
        'when fulfilled',
        'to satisfy',
        {
          output: expect.it('not to match', /MaxListenersExceededWarning/)
        }
      );
    });
  });
});
