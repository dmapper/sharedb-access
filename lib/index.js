var _ = require('lodash');
var util = require('./util');
var debug = require('debug')('access');

function getOrigin(agent){
  return (agent.stream.isServer) ? 'server' : 'browser';
}

var operations = [
  'Read',
  'Create',
  'Delete',
  'Update'
];

// Possible options:
// dontUseOldDocs: false - if true don't save unupdated docs for update action

exports = module.exports = ShareDBAccess;

function ShareDBAccess(racer, options){
  if (!(this instanceof ShareDBAccess)) return new ShareDBAccess(racer, options);
  var self = this;

  this.options = options || {};

  this.allow = {};
  this.deny = {};

  racer.on('store', function(store){
    self.store = store;

    var backend = store.backend;

    backend.use('doc', self.docHandler.bind(self));
    backend.use('apply', self.applyHandler.bind(self));
    backend.use('commit', self.commitHandler.bind(self));

    self.initStore();
  });
}

ShareDBAccess.prototype.initStore = function(){
  var store = this.store;

  var allow = this.allow;
  var deny = this.deny;

  // Export functions
  operations.forEach(function(op){
    allow[op] = {};
    deny[op] = {};

    if (op !== 'Update') {

      store['allow' + op] = function (collection, fn) {
        if(collection.indexOf('*') > -1) {
          allow[op]['**'] = allow[op]['**'] || [];
          allow[op]['**'].push({fn: fn, pattern: collection});
        } else {
          allow[op][collection] = allow[op][collection] || [];
          allow[op][collection].push(fn);
        }
      };

      store['deny' + op] = function (collection, fn) {
        if(collection.indexOf('*') > -1) {
          deny[op]['**'] = deny[op]['**'] || [];
          deny[op]['**'].push({fn: fn, pattern: collection});
        } else {
          deny[op][collection] = deny[op][collection] || [];
          deny[op][collection].push(fn);
        }
      };
    }

  });

  store.allowUpdate = function (collection, fn) {

    if(collection.indexOf('*') > -1) {
      allow['Update']['**'] = allow['Update']['**'] || [];
      allow['Update']['**'].push({fn: fn, pattern: collection});
    } else {
      allow['Update'][collection] = allow['Update'][collection] || [];
      allow['Update'][collection].push({
        fn: fn
      });
    }
  };

  store.denyUpdate = function (collection, fn) {
    if(collection.indexOf('*') > -1) {
      deny['Update']['**'] = deny['Update']['**'] || [];
      deny['Update']['**'].push({fn: fn, pattern: collection});
    } else {
      deny['Update'][collection] = deny['Update'][collection] || [];
      deny['Update'][collection].push({
        fn: fn
      });
    }
  };
};

// ++++++++++++++++++++++++++++++++ UPDATE ++++++++++++++++++++++++++++++++++

ShareDBAccess.prototype.commitHandler = function (shareRequest, done){
  var opData = shareRequest.op;

  if (opData.create || opData.del) return done();

  var session = shareRequest.agent.connectSession;
  var collection = shareRequest.collection;
  var docId = shareRequest.id;
  var oldDoc = (shareRequest.originalSnapshot && shareRequest.originalSnapshot.data) || {};
  var newDoc = shareRequest.snapshot.data;

  var ops = opData.op;

  var ok = this.check('Update', collection, [docId, oldDoc, newDoc, ops, session]);
  debug('update', ok, collection, docId, oldDoc, newDoc, ops);

  if (ok) return done();

  return done('403: Permission denied (update), collection: ' + collection + ', docId: '+ docId);
};

