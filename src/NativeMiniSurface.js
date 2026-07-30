var __MN_NATIVE_MINI_SURFACE_MNOstraconAddon = (function () {
  const MINI_HEIGHT = 32;
  const MINI_CORNER_RADIUS = 10;
  const POPOVER_ROW_HEIGHT = 42;
  const FILE_POPOVER_WIDTH = 380;
  const FILE_POPOVER_HEIGHT = 440;
  const TOUCH_UP_INSIDE = 1 << 6;
  const EDITING_CHANGED = 1 << 17;

  const COLOR_BACKGROUND = UIColor.colorWithRedGreenBlueAlpha(1, 1, 1, 0.98);
  const COLOR_INK = UIColor.colorWithRedGreenBlueAlpha(37 / 255, 42 / 255, 52 / 255, 1);
  const COLOR_SECONDARY = UIColor.colorWithRedGreenBlueAlpha(105 / 255, 115 / 255, 134 / 255, 1);
  const COLOR_LINE = UIColor.colorWithRedGreenBlueAlpha(105 / 255, 115 / 255, 134 / 255, 0.18);
  const COLOR_DISABLED = UIColor.colorWithRedGreenBlueAlpha(154 / 255, 161 / 255, 173 / 255, 1);
  const COLOR_ERROR = UIColor.colorWithRedGreenBlueAlpha(184 / 255, 50 / 255, 50 / 255, 1);

  var fileActionTargetClass = JSB.defineClass("MNOstraconNativeMiniFileActionTarget : NSObject", {
    "perform:": function () {
      runItemAction(self._controller, self._item);
    },
  });

  function iconPath(controller, name) {
    return controller.mainPath + "/assets/mini/" + name + ".png";
  }

  function loadIcon(controller, name) {
    var data = NSData.dataWithContentsOfFile(iconPath(controller, name));
    if (!data) throw new Error("Native mini icon not found: " + name);
    var image = UIImage.imageWithData(data);
    if (!image) throw new Error("Native mini icon is invalid: " + name);
    return image;
  }

  function configureIconButton(controller, button, icon, selector) {
    button.setImageForState(loadIcon(controller, icon), 0);
    button.addTargetActionForControlEvents(controller, selector, TOUCH_UP_INSIDE);
    button.backgroundColor = UIColor.clearColor();
  }

  function configureCommandButton(controller, button, title, icon, selector) {
    button.setTitleForState(title, 0);
    button.setTitleColorForState(COLOR_INK, 0);
    button.setTitleColorForState(COLOR_DISABLED, 2);
    button.setImageForState(loadIcon(controller, icon), 0);
    button.titleLabel.font = UIFont.boldSystemFontOfSize(15);
    button.imageEdgeInsets = { top: 0, left: -6, bottom: 0, right: 6 };
    button.addTargetActionForControlEvents(controller, selector, TOUCH_UP_INSIDE);
    button.backgroundColor = UIColor.clearColor();
  }

  function createDivider() {
    var divider = new UIView({ x: 0, y: 12, width: 1, height: 40 });
    divider.backgroundColor = COLOR_LINE;
    return divider;
  }

  function setup(controller) {
    controller._nativeMiniState = {
      connected: false,
      status: "disconnected",
      loading: false,
      selectedCount: 0,
      sendScope: "selection",
      format: "markdown",
      prefs: { mode: "flat", includeBacklinks: true },
      sendDisabled: true,
      quoteTarget: "cursor",
      quoteFilePath: "",
      quoteDisabled: true,
      quote: {
        selectionAvailable: false,
        cursorAvailable: false,
        activeFileAvailable: false,
        rootTitle: "",
        busyTarget: "",
      },
    };

    var surface = new UIView({ x: 0, y: 0, width: 240, height: MINI_HEIGHT });
    surface.backgroundColor = COLOR_BACKGROUND;
    surface.layer.cornerRadius = MINI_CORNER_RADIUS;
    surface.layer.masksToBounds = true;
    surface.layer.borderWidth = 1;
    surface.layer.borderColor = COLOR_LINE;
    surface.hidden = true;
    controller.view.addSubview(surface);
    controller.miniContainerView = surface;

    var grip = UIButton.buttonWithType(0);
    grip.frame = { x: 12, y: 6, width: 20, height: 20 };
    grip.setImageForState(loadIcon(controller, "grip-vertical"), 0);
    grip.backgroundColor = UIColor.clearColor();
    grip.addGestureRecognizer(new UIPanGestureRecognizer(controller, "handlePan:"));
    surface.addSubview(grip);
    controller.miniGrip = grip;

    controller.miniSendButton = UIButton.buttonWithType(0);
    configureCommandButton(controller, controller.miniSendButton, "发送", "send", "nativeMiniSendPressed");
    surface.addSubview(controller.miniSendButton);

    controller.miniSendArrow = UIButton.buttonWithType(0);
    configureIconButton(controller, controller.miniSendArrow, "chevron-down", "nativeMiniSendMenuPressed");
    surface.addSubview(controller.miniSendArrow);

    controller.miniCommandDivider = createDivider();
    surface.addSubview(controller.miniCommandDivider);

    controller.miniQuoteButton = UIButton.buttonWithType(0);
    configureCommandButton(controller, controller.miniQuoteButton, "引文", "quote", "nativeMiniQuotePressed");
    surface.addSubview(controller.miniQuoteButton);

    controller.miniQuoteArrow = UIButton.buttonWithType(0);
    configureIconButton(controller, controller.miniQuoteArrow, "chevron-down", "nativeMiniQuoteMenuPressed");
    surface.addSubview(controller.miniQuoteArrow);

    controller.miniExpandButton = UIButton.buttonWithType(0);
    configureIconButton(controller, controller.miniExpandButton, "maximize-2", "nativeMiniExpandPressed");
    surface.addSubview(controller.miniExpandButton);

    controller.miniCloseButton = UIButton.buttonWithType(0);
    configureIconButton(controller, controller.miniCloseButton, "x", "nativeMiniClosePressed");
    surface.addSubview(controller.miniCloseButton);

    controller.miniButton.enabled = false;

    refreshLayout(controller);
    updateState(controller, controller._nativeMiniState);
  }

  function refreshLayout(controller) {
    if (!controller.miniContainerView) return;
    var bounds = controller.view.bounds;
    var width = bounds.width;
    controller.miniContainerView.frame = { x: 0, y: 0, width: width, height: bounds.height };
    controller.miniContainerView.layer.cornerRadius = Math.min(MINI_CORNER_RADIUS, bounds.height / 2);

    var compact = width < 360;
    var gripX = compact ? 6 : 16;
    var gripWidth = compact ? 16 : 24;
    var left = gripX + gripWidth + (compact ? 3 : 14);
    var controlWidth = compact ? 20 : 36;
    var controlGap = 2;
    var rightControlsWidth = controlWidth * 2 + controlGap;
    var rightInset = compact ? 6 : 8;
    var commandAreaInset = compact ? rightInset + 1 : 18;
    var commandWidth = Math.max(compact ? 83 : 118, (width - left - rightControlsWidth - commandAreaInset) / 2);
    var arrowWidth = compact ? 18 : 30;
    var mainWidth = commandWidth - arrowWidth;
    var x = left;

    controller.miniGrip.frame = { x: gripX, y: Math.max(0, (bounds.height - gripWidth) / 2), width: gripWidth, height: gripWidth };
    controller.miniSendButton.frame = { x: x, y: compact ? 2 : 6, width: mainWidth, height: Math.max(0, bounds.height - (compact ? 4 : 12)) };
    x += mainWidth;
    controller.miniSendArrow.frame = { x: x, y: compact ? 2 : 6, width: arrowWidth, height: Math.max(0, bounds.height - (compact ? 4 : 12)) };
    x += arrowWidth;
    controller.miniCommandDivider.frame = { x: x, y: compact ? 6 : 12, width: 1, height: Math.max(0, bounds.height - (compact ? 12 : 24)) };
    x += 1;
    controller.miniQuoteButton.frame = { x: x, y: compact ? 2 : 6, width: mainWidth, height: Math.max(0, bounds.height - (compact ? 4 : 12)) };
    x += mainWidth;
    controller.miniQuoteArrow.frame = { x: x, y: compact ? 2 : 6, width: arrowWidth, height: Math.max(0, bounds.height - (compact ? 4 : 12)) };

    controller.miniExpandButton.frame = { x: width - rightControlsWidth - rightInset, y: Math.max(0, (bounds.height - controlWidth) / 2), width: controlWidth, height: controlWidth };
    controller.miniCloseButton.frame = { x: width - controlWidth - rightInset, y: Math.max(0, (bounds.height - controlWidth) / 2), width: controlWidth, height: controlWidth };

  }

  function setMode(controller, isMini) {
    if (!controller.miniContainerView) return;
    controller.containerView.hidden = isMini;
    controller.resizeHandle.hidden = isMini || controller._isMaximized;
    controller.miniContainerView.hidden = !isMini;
    controller.view.layer.masksToBounds = !isMini;
    if (!isMini) dismissPopovers(controller);
    refreshLayout(controller);
  }

  function updateState(controller, payload) {
    if (!payload || typeof payload !== "object") throw new Error("Native mini state must be an object");
    controller._nativeMiniState = payload;
    if (!controller.miniContainerView) return;

    var connected = payload.connected === true && payload.status !== "pending_approval";
    controller.miniSendButton.hidden = !connected;
    controller.miniSendArrow.hidden = !connected;
    controller.miniCommandDivider.hidden = !connected;
    controller.miniQuoteButton.hidden = !connected;
    controller.miniQuoteArrow.hidden = !connected;
    controller.miniButton.enabled = connected;

    controller.miniSendButton.enabled = !payload.sendDisabled;
    controller.miniSendButton.setTitleForState(payload.loading ? "发送中" : "发送", 0);
    controller.miniQuoteButton.enabled = !payload.quoteDisabled;
    controller.miniQuoteButton.setTitleForState(payload.quote && payload.quote.busyTarget ? "引文中" : "引文", 0);
  }

  function dismissPopover(popover) {
    if (popover) popover.dismissPopoverAnimated(true);
  }

  function dismissPopovers(controller) {
    dismissPopover(controller._nativeMiniPopover);
    dismissPopover(controller._nativeMiniSubPopover);
    dismissPopover(controller._nativeMiniFilePopover);
    controller._nativeMiniPopover = null;
    controller._nativeMiniSubPopover = null;
    controller._nativeMiniFilePopover = null;
  }

  function presentPopover(controller, contentController, sender, width, height, propertyName) {
    contentController.preferredContentSize = { width: width, height: height };
    contentController.view.backgroundColor = COLOR_BACKGROUND;
    var popover = new UIPopoverController(contentController);
    var targetView = controller.view.superview;
    if (!targetView) throw new Error("Native mini popover requires a mounted study view");
    var rect = sender.convertRectToView(sender.bounds, targetView);
    var direction = rect.y >= height + 16 ? 2 : 1;
    popover.presentPopoverFromRect(rect, targetView, direction, true);
    controller[propertyName] = popover;
    return popover;
  }

  function addMenuLabel(view, title, y, width) {
    var label = new UILabel({ x: 16, y: y, width: width - 32, height: 28 });
    label.text = title;
    label.font = UIFont.boldSystemFontOfSize(11);
    label.textColor = COLOR_SECONDARY;
    view.addSubview(label);
    return y + 28;
  }

  function addMenuRow(controller, view, item, y, width) {
    var button = UIButton.buttonWithType(0);
    button.frame = { x: 16, y: y, width: width - 32, height: POPOVER_ROW_HEIGHT };
    button.setTitleForState(item.title + (item.submenu ? "  \u203a" : ""), 0);
    button.setTitleColorForState(item.disabled ? COLOR_DISABLED : COLOR_INK, 0);
    button.titleLabel.font = UIFont.systemFontOfSize(15);
    button.contentHorizontalAlignment = 1;
    button.contentEdgeInsets = { top: 0, left: 0, bottom: 0, right: 32 };
    button.enabled = !item.disabled;
    if (!item.disabled) button.addTargetActionForControlEvents(controller, item.selector, TOUCH_UP_INSIDE);
    view.addSubview(button);

    if (item.checked) {
      var checkmark = new UILabel({ x: width - 42, y: y, width: 26, height: POPOVER_ROW_HEIGHT });
      checkmark.text = "\u2713";
      checkmark.textAlignment = 1;
      checkmark.font = UIFont.systemFontOfSize(20);
      checkmark.textColor = UIColor.colorWithRedGreenBlueAlpha(0, 122 / 255, 1, 1);
      view.addSubview(checkmark);
    }
  }

  function showMenu(controller, sender, sections, width, propertyName) {
    console.log("[Ostracon] native mini menu requested: " + propertyName);
    if (propertyName === "_nativeMiniPopover") dismissPopover(controller._nativeMiniPopover);
    var content = UIViewController.new();
    var y = 8;
    for (var sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      var section = sections[sectionIndex];
      if (section.title) y = addMenuLabel(content.view, section.title, y, width);
      for (var itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) {
        addMenuRow(controller, content.view, section.items[itemIndex], y, width);
        y += POPOVER_ROW_HEIGHT;
      }
    }
    presentPopover(controller, content, sender, width, y + 8, propertyName);
    console.log("[Ostracon] native mini menu presented: " + propertyName);
  }

  function showSendMenu(controller) {
    var state = controller._nativeMiniState;
    var selectionTitle = state.selectedCount > 0 ? "选中" + state.selectedCount + "张" : "选中卡片";
    showMenu(controller, controller.miniSendArrow, [
      { title: "来源", items: [
        { title: selectionTitle, checked: state.sendScope === "selection", selector: "nativeMiniSetSendSelection", disabled: state.selectedCount === 0 },
        { title: "卡片树", checked: state.sendScope === "card-tree", selector: "nativeMiniSetSendCardTree" },
        { title: "当前脑图", checked: state.sendScope === "mindmap", selector: "nativeMiniSetSendMindmap" },
        { title: "当前学习集", checked: state.sendScope === "notebook", selector: "nativeMiniSetSendNotebook" },
      ] },
      { title: "格式", items: [
        { title: "Canvas", checked: state.format === "canvas", selector: "nativeMiniSetFormatCanvas" },
        { title: "Markdown", checked: state.format === "markdown", submenu: true, selector: "nativeMiniOpenMarkdownMenu" },
      ] },
    ], 240, "_nativeMiniPopover");
  }

  function showMarkdownMenu(controller, sender) {
    var state = controller._nativeMiniState;
    showMenu(controller, sender, [
      { title: "Markdown", items: [
        { title: "平铺", checked: state.format === "markdown" && state.prefs.mode === "flat", selector: "nativeMiniSetMarkdownFlat" },
        { title: "树形", checked: state.format === "markdown" && state.prefs.mode === "tree", selector: "nativeMiniSetMarkdownTree" },
        { title: "回链", checked: state.format === "markdown" && state.prefs.includeBacklinks === true, selector: "nativeMiniToggleMarkdownBacklinks" },
      ] },
    ], 190, "_nativeMiniSubPopover");
  }

  function showQuoteMenu(controller) {
    var state = controller._nativeMiniState;
    var quote = state.quote || {};
    var fileTitle = state.quoteFilePath ? String(state.quoteFilePath).split("/").pop() : "选择文件";
    showMenu(controller, controller.miniQuoteArrow, [
      { title: "目标", items: [
        { title: "当前光标", checked: state.quoteTarget === "cursor", selector: "nativeMiniSetQuoteCursor", disabled: !quote.cursorAvailable },
        { title: "追加当前文件", checked: state.quoteTarget === "active-file", selector: "nativeMiniSetQuoteActiveFile", disabled: !quote.activeFileAvailable },
        { title: fileTitle, checked: state.quoteTarget === "file", selector: "nativeMiniOpenQuoteFilePicker" },
      ] },
      { title: "同级节点", items: [
        { title: quote.rootTitle || "当前学习集", disabled: true },
      ] },
    ], 270, "_nativeMiniPopover");
  }

  function dispatchAction(controller, action, payload) {
    var message = { action: action, payload: payload || {} };
    var encoded = __MN_BRIDGE_DISPATCHER_MNOstraconAddon.encodeBridgeJSON(message);
    __MN_BRIDGE_DISPATCHER_MNOstraconAddon.evaluateScript(
      controller.webView,
      "window.__OstraconNativeMiniAction('" + encoded + "');",
    );
  }

  function runItemAction(controller, item) {
    if (!controller || !item) throw new Error("Native mini action is missing its context");
    if (item.kind === "file-folder") {
      dispatchAction(controller, "list-files", { path: item.path });
      return;
    }
    if (item.kind === "file-document") {
      dispatchAction(controller, "select-file", { path: item.path });
      dismissPopover(controller._nativeMiniFilePopover);
      controller._nativeMiniFilePopover = null;
      return;
    }
    throw new Error("Unknown native mini file item kind: " + item.kind);
  }

  function handleMenuCommand(controller, command) {
    var commands = {
      "send-selection": { action: "set-send-scope", payload: { scope: "selection" }, popover: "_nativeMiniPopover" },
      "send-card-tree": { action: "set-send-scope", payload: { scope: "card-tree" }, popover: "_nativeMiniPopover" },
      "send-mindmap": { action: "set-send-scope", payload: { scope: "mindmap" }, popover: "_nativeMiniPopover" },
      "send-notebook": { action: "set-send-scope", payload: { scope: "notebook" }, popover: "_nativeMiniPopover" },
      "format-canvas": { action: "set-format", payload: { format: "canvas" }, popover: "_nativeMiniPopover" },
      "markdown-flat": { action: "set-markdown-mode", payload: { mode: "flat" }, popover: "_nativeMiniSubPopover" },
      "markdown-tree": { action: "set-markdown-mode", payload: { mode: "tree" }, popover: "_nativeMiniSubPopover" },
      "markdown-backlinks": { action: "toggle-backlinks", payload: {}, popover: "_nativeMiniSubPopover" },
      "quote-cursor": { action: "set-quote-target", payload: { target: "cursor" }, popover: "_nativeMiniPopover" },
      "quote-active-file": { action: "set-quote-target", payload: { target: "active-file" }, popover: "_nativeMiniPopover" },
    };
    var item = commands[command];
    if (!item) throw new Error("Unknown native mini menu command: " + command);
    console.log("[Ostracon] native mini menu command: " + command);
    dispatchAction(controller, item.action, item.payload);
    dismissPopover(controller[item.popover]);
  }

  function openMarkdownMenu(controller) {
    if (controller._nativeMiniPopover) controller._nativeMiniPopover.dismissPopoverAnimated(false);
    controller._nativeMiniPopover = null;
    showMarkdownMenu(controller, controller.miniSendArrow);
  }

  function openQuoteFilePicker(controller) {
    if (controller._nativeMiniPopover) controller._nativeMiniPopover.dismissPopoverAnimated(false);
    controller._nativeMiniPopover = null;
    showFilePicker(controller);
    dispatchAction(controller, "list-files", { path: "" });
  }

  function createFilePicker(controller) {
    var content = UIViewController.new();
    var view = content.view;
    view.backgroundColor = COLOR_BACKGROUND;

    var backButton = UIButton.buttonWithType(0);
    backButton.frame = { x: 10, y: 10, width: 38, height: 36 };
    backButton.setTitleForState("\u2039", 0);
    backButton.setTitleColorForState(COLOR_INK, 0);
    backButton.titleLabel.font = UIFont.systemFontOfSize(28);
    backButton.addTargetActionForControlEvents(controller, "nativeMiniFileBackPressed", TOUCH_UP_INSIDE);
    view.addSubview(backButton);
    controller._nativeMiniFileBackButton = backButton;

    var search = new UITextField({ x: 52, y: 10, width: FILE_POPOVER_WIDTH - 62, height: 36 });
    search.placeholder = "搜索文件";
    search.borderStyle = 1;
    search.font = UIFont.systemFontOfSize(14);
    search.addTargetActionForControlEvents(controller, "nativeMiniFileSearchChanged:", EDITING_CHANGED);
    view.addSubview(search);
    controller._nativeMiniFileSearch = search;

    var pathLabel = new UILabel({ x: 14, y: 50, width: FILE_POPOVER_WIDTH - 28, height: 26 });
    pathLabel.font = UIFont.boldSystemFontOfSize(12);
    pathLabel.textColor = COLOR_SECONDARY;
    view.addSubview(pathLabel);
    controller._nativeMiniFilePathLabel = pathLabel;

    var scroll = new UIScrollView({ x: 0, y: 78, width: FILE_POPOVER_WIDTH, height: FILE_POPOVER_HEIGHT - 78 });
    scroll.alwaysBounceVertical = true;
    view.addSubview(scroll);
    controller._nativeMiniFileScroll = scroll;
    controller._nativeMiniFileRowViews = [];
    return content;
  }

  function showFilePicker(controller) {
    dismissPopover(controller._nativeMiniFilePopover);
    var content = createFilePicker(controller);
    presentPopover(controller, content, controller.miniQuoteArrow, FILE_POPOVER_WIDTH, FILE_POPOVER_HEIGHT, "_nativeMiniFilePopover");
    renderFiles(controller);
  }

  function clearFileRows(controller) {
    var views = controller._nativeMiniFileRowViews || [];
    for (var index = 0; index < views.length; index += 1) views[index].removeFromSuperview();
    controller._nativeMiniFileRowViews = [];
  }

  function addFileRow(controller, title, subtitle, item, y, targets) {
    var scroll = controller._nativeMiniFileScroll;
    var button = UIButton.buttonWithType(0);
    button.frame = { x: 8, y: y, width: FILE_POPOVER_WIDTH - 16, height: 48 };
    button.setTitleForState((item.kind === "file-folder" ? "\u203a  " : "   ") + title + (subtitle ? "\n" + subtitle : ""), 0);
    button.setTitleColorForState(COLOR_INK, 0);
    button.titleLabel.font = UIFont.systemFontOfSize(14);
    button.titleLabel.numberOfLines = 2;
    button.contentHorizontalAlignment = 1;
    button.contentEdgeInsets = { top: 0, left: 8, bottom: 0, right: 8 };
    var target = fileActionTargetClass.new();
    target._controller = controller;
    target._item = item;
    targets.push(target);
    button.addTargetActionForControlEvents(target, "perform:", TOUCH_UP_INSIDE);
    scroll.addSubview(button);
    controller._nativeMiniFileRowViews.push(button);
  }

  function renderFiles(controller) {
    if (!controller._nativeMiniFileScroll) return;
    clearFileRows(controller);
    var state = controller._nativeMiniFiles || { folderPath: "", query: "", folders: [], documents: [], loading: true, error: "" };
    controller._nativeMiniFileSearch.text = String(state.query || "");
    controller._nativeMiniFilePathLabel.text = state.query ? "搜索结果" : (state.folderPath || "Vault");
    controller._nativeMiniFileBackButton.enabled = !state.query && Boolean(state.folderPath);

    var rows = [];
    var folders = state.query ? [] : (state.folders || []);
    var documents = state.documents || [];
    for (var folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
      rows.push({ kind: "folder", title: folders[folderIndex].name, path: folders[folderIndex].path });
    }
    for (var documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
      rows.push({ kind: "document", title: documents[documentIndex].title || documents[documentIndex].name, path: documents[documentIndex].path });
    }
    var targets = [];

    var y = 0;
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      var row = rows[rowIndex];
      var item = row.kind === "folder"
        ? { kind: "file-folder", path: row.path }
        : { kind: "file-document", path: row.path };
      addFileRow(controller, row.title, row.kind === "document" ? row.path : "", item, y, targets);
      y += 48;
    }

    if (state.loading || state.error || rows.length === 0) {
      var label = new UILabel({ x: 14, y: y + 8, width: FILE_POPOVER_WIDTH - 28, height: 40 });
      label.text = state.loading ? "加载中..." : (state.error || "没有文件");
      label.textColor = state.error ? COLOR_ERROR : COLOR_SECONDARY;
      label.font = UIFont.systemFontOfSize(13);
      controller._nativeMiniFileScroll.addSubview(label);
      controller._nativeMiniFileRowViews.push(label);
      y += 56;
    }
    controller._nativeMiniFileScroll.contentSize = { width: FILE_POPOVER_WIDTH, height: Math.max(FILE_POPOVER_HEIGHT - 78, y) };
    controller._nativeMiniFileTargets = targets;
  }

  function updateFiles(controller, payload) {
    if (!payload || typeof payload !== "object") throw new Error("Native mini files payload must be an object");
    controller._nativeMiniFiles = payload;
    renderFiles(controller);
  }

  function handleFileBack(controller) {
    var state = controller._nativeMiniFiles || {};
    var parts = String(state.folderPath || "").split("/").filter(Boolean);
    parts.pop();
    dispatchAction(controller, "list-files", { path: parts.join("/") });
  }

  function handleFileSearch(controller, sender) {
    dispatchAction(controller, "search-files", { query: String(sender.text || "") });
  }

  return {
    setup: setup,
    refreshLayout: refreshLayout,
    setMode: setMode,
    updateState: updateState,
    updateFiles: updateFiles,
    showSendMenu: showSendMenu,
    showQuoteMenu: showQuoteMenu,
    handleFileBack: handleFileBack,
    handleFileSearch: handleFileSearch,
    handleMenuCommand: handleMenuCommand,
    openMarkdownMenu: openMarkdownMenu,
    openQuoteFilePicker: openQuoteFilePicker,
    dispatchAction: dispatchAction,
    dismissPopovers: dismissPopovers,
  };
})();
