'use strict';

describe('suite', function () {
  it('should fail in a fake-async test case', function(done) {
    done();
    throw new Error('error after done'); // catched synchronously
  });

  it('should fail in an async test case', function (done) {
    process.nextTick(function () {
      done();
      throw new Error('error after done'); // uncaught exception
    });
  });
});
