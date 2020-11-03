'use strict';

const {ModuleMap} = require('../../../lib/cli/module-map');
const {ModuleMapNode} = require('../../../lib/cli/module-map-node');
const sinon = require('sinon');
const {absoluteFixturePath} = require('../helpers');

const TEST_MODULE_MAP_CACHE_FILENAME = 'module-map-integration-test.cache.json';
const TEST_FILE_ENTRY_CACHE_FILENAME = 'file-entry-integration-test.cache.json';
const TEST_WITH_DEP_PATH = absoluteFixturePath(
  'options/watch/test-with-dependency'
);
const DEP_PATH = absoluteFixturePath('options/watch/dependency');
const TEST_WITH_TRANSITIVE_DEP_PATH = absoluteFixturePath(
  'options/watch/test-with-transitive-dep'
);
const TRANSITIVE_DEP_PATH = absoluteFixturePath('options/watch/transitive-dep');

describe('module-map', function() {
  /**
   * @type {ModuleMap}
   */
  let moduleMap;

  beforeEach(function() {
    sinon
      .stub(ModuleMap.prototype, 'fileEntryCacheFilename')
      .get(() => TEST_FILE_ENTRY_CACHE_FILENAME);
    sinon
      .stub(ModuleMap.prototype, 'moduleMapCacheFilename')
      .get(() => TEST_MODULE_MAP_CACHE_FILENAME);

    moduleMap = ModuleMap.create({
      entryFiles: [TEST_WITH_DEP_PATH, TEST_WITH_TRANSITIVE_DEP_PATH],
      reset: true
    });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('initialization', function() {
    it('should populate the ModuleMap with all entry files and dependencies thereof', function() {
      expect(moduleMap, 'as JSON', 'to satisfy', {
        [TEST_WITH_DEP_PATH]: {
          filename: TEST_WITH_DEP_PATH,
          entryFiles: [],
          children: [DEP_PATH],
          parents: []
        },
        [TEST_WITH_TRANSITIVE_DEP_PATH]: {
          filename: TEST_WITH_TRANSITIVE_DEP_PATH,
          entryFiles: [],
          children: [TRANSITIVE_DEP_PATH],
          parents: []
        },
        [DEP_PATH]: {
          filename: DEP_PATH,
          entryFiles: [TEST_WITH_DEP_PATH, TEST_WITH_TRANSITIVE_DEP_PATH],
          children: [],
          parents: [TEST_WITH_DEP_PATH, TRANSITIVE_DEP_PATH]
        },
        [TRANSITIVE_DEP_PATH]: {
          filename: TRANSITIVE_DEP_PATH,
          entryFiles: [TEST_WITH_TRANSITIVE_DEP_PATH],
          children: [DEP_PATH],
          parents: [TEST_WITH_TRANSITIVE_DEP_PATH]
        }
      });
    });

    describe('when reloading', function() {
      beforeEach(function() {
        sinon.spy(ModuleMap.prototype, '_populate');
      });

      describe('when known files previously persisted to file entry cache', function() {
        beforeEach(function() {
          moduleMap.persistFileEntryCache();
        });

        it('should inspect only new (unknown) entry files', function() {
          const someOtherFile = absoluteFixturePath(
            'options/watch/test-file-change'
          );
          const map2 = ModuleMap.create({
            entryFiles: [
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH,
              someOtherFile
            ]
          });
          expect(map2._populate, 'to have a call satisfying', [
            expect
              .it('as array', 'to have an item satisfying', {
                filename: someOtherFile
              })
              .and('as array', 'to have length', 1),
            {force: true}
          ]);
        });
      });

      describe('when known files were not previously persisted to file entry cache', function() {
        it('should inspect all entry files', function() {
          const someOtherFile = absoluteFixturePath(
            'options/watch/test-file-change'
          );
          const map2 = ModuleMap.create({
            entryFiles: [
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH,
              someOtherFile
            ]
          });
          // a less awkward way to do this might be to just instantiate a bunch
          // of `ModuleMapNode` objects with the proper properties
          expect(map2._populate, 'to have a call satisfying', [
            expect
              .it('as array', 'to have an item satisfying', {
                filename: someOtherFile
              })
              .and('as array', 'to have an item satisfying', {
                filename: TEST_WITH_DEP_PATH
              })
              .and('as array', 'to have an item satisfying', {
                filename: TEST_WITH_TRANSITIVE_DEP_PATH
              })
              .and('as array', 'to have an item satisfying', {
                filename: DEP_PATH
              })
              .and('as array', 'to have an item satisfying', {
                filename: TRANSITIVE_DEP_PATH
              })
              .and('as array', 'to have length', 5),
            {force: true}
          ]);
        });
      });

      describe('when an entry file has changed', function() {
        let someOtherFile;

        beforeEach(function() {
          someOtherFile = absoluteFixturePath('options/watch/test-file-change');
          sinon
            .stub(ModuleMap.prototype, 'getChangedFiles')
            .returns([TEST_WITH_DEP_PATH, someOtherFile]);
        });

        it('should inspect all changed and new entry files', function() {
          const map2 = ModuleMap.create({
            entryFiles: [
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH,
              someOtherFile
            ]
          });
          expect(map2._populate, 'to have a call satisfying', [
            new Set([
              ModuleMapNode.create(someOtherFile),
              ModuleMapNode.create(TEST_WITH_DEP_PATH, {
                children: new Set([DEP_PATH])
              })
            ]),
            {force: true}
          ]);
        });
      });

      describe('when a known dependency has changed', function() {
        beforeEach(function() {
          sinon
            .stub(ModuleMap.prototype, 'getChangedFiles')
            .returns([DEP_PATH]);
        });

        it('should inspect all changed dependencies', function() {
          const map2 = ModuleMap.create({
            entryFiles: [TEST_WITH_DEP_PATH, TEST_WITH_TRANSITIVE_DEP_PATH]
          });
          expect(map2._populate, 'to have a call satisfying', [
            new Set([
              ModuleMapNode.create(DEP_PATH, {
                entryFiles: new Set([
                  TEST_WITH_DEP_PATH,
                  TEST_WITH_TRANSITIVE_DEP_PATH
                ]),
                parents: new Set([TEST_WITH_DEP_PATH, TRANSITIVE_DEP_PATH])
              })
            ]),
            {force: true}
          ]);
        });
      });
    });
  });

  describe('merging from disk', function() {
    describe('when run w/ option `destructive = true`', function() {
      it('should overwrite the ModuleMap contents', function() {
        moduleMap.set('/some/file', ModuleMapNode.create('/some/file'));
        moduleMap.mergeFromCache({destructive: true});
        expect(moduleMap, 'not to have key', '/some/file').and(
          'to have key',
          TEST_WITH_DEP_PATH
        );
      });
    });

    describe('when run w/o options', function() {
      it('should merge into the ModuleMap contents', function() {
        moduleMap.set('/some/file', ModuleMapNode.create('/some/file'));
        moduleMap.mergeFromCache();
        expect(moduleMap, 'to have key', '/some/file').and(
          'to have key',
          TEST_WITH_DEP_PATH
        );
      });
    });
  });

  describe('module map cache creation/loading', function() {
    describe('when the cache has previously been persisted with known files', function() {
      it('should return a non-empty cache object', function() {
        expect(moduleMap.createModuleMapCache().all(), 'to have keys', [
          ...moduleMap.files
        ]);
      });
    });

    describe('when the cache has not previously been persisted with known files', function() {
      beforeEach(function() {
        moduleMap.resetModuleMapCache();
      });

      it('should return an empty cache object', function() {
        expect(moduleMap.createModuleMapCache().all(), 'to be empty');
      });
    });
  });

  describe('file entry cache creation/loading', function() {
    describe('when the cache has not previously been persisted with known files', function() {
      it('should return a cache object containing an empty flat cache', function() {
        expect(moduleMap.createFileEntryCache().cache.all(), 'to be empty');
      });
    });

    describe('when the cache has previously been persisted with known files', function() {
      beforeEach(function() {
        moduleMap.persistFileEntryCache();
      });

      it('should return a cache object containing a non-empty flat cache', function() {
        expect(moduleMap.createFileEntryCache().cache.all(), 'to have keys', [
          ...moduleMap.files
        ]);
      });
    });
  });

  describe('module map cache destruction', function() {
    describe('when a new ModuleMap is instantiated with a previously-reset module map cache', function() {
      beforeEach(function() {
        moduleMap.resetModuleMapCache();
      });

      it('should be empty', function() {
        expect(ModuleMap.create(), 'to be empty');
      });
    });

    describe('when a ModuleMap has had its module map cache previously reset', function() {
      beforeEach(function() {
        moduleMap.resetModuleMapCache();
      });

      it("should not affect the ModuleMap's in-memory contents", function() {
        expect(moduleMap, 'not to be empty');
      });

      describe('when a ModuleMap then persists its in-memory contents', function() {
        beforeEach(function() {
          moduleMap.persistModuleMapCache();
        });

        it('should contain a non-empty module map cache', function() {
          expect(moduleMap.moduleMapCache.all(), 'not to be empty');
        });

        it("should not affect the ModuleMap's in-memory contents", function() {
          expect(moduleMap, 'not to be empty');
        });
      });
    });
  });

  describe('file entry cache destruction', function() {
    describe('when a new ModuleMap is instantiated with a previously-reset file entry cache', function() {
      beforeEach(function() {
        moduleMap.resetFileEntryCache();
      });

      it('should contain an empty file entry cache', function() {
        expect(ModuleMap.create().fileEntryCache.cache.all(), 'to be empty');
      });
    });

    describe('when a ModuleMap has had its file entry cache previously reset', function() {
      beforeEach(function() {
        moduleMap.resetFileEntryCache();
      });

      it('should clear the file entry cache', function() {
        expect(moduleMap.fileEntryCache.cache.all(), 'to be empty');
      });

      it("should not affect the ModuleMap's in-memory contents", function() {
        expect(moduleMap, 'not to be empty');
      });

      describe('when a ModuleMap then updates & persists its file entry cache', function() {
        beforeEach(function() {
          moduleMap.persistFileEntryCache();
        });

        it('should add all known files back into the file entry cache', function() {
          expect(moduleMap.fileEntryCache.cache.all(), 'not to be empty');
        });

        it("should not affect the ModuleMap's in-memory contents", function() {
          expect(moduleMap, 'not to be empty');
        });
      });
    });
  });

  describe('finding entry files affected by a file change', function() {
    beforeEach(function() {
      // this will effectively remove any "changed files" in memory from the file entry cache
      moduleMap.persistFileEntryCache();
    });

    describe('when a direct dependency of an entry file is known to have changed', function() {
      it('should return a list of related files', function() {
        expect(
          moduleMap.findAffectedFiles({
            knownChangedFiles: [DEP_PATH]
          }),
          'to equal',
          {
            entryFiles: new Set([
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH
            ]),
            allFiles: new Set([
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH,
              TRANSITIVE_DEP_PATH,
              DEP_PATH
            ])
          }
        );
      });
    });

    describe('when an entry file itself is known to have changed', function() {
      it('should return a list of related files', function() {
        expect(
          moduleMap.findAffectedFiles({
            knownChangedFiles: [TEST_WITH_DEP_PATH]
          }),
          'to equal',
          {
            entryFiles: new Set([TEST_WITH_DEP_PATH]),
            allFiles: new Set([TEST_WITH_DEP_PATH])
          }
        );
      });
    });

    describe('when a transitive dependency of an entry file is known to have changed', function() {
      it('should return a list of related files', function() {
        expect(
          moduleMap.findAffectedFiles({
            knownChangedFiles: [TRANSITIVE_DEP_PATH]
          }),
          'to equal',
          {
            entryFiles: new Set([TEST_WITH_TRANSITIVE_DEP_PATH]),
            allFiles: new Set([
              TEST_WITH_TRANSITIVE_DEP_PATH,
              TRANSITIVE_DEP_PATH
            ])
          }
        );
      });
    });

    describe('when an entry file which depends on another entry file is known to have changed', function() {
      it('should return a list of entry files');
    });

    describe('when a previously-unknown file is known to have changed', function() {
      it('should return no affected files', function() {
        expect(
          moduleMap.findAffectedFiles({
            knownChangedFiles: [absoluteFixturePath('options/watch/hook')]
          }),
          'to equal',
          {entryFiles: new Set(), allFiles: new Set()}
        );
      });
    });
  });
});
