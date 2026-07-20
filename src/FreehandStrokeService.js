// Adapted from perfect-freehand 1.2.2, MIT License.
var __MN_FREEHAND_STROKE_SERVICE_MNOstraconAddon = (function () {
  function rate(size, thinning, pressure, easing) { return size * easing(0.5 - thinning * (0.5 - pressure)); }
  function neg(a) { return [-a[0], -a[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, value) { return [a[0] * value, a[1] * value]; }
  function div(a, value) { return [a[0] / value, a[1] / value]; }
  function per(a) { return [a[1], -a[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function equal(a, b) { return a[0] === b[0] && a[1] === b[1]; }
  function length(a) { return Math.hypot(a[0], a[1]); }
  function distanceSquared(a, b) { var d = sub(a, b); return d[0] * d[0] + d[1] * d[1]; }
  function unit(a) { return div(a, length(a)); }
  function distance(a, b) { return Math.hypot(a[1] - b[1], a[0] - b[0]); }
  function rotate(a, center, radians) {
    var sin = Math.sin(radians);
    var cos = Math.cos(radians);
    var x = a[0] - center[0];
    var y = a[1] - center[1];
    return [x * cos - y * sin + center[0], x * sin + y * cos + center[1]];
  }
  function interpolate(a, b, value) { return add(a, mul(sub(b, a), value)); }
  function addScaled(a, b, value) { return add(a, mul(b, value)); }

  function getStrokePoints(input, options) {
    var streamline = options.streamline === undefined ? 0.5 : options.streamline;
    var size = options.size === undefined ? 16 : options.size;
    var last = options.last === true;
    if (input.length === 0) return [];
    var t = 0.15 + (1 - streamline) * 0.85;
    var points = Array.isArray(input[0]) ? input : input.map(function (point) {
      return [point.x, point.y, point.pressure === undefined ? 0.5 : point.pressure];
    });
    if (points.length === 2) {
      var end = points[1];
      points = points.slice(0, -1);
      for (var extra = 1; extra < 5; extra++) points.push(interpolate(points[0], end, extra / 4));
    }
    if (points.length === 1) points = points.concat([[points[0][0] + 1, points[0][1] + 1, points[0][2]]]);
    var firstPressure = points[0][2] >= 0 ? points[0][2] : 0.25;
    var strokePoints = [{ point: points[0].slice(0, 2), pressure: firstPressure, vector: [1, 1], distance: 0, runningLength: 0 }];
    var runningLength = 0;
    var previous = strokePoints[0];
    var started = false;
    var finalIndex = points.length - 1;
    for (var index = 1; index < points.length; index++) {
      var point = last && index === finalIndex ? points[index].slice(0, 2) : interpolate(previous.point, points[index], t);
      if (equal(previous.point, point)) continue;
      var segmentLength = distance(point, previous.point);
      runningLength += segmentLength;
      if (index < finalIndex && !started) {
        if (runningLength < size) continue;
        started = true;
      }
      previous = {
        point: point,
        pressure: points[index][2] >= 0 ? points[index][2] : 0.5,
        vector: unit(sub(previous.point, point)),
        distance: segmentLength,
        runningLength: runningLength,
      };
      strokePoints.push(previous);
    }
    strokePoints[0].vector = strokePoints[1] ? strokePoints[1].vector : [0, 0];
    return strokePoints;
  }

  function getStrokeOutlinePoints(points, options) {
    var size = options.size === undefined ? 16 : options.size;
    var smoothing = options.smoothing === undefined ? 0.5 : options.smoothing;
    var thinning = options.thinning === undefined ? 0.5 : options.thinning;
    var simulatePressure = options.simulatePressure !== false;
    var easing = options.easing || function (value) { return value; };
    var start = options.start || {};
    var end = options.end || {};
    var last = options.last === true;
    if (points.length === 0 || size <= 0) return [];
    var totalLength = points[points.length - 1].runningLength;
    var startTaper = start.taper === false ? 0 : start.taper === true ? Math.max(size, totalLength) : start.taper || 0;
    var endTaper = end.taper === false ? 0 : end.taper === true ? Math.max(size, totalLength) : end.taper || 0;
    var startEase = start.easing || function (value) { return value * (2 - value); };
    var endEase = end.easing || function (value) { value -= 1; return value * value * value + 1; };
    var minDistance = Math.pow(size * smoothing, 2);
    var left = [];
    var right = [];
    var averagePressure = points.slice(0, 10).reduce(function (value, point) {
      var pressure = point.pressure;
      if (simulatePressure) {
        var distanceValue = Math.min(1, point.distance / size);
        pressure = Math.min(1, value + (Math.min(1, 1 - distanceValue) - value) * distanceValue * 0.275);
      }
      return (value + pressure) / 2;
    }, points[0].pressure);
    var radius = rate(size, thinning, points[points.length - 1].pressure, easing);
    var firstRadius;
    var previousVector = points[0].vector;
    var previousLeft = points[0].point;
    var previousRight = points[0].point;
    var lastLeft = previousLeft;
    var lastRight = previousRight;
    var reversing = false;

    for (var index = 0; index < points.length; index++) {
      var current = points[index];
      var pressure = current.pressure;
      if (index < points.length - 1 && totalLength - current.runningLength < 3) continue;
      if (thinning) {
        if (simulatePressure) {
          var distanceValue = Math.min(1, current.distance / size);
          pressure = Math.min(1, averagePressure + (Math.min(1, 1 - distanceValue) - averagePressure) * distanceValue * 0.275);
        }
        radius = rate(size, thinning, pressure, easing);
      } else {
        radius = size / 2;
      }
      if (firstRadius === undefined) firstRadius = radius;
      var startScale = current.runningLength < startTaper ? startEase(current.runningLength / startTaper) : 1;
      var endScale = totalLength - current.runningLength < endTaper ? endEase((totalLength - current.runningLength) / endTaper) : 1;
      radius = Math.max(0.01, radius * Math.min(startScale, endScale));
      var nextVector = (index < points.length - 1 ? points[index + 1] : current).vector;
      var nextDot = index < points.length - 1 ? dot(current.vector, nextVector) : 1;
      var reversingDirection = dot(current.vector, previousVector) < 0 && !reversing;
      var sharpCorner = nextDot !== null && nextDot < 0;
      if (reversingDirection || sharpCorner) {
        var offset = mul(per(previousVector), radius);
        for (var step = 0; step <= 1; step += 1 / 13) {
          lastLeft = rotate(sub(current.point, offset), current.point, (Math.PI + 0.0001) * step);
          left.push(lastLeft);
          lastRight = rotate(add(current.point, offset), current.point, (Math.PI + 0.0001) * -step);
          right.push(lastRight);
        }
        previousLeft = lastLeft;
        previousRight = lastRight;
        if (sharpCorner) reversing = true;
        continue;
      }
      reversing = false;
      if (index === points.length - 1) {
        var finalOffset = mul(per(current.vector), radius);
        left.push(sub(current.point, finalOffset));
        right.push(add(current.point, finalOffset));
        continue;
      }
      var offsetVector = mul(per(interpolate(nextVector, current.vector, nextDot)), radius);
      lastLeft = sub(current.point, offsetVector);
      if (index <= 1 || distanceSquared(previousLeft, lastLeft) > minDistance) {
        left.push(lastLeft);
        previousLeft = lastLeft;
      }
      lastRight = add(current.point, offsetVector);
      if (index <= 1 || distanceSquared(previousRight, lastRight) > minDistance) {
        right.push(lastRight);
        previousRight = lastRight;
      }
      averagePressure = pressure;
      previousVector = current.vector;
    }

    var firstPoint = points[0].point.slice(0, 2);
    var lastPoint = points.length > 1 ? points[points.length - 1].point.slice(0, 2) : add(points[0].point, [1, 1]);
    var startCap = [];
    var endCap = [];
    if (points.length === 1) {
      if ((!startTaper && !endTaper) || last) {
        var startCenter = addScaled(firstPoint, unit(per(sub(firstPoint, lastPoint))), -(firstRadius || radius));
        for (var singleStep = 1 / 13; singleStep <= 1; singleStep += 1 / 13) {
          startCap.push(rotate(startCenter, firstPoint, (Math.PI + 0.0001) * 2 * singleStep));
        }
        return startCap;
      }
    } else if (!startTaper) {
      if (start.cap !== false) {
        for (var startStep = 1 / 13; startStep <= 1; startStep += 1 / 13) {
          startCap.push(rotate(right[0], firstPoint, (Math.PI + 0.0001) * startStep));
        }
      } else {
        var startDelta = sub(left[0], right[0]);
        var startHalf = mul(startDelta, 0.5);
        var startWide = mul(startDelta, 0.51);
        startCap.push(sub(firstPoint, startHalf), sub(firstPoint, startWide), add(firstPoint, startWide), add(firstPoint, startHalf));
      }
    }
    var endVector = per(neg(points[points.length - 1].vector));
    if (endTaper || startTaper && points.length === 1) {
      endCap.push(lastPoint);
    } else if (end.cap !== false) {
      var endCenter = addScaled(lastPoint, endVector, radius);
      for (var endStep = 1 / 29; endStep < 1; endStep += 1 / 29) {
        endCap.push(rotate(endCenter, lastPoint, (Math.PI + 0.0001) * 3 * endStep));
      }
    } else {
      endCap.push(add(lastPoint, mul(endVector, radius)), add(lastPoint, mul(endVector, radius * 0.99)), sub(lastPoint, mul(endVector, radius * 0.99)), sub(lastPoint, mul(endVector, radius)));
    }
    return left.concat(endCap, right.reverse(), startCap);
  }

  function getStroke(points, options) {
    var resolved = options || {};
    return getStrokeOutlinePoints(getStrokePoints(points, resolved), resolved);
  }

  return { getStroke: getStroke };
})();
