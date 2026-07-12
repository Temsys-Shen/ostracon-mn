function normalizeSendScope(scope) {
  return scope === "notebook" || scope === "mindmap" ? scope : "selection";
}

function isSendDisabled(loading, scope, selectedCount) {
  return Boolean(loading) || (normalizeSendScope(scope) === "selection" && selectedCount === 0);
}

export { isSendDisabled, normalizeSendScope };
