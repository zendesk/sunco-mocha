'use strict';

const logSymbols = require('log-symbols');
const debug = require('debug')('mocha:cli:watch');
const chokidar = require('chokidar');
const Context = require('../context');
const collectFiles = require('./collect-files');
const {createModuleMap} = require('mrca');
const {Rerunner} = require('./rerunner');
const path = require('path');

/**
 * Exports the `watchRun` function that runs mocha in "watch" mode.
 * @see module:lib/cli/run-helpers
 * @module
 * @private
 */

/**
 * Run Mocha in parallel "watch" mode
 * @param {Mocha} mocha - Mocha instance
 * @param {Object} opts - Options
 * @param {string[]} [opts.watchFiles] - List of paths and patterns to
 *   watch. If not provided all files with an extension included in
 *   `fileCollectionParams.extension` are watched. See first argument of
 *   `chokidar.watch`.
 * @param {string[]} opts.watchIgnore - List of paths and patterns to
 *   exclude from watching. See `ignored` option of `chokidar`.
 * @param {FileCollectionOptions} fileCollectParams - Parameters that control test
 * @private
 */
exports.watchParallelRun = (
  mocha,
  {watchFiles, watchIgnore},
  fileCollectParams
) => {
  debug('creating parallel watcher');

  return createWatcher(mocha, {
    watchFiles,
    watchIgnore,
    setupRun({mocha}) {
      // I don't know why we're cloning the root suite.
      const rootSuite = mocha.suite.clone();

      // ensure we aren't leaking event listeners
      mocha.dispose();

      // this `require` is needed because the require cache has been cleared.  the dynamic
      // exports set via the below call to `mocha.ui()` won't work properly if a
      // test depends on this module (see `required-tokens.spec.js`).
      const Mocha = require('../mocha');

      // ... and now that we've gotten a new module, we need to use it again due
      // to `mocha.ui()` call
      const newMocha = new Mocha(mocha.options);
      // don't know why this is needed
      newMocha.suite = rootSuite;
      // nor this
      newMocha.suite.ctx = new Context();

      // reset the list of files
      newMocha.files = collectFiles(fileCollectParams);

      // because we've swapped out the root suite (see the `run` inner function
      // in `createRerunner`), we need to call `mocha.ui()` again to set up the context/globals.
      newMocha.ui(newMocha.options.ui);

      // we need to call `newMocha.rootHooks` to set up rootHooks for the new
      // suite
      newMocha.rootHooks(newMocha.options.rootHooks);

      // in parallel mode, the main Mocha process doesn't actually load the
      // files. this flag prevents `mocha.run()` from autoloading.
      newMocha.lazyLoadFiles(true);
      return newMocha;
    },
    fileCollectParams
  });
};

/**
 * Run Mocha in "watch" mode
 * @param {Mocha} mocha - Mocha instance
 * @param {Object} opts - Options
 * @param {string[]} [opts.watchFiles] - List of paths and patterns to
 *   watch. If not provided all files with an extension included in
 *   `fileCollectionParams.extension` are watched. See first argument of
 *   `chokidar.watch`.
 * @param {string[]} opts.watchIgnore - List of paths and patterns to
 *   exclude from watching. See `ignored` option of `chokidar`.
 * @param {FileCollectionOptions} fileCollectParams - Parameters that control test
 *   file collection. See `lib/cli/collect-files.js`.
 * @private
 */
exports.watchRun = (mocha, {watchFiles, watchIgnore}, fileCollectParams) => {
  debug('creating serial watcher');

  return createWatcher(mocha, {
    watchFiles,
    watchIgnore,
    setupRun({mocha, filenames = []}) {
      // I don't know why we're cloning the root suite.
      const rootSuite = mocha.suite.clone();

      // ensure we aren't leaking event listeners
      mocha.dispose();

      // this `require` is needed because the require cache has been cleared.  the dynamic
      // exports set via the below call to `mocha.ui()` won't work properly if a
      // test depends on this module (see `required-tokens.spec.js`).
      const Mocha = require('../mocha');

      // ... and now that we've gotten a new module, we need to use it again due
      // to `mocha.ui()` call
      const newMocha = new Mocha(mocha.options);
      // don't know why this is needed
      newMocha.suite = rootSuite;
      // nor this
      newMocha.suite.ctx = new Context();

      // reset the list of files
      newMocha.files = filenames.length
        ? filenames
        : collectFiles(fileCollectParams);
      debug('running mocha with files %o', newMocha.files);

      // because we've swapped out the root suite (see the `run` inner function
      // in `createRerunner`), we need to call `mocha.ui()` again to set up the context/globals.
      newMocha.ui(newMocha.options.ui);

      // we need to call `newMocha.rootHooks` to set up rootHooks for the new
      // suite
      newMocha.rootHooks(newMocha.options.rootHooks);

      return newMocha;
    },
    fileCollectParams
  });
};

/**
 * Bootstraps a chokidar watcher. Handles keyboard input & signals
 * @param {Mocha} mocha - Mocha instance
 * @param {Object} opts
 * @param {BeforeWatchRun} [opts.setupRun] - Function to call before
 * `mocha.run()`
 * @param {string[]} [opts.watchFiles] - List of paths and patterns to watch. If
 *   not provided all files with an extension included in
 *   `fileCollectionParams.extension` are watched. See first argument of
 *   `chokidar.watch`.
 * @param {string[]} [opts.watchIgnore] - List of paths and patterns to exclude
 *   from watching. See `ignored` option of `chokidar`.
 * @param {FileCollectionOptions} opts.fileCollectParams - List of extensions to watch if `opts.watchFiles` is not given.
 * @returns {FSWatcher}
 * @ignore
 * @private
 */
