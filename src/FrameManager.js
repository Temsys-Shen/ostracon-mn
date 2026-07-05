var __MN_FRAME_MANAGER_MNOstraconAddon = (function () {
  const FRAME_CONFIG_KEY = "mn_web_template_mnostraconaddon_frame_config";
  const PANEL_ON_KEY = "mn_web_template_mnostraconaddon_panel_on";

  const MIN_WIDTH = 520;
  const MIN_HEIGHT = 420;
  const DEFAULT_WIDTH = 960;
  const DEFAULT_HEIGHT = 640;
  const PANEL_MARGIN = 16;

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
    var maxWidth = Math.max(320, safeBounds.width - PANEL_MARGIN * 2);
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

  function isFullscreenLike(frame, bounds) {
    if (!frame || !bounds) return false;
    var safeBounds = normalizeBounds(bounds);
    return Math.abs(numberOr(frame.x, 0) - safeBounds.x) < 1 &&
      Math.abs(numberOr(frame.y, 0) - safeBounds.y) < 1 &&
      frame.width >= safeBounds.width - PANEL_MARGIN &&
      frame.height >= safeBounds.height - PANEL_MARGIN;
  }

  function normalizePanelFrame(frame, bounds) {
    var safeBounds = normalizeBounds(bounds);
    var fallback = createDefaultFrame(safeBounds);
    var source = frame || fallback;
    var maxWidth = Math.max(320, safeBounds.width - PANEL_MARGIN * 2);
    var maxHeight = Math.max(260, safeBounds.height - PANEL_MARGIN * 2);
    var width = Math.min(Math.max(MIN_WIDTH, numberOr(source.width, fallback.width)), maxWidth);
    var height = Math.min(Math.max(MIN_HEIGHT, numberOr(source.height, fallback.height)), maxHeight);
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
    NSUserDefaults.standardUserDefaults().setObjectForKey(config, FRAME_CONFIG_KEY);
  }

  function applyDefaultFrame(controller) {
    var bounds = getStudyRootBounds(controller);
    applyRootFrame(controller, createDefaultFrame(bounds), true);
  }

  function applySavedOrDefaultFrame(controller) {
    var bounds = getStudyRootBounds(controller);
    var saved = NSUserDefaults.standardUserDefaults().objectForKey(FRAME_CONFIG_KEY);

    if (!saved || isFullscreenLike(saved, bounds)) {
      applyDefaultFrame(controller);
      return;
    }

    var x = saved.x;
    var y = saved.y;
    var width = saved.width;
    var height = saved.height;

    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      applyDefaultFrame(controller);
      return;
    }

    if (
      !Number.isFinite(Number(x)) ||
      !Number.isFinite(Number(y)) ||
      !Number.isFinite(Number(width)) ||
      !Number.isFinite(Number(height))
    ) {
      applyDefaultFrame(controller);
      return;
    }

    applyRootFrame(controller, normalizePanelFrame({ x: x, y: y, width: width, height: height }, bounds), true);
  }

  function keepPanelWithinStudyBounds(controller) {
    if (!controller.view || !controller.view.superview) return;
    var bounds = getStudyRootBounds(controller);

    if (controller._isMaximized) {
      var maximizedFrame = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      if (!framesEqual(controller.view.frame, maximizedFrame)) {
        applyRootFrame(controller, maximizedFrame, false);
      }
      return;
    }

    var preferred = controller._preferredFrame || controller.view.frame || createDefaultFrame(bounds);
    var normalized = normalizePanelFrame(preferred, bounds);
    if (!framesEqual(controller.view.frame, normalized)) {
      applyRootFrame(controller, normalized, false);
    }
  }

  return {
    normalizeBounds: normalizeBounds,
    createDefaultFrame: createDefaultFrame,
    isFullscreenLike: isFullscreenLike,
    normalizePanelFrame: normalizePanelFrame,
    framesEqual: framesEqual,
    applyRootFrame: applyRootFrame,
    getStudyRootBounds: getStudyRootBounds,
    saveWebPanelFrame: saveWebPanelFrame,
    applyDefaultFrame: applyDefaultFrame,
    applySavedOrDefaultFrame: applySavedOrDefaultFrame,
    keepPanelWithinStudyBounds: keepPanelWithinStudyBounds,
    numberOr: numberOr,
    MIN_WIDTH: MIN_WIDTH,
    MIN_HEIGHT: MIN_HEIGHT,
    PANEL_MARGIN: PANEL_MARGIN,
    FRAME_CONFIG_KEY: FRAME_CONFIG_KEY,
    PANEL_ON_KEY: PANEL_ON_KEY,
  };
})();
