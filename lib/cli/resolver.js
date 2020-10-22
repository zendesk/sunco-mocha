'use strict';

const {paperwork} = require('precinct');
const cabinet = require('filing-cabinet');
const path = require('path');
const multimatch = require('multimatch');
const debug = require('debug')('mocha:cli:resolver');
const {castArray, defineConstants} = require('../utils');
const {existsSync} = require('fs');
const resolveFrom = require('resolve-from');

const constants = defineConstants({
  DEFAULT_WEBPACK_CONFIG_FILENAME: 'webpack.config.js',
  DEFAULT_TS_CONFIG_FILENAME: 'tsconfig.json'
});

/**
 * Filter ignored files from a list of files
 * @param {Set<string>|string[]} files - List of files to match against ignorelist
 * @param {Set<string>|string[]} ignore - Ignored globs
 * @returns {Set<string>} `files` sans any ignored files
 */
const filterIgnored = (files, ignore) => {
  files = new Set(files);
  ignore = new Set(ignore);
  multimatch([...files], [...ignore]).forEach(ignored => {
    files.delete(ignored);
  });
  return files;
};

/**
 * Configures `filing-cabinet` to resolve modules referenced in JS files.
 *
 * Does not support RequireJS/AMD
 * @private
 * @param {Partial<ConfigureFilingCabinetForJSOptions>} [opts] - Options
 * @returns {string|void} Object containing path to a webpack config file, if any
 */
const tryFindWebpackConfigPath = ({
  cwd = process.cwd(),
  webpackConfigPath
} = {}) => {
  if (!webpackConfigPath) {
    const defaultWebpackConfigPath = path.join(
      cwd,
      constants.DEFAULT_WEBPACK_CONFIG_FILENAME
    );
    if (existsSync(defaultWebpackConfigPath)) {
      return defaultWebpackConfigPath;
    }
  }
  return webpackConfigPath;
};

/**
 * Configures `filing-cabinet` to resolve modules referenced in TS files
 * @private
 * @param {Partial<ConfigureFilingCabinetForTSOptions>} [opts]
 * @returns {string|void} Object containing path to a TS config file, if any
 */
const tryFindTSConfigPath = ({cwd = process.cwd(), tsConfigPath} = {}) => {
  if (!tsConfigPath) {
    const defaultTsConfigPath = path.join(
      cwd,
      constants.DEFAULT_TS_CONFIG_FILENAME
    );
    if (existsSync(defaultTsConfigPath)) {
      debug('found default TS config at %s', defaultTsConfigPath);
      return defaultTsConfigPath;
    }
  }
  return tsConfigPath;
};

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

/**
 * Given a set of partial module names/paths, return an object containing a Set of paths to those that were found
 * via `require.resolve()`, and another Set containing partials which could not be found this way
 * @param {Set<string>} unfilteredPartials
 * @returns {{naivelyResolvedPartials: Set<string>, unresolvedPartials: Set<string>}}
 */
const tryNaivelyResolvePartials = (filepath, unfilteredPartials) => {
  const naivelyResolvedPartials = new Set();
  const unresolvedPartials = unfilteredPartials.reduce((acc, partial) => {
    try {
      debug('trying to resolve partial "%s" from "%s"', partial, filepath);
      const resolvedPath = resolveFrom(path.dirname(filepath), partial);
      naivelyResolvedPartials.add(resolvedPath);
    } catch (ignored) {
      acc.add(partial);
    }
    return acc;
  }, new Set());
  return {naivelyResolvedPartials, unresolvedPartials};
};

/**
 * Given a set of partial module names/paths, return an array of resolved paths via `filing-cabinet`'s static analysis
 *
 * @param {Set<string>} unresolvedPartials - A Set of partials
 * @param {cabinet.Options} cabinetOptions  - Options for `filing-cabinet`
 * @returns {string[]} Resolved paths
 */
const resolvePartials = (unresolvedPartials, cabinetOptions = {}) =>
  [...unresolvedPartials]
    .map(partial => {
      const result = cabinet({partial, ...cabinetOptions});
      if (result === '') {
        debug('filing-cabinet could not resolve module "%s"!', partial);
      } else {
        debug('filing-cabinet resolved %s: %o', partial, result);
      }
      return result;
    })
    // when `filing-cabinet` fails to resolve a partial module reference, it returns an empty string,
    // which is not useful for Mocha
    .filter(Boolean);

