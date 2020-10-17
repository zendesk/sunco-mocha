'use strict';

const {paperwork} = require('precinct');
const cabinet = require('filing-cabinet');
const path = require('path');
const multimatch = require('multimatch');
const debug = require('debug')('mocha:cli:resolver');
const {castArray, defineConstants} = require('../utils');
const {warn} = require('../errors');
const {existsSync} = require('fs');

const configureJavaScript = ({cwd = process.cwd(), webpackConfig} = {}) => {
  if (!webpackConfig) {
    const defaultWebpackConfig = path.join(cwd, 'webpack.config.js');
    if (existsSync(defaultWebpackConfig)) {
      return {webpackConfig: defaultWebpackConfig};
    }
  }
  return {webpackConfig};
};

const configureTypeScript = ({cwd = process.cwd(), tsConfig} = {}) => {
  if (!tsConfig) {
    const defaultTsConfig = path.join(cwd, 'tsconfig.json');
    if (existsSync(defaultTsConfig)) {
      return {tsConfig: defaultTsConfig};
    }
    warn(
      '[mocha]: could not find tsconfig.json; smart "watch" behavior may be negatively impacted'
    );
  }
  return {tsConfig};
};

const knownExtensions = defineConstants({
  '.ts': configureTypeScript,
  '.tsx': configureTypeScript,
  '.js': configureJavaScript,
  '.jsx': configureJavaScript
});

/**
 *
 * @param {string} filename - Module filepath
 * @param {Partial<ResolveDependenciesOptions>} [opts]
 */
exports.resolveDependencies = (
  filename,
  {cwd = process.cwd(), tsConfig, webpackConfig, ignore = new Set()} = {}
) => {
  ignore = [...new Set(castArray(ignore))]; // pretend you didn't see this
  const partials = paperwork(filename, {includeCore: false});

  const extname = path.extname(filename);
  let baseCabinetOptions = {filename, directory: cwd};
  if (knownExtensions[extname]) {
    baseCabinetOptions = {
      ...baseCabinetOptions,
      ...knownExtensions[extname]({cwd, tsConfig, webpackConfig})
    };
  }

  debug('found partials in %s: %o', filename, partials);
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
  return deps;
};

/**
 * @typedef {Object} ResolveDependenciesOptions
 * @property {string} cwd - Current working directory
 * @property {string} tsConfig - Path to `tsconfig.json`
 * @property {Set<string>|string[]|string} ignore - Paths/globs to ignore
 */