ShareDBAccess.prototype.applyHandler = function (shareRequest, done) {
  var opData = shareRequest.op;
  var session = shareRequest.agent.connectSession || {};
  var collection = shareRequest.collection;
  var docId = shareRequest.id;
  var snapshot = shareRequest.snapshot;

  var origin = getOrigin(shareRequest.agent);

  // Save userId for audit purpose
  opData.m = opData.m || {};
  opData.m.uId = session.userId;

  // Only derby-app client-request and server
  // if we set up checkServerAccess flag in stream
  //
  // we can set it up in the express middleware
  // before derby-apps routing in express
  // and set it off after

  var checkServerAccess = shareRequest.agent.stream.checkServerAccess;

  if (origin == 'server' && !checkServerAccess){
    return done();
  }

  // ++++++++++++++++++++++++++++++++ CREATE ++++++++++++++++++++++++++++++++++
  if (opData.create){

    var doc = opData.create.data;

    var ok = this.check('Create', collection, [docId, doc, session]);
    debug('create', ok, collection, docId, doc);
    if (ok) return done();

    return done('403: Permission denied (create), collection: ' + collection + ', docId: '+ docId);
  }

  // ++++++++++++++++++++++++++++++++ DELETE ++++++++++++++++++++++++++++++++++
  if (opData.del) {
    var doc = snapshot.data;

    var ok = this.check('Delete', collection, [docId, doc, session]);
    debug('delete', ok, collection, docId, doc);
    if (ok) return done();

    return done('403: Permission denied (delete), collection: ' + collection + ', docId: '+ docId);
  }

  // For Update
  if (!this.options.dontUseOldDocs) {
    shareRequest.originalSnapshot = _.cloneDeep(snapshot);
  }

  return done();
};

ShareDBAccess.prototype.docHandler = function (shareRequest, next){
  // ++++++++++++++++++++++++++++++++ READ ++++++++++++++++++++++++++++++++++
  var collection = shareRequest.collection;
  var docId = shareRequest.id;
  var doc = (shareRequest.snapshot && shareRequest.snapshot.data) || {};
  var agent = shareRequest.agent;

  var session = agent.connectSession;

  var origin = getOrigin(agent);

  var checkServerAccess = agent.stream.checkServerAccess;

  if (origin == 'server' && !checkServerAccess){
    return next();
  }

  var ok = this.check('Read', collection, [docId, doc, session]);

  debug('read', ok, collection, [docId, doc, session]);

  if (ok) return next();

  next('403: Permission denied (read), collection: ' + collection + ', docId: '+ docId);
};

ShareDBAccess.prototype.check = function (operation, collection, args){
  var allow = this.allow;
  var deny = this.deny;

  // First, check pattern matching collections
  allow[operation]['**'] = allow[operation]['**'] || [];
  deny[operation]['**'] = deny[operation]['**'] || [];

  var allowPatterns = allow[operation]['**'];
  var denyPatterns = deny[operation]['**'];

  allow [operation][collection] = allow [operation][collection] || [];
  deny  [operation][collection] = deny  [operation][collection] || [];

  var allowValidators = allow [operation][collection];
  var denyValidators  = deny  [operation][collection];

  var isAllowed = false;

  for(var i = 0, len = allowPatterns.length; i < len; i++) {
    var pattern = allowPatterns[i].pattern;

    var regExp = util.patternToRegExp(pattern);

    if(regExp.test(collection)) isAllowed = apply(allowPatterns[i]);

    if (isAllowed) break;
  }

  for (var i = 0; !isAllowed && i < allowValidators.length; i++) {
    isAllowed = apply(allowValidators[i]);
    if (isAllowed) break;
  }

  var isDenied = false;

  for(var i = 0, len = denyPatterns.length; i < len; i++) {
    var pattern = denyPatterns[i].pattern;

    var regExp = util.patternToRegExp(pattern);

    if(regExp.test(collection)) isDenied = apply(denyPatterns[i]);

    if (isDenied) break;
  }

  for (var j = 0; !isDenied && j < denyValidators.length; j++) {
    isDenied = apply(denyValidators[j]);
    if (isDenied) break;
  }

  return isAllowed && !isDenied;

  function apply(validator) {
    if (_.isFunction(validator)) return validator.apply(this, args);
    return validator.fn.apply(this, args);
  }
};

exports.lookup = util.lookup;



