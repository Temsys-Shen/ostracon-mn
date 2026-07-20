var __MN_HTML_COMPATIBILITY_SERVICE_MNOstraconAddon = (function () {
  var VOID_TAGS = { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, link: true, meta: true, param: true, source: true, track: true, wbr: true };

  function contextSuffix(context) {
    return ": noteId=" + String(context && context.noteId || "unknown") + ", commentIndex=" + String(context && context.commentIndex !== undefined ? context.commentIndex : -1);
  }

  function splitTopLevel(text, delimiter) {
    var parts = [];
    var start = 0;
    var quote = "";
    var depth = 0;
    for (var index = 0; index < text.length; index++) {
      var character = text.charAt(index);
      if (quote) {
        if (character === quote && text.charAt(index - 1) !== "\\") quote = "";
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === "(") depth++;
      else if (character === ")") depth = Math.max(0, depth - 1);
      else if (character === delimiter && depth === 0) {
        parts.push(text.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  function parseDeclarations(source, context) {
    var declarations = [];
    var parts = splitTopLevel(source, ";");
    for (var index = 0; index < parts.length; index++) {
      var declaration = parts[index].trim();
      if (!declaration) continue;
      var colon = -1;
      var quote = "";
      var depth = 0;
      for (var cursor = 0; cursor < declaration.length; cursor++) {
        var character = declaration.charAt(cursor);
        if (quote) {
          if (character === quote && declaration.charAt(cursor - 1) !== "\\") quote = "";
        } else if (character === '"' || character === "'") quote = character;
        else if (character === "(") depth++;
        else if (character === ")") depth = Math.max(0, depth - 1);
        else if (character === ":" && depth === 0) { colon = cursor; break; }
      }
      if (colon <= 0) throw new Error("HTML样式声明无效" + contextSuffix(context) + ", declaration=" + declaration);
      var property = declaration.slice(0, colon).trim().toLowerCase();
      var value = declaration.slice(colon + 1).trim();
      if (!/^(--[A-Za-z0-9_-]+|[A-Za-z][A-Za-z0-9-]*)$/.test(property) || !value) {
        throw new Error("HTML样式属性无效" + contextSuffix(context) + ", declaration=" + declaration);
      }
      var important = /\s*!important\s*$/i.test(value);
      if (important) value = value.replace(/\s*!important\s*$/i, "").trim();
      declarations.push({ property: property, value: value, important: important });
    }
    return declarations;
  }

  function parseSimpleSelector(source, context) {
    if (!source || /[:\[\]+~]/.test(source)) throw new Error("不支持的HTML样式选择器" + contextSuffix(context) + ", selector=" + source);
    var tagMatch = /^(\*|[A-Za-z][A-Za-z0-9-]*)/.exec(source);
    var tag = tagMatch ? tagMatch[1].toLowerCase() : "*";
    var cursor = tagMatch ? tagMatch[0].length : 0;
    var classes = [];
    var id = "";
    while (cursor < source.length) {
      var marker = source.charAt(cursor);
      var match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(source.slice(cursor + 1));
      if ((marker !== "." && marker !== "#") || !match) {
        throw new Error("不支持的HTML样式选择器" + contextSuffix(context) + ", selector=" + source);
      }
      if (marker === ".") classes.push(match[0]);
      else {
        if (id) throw new Error("HTML样式选择器包含多个ID" + contextSuffix(context) + ", selector=" + source);
        id = match[0];
      }
      cursor += match[0].length + 1;
    }
    return { tag: tag, classes: classes, id: id };
  }

  function parseSelector(source, context) {
    var normalized = source.trim().replace(/\s*>\s*/g, ">");
    if (!normalized || normalized.charAt(0) === "@") throw new Error("不支持的HTML样式选择器" + contextSuffix(context) + ", selector=" + source);
    var tokens = normalized.match(/[^\s>]+|>/g) || [];
    var parts = [];
    var combinators = [];
    var pending = "descendant";
    for (var index = 0; index < tokens.length; index++) {
      if (tokens[index] === ">") {
        if (parts.length === 0 || pending === "child") throw new Error("HTML样式选择器结构无效" + contextSuffix(context) + ", selector=" + source);
        pending = "child";
        continue;
      }
      if (parts.length > 0) combinators.push(pending);
      parts.push(parseSimpleSelector(tokens[index], context));
      pending = "descendant";
    }
    if (parts.length === 0 || tokens[tokens.length - 1] === ">") throw new Error("HTML样式选择器结构无效" + contextSuffix(context) + ", selector=" + source);
    var specificity = 0;
    for (var partIndex = 0; partIndex < parts.length; partIndex++) {
      specificity += parts[partIndex].id ? 100 : 0;
      specificity += parts[partIndex].classes.length * 10;
      specificity += parts[partIndex].tag !== "*" ? 1 : 0;
    }
    return { parts: parts, combinators: combinators, specificity: specificity, source: source.trim() };
  }

  function parseStyleSheets(styleSources, context) {
    var rules = [];
    var definedClasses = {};
    var order = 0;
    for (var sheetIndex = 0; sheetIndex < styleSources.length; sheetIndex++) {
      var source = styleSources[sheetIndex].replace(/\/\*[\s\S]*?\*\//g, "");
      var cursor = 0;
      while (cursor < source.length) {
        while (cursor < source.length && /\s/.test(source.charAt(cursor))) cursor++;
        if (cursor >= source.length) break;
        var open = source.indexOf("{", cursor);
        if (open < 0) throw new Error("HTML样式表缺少左花括号" + contextSuffix(context));
        var selectorSource = source.slice(cursor, open).trim();
        var close = source.indexOf("}", open + 1);
        if (close < 0) throw new Error("HTML样式表缺少右花括号" + contextSuffix(context));
        if (selectorSource.charAt(0) === "@") throw new Error("不支持HTML样式规则" + contextSuffix(context) + ", selector=" + selectorSource);
        var declarations = parseDeclarations(source.slice(open + 1, close), context);
        var selectorParts = splitTopLevel(selectorSource, ",");
        for (var selectorIndex = 0; selectorIndex < selectorParts.length; selectorIndex++) {
          var selector = parseSelector(selectorParts[selectorIndex], context);
          for (var partIndex = 0; partIndex < selector.parts.length; partIndex++) {
            for (var classIndex = 0; classIndex < selector.parts[partIndex].classes.length; classIndex++) {
              definedClasses[selector.parts[partIndex].classes[classIndex]] = true;
            }
          }
          rules.push({ selector: selector, declarations: declarations, order: order++ });
        }
        cursor = close + 1;
      }
    }
    return { rules: rules, definedClasses: definedClasses };
  }

  function parseAttributes(source, context) {
    var attributes = [];
    var pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(source)) !== null) {
      if (source.slice(lastIndex, match.index).trim()) throw new Error("HTML属性结构无效" + contextSuffix(context) + ", attributes=" + source);
      attributes.push({ name: match[1], value: match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : null });
      lastIndex = pattern.lastIndex;
    }
    if (source.slice(lastIndex).trim()) throw new Error("HTML属性结构无效" + contextSuffix(context) + ", attributes=" + source);
    return attributes;
  }

  function descriptor(tag, attributes) {
    var classes = [];
    var id = "";
    for (var index = 0; index < attributes.length; index++) {
      var name = attributes[index].name.toLowerCase();
      if (name === "class" && attributes[index].value) classes = attributes[index].value.trim().split(/\s+/).filter(Boolean);
      if (name === "id" && attributes[index].value) id = attributes[index].value;
    }
    return { tag: tag.toLowerCase(), classes: classes, id: id };
  }

  function matchesSimple(node, simple) {
    if (simple.tag !== "*" && node.tag !== simple.tag) return false;
    if (simple.id && node.id !== simple.id) return false;
    for (var index = 0; index < simple.classes.length; index++) if (node.classes.indexOf(simple.classes[index]) < 0) return false;
    return true;
  }

  function matchesSelector(node, ancestors, selector) {
    var partIndex = selector.parts.length - 1;
    if (!matchesSimple(node, selector.parts[partIndex])) return false;
    var ancestorIndex = ancestors.length - 1;
    while (partIndex > 0) {
      var relation = selector.combinators[partIndex - 1];
      partIndex--;
      if (relation === "child") {
        if (ancestorIndex < 0 || !matchesSimple(ancestors[ancestorIndex], selector.parts[partIndex])) return false;
        ancestorIndex--;
      } else {
        var matched = false;
        while (ancestorIndex >= 0) {
          if (matchesSimple(ancestors[ancestorIndex], selector.parts[partIndex])) { matched = true; ancestorIndex--; break; }
          ancestorIndex--;
        }
        if (!matched) return false;
      }
    }
    return true;
  }

  function applyDeclaration(computed, declaration, specificity, order) {
    var current = computed[declaration.property];
    var wins = !current ||
      declaration.important && !current.important ||
      declaration.important === current.important && (specificity > current.specificity || specificity === current.specificity && order >= current.order);
    if (wins) computed[declaration.property] = { value: declaration.value, important: declaration.important, specificity: specificity, order: order };
  }

  function computedStyle(node, ancestors, attributes, parsedStyles, context) {
    var computed = {};
    var matchedClasses = {};
    for (var ruleIndex = 0; ruleIndex < parsedStyles.rules.length; ruleIndex++) {
      var rule = parsedStyles.rules[ruleIndex];
      if (!matchesSelector(node, ancestors, rule.selector)) continue;
      for (var classIndex = 0; classIndex < node.classes.length; classIndex++) {
        if (rule.selector.source.indexOf("." + node.classes[classIndex]) >= 0) matchedClasses[node.classes[classIndex]] = true;
      }
      for (var declarationIndex = 0; declarationIndex < rule.declarations.length; declarationIndex++) {
        applyDeclaration(computed, rule.declarations[declarationIndex], rule.selector.specificity, rule.order);
      }
    }
    for (var nodeClassIndex = 0; nodeClassIndex < node.classes.length; nodeClassIndex++) {
      var className = node.classes[nodeClassIndex];
      if (!parsedStyles.definedClasses[className] || !matchedClasses[className]) {
        throw new Error("HTML样式类未匹配" + contextSuffix(context) + ", class=" + className + ", tag=" + node.tag);
      }
    }
    for (var attributeIndex = 0; attributeIndex < attributes.length; attributeIndex++) {
      if (attributes[attributeIndex].name.toLowerCase() !== "style" || attributes[attributeIndex].value === null) continue;
      var inlineDeclarations = parseDeclarations(attributes[attributeIndex].value, context);
      for (var inlineIndex = 0; inlineIndex < inlineDeclarations.length; inlineIndex++) applyDeclaration(computed, inlineDeclarations[inlineIndex], 1000, Number.MAX_SAFE_INTEGER);
    }
    return computed;
  }

  function escapeAttribute(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function serializeStyle(computed) {
    return Object.keys(computed).map(function (property) { return property + ":" + computed[property].value + (computed[property].important ? " !important" : ""); }).join(";");
  }

  function serializeOpenTag(tag, attributes, computed, selfClosing) {
    var output = "<" + tag;
    for (var index = 0; index < attributes.length; index++) {
      var name = attributes[index].name;
      var lower = name.toLowerCase();
      if (lower === "class" || lower === "style") continue;
      output += " " + name;
      if (attributes[index].value !== null) output += '="' + escapeAttribute(attributes[index].value) + '"';
    }
    var style = serializeStyle(computed);
    if (style) output += ' style="' + escapeAttribute(style) + '"';
    return output + (selfClosing ? "/>" : ">");
  }

  function findTagEnd(source, start, context) {
    var quote = "";
    for (var index = start; index < source.length; index++) {
      var character = source.charAt(index);
      if (quote) {
        if (character === quote && source.charAt(index - 1) !== "\\") quote = "";
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") return index;
    }
    throw new Error("HTML标签未闭合" + contextSuffix(context));
  }

  function convertFragment(source, parsedStyles, initialAncestors, context) {
    var output = "";
    var stack = [];
    var position = 0;
    while (position < source.length) {
      var open = source.indexOf("<", position);
      if (open < 0) { output += source.slice(position); break; }
      output += source.slice(position, open);
      if (source.slice(open, open + 4) === "<!--") {
        var commentEnd = source.indexOf("-->", open + 4);
        if (commentEnd < 0) throw new Error("HTML注释未闭合" + contextSuffix(context));
        output += source.slice(open, commentEnd + 3);
        position = commentEnd + 3;
        continue;
      }
      var end = findTagEnd(source, open + 1, context);
      var tagSource = source.slice(open + 1, end).trim();
      if (!tagSource) throw new Error("HTML空标签" + contextSuffix(context));
      if (tagSource.charAt(0) === "!") { position = end + 1; continue; }
      if (tagSource.charAt(0) === "/") {
        var closingTag = tagSource.slice(1).trim().toLowerCase();
        if (stack.length === 0 || stack[stack.length - 1].tag !== closingTag) throw new Error("HTML结束标签不匹配" + contextSuffix(context) + ", tag=" + closingTag);
        stack.pop();
        output += "</" + closingTag + ">";
        position = end + 1;
        continue;
      }
      var selfClosing = /\/$/.test(tagSource);
      if (selfClosing) tagSource = tagSource.slice(0, -1).trim();
      var nameMatch = /^([A-Za-z][A-Za-z0-9:-]*)/.exec(tagSource);
      if (!nameMatch) throw new Error("HTML标签名无效" + contextSuffix(context) + ", tag=" + tagSource);
      var tag = nameMatch[1].toLowerCase();
      var attributes = parseAttributes(tagSource.slice(nameMatch[0].length), context);
      var node = descriptor(tag, attributes);
      var ancestors = initialAncestors.concat(stack.map(function (entry) { return entry.node; }));
      var computed = computedStyle(node, ancestors, attributes, parsedStyles, context);
      var voidTag = VOID_TAGS[tag] === true;
      output += serializeOpenTag(tag, attributes, computed, selfClosing && !voidTag);
      if (!voidTag && !selfClosing) stack.push({ tag: tag, node: node });
      position = end + 1;
    }
    if (stack.length > 0) throw new Error("HTML标签未闭合" + contextSuffix(context) + ", tag=" + stack[stack.length - 1].tag);
    return output;
  }

  function extractStyleSources(html) {
    var styles = [];
    html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, function (_, content) { styles.push(content); return _; });
    return styles;
  }

  function convertHtml(html, context) {
    var source = String(html || "").trim();
    if (!source) throw new Error("HtmlNote缺少html" + contextSuffix(context));
    var fullDocument = /<!doctype\s+html/i.test(source) || /<html\b/i.test(source) || /Cocoa HTML Writer/i.test(source);
    var styleSources = extractStyleSources(source);
    if (!fullDocument && styleSources.length === 0) return source;
    if (fullDocument && styleSources.length === 0 && /\bclass\s*=/i.test(source)) throw new Error("Cocoa HTML缺少style" + contextSuffix(context));
    var parsedStyles = parseStyleSheets(styleSources, context);
    if (fullDocument) {
      var bodyMatch = /<body\b([^>]*)>([\s\S]*?)<\/body\s*>/i.exec(source);
      if (!bodyMatch) throw new Error("Cocoa HTML缺少body" + contextSuffix(context));
      var bodyAttributes = parseAttributes(bodyMatch[1], context);
      var bodyNode = descriptor("body", bodyAttributes);
      var bodyStyle = computedStyle(bodyNode, [], bodyAttributes, parsedStyles, context);
      var inner = convertFragment(bodyMatch[2].replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ""), parsedStyles, [bodyNode], context);
      var wrapperAttributes = bodyAttributes.filter(function (attribute) { var name = attribute.name.toLowerCase(); return name !== "class" && name !== "style"; });
      var wrapper = serializeOpenTag("div", wrapperAttributes, bodyStyle, false);
      return serializeStyle(bodyStyle) || wrapperAttributes.length > 0 ? wrapper + inner + "</div>" : inner;
    }
    var fragment = source.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
    return convertFragment(fragment, parsedStyles, [], context);
  }

  return { convertHtml: convertHtml };
})();
