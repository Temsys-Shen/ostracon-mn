function encodeVarint(value) {
  const bytes = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current = Math.floor(current / 128);
    if (current > 0) byte |= 0x80;
    bytes.push(byte);
  } while (current > 0);
  return Buffer.from(bytes);
}

function bytesField(number, payload) {
  return Buffer.concat([encodeVarint(number * 8 + 2), encodeVarint(payload.length), payload]);
}

function varintField(number, value) {
  return Buffer.concat([encodeVarint(number * 8), encodeVarint(value)]);
}

function floatField(number, value) {
  const payload = Buffer.alloc(4);
  payload.writeFloatLE(value);
  return Buffer.concat([encodeVarint(number * 8 + 5), payload]);
}

function createTransform(transform = {}) {
  return Buffer.concat([
    floatField(1, transform.a ?? 1),
    floatField(2, transform.b ?? 0),
    floatField(3, transform.c ?? 0),
    floatField(4, transform.d ?? 1),
    floatField(5, transform.tx ?? 0),
    floatField(6, transform.ty ?? 0),
  ]);
}

function createInkDefinition(ink) {
  const color = ink.color ?? { r: 0, g: 0, b: 0, a: 1 };
  return Buffer.concat([
    bytesField(1, Buffer.concat([
      floatField(1, color.r),
      floatField(2, color.g),
      floatField(3, color.b),
      floatField(4, color.a),
    ])),
    bytesField(2, Buffer.from(ink.type ?? "com.apple.ink.pen")),
    varintField(3, ink.width ?? 3),
  ]);
}

function formatForStride(stride) {
  return { 8: 1, 12: 3, 14: 35, 16: 7, 18: 39, 20: 103, 22: 231, 30: 1007 }[stride] ?? 0;
}

function pressureOffset(format, stride) {
  if ([35, 67, 131, 227, 259].includes(format)) return 12;
  if (format === 1007) return 18;
  if ([39, 71, 103, 135, 167, 199, 231, 355, 419, 483].includes(format)) return 16;
  if (stride === 14) return 12;
  return -1;
}

function createPath(stroke) {
  const points = stroke.points ?? [{ x: 1, y: 2, pressure: 0.5 }, { x: 3, y: 4, pressure: 0.8 }];
  const stride = stroke.pointStride ?? 12;
  const format = stroke.format ?? formatForStride(stride);
  const pointData = Buffer.alloc(stride * points.length);
  const pressureAt = pressureOffset(format, stride);
  points.forEach((point, index) => {
    const offset = index * stride;
    if (stride >= 4) pointData.writeFloatLE(point.x, offset);
    if (stride >= 8) pointData.writeFloatLE(point.y, offset + 4);
    if (pressureAt >= 0 && pressureAt + 2 <= stride) {
      pointData.writeUInt16LE(Math.round((point.pressure ?? 0.5) * 1000), offset + pressureAt);
    }
  });
  return Buffer.concat([
    varintField(3, points.length),
    varintField(4, format),
    bytesField(7, pointData),
  ]);
}

function createRenderFragment(fragment) {
  const pointData = Buffer.alloc(fragment.points.length * 8);
  fragment.points.forEach((point, index) => {
    pointData.writeFloatLE(point.x, index * 8);
    pointData.writeFloatLE(point.y, index * 8 + 4);
  });
  return Buffer.concat([
    bytesField(7, createTransform(fragment.transform)),
    bytesField(10, pointData),
  ]);
}

function createStroke(stroke) {
  const fields = [
    varintField(4, stroke.inkIndex ?? 0),
    bytesField(5, createPath(stroke)),
    bytesField(7, createTransform(stroke.transform ?? { tx: 10, ty: 20 })),
  ];
  (stroke.fragments ?? []).forEach((fragment) => fields.push(bytesField(11, createRenderFragment(fragment))));
  return Buffer.concat(fields);
}

function createInkArchive(options = {}) {
  const inks = options.inks ?? [{ type: "com.apple.ink.pen", width: 3, color: { r: 0, g: 0, b: 0, a: 1 } }];
  const strokes = options.strokes ?? [{
    inkIndex: 0,
    points: options.points,
    pointStride: options.pointStride,
    format: options.format,
    transform: options.transform,
    fragments: options.fragments,
  }];
  const payload = [];
  inks.forEach((ink) => payload.push(bytesField(4, createInkDefinition(ink))));
  strokes.forEach((stroke) => payload.push(bytesField(5, createStroke(stroke))));
  return Buffer.concat([Buffer.from([119, 114, 100, 240, 1, 0, 8, 0]), ...payload]).toString("base64");
}

function uid(value) {
  return { __bplistUid: value };
}

