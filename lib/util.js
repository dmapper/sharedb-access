
exports.relevantPath = function relevantPath(pattern, op) {
//  console.log('op', op);
  var segments = segmentsFor(op);
  var patternSegments = pattern.split('.');

  if (segments.length !== patternSegments.length) {
    return false;
  }

  if (-1 === patternSegments.indexOf('*')) {
    return segments.join('.') === patternSegments.join('.');
  }

  var regExp = patternToRegExp(patternSegments.join('.'));


  return regExp.test(segments.join('.'));

};

exports.lookup = function(segments, doc) {

  var part, curr = doc;
  for (var i = 0; i < segments.length; i++) {
    part = segments[i];
    if (curr !== void 0) {
      curr = curr[part];
    }
  }

  return curr;
};

function patternToRegExp (pattern) {
  var regExpString = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "(.+)")
    .replace(/\*/g, "([^.]+)");

  return new RegExp('^'+regExpString+'$');
}

exports.patternToRegExp = patternToRegExp;

function segmentsFor(item) {

  var relativeSegments = item.p;

  if (normalPath(item)) return relativeSegments;

  return relativeSegments.slice(0, -1);
}

function normalPath (item) {
  return 'oi' in item || 'od' in item || 'li' in item || 'ld' in item || 'na' in item;
}