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

const configureJavaScript = ({cwd = process.cwd(), webpackConfig} = {}) => {
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

const configureTypeScript = ({cwd = process.cwd(), tsConfig} = {}) => {
  if (!tsConfig) {
    const tsConfigPath = path.join(cwd, constants.DEFAULT_TS_CONFIG_FILENAME);
    if (existsSync(tsConfigPath)) {
      debug('looking for default typescript config file at %s', tsConfigPath);
      return {tsConfig: tsConfigPath};
    }
    warn(
      '[mocha]: could not find tsconfig.json; smart "watch" behavior may be negatively impacted'
    );
  }
  return {tsConfig};
};

const knownExtensions = createMap({
  '.ts': configureTypeScript,
  '.tsx': configureTypeScript,
  '.js': configureJavaScript,
  '.jsx': configureJavaScript
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
  const partials = paperwork(filepath, {includeCore: false});
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

  debug('found partials in %s: %o', filepath, partials);
  const deps = new Set(
    partials
      .map(partial => {
        const result = cabinet({partial, ...baseCabinetOptions});
        debug('cabinet found for %s: %o', partial, result);
        return result;
      })
      .filter(Boolean) // bugs in the filing-cabinet sometimes return empty strings!
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