function unsignedBytes(value, byteLength) {
  const output = Buffer.alloc(byteLength);
  let current = value;
  for (let index = byteLength - 1; index >= 0; index--) {
    output[index] = current % 256;
    current = Math.floor(current / 256);
  }
  return output;
}

function byteLengthFor(value) {
  if (value <= 0xff) return 1;
  if (value <= 0xffff) return 2;
  if (value <= 0xffffffff) return 4;
  return 8;
}

function lengthPrefix(type, length) {
  if (length < 15) return Buffer.from([(type << 4) | length]);
  const byteLength = byteLengthFor(length);
  const power = Math.log2(byteLength);
  return Buffer.concat([Buffer.from([(type << 4) | 15, (1 << 4) | power]), unsignedBytes(length, byteLength)]);
}

function encodeBinaryPlist(root) {
  const objects = [];

  function addObject(value) {
    const reference = objects.length;
    const entry = { value, childReferences: null };
    objects.push(entry);
    if (Array.isArray(value)) {
      entry.childReferences = value.map(addObject);
    } else if (value && typeof value === "object" && !Buffer.isBuffer(value) && value.__bplistUid === undefined) {
      const keys = Object.keys(value);
      entry.childReferences = {
        keys: keys.map(addObject),
        values: keys.map(key => addObject(value[key])),
      };
    }
    return reference;
  }

  const topObject = addObject(root);
  const referenceSize = byteLengthFor(objects.length - 1);

  function encodeObject(entry) {
    const value = entry.value;
    if (value === null) return Buffer.from([0]);
    if (value === false) return Buffer.from([8]);
    if (value === true) return Buffer.from([9]);
    if (typeof value === "number") {
      const byteLength = byteLengthFor(value);
      return Buffer.concat([Buffer.from([(1 << 4) | Math.log2(byteLength)]), unsignedBytes(value, byteLength)]);
    }
    if (typeof value === "string") {
      const bytes = Buffer.from(value, "ascii");
      return Buffer.concat([lengthPrefix(5, bytes.length), bytes]);
    }
    if (Buffer.isBuffer(value)) return Buffer.concat([lengthPrefix(4, value.length), value]);
    if (value && value.__bplistUid !== undefined) {
      const byteLength = byteLengthFor(value.__bplistUid);
      return Buffer.concat([Buffer.from([(8 << 4) | (byteLength - 1)]), unsignedBytes(value.__bplistUid, byteLength)]);
    }
    if (Array.isArray(value)) {
      return Buffer.concat([
        lengthPrefix(10, entry.childReferences.length),
        ...entry.childReferences.map(reference => unsignedBytes(reference, referenceSize)),
      ]);
    }
    const references = entry.childReferences;
    return Buffer.concat([
      lengthPrefix(13, references.keys.length),
      ...references.keys.map(reference => unsignedBytes(reference, referenceSize)),
      ...references.values.map(reference => unsignedBytes(reference, referenceSize)),
    ]);
  }

  const header = Buffer.from("bplist00");
  const encodedObjects = objects.map(encodeObject);
  const offsets = [];
  let position = header.length;
  encodedObjects.forEach((object) => {
    offsets.push(position);
    position += object.length;
  });
  const offsetSize = byteLengthFor(position);
  const offsetTable = Buffer.concat(offsets.map(offset => unsignedBytes(offset, offsetSize)));
  const trailer = Buffer.alloc(32);
  trailer[6] = offsetSize;
  trailer[7] = referenceSize;
  unsignedBytes(objects.length, 8).copy(trailer, 8);
  unsignedBytes(topObject, 8).copy(trailer, 16);
  unsignedBytes(position, 8).copy(trailer, 24);
  return Buffer.concat([header, ...encodedObjects, offsetTable, trailer]);
}

function createDrawingArchive(drawings = {}) {
  const archivedObjects = ["$null", null];
  const keys = [];
  const values = [];
  ["drawing2", "drawing1"].forEach((key) => {
    if (!drawings[key]) return;
    keys.push(uid(archivedObjects.length));
    archivedObjects.push(key);
    values.push(uid(archivedObjects.length));
    archivedObjects.push(Buffer.from(drawings[key], "base64"));
  });
  const classIndex = archivedObjects.length;
  archivedObjects.push({ $classes: ["NSDictionary", "NSObject"], $classname: "NSDictionary" });
  archivedObjects[1] = { "NS.keys": keys, "NS.objects": values, $class: uid(classIndex) };

  return encodeBinaryPlist({
    $version: 100000,
    $archiver: "NSKeyedArchiver",
    $top: { root: uid(1) },
    $objects: archivedObjects,
  }).toString("base64");
}

export { createDrawingArchive, createInkArchive };