/**
 * Given a path to a module, attempt to determine the paths to its dependencies.
 *
 * - This function is used to determine which tests need re-running if a file changes
 * - Does special handling of TypeScript sources and supports Webpack configurations
 *
 * @public
 * @param {string} filepath - Module filepath
 * @param {Partial<ResolveDependenciesOptions>} [opts] - Options
 * @returns {Set<string>} Dependency paths
 */
exports.resolveDependencies = (
  filepath,
  {cwd = process.cwd(), tsConfigPath, webpackConfigPath, ignore = []} = {}
) => {
  ignore = new Set(castArray(ignore)); // pretend you didn't see this

  // `paperwork` finds referenced modules in source files
  debug('looking for partials in %s', filepath);
  if (ignore.size) {
    debug('ignoring: %o', ignore);
  }
  let unfilteredPartials;
  try {
    unfilteredPartials = paperwork(filepath, {includeCore: false});
    debug('found partials in %s: %o', filepath, unfilteredPartials);
  } catch (err) {
    // unclear how to reliably cause paperwork to throw
    /* istanbul ignore next */
    debug('precinct could not parse %s; %s', filepath, err);
    /* istanbul ignore next */
    return new Set();
  }

  const extname = path.extname(filepath);
  const resolvedDeps = new Set();

  /**
   * Whether or not to perform "naive" module resolution via `require-from`.
   * This is more performant, and is desirable if neither TypeScript nor
   * Webpack is in use.
   */
  let shouldDoNaiveResolution = true;
  if (TS_EXTENSIONS.has(extname)) {
    debug('file %s is probably TS', filepath);
    tsConfigPath = tryFindTSConfigPath({cwd, tsConfigPath});
    if (tsConfigPath) {
      resolvedDeps.add(tsConfigPath);
      shouldDoNaiveResolution = false;
    }
  } else if (JS_EXTENSIONS.has(extname)) {
    debug('file %s is probably JS', filepath);
    webpackConfigPath = tryFindWebpackConfigPath({cwd, webpackConfigPath});
    if (webpackConfigPath) {
      resolvedDeps.add(webpackConfigPath);
      shouldDoNaiveResolution = false;
    }
  }

  let naivelyResolvedPartials = new Set();
  let unresolvedPartials;
  if (shouldDoNaiveResolution) {
    const naiveResult = tryNaivelyResolvePartials(filepath, unfilteredPartials);
    naivelyResolvedPartials = naiveResult.naivelyResolvedPartials;
    unresolvedPartials = naiveResult.unresolvedPartials;
  } else {
    unresolvedPartials = new Set(unfilteredPartials);
  }

  if (naivelyResolvedPartials.size) {
    debug('naively resolved deps: %o', naivelyResolvedPartials);
  }

  const naivelyResolvedDeps = filterIgnored(naivelyResolvedPartials, ignore);
  if (naivelyResolvedDeps.size) {
    debug('non-ignored naively-resolved deps: %o', naivelyResolvedDeps);
  }

  let filingCabinetResolvedDeps = new Set();

  if (unresolvedPartials.size) {
    const cabinetConfig = {
      filename: filepath,
      directory: cwd,
      webpackConfig: webpackConfigPath,
      tsConfig: tsConfigPath
    };
    debug(
      'using filing-cabinet to resolve: %o with config %o',
      unresolvedPartials,
      cabinetConfig
    );
    filingCabinetResolvedDeps = filterIgnored(
      resolvePartials(unresolvedPartials, cabinetConfig),
      ignore
    );
  }

  return new Set([
    ...resolvedDeps,
    ...filingCabinetResolvedDeps,
    ...naivelyResolvedDeps
  ]);
};

/**
 * Options for {@link resolveDependencies}
 * @typedef {Object} ResolveDependenciesOptions
 * @property {string} cwd - Current working directory
 * @property {string} tsConfigPath - Path to `tsconfig.json`
 * @property {string} webpackConfigPath - Path to `webpack.config.js`
 * @property {Set<string>|string[]|string} ignore - Paths/globs to ignore
 */

/**
 * Options for {@link configureFilingCabinetForJS}
 * @private
 * @typedef {Object} ConfigureFilingCabinetForJSOptions
 * @property {string} cwd - Current working directory
 * @property {string} webpackConfigPath - Path to webpack config
 */

/**
 * Options for {@link configureFilingCabinetForTS}
 * @private
 * @typedef {Object} ConfigureFilingCabinetForTSOptions
 * @property {string} cwd - Current working directory
 * @property {string} tsConfigPath - Path to TS config
 */
