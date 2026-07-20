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

export { createInkArchive };
