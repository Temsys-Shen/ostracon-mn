var __MN_WEB_API_MNOstraconAddon = (function () {
  var _fm = __MN_FRAME_MANAGER_MNOstraconAddon;
  var _bd = __MN_BRIDGE_DISPATCHER_MNOstraconAddon;

  const TITLE_HEIGHT = 32;

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
    if (controller.view.superview) controller.view.removeFromSuperview();
    NSUserDefaults.standardUserDefaults().setObjectForKey(false, _fm.PANEL_ON_KEY);
    NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
      var targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
      if (!targetWindow) return;
      Application.sharedInstance().studyController(targetWindow).refreshAddonCommands();
    });
  }

  function refreshWebPanelLayout(controller) {
    var frame = controller.view.bounds;
    controller.containerView.frame = { x: 0, y: 0, width: frame.width, height: frame.height };
    controller.titleBar.frame = { x: 0, y: 0, width: frame.width, height: TITLE_HEIGHT };
    controller.titleLabel.frame = { x: 40, y: 0, width: Math.max(0, frame.width - 80), height: TITLE_HEIGHT };
    controller.webView.frame = { x: 0, y: TITLE_HEIGHT, width: frame.width, height: Math.max(0, frame.height - TITLE_HEIGHT) };
    var resizeSize = 40;
    controller.resizeHandle.frame = { x: frame.width - resizeSize, y: frame.height - resizeSize, width: resizeSize, height: resizeSize };
  }

  function setupWebPanelUI(controller) {
    controller.navigationItem.title = "Ostracon";
    controller.view.autoresizingMask = 0;
    controller.view.backgroundColor = UIColor.clearColor();
    controller.view.layer.shadowOffset = { width: 0, height: 2 };
    controller.view.layer.shadowRadius = 4;
    controller.view.layer.shadowOpacity = 0.3;
    controller.view.layer.shadowColor = UIColor.blackColor();
    controller.view.layer.masksToBounds = false;

    var initWidth = 960;
    var initHeight = 640;

    controller._isMaximized = false;

    controller.containerView = new UIView({ x: 0, y: 0, width: initWidth, height: initHeight });
    controller.containerView.backgroundColor = UIColor.whiteColor();
    controller.containerView.layer.cornerRadius = 10;
    controller.containerView.layer.masksToBounds = true;
    controller.containerView.layer.borderWidth = 0.5;
    controller.containerView.layer.borderColor = UIColor.lightGrayColor().colorWithAlphaComponent(0.3);
    controller.containerView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.view.addSubview(controller.containerView);

    controller.titleBar = new UIView({ x: 0, y: 0, width: initWidth, height: TITLE_HEIGHT });
    controller.titleBar.backgroundColor = UIColor.colorWithWhiteAlpha(0.96, 1);
    controller.titleBar.autoresizingMask = (1 << 1);

    controller.titleLabel = new UILabel({ x: 40, y: 0, width: initWidth - 80, height: TITLE_HEIGHT });
    controller.titleLabel.text = "Ostracon";
    controller.titleLabel.textAlignment = 1;
    controller.titleLabel.font = UIFont.boldSystemFontOfSize(14);
    controller.titleLabel.textColor = UIColor.darkGrayColor();
    controller.titleLabel.autoresizingMask = (1 << 1);
    controller.titleBar.addSubview(controller.titleLabel);

    controller.closeButton = new UIButton({ x: 5, y: 0, width: TITLE_HEIGHT, height: TITLE_HEIGHT });
    controller.closeButton.setTitleForState("\u00d7", 0);
    controller.closeButton.setTitleColorForState(UIColor.grayColor(), 0);
    controller.closeButton.titleLabel.font = UIFont.systemFontOfSize(24);
    controller.closeButton.addTargetActionForControlEvents(controller, "closeWindow", 1 << 0);
    controller.titleBar.addSubview(controller.closeButton);

    var panRecognizer = new UIPanGestureRecognizer(controller, "handlePan:");
    controller.titleBar.addGestureRecognizer(panRecognizer);

    var doubleTapRecognizer = new UITapGestureRecognizer(controller, "handleTitleBarDoubleTap:");
    doubleTapRecognizer.numberOfTapsRequired = 2;
    controller.titleBar.addGestureRecognizer(doubleTapRecognizer);
    panRecognizer.requireGestureRecognizerToFail(doubleTapRecognizer);
    controller.containerView.addSubview(controller.titleBar);

    controller.webView = new UIWebView({ x: 0, y: TITLE_HEIGHT, width: initWidth, height: Math.max(0, initHeight - TITLE_HEIGHT) });
    controller.webView.backgroundColor = UIColor.whiteColor();
    controller.webView.scalesPageToFit = true;
    controller.webView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.webView.delegate = controller;
    controller.containerView.addSubview(controller.webView);

    var resizeSize = 40;
    controller.resizeHandle = new UIView({ x: initWidth - resizeSize, y: initHeight - resizeSize, width: resizeSize, height: resizeSize });
    controller.resizeHandle.backgroundColor = UIColor.clearColor();
    controller.resizeHandle.autoresizingMask = (1 << 0 | 1 << 3);
    controller.resizeHandle.userInteractionEnabled = true;

    var resizeIcon = new UILabel({ x: 15, y: 15, width: 20, height: 20 });
    resizeIcon.text = "\u2198";
    resizeIcon.font = UIFont.systemFontOfSize(16);
    resizeIcon.textColor = UIColor.grayColor();
    resizeIcon.alpha = 0.5;
    controller.resizeHandle.addSubview(resizeIcon);

    var resizeRecognizer = new UIPanGestureRecognizer(controller, "handleResize:");
    controller.resizeHandle.addGestureRecognizer(resizeRecognizer);

    var resizeDoubleTap = new UITapGestureRecognizer(controller, "handleResizeDoubleTap:");
    resizeDoubleTap.numberOfTapsRequired = 2;
    controller.resizeHandle.addGestureRecognizer(resizeDoubleTap);
    resizeRecognizer.requireGestureRecognizerToFail(resizeDoubleTap);

    controller.containerView.addSubview(controller.resizeHandle);
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
        if (String(url.scheme || "").toLowerCase() !== _bd.BRIDGE_SCHEME) return true;

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