const createWatcher = (
  mocha,
  {watchFiles = [], watchIgnore = [], setupRun, fileCollectParams}
) => {
  const ignore = new Set([watchIgnore]);
  debug('ignoring files matching: %s', ignore);
  let globalFixtureContext;

  // we handle global fixtures manually
  mocha.enableGlobalSetup(false).enableGlobalTeardown(false);

  const testFiles = new Set(collectFiles(fileCollectParams));
  debug('found test files: %s', testFiles);

  const moduleMap = createModuleMap({
    entryFiles: testFiles,
    threaded: true,
    ignore
  });

  const useLegacyMode = Boolean(watchFiles.length);

  /* istanbul ignore next */
  if (useLegacyMode) {
    debug(
      'explicit list of watched files provided; will re-run all tests upon change'
    );
  }

  const watcher = chokidar.watch(
    watchFiles.length
      ? watchFiles
      : [...moduleMap.files, ...moduleMap.directories],
    {
      ignored: watchIgnore,
      ignoreInitial: true
    }
  );

  const rerunner = Rerunner.create(mocha, watcher, {
    setupRun
  });

  const findChangesAndRerun = async filename => {
    if (!filename) {
      const watchedFiles = getWatchedFiles(watcher);
      debug('rerunning all tests');
      rerunner.enqueue(testFiles, watchedFiles);
    } else {
      const {
        entryFiles,
        allFiles
      } = await moduleMap.findAffectedFilesForChangedFiles({
        knownChangedFiles: filename
      });
      if (allFiles.size) {
        if (entryFiles.size) {
          debug('enqueing %o', entryFiles);
          rerunner.enqueue(entryFiles, allFiles);
        } else {
          debug('%d files affected, but none were tests!', allFiles.size);
        }
      } else {
        debug(
          'file in watched directory changed (%s) but not consumed by any test file',
          filename
        );
      }
    }
  };

  watcher.on('ready', async () => {
    if (!globalFixtureContext) {
      debug('triggering global setup');
      globalFixtureContext = await mocha.runGlobalSetup();
    }
    rerunner.run();
  });

  if (useLegacyMode) {
    watcher.on('all', () => {
      findChangesAndRerun();
    });
  } else {
    watcher
      .on('add', filename => {
        // does this file fall into the "test file" bucket?  we have to
        // re-collect the files to find out.
        debug('"add" event for %s', filename);
        const newEntryFiles = new Set(collectFiles(fileCollectParams));
        if (newEntryFiles.has(filename)) {
          moduleMap.addEntryFile(filename);
          debug('added new entry file %s', filename);
          findChangesAndRerun(filename);
        } else {
          debug('added non-entry file %s; not triggering rerun', filename);
        }
      })
      .on('change', filename => {
        debug('"change" event for %s', filename);
        findChangesAndRerun(filename);
      })
      .on('unlink', filename => {
        debug('"unlink" event for %s', filename);
        findChangesAndRerun(filename);
        moduleMap.delete(filename);
      });
  }

  hideCursor();
  process.on('exit', () => {
    showCursor();
  });

  // this is for testing.
  // win32 cannot gracefully shutdown via a signal from a parent
  // process; a `SIGINT` from a parent will cause the process
  // to immediately exit.  during normal course of operation, a user
  // will type Ctrl-C and the listener will be invoked, but this
  // is not possible in automated testing.
  // there may be another way to solve this, but it too will be a hack.
  // for our watch tests on win32 we must _fork_ mocha with an IPC channel
  if (process.connected) {
    process.on('message', msg => {
      if (msg === 'SIGINT') {
        process.emit('SIGINT');
      }
    });
  }

  let exiting = false;
  process.on('SIGINT', async () => {
    showCursor();
    if (!exiting) {
      exiting = true;
      console.error(
        `\n${logSymbols.warning} [mocha] cleaning up, please wait...`
      );
      try {
        moduleMap.save();
        debug('persisted module map cache');
      } catch (err) {
        console.error(`failed to save module map: ${err}\ncontinuing...`);
      }
      try {
        await moduleMap.terminate();
        debug('terminated worker');
      } catch (err) {
        console.error(`failed to terminate worker: ${err}\ncontinuing...`);
      }
      if (mocha.hasGlobalTeardownFixtures()) {
        debug('running global teardown');
        try {
          await mocha.runGlobalTeardown(globalFixtureContext);
        } catch (err) {
          console.error(err);
        }
      }
      debug('done');
      process.exit(130);
    } else {
      console.error(
        `\b${logSymbols.warning} [mocha] sorry! still cleaning up, please wait...`
      );
    }
  });

  // Keyboard shortcut for restarting when "rs\n" is typed (ala Nodemon)
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => {
    const str = data
      .toString()
      .trim()
      .toLowerCase();
    if (str === 'rs') rerunner.enqueue(testFiles);
  });

  return watcher;
};

/**
 * Hide the cursor.
 * @ignore
 * @private
 */
const hideCursor = () => {
  process.stdout.write('\u001b[?25l');
};

/**
 * Show the cursor.
 * @ignore
 * @private
 */
const showCursor = () => {
  process.stdout.write('\u001b[?25h');
};

/**
 * Return the list of absolute paths watched by a chokidar watcher.
 *
 * @param watcher - Instance of a chokidar watcher
 * @return {string[]} - List of absolute paths
 * @ignore
 * @private
 */
const getWatchedFiles = watcher => {
  const watchedDirs = watcher.getWatched();
  return Object.keys(watchedDirs).reduce(
    (acc, dir) => [
      ...acc,
      ...watchedDirs[dir].map(file => path.join(dir, file))
    ],
    []
  );
};
