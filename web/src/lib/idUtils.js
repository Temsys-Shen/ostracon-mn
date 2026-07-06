function createId(prefix) {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${random}`;
}

function createRequestId(prefix) {
  return createId(prefix);
}

function nowIso() {
  return new Date().toISOString();
}

export { createId, createRequestId, nowIso };
