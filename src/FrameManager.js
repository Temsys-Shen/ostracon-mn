var __MN_FRAME_MANAGER_MNOstraconAddon = (function () {
  const FRAME_CONFIG_KEY = "mn_web_template_mnostraconaddon_frame_config";
  const MINI_FRAME_CONFIG_KEY = "mn_web_template_mnostraconaddon_mini_frame_config";
  const PANEL_MODE_KEY = "mn_web_template_mnostraconaddon_panel_mode";
  const PANEL_ON_KEY = "mn_web_template_mnostraconaddon_panel_on";

  const MIN_WIDTH = 260;
  const MIN_HEIGHT = 300;
  const MINI_MIN_WIDTH = 240;
  const MINI_MIN_HEIGHT = 40;
  const MINI_DEFAULT_WIDTH = 320;
  const MINI_DEFAULT_HEIGHT = 40;
  const DEFAULT_WIDTH = 520;
  const DEFAULT_HEIGHT = 480;
  const PANEL_MARGIN = 16;
  const PANEL_MODE_FULL = "full";
  const PANEL_MODE_MINI = "mini";

  function numberOr(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeBounds(bounds) {
    return {
      x: numberOr(bounds && bounds.x, 0),
      y: numberOr(bounds && bounds.y, 0),
      width: Math.max(0, numberOr(bounds && bounds.width, 0)),
      height: Math.max(0, numberOr(bounds && bounds.height, 0)),
    };
  }

  function createDefaultFrame(bounds) {
    var safeBounds = normalizeBounds(bounds);
    var maxWidth = Math.max(MIN_WIDTH, safeBounds.width - PANEL_MARGIN * 2);
    var maxHeight = Math.max(260, safeBounds.height - PANEL_MARGIN * 2);
    var width = Math.min(DEFAULT_WIDTH, maxWidth);
    var height = Math.min(DEFAULT_HEIGHT, maxHeight);

    return {
      x: safeBounds.x + Math.max(PANEL_MARGIN, (safeBounds.width - width) / 2),
      y: safeBounds.y + Math.max(PANEL_MARGIN, (safeBounds.height - height) / 2),
      width: width,
      height: height,
    };
  }

  function createMiniFrame(bounds) {
    var safeBounds = normalizeBounds(bounds);
    var maxWidth = Math.max(MINI_MIN_WIDTH, safeBounds.width - PANEL_MARGIN * 2);
    var maxHeight = Math.max(MINI_MIN_HEIGHT, safeBounds.height - PANEL_MARGIN * 2);
    var width = Math.min(MINI_DEFAULT_WIDTH, maxWidth);
    var height = Math.min(MINI_DEFAULT_HEIGHT, maxHeight);

    return {
      x: safeBounds.x + Math.max(PANEL_MARGIN, safeBounds.width - width - PANEL_MARGIN),
      y: safeBounds.y + Math.max(PANEL_MARGIN, safeBounds.height - height - PANEL_MARGIN),
      width: width,
      height: height,
    };
  }

  function isFullscreenLike(frame, bounds) {
    if (!frame || !bounds) return false;
    var safeBounds = normalizeBounds(bounds);
    return Math.abs(numberOr(frame.x, 0) - safeBounds.x) < 1 &&
      Math.abs(numberOr(frame.y, 0) - safeBounds.y) < 1 &&
      frame.width >= safeBounds.width - PANEL_MARGIN &&
      frame.height >= safeBounds.height - PANEL_MARGIN;
  }

  function normalizePanelFrame(frame, bounds, mode) {
    var safeBounds = normalizeBounds(bounds);
    var isMini = mode === PANEL_MODE_MINI;
    var fallback = isMini ? createMiniFrame(safeBounds) : createDefaultFrame(safeBounds);
    var source = frame || fallback;
    // ★ Fix: 移除宽度上限（不再用 DEFAULT_WIDTH / MINI_DEFAULT_WIDTH 限制最大宽度）
    // 宽度只受屏幕宽度约束：最小 = minWidth，最大 = screenWidth - margin
    var maxWidth = isMini
      ? Math.max(MINI_MIN_WIDTH, safeBounds.width - PANEL_MARGIN * 2)
      : Math.max(MIN_WIDTH, safeBounds.width - PANEL_MARGIN * 2);
    var maxHeight = isMini
      ? Math.min(MINI_DEFAULT_HEIGHT, Math.max(MINI_MIN_HEIGHT, safeBounds.height - PANEL_MARGIN * 2))
      : Math.max(260, safeBounds.height - PANEL_MARGIN * 2);
    var minWidth = isMini ? MINI_MIN_WIDTH : MIN_WIDTH;
    var minHeight = isMini ? MINI_MIN_HEIGHT : MIN_HEIGHT;
    var width = Math.min(Math.max(minWidth, numberOr(source.width, fallback.width)), maxWidth);
    var height = Math.min(Math.max(minHeight, numberOr(source.height, fallback.height)), maxHeight);
    var minX = safeBounds.x + PANEL_MARGIN;
    var minY = safeBounds.y + PANEL_MARGIN;
    var maxX = safeBounds.x + Math.max(PANEL_MARGIN, safeBounds.width - width - PANEL_MARGIN);
    var maxY = safeBounds.y + Math.max(PANEL_MARGIN, safeBounds.height - height - PANEL_MARGIN);

    return {
      x: Math.max(minX, Math.min(maxX, numberOr(source.x, fallback.x))),
      y: Math.max(minY, Math.min(maxY, numberOr(source.y, fallback.y))),
      width: width,
      height: height,
    };
  }

  function framesEqual(left, right) {
    if (!left || !right) return false;
    return Math.abs(left.x - right.x) < 0.5 &&
      Math.abs(left.y - right.y) < 0.5 &&
      Math.abs(left.width - right.width) < 0.5 &&
      Math.abs(left.height - right.height) < 0.5;
  }

  function applyRootFrame(controller, frame, persistPreferred) {
    controller.view.autoresizingMask = 0;
    controller.view.frame = frame;
    if (persistPreferred !== false) {
      controller._preferredFrame = frame;
    }
  }

  function getStudyRootBounds(controller) {
    var targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
    var studyController = Application.sharedInstance().studyController(targetWindow);
    if (!studyController || !studyController.view) {
      throw new Error("studyController not found");
    }
    return studyController.view.bounds;
  }

  function saveWebPanelFrame(controller) {
    if (controller._isMaximized) return;
    var frame = controller.view.frame;
    var config = {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
    NSUserDefaults.standardUserDefaults().setObjectForKey(config, controller._isMini ? MINI_FRAME_CONFIG_KEY : FRAME_CONFIG_KEY);
  }

  function savePanelMode(mode) {
    if (mode !== PANEL_MODE_MINI && mode !== PANEL_MODE_FULL) throw new Error("Unsupported panel mode: " + mode);
    NSUserDefaults.standardUserDefaults().setObjectForKey(mode, PANEL_MODE_KEY);
  }

  function loadPanelMode() {
    var mode = NSUserDefaults.standardUserDefaults().objectForKey(PANEL_MODE_KEY);
    return mode === PANEL_MODE_MINI ? PANEL_MODE_MINI : PANEL_MODE_FULL;
  }

  function hasValidFrameFields(frame) {
    if (!frame) return false;
    if (frame.x === undefined || frame.y === undefined || frame.width === undefined || frame.height === undefined) return false;
    return Number.isFinite(Number(frame.x)) &&
      Number.isFinite(Number(frame.y)) &&
      Number.isFinite(Number(frame.width)) &&
      Number.isFinite(Number(frame.height));
  }

  function applyDefaultFrame(controller) {
    var bounds = getStudyRootBounds(controller);
    applyRootFrame(controller, createDefaultFrame(bounds), true);
  }

  function applySavedOrDefaultFrame(controller) {
    var bounds = getStudyRootBounds(controller);
    var mode = loadPanelMode();
    controller._isMini = mode === PANEL_MODE_MINI;
    var saved = NSUserDefaults.standardUserDefaults().objectForKey(controller._isMini ? MINI_FRAME_CONFIG_KEY : FRAME_CONFIG_KEY);

    if (!saved || isFullscreenLike(saved, bounds)) {
      applyRootFrame(controller, controller._isMini ? createMiniFrame(bounds) : createDefaultFrame(bounds), true);
      return;
    }

    if (!hasValidFrameFields(saved)) {
      applyRootFrame(controller, controller._isMini ? createMiniFrame(bounds) : createDefaultFrame(bounds), true);
      return;
    }

    applyRootFrame(controller, normalizePanelFrame(saved, bounds, mode), true);
  }

  function keepPanelWithinStudyBounds(controller) {
    if (!controller.view || !controller.view.superview) return;
    // ★ Fix: 步进动画期间不修正 frame，避免与 NSTimer 插值冲突
    if (controller._isPanelTransitioning) return;
    var bounds = getStudyRootBounds(controller);

    if (controller._isMaximized) {
      var maximizedFrame = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      if (!framesEqual(controller.view.frame, maximizedFrame)) {
        applyRootFrame(controller, maximizedFrame, false);
      }
      return;
    }

    var preferred = controller._preferredFrame || controller.view.frame || createDefaultFrame(bounds);
    var normalized = normalizePanelFrame(preferred, bounds, controller._isMini ? PANEL_MODE_MINI : PANEL_MODE_FULL);
    if (!framesEqual(controller.view.frame, normalized)) {
      applyRootFrame(controller, normalized, false);
    }
  }

  return {
    createDefaultFrame: createDefaultFrame,
    createMiniFrame: createMiniFrame,
    normalizePanelFrame: normalizePanelFrame,
    applyRootFrame: applyRootFrame,
    getStudyRootBounds: getStudyRootBounds,
    saveWebPanelFrame: saveWebPanelFrame,
    applyDefaultFrame: applyDefaultFrame,
    applySavedOrDefaultFrame: applySavedOrDefaultFrame,
    keepPanelWithinStudyBounds: keepPanelWithinStudyBounds,
    savePanelMode: savePanelMode,
    loadPanelMode: loadPanelMode,
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    DEFAULT_HEIGHT: DEFAULT_HEIGHT,
    MIN_WIDTH: MIN_WIDTH,
    MIN_HEIGHT: MIN_HEIGHT,
    MINI_MIN_WIDTH: MINI_MIN_WIDTH,
    MINI_MIN_HEIGHT: MINI_MIN_HEIGHT,
    PANEL_MODE_FULL: PANEL_MODE_FULL,
    PANEL_MODE_MINI: PANEL_MODE_MINI,
    PANEL_MARGIN: PANEL_MARGIN,
    PANEL_ON_KEY: PANEL_ON_KEY,
    PANEL_MODE_KEY: PANEL_MODE_KEY,
  };
})();
