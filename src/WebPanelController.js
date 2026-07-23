var __MN_WEB_API_MNOstraconAddon = (function () {
  var _fm = __MN_FRAME_MANAGER_MNOstraconAddon;
  var _bd = __MN_BRIDGE_DISPATCHER_MNOstraconAddon;

  const TITLE_HEIGHT = 32;
  const TITLE_HORIZONTAL_PADDING = 14;
  const CLOSE_BUTTON_SIZE = 24;
  const CLOSE_BUTTON_MARGIN = 4;
  const RESIZE_HANDLE_SIZE = 32;
  const WINDOW_CORNER_RADIUS = 14;
  const NAVIGATION_TYPE_LINK_CLICKED = 0;

  const WINDOW_BACKGROUND = UIColor.colorWithRedGreenBlueAlpha(247 / 255, 248 / 255, 250 / 255, 1);
  const TITLE_COLOR = UIColor.colorWithRedGreenBlueAlpha(37 / 255, 42 / 255, 52 / 255, 1);
  const SECONDARY_COLOR = UIColor.colorWithRedGreenBlueAlpha(105 / 255, 115 / 255, 134 / 255, 1);
  const BORDER_COLOR = UIColor.colorWithRedGreenBlueAlpha(105 / 255, 115 / 255, 134 / 255, 0.16);
  const CLOSE_BACKGROUND = UIColor.colorWithRedGreenBlueAlpha(238 / 255, 241 / 255, 245 / 255, 1);

  function resolveWebEntryURL(mainPath) {
    var devServerURL = __MNGetWebDevServerURL_MNOstraconAddon();
    if (devServerURL) {
      console.log("[WebAddon] load dev server: " + devServerURL);
      return { url: NSURL.URLWithString(devServerURL), kind: "remote" };
    }

    var localEntryPath = mainPath + "/web-dist/index.html";
    var fileManager = NSFileManager.defaultManager();
    if (!fileManager.fileExistsAtPath(localEntryPath)) {
      throw new Error("Web build output not found: " + localEntryPath + ". Run \"pnpm build\" or \"npm run build\" first.");
    }

    console.log("[WebAddon] load local build: " + localEntryPath);
    return { url: NSURL.fileURLWithPath(localEntryPath), kind: "local" };
  }

  function performCloseWindow(controller) {
    controller.view.hidden = true;
    NSUserDefaults.standardUserDefaults().setObjectForKey(false, _fm.PANEL_ON_KEY);
    NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
      var targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
      if (!targetWindow) return;
      Application.sharedInstance().studyController(targetWindow).refreshAddonCommands();
    });
  }

  function refreshWebPanelLayout(controller) {
    var frame = controller.view.bounds;
    controller.containerView.layer.cornerRadius = controller._isMaximized ? 0 : WINDOW_CORNER_RADIUS;
    controller.containerView.layer.borderWidth = controller._isMaximized ? 0 : 1;
    controller.containerView.frame = { x: 0, y: 0, width: frame.width, height: frame.height };
    controller.titleBar.frame = { x: 0, y: 0, width: frame.width, height: TITLE_HEIGHT };
    controller.dragRegion.frame = { x: 0, y: 0, width: Math.max(0, frame.width - CLOSE_BUTTON_SIZE - CLOSE_BUTTON_MARGIN * 2), height: TITLE_HEIGHT };
    controller.titleLabel.frame = { x: TITLE_HORIZONTAL_PADDING, y: 0, width: Math.max(0, controller.dragRegion.frame.width - TITLE_HORIZONTAL_PADDING), height: TITLE_HEIGHT };
    controller.closeButton.frame = { x: Math.max(0, frame.width - CLOSE_BUTTON_SIZE - CLOSE_BUTTON_MARGIN), y: CLOSE_BUTTON_MARGIN, width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE };
    controller.titleDivider.frame = { x: 0, y: TITLE_HEIGHT - 1, width: frame.width, height: 1 };
    controller.webView.frame = { x: 0, y: TITLE_HEIGHT, width: frame.width, height: Math.max(0, frame.height - TITLE_HEIGHT) };
    controller.resizeHandle.frame = { x: frame.width - RESIZE_HANDLE_SIZE, y: frame.height - RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE };
    controller.resizeHandle.hidden = controller._isMaximized;
  }

  function setupWebPanelUI(controller) {
    controller.navigationItem.title = "Ostracon";
    controller.view.autoresizingMask = 0;
    controller.view.backgroundColor = UIColor.clearColor();
    controller.view.layer.masksToBounds = true;

    var initWidth = _fm.DEFAULT_WIDTH;
    var initHeight = _fm.DEFAULT_HEIGHT;

    controller._isMaximized = false;

    controller.containerView = new UIView({ x: 0, y: 0, width: initWidth, height: initHeight });
    controller.containerView.backgroundColor = WINDOW_BACKGROUND;
    controller.containerView.layer.cornerRadius = WINDOW_CORNER_RADIUS;
    controller.containerView.layer.masksToBounds = true;
    controller.containerView.layer.borderWidth = 1;
    controller.containerView.layer.borderColor = BORDER_COLOR;
    controller.containerView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.view.addSubview(controller.containerView);

    controller.titleBar = new UIView({ x: 0, y: 0, width: initWidth, height: TITLE_HEIGHT });
    controller.titleBar.backgroundColor = WINDOW_BACKGROUND;
    controller.titleBar.autoresizingMask = (1 << 1);

    controller.dragRegion = new UIView({ x: 0, y: 0, width: initWidth - CLOSE_BUTTON_SIZE - CLOSE_BUTTON_MARGIN * 2, height: TITLE_HEIGHT });
    controller.dragRegion.backgroundColor = UIColor.clearColor();
    controller.dragRegion.autoresizingMask = (1 << 1);

    controller.titleLabel = new UILabel({ x: TITLE_HORIZONTAL_PADDING, y: 0, width: initWidth - CLOSE_BUTTON_SIZE - CLOSE_BUTTON_MARGIN * 2 - TITLE_HORIZONTAL_PADDING, height: TITLE_HEIGHT });
    controller.titleLabel.text = "Ostracon";
    controller.titleLabel.textAlignment = 0;
    controller.titleLabel.font = UIFont.boldSystemFontOfSize(12);
    controller.titleLabel.textColor = TITLE_COLOR;
    controller.titleLabel.autoresizingMask = (1 << 1);
    controller.dragRegion.addSubview(controller.titleLabel);
    controller.titleBar.addSubview(controller.dragRegion);

    controller.closeButton = new UIButton({ x: initWidth - CLOSE_BUTTON_SIZE - CLOSE_BUTTON_MARGIN, y: CLOSE_BUTTON_MARGIN, width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE });
    controller.closeButton.setTitleForState("\u00d7", 0);
    controller.closeButton.setTitleColorForState(SECONDARY_COLOR, 0);
    controller.closeButton.titleLabel.font = UIFont.systemFontOfSize(18);
    controller.closeButton.backgroundColor = CLOSE_BACKGROUND;
    controller.closeButton.layer.cornerRadius = 6;
    controller.closeButton.layer.masksToBounds = true;
    controller.closeButton.addTargetActionForControlEvents(controller, "closeWindow", 1 << 0);
    controller.titleBar.addSubview(controller.closeButton);

    controller.titleDivider = new UIView({ x: 0, y: TITLE_HEIGHT - 1, width: initWidth, height: 1 });
    controller.titleDivider.backgroundColor = BORDER_COLOR;
    controller.titleDivider.autoresizingMask = (1 << 1);
    controller.titleBar.addSubview(controller.titleDivider);

    var panRecognizer = new UIPanGestureRecognizer(controller, "handlePan:");
    controller.dragRegion.addGestureRecognizer(panRecognizer);

    var doubleTapRecognizer = new UITapGestureRecognizer(controller, "handleTitleBarDoubleTap:");
    doubleTapRecognizer.numberOfTapsRequired = 2;
    controller.dragRegion.addGestureRecognizer(doubleTapRecognizer);
    panRecognizer.requireGestureRecognizerToFail(doubleTapRecognizer);
    controller.containerView.addSubview(controller.titleBar);

    controller.webView = new UIWebView({ x: 0, y: TITLE_HEIGHT, width: initWidth, height: Math.max(0, initHeight - TITLE_HEIGHT) });
    controller.webView.backgroundColor = WINDOW_BACKGROUND;
    controller.webView.scalesPageToFit = true;
    controller.webView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.webView.delegate = controller;
    controller.webView.scrollView.bounces = false;
    controller.webView.scrollView.alwaysBounceVertical = false;
    controller.webView.scrollView.alwaysBounceHorizontal = false;
    controller.webView.scrollView.showsVerticalScrollIndicator = false;
    controller.webView.scrollView.showsHorizontalScrollIndicator = false;
    controller.containerView.addSubview(controller.webView);

    controller.resizeHandle = new UIView({ x: initWidth - RESIZE_HANDLE_SIZE, y: initHeight - RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE });
    controller.resizeHandle.backgroundColor = UIColor.clearColor();
    controller.resizeHandle.autoresizingMask = (1 << 0 | 1 << 3);
    controller.resizeHandle.userInteractionEnabled = true;

    var resizeArcClip = new UIView({ x: 13, y: 13, width: 16, height: 16 });
    resizeArcClip.backgroundColor = UIColor.clearColor();
    resizeArcClip.layer.masksToBounds = true;
    resizeArcClip.userInteractionEnabled = false;

    var resizeArc = new UIView({ x: -13, y: -13, width: WINDOW_CORNER_RADIUS * 2, height: WINDOW_CORNER_RADIUS * 2 });
    resizeArc.backgroundColor = UIColor.clearColor();
    resizeArc.layer.cornerRadius = WINDOW_CORNER_RADIUS;
    resizeArc.layer.borderWidth = 2;
    resizeArc.layer.borderColor = SECONDARY_COLOR;
    resizeArc.userInteractionEnabled = false;
    resizeArcClip.addSubview(resizeArc);
    controller.resizeHandle.addSubview(resizeArcClip);

    var resizeRecognizer = new UIPanGestureRecognizer(controller, "handleResize:");
    controller.resizeHandle.addGestureRecognizer(resizeRecognizer);

    var resizeDoubleTap = new UITapGestureRecognizer(controller, "handleResizeDoubleTap:");
    resizeDoubleTap.numberOfTapsRequired = 2;
    controller.resizeHandle.addGestureRecognizer(resizeDoubleTap);

    controller.view.addSubview(controller.resizeHandle);
  }

  function togglePanelMaximize(controller) {
    var superview = controller.view.superview;
    var bounds = superview ? superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

    if (!controller._isMaximized) {
      controller._preMaxFrame = controller._preferredFrame || controller.view.frame;
      _fm.applyRootFrame(controller, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, false);
      controller._isMaximized = true;
    } else {
      _fm.applyRootFrame(controller, _fm.normalizePanelFrame(controller._preMaxFrame, bounds), true);
      controller._isMaximized = false;
    }

    refreshWebPanelLayout(controller);
    _fm.saveWebPanelFrame(controller);
  }

  function loadInitialWebPage(controller) {
    var entry = resolveWebEntryURL(controller.mainPath);
    var request = NSURLRequest.requestWithURL(entry.url);
    controller.webView.loadRequest(request);
  }

  var panelControllerClass = JSB.defineClass("MNWebPanelController_MNOstraconAddon : UIViewController <UIWebViewDelegate>", {
    viewDidLoad: function () {
      setupWebPanelUI(self);
      loadInitialWebPage(self);
    },

    viewDidLayoutSubviews: function () {
      _fm.keepPanelWithinStudyBounds(self);
      refreshWebPanelLayout(self);
    },

    closeWindow: function () {
      performCloseWindow(self);
    },

    handlePan: function (recognizer) {
      var translation = recognizer.translationInView(self.view.superview);
      var center = self.view.center;
      var nextCenter = { x: center.x + translation.x, y: center.y + translation.y };

      var frame = self.view.frame;
      var bounds = self.view.superview ? self.view.superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

      var minX = bounds.x + frame.width / 2;
      var maxX = bounds.x + bounds.width - frame.width / 2;
      var minY = bounds.y + frame.height / 2;
      var maxY = bounds.y + bounds.height - frame.height / 2;

      nextCenter.x = Math.max(minX, Math.min(maxX, nextCenter.x));
      nextCenter.y = Math.max(minY, Math.min(maxY, nextCenter.y));

      self.view.center = nextCenter;
      self._preferredFrame = self.view.frame;
      recognizer.setTranslationInView({ x: 0, y: 0 }, self.view.superview);

      if (recognizer.state === 3) _fm.saveWebPanelFrame(self);
    },

    handleResize: function (recognizer) {
      var location = recognizer.locationInView(self.view.superview);
      if (recognizer.state === 1) {
        self._resizeStartLocation = location;
        self._resizeStartFrame = self.view.frame;
        return;
      }

      if (recognizer.state === 2) {
        if (!self._resizeStartLocation || !self._resizeStartFrame) throw new Error("Resize state missing");

        var dx = location.x - self._resizeStartLocation.x;
        var dy = location.y - self._resizeStartLocation.y;

        var width = Math.max(_fm.MIN_WIDTH, self._resizeStartFrame.width + dx);
        var height = Math.max(_fm.MIN_HEIGHT, self._resizeStartFrame.height + dy);

        var bounds = self.view.superview ? self.view.superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
        var maxX = bounds.x + bounds.width;
        var maxY = bounds.y + bounds.height;

        if (self._resizeStartFrame.x + width > maxX) width = maxX - self._resizeStartFrame.x;
        if (self._resizeStartFrame.y + height > maxY) height = maxY - self._resizeStartFrame.y;

        self.view.frame = { x: self._resizeStartFrame.x, y: self._resizeStartFrame.y, width: width, height: height };
        self._preferredFrame = self.view.frame;
        self.view.setNeedsLayout();
        return;
      }

      if (recognizer.state === 3) {
        _fm.saveWebPanelFrame(self);
        self._resizeStartLocation = null;
        self._resizeStartFrame = null;
      }
    },

    handleResizeDoubleTap: function () {
      var bounds = self.view.superview ? self.view.superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
      self.view.center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      self._preferredFrame = self.view.frame;
      _fm.saveWebPanelFrame(self);
    },

    handleTitleBarDoubleTap: function () {
      togglePanelMaximize(self);
    },

    viewWillAppear: function () {
      self.view.hidden = false;
      self.webView.delegate = self;
      _bd.evaluateScript(self.webView, "typeof window.__onPanelShow==='function'&&window.__onPanelShow();");
    },

    viewWillDisappear: function () {
      self.webView.stopLoading();
      self.webView.delegate = null;
      UIApplication.sharedApplication().networkActivityIndicatorVisible = false;
    },

    webViewDidStartLoad: function () {
      UIApplication.sharedApplication().networkActivityIndicatorVisible = true;
    },

    webViewDidFinishLoad: function () {
      UIApplication.sharedApplication().networkActivityIndicatorVisible = false;
    },

    webViewDidFailLoadWithError: function (webView, error) {
      UIApplication.sharedApplication().networkActivityIndicatorVisible = false;
      var message = String(error && error.localizedDescription ? error.localizedDescription : error);
      var errHTML = "<html><body style=\"margin:20px;font-family:-apple-system;color:#666;\"><h3>Load failed</h3><p>" + message.replace(/</g, "&lt;") + "</p></body></html>";
      self.webView.loadHTMLStringBaseURL(errHTML, null);
    },

    webViewShouldStartLoadWithRequestNavigationType: function (webView, request, navigationType) {
      var message = null;
      try {
        var url = request.URL();
        var scheme = String(url.scheme || "").toLowerCase();
        if (scheme !== _bd.BRIDGE_SCHEME) {
          if (navigationType === NAVIGATION_TYPE_LINK_CLICKED) {
            Application.sharedInstance().openURL(url);
            return false;
          }
          return true;
        }

        message = _bd.decodeBridgeMessage(url);
        var result = _bd.dispatchBridgeCommand(self, message);

        if (_bd.isPromiseLike(result)) {
          result.then(function (payload) {
            _bd.sendBridgeResponse(webView, message.requestId, payload, null);
          }).catch(function (error) {
            var bridgeError = _bd.normalizeBridgeError(error, message.command);
            _bd.sendBridgeResponse(webView, message.requestId, null, bridgeError);
            console.log("[WebAddon] bridge error: " + bridgeError.message);
          });
          return false;
        }

        _bd.sendBridgeResponse(webView, message.requestId, result, null);
        return false;
      } catch (error) {
        var requestId = message && message.requestId ? message.requestId : "unknown";
        var bridgeError = _bd.normalizeBridgeError(error, message && message.command ? message.command : "unknown");
        _bd.sendBridgeResponse(webView, requestId, null, bridgeError);
        console.log("[WebAddon] bridge error: " + bridgeError.message);
        return false;
      }
    },
  });

  function createController(mainPath, addon) {
    var controller = panelControllerClass.new();
    controller.mainPath = mainPath;
    controller.addon = addon;
    controller.addonWindow = addon.window;
    return controller;
  }

  function showPanel(controller) {
    var targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
    var studyController = Application.sharedInstance().studyController(targetWindow);
    if (!studyController || !studyController.view) throw new Error("studyController not found");

    if (!controller.view.superview) studyController.view.addSubview(controller.view);

    controller.view.autoresizingMask = 0;
    controller._isMaximized = false;
    _fm.applySavedOrDefaultFrame(controller);
    controller.view.hidden = false;
    _bd.evaluateScript(controller.webView, "typeof window.__onPanelShow==='function'&&window.__onPanelShow();");
    NSUserDefaults.standardUserDefaults().setObjectForKey(true, _fm.PANEL_ON_KEY);
  }

  function hidePanel(controller) {
    performCloseWindow(controller);
  }

  function shouldRestorePanel() {
    return NSUserDefaults.standardUserDefaults().objectForKey(_fm.PANEL_ON_KEY) === true;
  }

  function ensureLayout(controller) {
    if (!controller.view) return;
    controller.view.autoresizingMask = 0;
    if (controller.view.frame.width === 0) {
      _fm.applySavedOrDefaultFrame(controller);
      return;
    }
    _fm.keepPanelWithinStudyBounds(controller);
    refreshWebPanelLayout(controller);
  }

  return {
    createController: createController,
    showPanel: showPanel,
    hidePanel: hidePanel,
    shouldRestorePanel: shouldRestorePanel,
    ensureLayout: ensureLayout,
  };
})();
