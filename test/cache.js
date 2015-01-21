require('lassi');
var assert = lassi.assert;

describe('cache', function() {

  it("Mémoire", function(done) {
    this.timeout(3000)
    var cache = new lfw.cache.Manager();
    var v = {a:{b:{c:'toto'}}};
    cache.set('truc', v, 1, function(error) {
      if (error) throw error;
      cache.get('truc', function(error, value) {
        if (error) throw error;
        assert.equals(value.a.b.c, 'toto');
        setTimeout(function() {
          cache.get('truc',function(error, value) {
            if (error) throw error;
            assert.false(value);
            done();
          });
        }, 1200);
      });
    });
  });

  it("Memcache", function(done) {
    this.timeout(3000)
    var cache = new lfw.cache.Manager();
    cache.addEngine('', new lfw.cache.MemcacheEngine('localhost:11211'));
    var v = {a:{b:{c:'toto'}}};
    cache.set('truc', v, 1, function(error) {
      if (error) throw error;
      cache.get('truc', function(error, value) {
        if (error) throw error;
        assert.equals(value.a.b.c, 'toto');
        setTimeout(function() {
          cache.get('truc',function(error, value) {
            if (error) throw error;
            assert.false(value);
            done();
          });
        }, 1200);
      });
    });
  });


});


