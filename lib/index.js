var _ = require('lodash');
var util = require('./util');

var operations = [
  'Read',
  'Create',
  'Delete',
  'Update'
];

var allow = {};
var deny = {};

var oprions = {};

exports = module.exports = function(racer, opts){
  racer.on('store', function(store){
    exports.setup(store.shareClient, opts);
  });
};

// Possible options:
// dontUseOldDocs: false - if true don't save unupdated docs for update action

exports.setup = function(shareClient, opts) {
  options = opts || {};

  shareClient.filter(function(collection, docName, docData, next){
    filterDocs(this, collection, docName, docData.data, next);
  });

  shareClient.use('submit', submitHandler);
};

// Export functions
operations.forEach(function(op){
  allow[op] = {};
  deny[op] = {};

  if (op !== 'Update') {

    exports['allow' + op] = function (collection, fn) {
      allow[op][collection] = allow[op][collection] || [];
      allow[op][collection].push(fn);
    };

    exports['deny' + op] = function (collection, fn) {
      deny[op][collection] = deny[op][collection] || [];
      deny[op][collection].push(fn);
    };
  }

});

exports.allowUpdate = function (collection, filter, fn) {
  if (fn === void 0) {
    fn = filter;
    filter = undefined;
  }

  allow['Update'][collection] = allow['Update'][collection] || [];
  allow['Update'][collection].push({
    fn: fn,
    filter: filter
  });

};

exports.denyUpdate = function (collection, filter, fn) {
  if (fn === undefined) {
    fn = filter;
    filter = undefined;
  }

  deny['Update'][collection] = deny['Update'][collection] || [];
  deny['Update'][collection].push({
    fn: fn,
    filter: filter
  });

};

exports.lookup = util.lookup;

function submitHandler(shareRequest, done) {
  var opData = shareRequest.opData;

  var session = shareRequest.agent.connectSession;

  var origin     = getOrigin(shareRequest.agent);

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

  opData.__ = {
    session: session,
    collection: shareRequest.collection,
    docId: shareRequest.docName
  };

  opData.preValidate = preValidate;

  // Only for Update
  if (!opData.create && !opData.del) {
    opData.validate = validate;
  }

  return done();
}


function preValidate(opData, snapshot){

  var session = opData.__.session;
  var collection = opData.__.collection;
  var docId = opData.__.docId;

  // ++++++++++++++++++++++++++++++++ CREATE ++++++++++++++++++++++++++++++++++
  if (opData.create){
    var doc = opData.create.data;

    var ok = check('Create', collection, [docId, doc, session]);

    if (ok) return;

    return '403: Permission denied (create), collection: ' + collection + ', docId: '+ docId;
  }

  // ++++++++++++++++++++++++++++++++ DELETE ++++++++++++++++++++++++++++++++++
  if (opData.del) {
    var doc = snapshot.data;

    var ok = check('Delete', collection, [docId, doc, session]);

    if (ok) return;

    return '403: Permission denied (delete), collection: ' + collection + ', docId: '+ docId;
  }

  // For Update
  if (!options.dontUseOldDocs) {
    opData.__.oldDoc = _.cloneDeep(snapshot.data);
  }

}

// ++++++++++++++++++++++++++++++++ UPDATE ++++++++++++++++++++++++++++++++++

// preValidate for update-events executes to every mutation atomic way
// opData.op.length == 1 ALWAYS
// https://github.com/share/livedb/blob/f705fd103fd3427bd298177d3beb17f6747ff17e/lib/ot.js#L130-L153

function validate(opData, snapshot){
  var newDoc = snapshot.data;

  var op = opData.op[0];
  var path = op.p;

  var oldDoc =  opData.__.oldDoc || newDoc;


  var ok = check('Update', opData.__.collection, [opData.__.docId, oldDoc, newDoc, path, opData.__.session], op);

  delete opData.__.oldDoc;

  if (ok) return;

  return '403: Permission denied (update), collection: ' + opData.__.collection + ', docId: '+ opData.__.docId;
}


function filterDocs(agent, collection, docId, doc, next){
  // ++++++++++++++++++++++++++++++++ READ ++++++++++++++++++++++++++++++++++
  var session = agent.connectSession;

  var origin     = getOrigin(agent);

  var checkServerAccess = agent.stream.checkServerAccess;
  
  if (origin == 'server' && !checkServerAccess){
    return next();
  }

  var ok = check('Read', collection, [docId, doc, session]);

  if (ok) return next();

  next('403: Permission denied (read), collection: ' + collection + ', docId: '+ docId);
}

function check(operation, collection, args, op){
  allow [operation][collection] = allow [operation][collection] || [];
  deny  [operation][collection] = deny  [operation][collection] || [];

  var allowValidators = allow [operation][collection];
  var denyValidators  = deny  [operation][collection];

  var isAllowed = false;

  for (var i = 0; i < allowValidators.length; i++) {
    isAllowed = apply(allowValidators[i]);
    if (isAllowed) break;
  }

  var isDenied = false;

  for (var j = 0; j < denyValidators.length; j++) {
    isDenied = apply(denyValidators[j]);
    if (isDenied) break;
  }

  return isAllowed && !isDenied;

  function apply(validator) {
    if (_.isFunction(validator)) return validator.apply(this, args);

    return validator.filter === undefined || util.relevantPath(validator.filter, op) ?
        validator.fn.apply(this, args) : false;

  }
}

function getOrigin(agent){
  return (agent.stream.isServer) ? 'server' : 'browser';
}
