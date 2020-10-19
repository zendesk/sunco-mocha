'use strict';

const {paperwork} = require('precinct');
const cabinet = require('filing-cabinet');
const path = require('path');
const multimatch = require('multimatch');
const debug = require('debug')('mocha:cli:resolver');
const {castArray, defineConstants, createMap} = require('../utils');
const {warn} = require('../errors');
const {existsSync} = require('fs');

const constants = defineConstants({
  DEFAULT_WEBPACK_CONFIG_FILENAME: 'webpack.config.js',
  DEFAULT_TS_CONFIG_FILENAME: 'tsconfig.json'
});

/**
 * Configures `filing-cabinet` to resolve modules referenced in JS files.
 *
 * Does not support RequireJS/AMD
 * @private
 * @param {Partial<ConfigureFilingCabinetForJSOptions>} [opts]
 * @returns {{webpackConfig: string|void}}
 */
const configureFilingCabinetForJS = ({
  cwd = process.cwd(),
  webpackConfig
} = {}) => {
  if (!webpackConfig) {
    const defaultWebpackConfig = path.join(
      cwd,
      constants.DEFAULT_WEBPACK_CONFIG_FILENAME
    );
    if (existsSync(defaultWebpackConfig)) {
      return {webpackConfig: defaultWebpackConfig};
    }
  }
  return {webpackConfig};
};

/**
 * Configures `filing-cabinet` to resolve modules referenced in TS files
 * @private
 * @param {Partial<ConfigureFilingCabinetForTSOptions>} [opts]
 * @returns {{tsConfig: string|void}}
 */
const configureFilingCabinetForTS = ({cwd = process.cwd(), tsConfig} = {}) => {
  if (!tsConfig) {
    const tsConfigPath = path.join(cwd, constants.DEFAULT_TS_CONFIG_FILENAME);
    if (existsSync(tsConfigPath)) {
      debug('looking for default typescript config file at %s', tsConfigPath);
      return {tsConfig: tsConfigPath};
    }
    warn('[mocha]: could not find TS config file; please provide a file path');
  }
  return {tsConfig};
};

/**
 * Mapping of file extensions to configuration functions above.
 * These are explicitly recognized by `filing-cabinet`, in addition to others
 */
const knownExtensions = createMap({
  '.ts': configureFilingCabinetForTS,
  '.tsx': configureFilingCabinetForTS,
  '.js': configureFilingCabinetForJS,
  '.jsx': configureFilingCabinetForJS
});

/**
 * Given a path to a module, attempt to determine its dependencies
 *
 * Does special handling of TypeScript sources and supports Webpack configurations
 * @param {string} filepath - Module filepath
 * @param {Partial<ResolveDependenciesOptions>} [opts]
 * @returns {Set<string>} Dependency paths
 */
exports.resolveDependencies = (
  filepath,
  {
    cwd = process.cwd(),
    tsConfigPath,
    webpackConfigPath,
    ignore = new Set()
  } = {}
) => {
  ignore = [...new Set(castArray(ignore))]; // pretend you didn't see this

  // `paperwork` finds referenced modules in source files
  const partials = paperwork(filepath, {includeCore: false});
  debug('found partials in %s: %o', filepath, partials);

  const extname = path.extname(filepath);

  let baseCabinetOptions = {filename: filepath, directory: cwd};

  if (knownExtensions[extname]) {
    baseCabinetOptions = {
      ...baseCabinetOptions,
      ...knownExtensions[extname]({
        cwd,
        tsConfig: tsConfigPath,
        webpackConfig: webpackConfigPath
      })
    };
  }

  const deps = new Set(
    partials
      .map(partial => {
        const result = cabinet({partial, ...baseCabinetOptions});
        debug('cabinet found for %s: %o', partial, result);
        if (result === '') {
          warn('[mocha] could not resolve module "%s"', partial);
        }
        return result;
      })
      // when `filing-cabinet` fails to resolve a partial module reference, it returns an empty string,
      // which is not useful for Mocha
      .filter(Boolean)
  );
  // remove stuff matching ignored globs from the list.
  // there is probably a more efficient way to do this.
  // "PR's accepted!"
  multimatch(deps, ignore).forEach(ignored => {
    deps.delete(ignored);
  });

  // include these as dependencies, since if they change, the dep tree may be affected
  if (baseCabinetOptions.tsConfig) {
    deps.add(baseCabinetOptions.tsConfig);
  }

  if (baseCabinetOptions.webpackConfig) {
    deps.add(baseCabinetOptions.webpackConfig);
  }

  return deps;
};

/**
 * @typedef {Object} ResolveDependenciesOptions
 * @property {string} cwd - Current working directory
 * @property {string} tsConfigPath - Path to `tsconfig.json`
 * @property {string} webpackConfigPath - Path to `webpack.config.js`
 * @property {Set<string>|string[]|string} ignore - Paths/globs to ignore
 */

/**
 * @typedef {Object} ConfigureFilingCabinetForJSOptions
 * @property {string} cwd - Current working directory
 * @property {string} webpackConfigPath - Path to webpack config
 */

/**
 * @typedef {Object} ConfigureFilingCabinetForTSOptions
 * @property {string} cwd - Current working directory
 * @property {string} tsConfigPath - Path to TS config
 */
