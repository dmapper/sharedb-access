var _ = require('lodash');

var operations = [
  'Read',
  'Create',
  'Delete',
  'Update'
];

var allow = {};
var deny = {};

exports = module.exports = function(racer, options){
  racer.on('store', function(store){
    exports.setup(store.shareClient);
  });
};

exports.setup = function(shareClient) {
  shareClient.filter(function(collection, docName, docData, next){
    filterDocs(this, collection, docName, docData.data, next);
  });

  shareClient.use('submit', submitHandler);
};

// Export functions
operations.forEach(function(op){
  allow[op] = {};
  deny[op] = {};

  exports['allow' + op] = function(collection, fn){
    allow[op][collection] = allow[op][collection] || [];
    allow[op][collection].push(fn);
  };

  exports['deny' + op] = function(collection, fn){
    deny[op][collection] = deny[op][collection] || [];
    deny[op][collection].push(fn);
  };
});

function submitHandler(shareRequest, done) {
  var opData = shareRequest.opData;

  var session = shareRequest.agent.connectSession;

  // Only derby-app requests have
  // connectSession
  if (!session) return done();

  opData.session    = session;
  opData.collection = shareRequest.collection;
  opData.docId      = shareRequest.docName;

  opData.preValidate = preValidate;

  // Only for Update
  if (!opData.create && !opData.del) {
    opData.validate = validate;
  }

  return done();
}


function preValidate(opData, snapshot){

  var session = opData.session;
  var collection = opData.collection;
  var docId = opData.docId;

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
  opData.oldDoc = _.cloneDeep(snapshot.data);

}

// ++++++++++++++++++++++++++++++++ UPDATE ++++++++++++++++++++++++++++++++++

// preValidate for update-events executes to every mutation atomic way
// opData.op.length == 1 ALWAYS
// https://github.com/share/livedb/blob/f705fd103fd3427bd298177d3beb17f6747ff17e/lib/ot.js#L130-L153

function validate(opData, snapshot){
  var newDoc = snapshot.data;

  console.log('opData: validate: ', opData);
  var path = opData.op[0].p;

  console.log('validate - Update:', opData.oldDoc, newDoc, path);

  var ok = check('Update', opData.collection, [opData.docId, opData.oldDoc, newDoc, path, opData.session]);

  if (ok) return;

  return '403: Permission denied (update), collection: ' + opData.collection + ', docId: '+ opData.docId;
}


function filterDocs(agent, collection, docId, doc, next){
  // ++++++++++++++++++++++++++++++++ READ ++++++++++++++++++++++++++++++++++
  var session = agent.connectSession;

  var ok = check('Read', collection, [docId, doc, session]);

  if (ok) return next();

  next('403: Permission denied (read), collection: ' + collection + ', docId: '+ docId);
}

function check(operation, collection, args){
  allow [operation][collection] = allow [operation][collection] || [];
  deny  [operation][collection] = deny  [operation][collection] || [];

  var allowValidators = allow [operation][collection];
  var denyValidators  = deny  [operation][collection];

  var isAllowed = false;

  for (var i = 0; i < allowValidators.length; i++) {
    isAllowed = allowValidators[i].apply(this, args);
    if (isAllowed) break;
  }

  var isDenied = false;

  for (var j = 0; j < denyValidators.length; j++) {
    isDenied = denyValidators[j].apply(this, args);
    if (isDenied) break;
  }

  return isAllowed && !isDenied;
}


