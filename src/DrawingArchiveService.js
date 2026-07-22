var __MN_DRAWING_ARCHIVE_SERVICE_MNOstraconAddon = (function () {
  var BPLIST_HEADER = [98, 112, 108, 105, 115, 116, 48, 48];

  function matchesBytes(data, expected) {
    if (data.length < expected.length) return false;
    for (var index = 0; index < expected.length; index++) {
      if (data[index] !== expected[index]) return false;
    }
    return true;
  }

  function readUnsigned(data, position, length, stage) {
    if (length < 1 || length > 8 || position < 0 || position + length > data.length) {
      throw new Error("invalid-bplist-" + stage);
    }
    var value = 0;
    for (var index = 0; index < length; index++) value = value * 256 + data[position + index];
    if (!Number.isSafeInteger(value)) throw new Error("bplist-" + stage + "-too-large");
    return value;
  }

  function decodeAscii(data, position, length) {
    var value = "";
    for (var index = 0; index < length; index++) value += String.fromCharCode(data[position + index]);
    return value;
  }

  function decodeUtf16(data, position, length) {
    var value = "";
    for (var index = 0; index < length; index++) {
      value += String.fromCharCode(readUnsigned(data, position + index * 2, 2, "utf16"));
    }
    return value;
  }

  function parseBinaryPlist(data) {
    if (!matchesBytes(data, BPLIST_HEADER)) throw new Error("invalid-bplist-header");
    if (data.length < 40) throw new Error("truncated-bplist-trailer");

    var trailerPosition = data.length - 32;
    var offsetSize = data[trailerPosition + 6];
    var referenceSize = data[trailerPosition + 7];
    var objectCount = readUnsigned(data, trailerPosition + 8, 8, "object-count");
    var topObject = readUnsigned(data, trailerPosition + 16, 8, "top-object");
    var offsetTablePosition = readUnsigned(data, trailerPosition + 24, 8, "offset-table");
    if (!offsetSize || !referenceSize || !objectCount || topObject >= objectCount) {
      throw new Error("invalid-bplist-trailer");
    }
    if (offsetTablePosition + objectCount * offsetSize > trailerPosition) {
      throw new Error("truncated-bplist-offset-table");
    }

    var offsets = [];
    for (var offsetIndex = 0; offsetIndex < objectCount; offsetIndex++) {
      var offset = readUnsigned(data, offsetTablePosition + offsetIndex * offsetSize, offsetSize, "object-offset");
      if (offset < BPLIST_HEADER.length || offset >= offsetTablePosition) throw new Error("invalid-bplist-object-offset");
      offsets.push(offset);
    }

    var cache = [];
    var parsing = {};

    function readLength(position, info) {
      if (info < 15) return { length: info, position: position };
      if (position >= offsetTablePosition) throw new Error("truncated-bplist-length");
      var marker = data[position++];
      if ((marker >> 4) !== 1) throw new Error("invalid-bplist-length-object");
      var byteLength = Math.pow(2, marker & 15);
      return {
        length: readUnsigned(data, position, byteLength, "length"),
        position: position + byteLength,
      };
    }

    function readReference(position) {
      var reference = readUnsigned(data, position, referenceSize, "object-reference");
      if (reference >= objectCount) throw new Error("invalid-bplist-object-reference-" + reference);
      return reference;
    }

    function parseObject(reference) {
      if (cache[reference] !== undefined) return cache[reference];
      if (parsing[reference]) throw new Error("cyclic-bplist-object-reference-" + reference);
      parsing[reference] = true;

      var position = offsets[reference];
      var marker = data[position++];
      var type = marker >> 4;
      var info = marker & 15;
      var result;

      if (type === 0) {
        if (info === 0) result = null;
        else if (info === 8) result = false;
        else if (info === 9) result = true;
        else throw new Error("unsupported-bplist-simple-" + info);
      } else if (type === 1) {
        result = readUnsigned(data, position, Math.pow(2, info), "integer");
      } else if (type === 4) {
        var dataLength = readLength(position, info);
        if (dataLength.position + dataLength.length > offsetTablePosition) throw new Error("truncated-bplist-data");
        result = data.slice(dataLength.position, dataLength.position + dataLength.length);
      } else if (type === 5) {
        var asciiLength = readLength(position, info);
        if (asciiLength.position + asciiLength.length > offsetTablePosition) throw new Error("truncated-bplist-ascii");
        result = decodeAscii(data, asciiLength.position, asciiLength.length);
      } else if (type === 6) {
        var utf16Length = readLength(position, info);
        if (utf16Length.position + utf16Length.length * 2 > offsetTablePosition) throw new Error("truncated-bplist-utf16");
        result = decodeUtf16(data, utf16Length.position, utf16Length.length);
      } else if (type === 8) {
        result = { uid: readUnsigned(data, position, info + 1, "uid") };
      } else if (type === 10) {
        var arrayLength = readLength(position, info);
        if (arrayLength.position + arrayLength.length * referenceSize > offsetTablePosition) throw new Error("truncated-bplist-array");
        result = [];
        cache[reference] = result;
        for (var arrayIndex = 0; arrayIndex < arrayLength.length; arrayIndex++) {
          result.push(parseObject(readReference(arrayLength.position + arrayIndex * referenceSize)));
        }
      } else if (type === 13) {
        var dictionaryLength = readLength(position, info);
        var valuesPosition = dictionaryLength.position + dictionaryLength.length * referenceSize;
        if (valuesPosition + dictionaryLength.length * referenceSize > offsetTablePosition) throw new Error("truncated-bplist-dictionary");
        result = {};
        cache[reference] = result;
        for (var dictionaryIndex = 0; dictionaryIndex < dictionaryLength.length; dictionaryIndex++) {
          var key = parseObject(readReference(dictionaryLength.position + dictionaryIndex * referenceSize));
          if (typeof key !== "string") throw new Error("invalid-bplist-dictionary-key");
          result[key] = parseObject(readReference(valuesPosition + dictionaryIndex * referenceSize));
        }
      } else {
        throw new Error("unsupported-bplist-object-type-" + type);
      }

      cache[reference] = result;
      delete parsing[reference];
      return result;
    }

    return parseObject(topObject);
  }

  function resolveUid(objects, value, stage) {
    if (!value || !Number.isInteger(value.uid) || value.uid < 0 || value.uid >= objects.length) {
      throw new Error("invalid-keyed-archive-" + stage + "-uid");
    }
    return objects[value.uid];
  }

  function extractArchivedDrawing(data) {
    var archive = parseBinaryPlist(data);
    if (!archive || archive.$archiver !== "NSKeyedArchiver") throw new Error("unsupported-keyed-archive");
    if (!Array.isArray(archive.$objects)) throw new Error("missing-keyed-archive-objects");
    if (!archive.$top || !archive.$top.root) throw new Error("missing-keyed-archive-root");

    var root = resolveUid(archive.$objects, archive.$top.root, "root");
    if (!root || !Array.isArray(root["NS.keys"]) || !Array.isArray(root["NS.objects"])) {
      throw new Error("invalid-keyed-archive-root-dictionary");
    }
    if (root["NS.keys"].length !== root["NS.objects"].length) {
      throw new Error("mismatched-keyed-archive-dictionary");
    }

    var drawings = {};
    for (var index = 0; index < root["NS.keys"].length; index++) {
      var key = resolveUid(archive.$objects, root["NS.keys"][index], "key-" + index);
      if (key === "drawing1" || key === "drawing2") {
        drawings[key] = resolveUid(archive.$objects, root["NS.objects"][index], "value-" + index);
      }
    }

    var selected = drawings.drawing2 || drawings.drawing1;
    if (!(selected instanceof Uint8Array)) throw new Error("missing-keyed-archive-drawing-data");
    return selected;
  }

  function extractDrawingData(data) {
    if (!(data instanceof Uint8Array)) throw new Error("invalid-drawing-data");
    if (matchesBytes(data, [119, 114, 100, 240])) return data;
    if (matchesBytes(data, BPLIST_HEADER)) return extractArchivedDrawing(data);
    return data;
  }

  return { extractDrawingData: extractDrawingData };
})();
