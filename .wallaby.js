'use strict';

/**
 * Stubs instrumentation for child processes
 * @see https://github.com/wallabyjs/public/issues/359
 */
const noopPreprocessor = f => `
global.$_$wpe = global.$_$wp = global.$_$wf = global.$_$w = global.$_$wv = () => {};
global.$_$tracer = { log: () => {} };//${f.content}
`;

module.exports = () => {
  return {
    files: [
      'index.js',
      'lib/**/*.{js,json}',
      'test/setup.js',
      'test/assertions.js',
      {
        pattern: 'test/**/*.fixture*',
        instrument: false
      },
      'bin/*',
      'test/integration/helpers.js',
      'package.json',
      'test/opts/mocha.opts',
      'mocharc.yml',
      '!lib/browser/growl.js',
      {
        pattern: 'test/integration/fixtures/cli/mode_nodules/**',
        instrument: false
      }
    ],
    filesWithNoCoverageCalculated: [
      'test/**/*.fixture*',
      'test/setup.js',
      'test/assertions.js',
      'lib/browser/**/*.js',
      'test/integration/helpers.js',
      'bin/*'
    ],
    tests: [
      'test/unit/**/*.spec.js',
      'test/node-unit/**/*.spec.js',
      'test/integration/cli/module-map.spec.js',
      'test/integration/cli/resolver.spec.js'
    ],
    env: {
      type: 'node',
      runner: 'node',
      params: {
        env: 'DEBUG=mocha*'
      }
    },
    compilers: {
      // do not compile any typescript files!
      // see https://github.com/wallabyjs/public/issues/2544
      '**/*.ts': file => file
    },
    preprocessors: {
      // this enables running Mocha in a subprocess, as our integration tests do
      'bin/*': noopPreprocessor
    },
    workers: {recycle: true},
    testFramework: {type: 'mocha', path: __dirname},
    setup(wallaby) {
      // running mocha instance is not the same as mocha under test,
      // running mocha is the project's source code mocha, mocha under test is instrumented version of the source code
      const runningMocha = wallaby.testFramework;
      runningMocha.timeout(2000);
      // to expose it/describe etc. on the mocha under test
      const MochaUnderTest = require('./');
      const mochaUnderTest = new MochaUnderTest();
      mochaUnderTest.suite.emit(
        MochaUnderTest.Suite.constants.EVENT_FILE_PRE_REQUIRE,
        global,
        '',
        mochaUnderTest
      );
      require('./test/setup');
    },
    debug: true,
    runMode: 'onsave',
    // by default wallaby _displays_ relative paths, but this makes working with absolute paths difficult.
    // this disables the behavior
    preservePaths: true
  };
};
