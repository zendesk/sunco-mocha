const path = require('path');
const url = require('url');
const debug = require('debug')('mocha:esm-utils');

const forward = x => x;

const formattedImport = async (file, esmDecorator = forward) => {
  debug('formattedImport 1', file);
  if (path.isAbsolute(file)) {
    debug('formattedImport 2', file);
    try {
      debug('formattedImport 3', file);
      return await exports.doImport(esmDecorator(url.pathToFileURL(file)));
    } catch (err) {
      debug('formattedImport 4', file);
      // This is a hack created because ESM in Node.js (at least in Node v15.5.1) does not emit
      // the location of the syntax error in the error thrown.
      // This is problematic because the user can't see what file has the problem,
      // so we add the file location to the error.
      // TODO: remove once Node.js fixes the problem.
      if (
        err instanceof SyntaxError &&
        err.message &&
        err.stack &&
        !err.stack.includes(file)
      ) {
        const newErrorWithFilename = new SyntaxError(err.message);
        newErrorWithFilename.stack = err.stack.replace(
          /^SyntaxError/,
          `SyntaxError[ @${file} ]`
        );
        throw newErrorWithFilename;
      }
      throw err;
    }
  }
  debug('formattedImport 5', file);
  return exports.doImport(esmDecorator(file));
};

exports.doImport = async file => import(file);

exports.requireOrImport = async (file, esmDecorator) => {
  debug('import 1');
  if (path.extname(file) === '.mjs') {
    return formattedImport(file, esmDecorator);
  }
  debug('import 2');
  try {
    // Importing a file usually works, but the resolution of `import` is the ESM
    // resolution algorithm, and not the CJS resolution algorithm. We may have
    // failed because we tried the ESM resolution, so we try to `require` it.
    debug('import 3');
    return require(file);
  } catch (requireErr) {
    throw requireErr;
  }
};

function dealWithExports(module) {
  debug('dealWithExports 1', module);
  if (module.default) {
    debug('dealWithExports 2', module);
    return module.default;
  } else {
    debug('dealWithExports 2.5', module);
    return {...module, default: undefined};
  }
}

exports.loadFilesAsync = async (
  files,
  preLoadFunc,
  postLoadFunc,
  esmDecorator
) => {
  for (const file of files) {
    preLoadFunc(file);
    debug('loading file ', file);
    const result = await exports.requireOrImport(
      path.resolve(file),
      esmDecorator
    );
    debug('after requireOrImport ', file);
    postLoadFunc(file, result);
  }
};
