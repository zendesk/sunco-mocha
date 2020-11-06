'use strict';

const {Rerunner} = require('../../../lib/cli/rerunner');
const sinon = require('sinon');

describe('Rerunner', function() {
  describe('static method', function() {
    describe('validateAdd()', function() {
      describe('when a value was successfully added to a Set', function() {
        it('should return true', function() {
          expect(Rerunner.validateAdd(new Set(), 'foo'), 'to be true');
        });
      });

      describe('when a value is already present in the Set', function() {
        let set;

        beforeEach(function() {
          set = new Set(['foo']);
        });

        it('should return false', function() {
          expect(Rerunner.validateAdd(set, 'foo'), 'to be false');
        });
      });

      describe('create()', function() {
        it('should return a new Rerunner instance', function() {
          expect(Rerunner.create(), 'to be a', Rerunner);
        });
      });
    });

    describe('instance method', function() {
      let rerunner;
      let stubs;

      beforeEach(function() {
        stubs = {
          mocha: {
            runAsync: sinon.stub().resolves()
          },
          watcher: {}
        };
        rerunner = Rerunner.create(stubs.mocha, stubs.watcher);
      });

      afterEach(function() {
        sinon.restore();
      });

      describe('enqueue()', function() {
        beforeEach(function() {
          sinon.stub(rerunner, 'resetDrainTimer');
        });

        describe('when not provided any files', function() {
          it('should not start the drain timer', function() {
            rerunner.enqueue();
            expect(rerunner.resetDrainTimer, 'was not called');
          });
        });

        describe('when the Rerunner is already running', function() {
          beforeEach(function() {
            rerunner.running = true;
          });

          describe('when provided files', function() {
            it('should not start the drain timer', function() {
              rerunner.enqueue(['foo.js'], ['foo.js', 'bar.js']);
              expect(rerunner.resetDrainTimer, 'was not called');
            });
          });
        });

        describe('when all files are already enqueued', function() {
          it('should not start the drain timer', function() {
            rerunner.testFileQueue.add('foo.js');
            rerunner.affectedFileQueue.add('foo.js');
            rerunner.enqueue(['foo.js'], ['foo.js']);
            expect(rerunner.resetDrainTimer, 'was not called');
          });
        });

        describe('when files are not already enqueued', function() {
          it('should start the drain timer', function() {
            rerunner.enqueue(['foo.js'], ['foo.js']);
            expect(rerunner.resetDrainTimer, 'was called once');
          });
        });
      });

      describe('drain()', function() {
        beforeEach(function() {
          sinon.stub(rerunner, 'run').resolves();
          sinon.stub(Rerunner, 'eraseLine');
        });

        it('should clear the test file queue', async function() {
          await rerunner.drain();
          expect(rerunner.testFileQueue, 'to be empty');
        });

        it('should clear the affected file queue', async function() {
          await rerunner.drain();
          expect(rerunner.affectedFileQueue, 'to be empty');
        });

        it('should erase the last line of the terminal', async function() {
          await rerunner.drain();
          expect(Rerunner.eraseLine, 'was called once');
        });

        it('should call run with whatever was in the queue', async function() {
          rerunner.testFileQueue.add('foo.js');
          rerunner.affectedFileQueue.add('bar.js').add('foo.js');
          await rerunner.drain();
          expect(rerunner.run, 'to have a call satisfying', [
            new Set(['foo.js']),
            new Set(['foo.js', 'bar.js'])
          ]);
        });
      });

      describe('resetDrainTimer()', function() {
        let drainTimer;

        beforeEach(function() {
          drainTimer = rerunner.drainTimer;
          sinon.stub(rerunner, 'drain');
        });

        it('should refresh the timer', function() {
          rerunner.resetDrainTimer();
          expect(rerunner.drainTimer, 'not to be', drainTimer);
        });
      });

      describe('run()', function() {
        beforeEach(function() {
          sinon.stub(Rerunner, 'blastRequireCache');
          sinon.stub(rerunner, 'resetDrainTimer');
        });

        it('should blast the require cache for all affected files', async function() {
          await rerunner.run([], ['foo.js']);
          expect(Rerunner.blastRequireCache, 'to have a call satisfying', [
            ['foo.js']
          ]);
        });

        it('should start a Mocha run', async function() {
          await rerunner.run();
          expect(stubs.mocha.runAsync, 'was called once');
        });

        describe('when a pre-run setup function is provided', function() {
          let newMocha;

          beforeEach(function() {
            newMocha = Object.create(stubs.mocha);
            rerunner.setupRun = sinon.stub().returns(newMocha);
          });

          it('should run against the new Mocha instance returned by the pre-run setup function', async function() {
            await rerunner.run();
            expect(newMocha.runAsync, 'was called once');
          });
        });

        describe('when the test file queue is not empty', function() {
          beforeEach(function() {
            rerunner.testFileQueue.add('foo.js');
          });
          it('should reset the drain timer', async function() {
            await rerunner.run();
            expect(rerunner.resetDrainTimer, 'was called once');
          });
        });

        describe('when the test file queue is empty', function() {
          it('should not reset the drain timer', async function() {
            await rerunner.run();
            expect(rerunner.resetDrainTimer, 'was not called');
          });
        });
      });
    });
  });
});
