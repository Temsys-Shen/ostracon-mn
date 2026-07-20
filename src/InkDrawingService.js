var __MN_INK_DRAWING_SERVICE_MNOstraconAddon = (function () {
  var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var getFreehandStroke = __MN_FREEHAND_STROKE_SERVICE_MNOstraconAddon.getStroke;
  var FORMAT_STRIDE_MAP = {
    1: 8, 3: 12,
    35: 14, 67: 14, 131: 14, 259: 14,
    7: 16, 99: 16, 163: 16, 291: 16,
    39: 18, 71: 18, 135: 18, 227: 18, 355: 18, 419: 18,
    103: 20, 167: 20, 199: 20, 483: 20,
    231: 22,
    1007: 30,
  };

  function decodeBase64(value) {
    var input = String(value || "").replace(/^data:[^,]+,/, "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    if (!input || input.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(input)) throw new Error("invalid-base64");
    var output = [];
    var buffer = 0;
    var bits = 0;
    for (var index = 0; index < input.length; index++) {
      var character = input.charAt(index);
      if (character === "=") break;
      var valueIndex = BASE64_CHARS.indexOf(character);
      if (valueIndex < 0) throw new Error("invalid-base64-character");
      buffer = (buffer << 6) | valueIndex;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output.push((buffer >> bits) & 255);
      }
    }
    return new Uint8Array(output);
  }

  function encodeBase64(value) {
    var input = String(value || "");
    var output = "";
    for (var index = 0; index < input.length; index += 3) {
      var first = input.charCodeAt(index) & 255;
      var hasSecond = index + 1 < input.length;
      var hasThird = index + 2 < input.length;
      var second = hasSecond ? input.charCodeAt(index + 1) & 255 : 0;
      var third = hasThird ? input.charCodeAt(index + 2) & 255 : 0;
      var combined = (first << 16) | (second << 8) | third;
      output += BASE64_CHARS.charAt((combined >> 18) & 63);
      output += BASE64_CHARS.charAt((combined >> 12) & 63);
      output += hasSecond ? BASE64_CHARS.charAt((combined >> 6) & 63) : "=";
      output += hasThird ? BASE64_CHARS.charAt(combined & 63) : "=";
    }
    return output;
  }

  function readVarint(data, start) {
    var result = 0;
    var shift = 0;
    var position = start;
    while (position < data.length) {
      var byte = data[position++];
      result += (byte & 127) * Math.pow(2, shift);
      if ((byte & 128) === 0) return { value: result, position: position };
      shift += 7;
      if (shift > 49) throw new Error("varint-too-long");
    }
    throw new Error("truncated-varint");
  }

  function ensureAvailable(position, length, end, stage) {
    if (length < 0 || position + length > end) throw new Error("truncated-" + stage);
  }

  function parseFields(data) {
    var fields = [];
    var position = 0;
    var view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    while (position < data.length) {
      var tag = readVarint(data, position);
      position = tag.position;
      var fieldNumber = Math.floor(tag.value / 8);
      var wireType = tag.value & 7;
      if (!fieldNumber) throw new Error("invalid-field-number");
      var field = { field: fieldNumber, wireType: wireType };
      if (wireType === 0) {
        var varint = readVarint(data, position);
        field.value = varint.value;
        position = varint.position;
      } else if (wireType === 1) {
        ensureAvailable(position, 8, data.length, "fixed64");
        field.double = view.getFloat64(position, true);
        position += 8;
      } else if (wireType === 2) {
        var length = readVarint(data, position);
        position = length.position;
        ensureAvailable(position, length.value, data.length, "bytes");
        field.raw = data.slice(position, position + length.value);
        position += length.value;
      } else if (wireType === 5) {
        ensureAvailable(position, 4, data.length, "fixed32");
        field.float = view.getFloat32(position, true);
        position += 4;
      } else {
        throw new Error("unsupported-wire-type-" + wireType);
      }
      fields.push(field);
    }
    return fields;
  }

  function groupFields(fields) {
    var grouped = {};
    for (var index = 0; index < fields.length; index++) {
      var field = fields[index];
      if (!grouped[field.field]) grouped[field.field] = [];
      grouped[field.field].push(field);
    }
    return grouped;
  }

  function firstField(grouped, number, wireType) {
    var fields = grouped[number] || [];
    for (var index = 0; index < fields.length; index++) {
      if (wireType === undefined || fields[index].wireType === wireType) return fields[index];
    }
    return null;
  }

  function decodeAscii(raw) {
    var output = "";
    for (var index = 0; index < raw.length; index++) output += String.fromCharCode(raw[index]);
    return output;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function parseInk(raw, index) {
    var grouped = groupFields(parseFields(raw));
    var colorField = firstField(grouped, 1, 2);
    var typeField = firstField(grouped, 2, 2);
    var widthField = firstField(grouped, 3, 0);
    if (!colorField || !typeField || !widthField || !Number.isFinite(widthField.value) || widthField.value <= 0) {
      throw new Error("invalid-ink-definition-" + index);
    }
    var colors = groupFields(parseFields(colorField.raw));
    var red = firstField(colors, 1, 5);
    var green = firstField(colors, 2, 5);
    var blue = firstField(colors, 3, 5);
    var alpha = firstField(colors, 4, 5);
    if (!red || !green || !blue || !alpha) throw new Error("invalid-ink-color-" + index);
    var type = decodeAscii(typeField.raw);
    if (!type) throw new Error("invalid-ink-type-" + index);
    return {
      color: {
        r: Math.round(clamp(red.float, 0, 1) * 255),
        g: Math.round(clamp(green.float, 0, 1) * 255),
        b: Math.round(clamp(blue.float, 0, 1) * 255),
        a: clamp(alpha.float, 0, 1),
      },
      type: type,
      width: widthField.value,
    };
  }

  function floatValue(grouped, number, defaultValue) {
    var field = firstField(grouped, number, 5);
    return field && Number.isFinite(field.float) ? field.float : defaultValue;
  }

  function parseTransform(raw) {
    if (!raw) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    var grouped = groupFields(parseFields(raw));
    var transform = {
      a: floatValue(grouped, 1, 1),
      b: floatValue(grouped, 2, 0),
      c: floatValue(grouped, 3, 0),
      d: floatValue(grouped, 4, 1),
      tx: floatValue(grouped, 5, 0),
      ty: floatValue(grouped, 6, 0),
    };
    var values = [transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty];
    for (var index = 0; index < values.length; index++) {
      if (!Number.isFinite(values[index])) throw new Error("invalid-transform");
    }
    return transform;
  }

  function applyTransform(point, transform) {
    return {
      x: transform.a * point.x + transform.c * point.y + transform.tx,
      y: transform.b * point.x + transform.d * point.y + transform.ty,
      pressure: point.pressure,
    };
  }

  function resolvePointStride(format, pointCount, byteLength) {
    if (!pointCount || pointCount < 1 || byteLength % pointCount !== 0) throw new Error("invalid-point-count");
    var actualStride = byteLength / pointCount;
    var knownStride = FORMAT_STRIDE_MAP[format];
    if (knownStride && actualStride !== knownStride) throw new Error("point-stride-mismatch");
    if (actualStride < 8) throw new Error("invalid-point-stride");
    return actualStride;
  }

  function pressureOffset(format, stride) {
    if (format === 35 || format === 67 || format === 131 || format === 227 || format === 259) return 12;
    if (format === 1007) return 18;
    if ([39, 71, 103, 135, 167, 199, 231, 355, 419, 483].indexOf(format) >= 0) return 16;
    if (stride === 14) return 12;
    if (stride === 16 && (format & 32)) return 12;
    if (stride >= 18 && stride <= 22) return 16;
    if (stride === 30) return 18;
    return -1;
  }

  function parseCenterline(raw, transform) {
    var grouped = groupFields(parseFields(raw));
    var countField = firstField(grouped, 3, 0);
    var formatField = firstField(grouped, 4, 0);
    var pointsField = firstField(grouped, 7, 2);
    if (!countField || !pointsField) throw new Error("missing-stroke-points");
    var pointCount = countField.value;
    var format = formatField ? formatField.value : 0;
    var stride = resolvePointStride(format, pointCount, pointsField.raw.length);
    var pressureAt = pressureOffset(format, stride);
    var view = new DataView(pointsField.raw.buffer, pointsField.raw.byteOffset, pointsField.raw.byteLength);
    var points = [];
    for (var index = 0; index < pointCount; index++) {
      var offset = index * stride;
      var x = view.getFloat32(offset, true);
      var y = view.getFloat32(offset + 4, true);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid-point-coordinate");
      var pressure = 0.5;
      if (pressureAt >= 0 && pressureAt + 2 <= stride) {
        var pressureRaw = view.getUint16(offset + pressureAt, true);
        if (pressureRaw < 2000) pressure = clamp(pressureRaw / 1000, 0, 1);
      }
      points.push(applyTransform({ x: x, y: y, pressure: pressure }, transform));
    }
    return points;
  }

  function parseRenderFragment(raw) {
    var grouped = groupFields(parseFields(raw));
    var pointsField = firstField(grouped, 10, 2);
    if (!pointsField || pointsField.raw.length < 24 || pointsField.raw.length % 8 !== 0) {
      throw new Error("invalid-render-fragment-points");
    }
    var transformField = firstField(grouped, 7, 2);
    var transform = parseTransform(transformField ? transformField.raw : null);
    var view = new DataView(pointsField.raw.buffer, pointsField.raw.byteOffset, pointsField.raw.byteLength);
    var points = [];
    for (var offset = 0; offset < pointsField.raw.length; offset += 8) {
      var x = view.getFloat32(offset, true);
      var y = view.getFloat32(offset + 4, true);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid-render-fragment-coordinate");
      points.push(applyTransform({ x: x, y: y, pressure: 1 }, transform));
    }
    return points;
  }

  function getInkOptions(inkType, width) {
    var scaleFactor = 0.75;
    if (inkType.indexOf("pencil") >= 0) {
      return { size: width * scaleFactor, thinning: 0.65, smoothing: 0.4, streamline: 0.4, simulatePressure: false, start: { taper: true }, end: { taper: true } };
    }
    if (inkType.indexOf("marker") >= 0) {
      return { size: width * scaleFactor * 1.3, thinning: 0.15, smoothing: 0.5, streamline: 0.5, simulatePressure: false, start: { taper: false }, end: { taper: false } };
    }
    return { size: width * scaleFactor, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: false, start: { taper: true }, end: { taper: true } };
  }

  function parseStroke(raw, inks, index) {
    var grouped = groupFields(parseFields(raw));
    var inkIndexField = firstField(grouped, 3, 0) || firstField(grouped, 4, 0);
    if (!inkIndexField) throw new Error("missing-ink-index-" + index);
    var inkIndex = inkIndexField.value;
    if (inkIndex < 0 || inkIndex >= inks.length) throw new Error("invalid-ink-index-" + index + "-" + inkIndex);
    var ink = inks[inkIndex];
    var fragmentFields = grouped[11] || [];
    var shapes = [];
    if (fragmentFields.length > 0) {
      for (var fragmentIndex = 0; fragmentIndex < fragmentFields.length; fragmentIndex++) {
        if (!fragmentFields[fragmentIndex].raw) throw new Error("invalid-render-fragment-" + fragmentIndex);
        shapes.push({ kind: "polygon", points: parseRenderFragment(fragmentFields[fragmentIndex].raw), ink: ink });
      }
    } else {
      var pathField = firstField(grouped, 5, 2);
      if (!pathField) throw new Error("missing-stroke-path-" + index);
      var transformField = firstField(grouped, 7, 2);
      var centerline = parseCenterline(pathField.raw, parseTransform(transformField ? transformField.raw : null));
      var effectiveWidth = ink.type.indexOf("marker") >= 0 ? ink.width * 3 : ink.width;
      if (centerline.length === 1) {
        shapes.push({ kind: "circle", point: centerline[0], radius: effectiveWidth / 2, ink: ink });
      } else {
        var input = centerline.map(function (point) { return [point.x, point.y, point.pressure]; });
        var outline = getFreehandStroke(input, getInkOptions(ink.type, effectiveWidth));
        if (outline.length < 3) throw new Error("empty-stroke-outline-" + index);
        shapes.push({
          kind: "polygon",
          points: outline.map(function (point) { return { x: point[0], y: point[1] }; }),
          ink: ink,
        });
      }
    }
    return { shapes: shapes };
  }

  function decodeInkData(data) {
    if (data.length < 8) throw new Error("truncated-header");
    if (data[0] !== 119 || data[1] !== 114 || data[2] !== 100) throw new Error("invalid-magic-header");
    if (data[3] !== 240) throw new Error("unsupported-wrd-header");
    var grouped = groupFields(parseFields(data.slice(8)));
    var inkFields = grouped[4] || [];
    if (inkFields.length === 0) throw new Error("missing-ink-definitions");
    var inks = [];
    for (var inkIndex = 0; inkIndex < inkFields.length; inkIndex++) {
      if (!inkFields[inkIndex].raw) throw new Error("invalid-ink-field-" + inkIndex);
      inks.push(parseInk(inkFields[inkIndex].raw, inkIndex));
    }
    var strokeFields = grouped[5] || [];
    if (strokeFields.length === 0) throw new Error("no-valid-strokes");
    var strokes = [];
    var shapes = [];
    for (var strokeIndex = 0; strokeIndex < strokeFields.length; strokeIndex++) {
      if (!strokeFields[strokeIndex].raw) throw new Error("invalid-stroke-field-" + strokeIndex);
      var stroke = parseStroke(strokeFields[strokeIndex].raw, inks, strokeIndex);
      strokes.push(stroke);
      shapes = shapes.concat(stroke.shapes);
    }
    if (shapes.length === 0) throw new Error("no-renderable-strokes");
    return { strokes: strokes, shapes: shapes };
  }

  function computeBounds(shapes) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
      var shape = shapes[shapeIndex];
      if (shape.kind === "circle") {
        minX = Math.min(minX, shape.point.x - shape.radius);
        minY = Math.min(minY, shape.point.y - shape.radius);
        maxX = Math.max(maxX, shape.point.x + shape.radius);
        maxY = Math.max(maxY, shape.point.y + shape.radius);
        continue;
      }
      for (var pointIndex = 0; pointIndex < shape.points.length; pointIndex++) {
        minX = Math.min(minX, shape.points[pointIndex].x);
        minY = Math.min(minY, shape.points[pointIndex].y);
        maxX = Math.max(maxX, shape.points[pointIndex].x);
        maxY = Math.max(maxY, shape.points[pointIndex].y);
      }
    }
    if (!Number.isFinite(minX)) throw new Error("no-valid-bounds");
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function formatNumber(value) { return Number(value).toFixed(2); }

  function inkColor(ink) {
    var alpha = ink.type.indexOf("marker") >= 0 ? Math.min(ink.color.a, 0.4) : ink.color.a;
    alpha = Number(alpha.toFixed(4));
    return "rgba(" + ink.color.r + "," + ink.color.g + "," + ink.color.b + "," + alpha + ")";
  }

  function polygonPath(points) {
    var path = "M " + formatNumber(points[0].x) + " " + formatNumber(points[0].y);
    for (var index = 1; index < points.length; index++) path += " L " + formatNumber(points[index].x) + " " + formatNumber(points[index].y);
    return path + " Z";
  }

  function renderSvg(shapes, bounds) {
    var margin = 30;
    var width = Math.max(1, bounds.width + margin * 2);
    var height = Math.max(1, bounds.height + margin * 2);
    var minX = bounds.x - margin;
    var minY = bounds.y - margin;
    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" viewBox="' + minX.toFixed(1) + " " + minY.toFixed(1) + " " + width.toFixed(1) + " " + height.toFixed(1) + '">',
      '<rect x="' + minX.toFixed(1) + '" y="' + minY.toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" fill="white"/>',
    ];
    for (var index = 0; index < shapes.length; index++) {
      var shape = shapes[index];
      if (shape.kind === "circle") {
        parts.push('<circle cx="' + formatNumber(shape.point.x) + '" cy="' + formatNumber(shape.point.y) + '" r="' + formatNumber(shape.radius) + '" fill="' + inkColor(shape.ink) + '"/>');
      } else {
        parts.push('<path d="' + polygonPath(shape.points) + '" fill="' + inkColor(shape.ink) + '"/>');
      }
    }
    parts.push("</svg>");
    return parts.join("\n");
  }

  function renderDrawingDataURI(base64) {
    var decoded = decodeInkData(decodeBase64(base64));
    var bounds = computeBounds(decoded.shapes);
    var svg = renderSvg(decoded.shapes, bounds);
    return {
      dataURI: "data:image/svg+xml;base64," + encodeBase64(svg),
      strokeCount: decoded.strokes.length,
      bounds: bounds,
    };
  }

  return { renderDrawingDataURI: renderDrawingDataURI };
})();
