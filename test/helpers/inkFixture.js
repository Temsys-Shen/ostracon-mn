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

function doubleField(number, value) {
  const payload = Buffer.alloc(8);
  payload.writeDoubleLE(value);
  return Buffer.concat([encodeVarint(number * 8 + 1), payload]);
}

function createInkArchive(trailingPointBytes = [], pointStride = 12) {
  const pointData = Buffer.alloc(pointStride * 2 + trailingPointBytes.length);
  pointData.writeFloatLE(1, 0);
  pointData.writeFloatLE(2, 4);
  pointData.writeFloatLE(0, 8);
  pointData.writeFloatLE(3, pointStride);
  pointData.writeFloatLE(4, pointStride + 4);
  pointData.writeFloatLE(0.5, pointStride + 8);
  Buffer.from(trailingPointBytes).copy(pointData, pointStride * 2);

  const strokeData = Buffer.concat([varintField(3, 2), bytesField(7, pointData)]);
  const transform = Buffer.concat([floatField(5, 10), floatField(6, 20)]);
  const stroke = Buffer.concat([bytesField(5, strokeData), bytesField(7, transform)]);
  const metadata = doubleField(8, 3);
  const protobuf = Buffer.concat([bytesField(4, metadata), bytesField(5, stroke)]);
  return Buffer.concat([Buffer.from([119, 114, 100, 0, 0, 0]), protobuf]).toString("base64");
}

export { createInkArchive };
