'use strict';

const debug = require('debug')('mocha:cli:rerunner');
const {clearTimeout, setTimeout} = global;
const {defineConstants} = require('../utils');

const constants = defineConstants({
  /**
   * Default wait time (in ms) to trigger a run. A debounce of sorts
   */
  DEFAULT_RUN_DELAY: 100
});

/**
 * A class that calls `mocha.run()`. Owns a queue of files to run
 * @private
 */
class Rerunner {
  /**
   * Create an object that allows you to rerun tests on the mocha instance.
   *
   * @param {Mocha} mocha - Mocha instance
   * @param {FSWatcher} watcher - chokidar `FSWatcher` instance
   * @param {Object} [opts] - Options!
   * @param {BeforeWatchRun} [opts.setupRun] - Function to call before `mocha.run()`
   * @param {number} [opts.delay] - Delay before rerun in ms
   */
  constructor(
    mocha,
    watcher,
    {setupRun, delay = constants.DEFAULT_RUN_DELAY} = {}
  ) {
    this.running = false;
    this.testFileQueue = new Set();
    this.affectedFileQueue = new Set();
    this.mocha = mocha;
    this.watcher = watcher;
    this.setupRun = setupRun;
    this.delay = delay;
  }

  /**
   * Enqueue files to be run by Mocha
   * @param {string[]|Set<string>} testFiles - A list of test ("entry") files
   * @param {string[]|Set<string>} affectedFiles - A list of all files which should be blasted from the require cache.  A superset of `testFiles`
   */
  enqueue(testFiles = [], affectedFiles = []) {
    let added = false;
    for (const testFile of testFiles) {
      added = Rerunner.validateAdd(this.testFileQueue, testFile) || added;
    }
    for (const affectedFile of affectedFiles) {
      added =
        Rerunner.validateAdd(this.affectedFileQueue, affectedFile) || added;
    }

    if (added && !this.running) {
      this.resetDrainTimer();
    }
  }

  resetDrainTimer() {
    clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(async () => {
      this.running = true;
      debug('set run flag true');
      await this.drain();
      this.running = false;
      debug('set run flag false');
    }, this.delay);
    debug('reset drain timer');
  }

  /**
   * Drain the queue and run.
   */
  async drain() {
    const testFiles = new Set([...this.testFileQueue]);
    const affectedFiles = new Set([...this.affectedFileQueue]);
    this.testFileQueue.clear();
    this.affectedFileQueue.clear();
    Rerunner.eraseLine();
    return this.run(testFiles, affectedFiles);
  }

  /**
   * Calls `Mocha#run()` with `runObjects`.
   * If other files are enqueued while this is running, it will drain the queue at the end of its run.
   * Calls `setupRun` if present.
   */
  async run(testFiles = [], affectedFiles = []) {
    Rerunner.blastRequireCache(affectedFiles);

    /**
     * @type {import('../../lib/mocha')}
     */
    const mocha = (this.mocha = this.setupRun
      ? this.setupRun.call(null, {
          mocha: this.mocha,
          watcher: this.watcher,
          filenames: [...testFiles]
        }) || this.mocha
      : this.mocha);

    await mocha.runAsync();

    debug('finished watch run');

    if (this.testFileQueue.size) {
      this.resetDrainTimer();
    }
  }

  /**
   * Blast files out of `require.cache`
   * @param {string[]|Set<string>} files - List of files
   */
  static blastRequireCache(files = []) {
    for (const file of files) {
      delete require.cache[file];
    }
    if (files.length) {
      /* istanbul ignore next */
      debug('deleted %d file(s) from the require cache', [...files].length);
    }
  }

  static create(mocha, watcher, opts) {
    return new Rerunner(mocha, watcher, opts);
  }

  /**
   * Erases the line on stdout
   */
  static eraseLine() {
    process.stdout.write('\u001b[2K');
  }

  /**
   * Adds `value` to `set`; returns `true` if `value` is _new_ to `set`
   *
   * Used to avoid reruns when the same file is enqueued multiple times
   * @param {Set<*>} set - A Set
   * @param {*} value - A value to add to the set
   * @returns {boolean}
   */
  static validateAdd(set, value) {
    const prevSize = set.size;
    set.add(value);
    return set.size > prevSize;
  }
}

exports.Rerunner = Rerunner;
exports.constants = constants;

/**
 * Callback to be run before `mocha.run()` is called.
 * Optionally, it can return a new `Mocha` instance.
 * @callback BeforeWatchRun
 * @private
 * @param {{mocha: Mocha, watcher: FSWatcher, filenames: string[]}} options
 * @returns {Mocha|void}
 */

/**
 * An object containing a list of test files and list of all affected files
 * @typedef {Object} RunObject
 * @property {string[]} testFiles
 * @property {string[]} affectedFiles
 */
