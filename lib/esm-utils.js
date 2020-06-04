const {promises: fs} = require('fs');
const path = require('path');
const url = require('url');
const validModule = require('valid-module');
const {createInvalidModuleConfigError} = require('./errors');

const formattedImport = async file => {
  if (path.isAbsolute(file)) {
    return import(url.pathToFileURL(file));
  }
  return import(file);
};

/**
 * Attempt to `require()` or `import()` a given file.
 *
 * `.mjs` files are always loaded as ES modules.
 *
 * @param {string} file - Filepath
 */
exports.requireOrImport = async file => {
  if (path.extname(file) === '.mjs') {
    return formattedImport(file);
  }
  try {
    return require(file);
  } catch (requireError) {
    // node does not reliably detect if a file with a .js extension is an ES module,
    // as either --input-type or `type: 'module'` in `package.json` must be used.
    // userland to the rescue!
    if (
      requireError.code === 'ERR_REQUIRE_ESM' ||
      requireError instanceof SyntaxError
    ) {
      try {
        return formattedImport(file);
      } catch (importError) {
        // if import fails, it might _still_ be an es module, and if that's the case
        // let's print a nice error to that effect.
        const contents = await fs.readFile(file);
        let isValidModule;
        try {
          isValidModule = await validModule.file(contents);
        } catch (ignored) {
          // isValidModule throws if it is a CJS module
          throw requireError;
        }
        if (isValidModule) {
          throw createInvalidModuleConfigError(
            `${file} is an ES module, but Node.js is not configured to recognize it. Use .mjs extension or otherwise see docs at https://nodejs.org/api/esm.html`,
            file
          );
        } else {
          throw importError;
        }
      }
    } else {
      throw requireError;
    }
  }
};

exports.loadFilesAsync = async (files, preLoadFunc, postLoadFunc) => {
  for (const file of files) {
    preLoadFunc(file);
    const result = await exports.requireOrImport(path.resolve(file));
    postLoadFunc(file, result);
  }
};
