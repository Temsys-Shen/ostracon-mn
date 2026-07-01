var __MN_WEB_API_MNOstraconAddon = (function () {
  const FRAME_CONFIG_KEY = "mn_web_template_mnostraconaddon_frame_config";
  const PANEL_ON_KEY = "mn_web_template_mnostraconaddon_panel_on";

  const BRIDGE_SCHEME = "mnaddon";
  const BRIDGE_HOST = "bridge";

  const MIN_WIDTH = 520;
  const MIN_HEIGHT = 420;
  const DEFAULT_WIDTH = 960;
  const DEFAULT_HEIGHT = 640;
  const PANEL_MARGIN = 16;
  const TITLE_HEIGHT = 32;

  function evaluateScript(webView, script) {
    webView.evaluateJavaScript(script, function () {});
  }

  function encodeBridgeJSON(value) {
    return JSON.stringify(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function decodeBridgeMessage(requestURL) {
    const absolute = String(requestURL.absoluteString());
    if (!absolute.startsWith(`${BRIDGE_SCHEME}://${BRIDGE_HOST}`)) {
      throw new Error(`Unexpected bridge URL: ${absolute}`);
    }

    const marker = "payload=";
    const index = absolute.indexOf(marker);
    if (index < 0) {
      throw new Error(`Missing payload in bridge URL: ${absolute}`);
    }

    const rawPayload = absolute.slice(index + marker.length);
    const decodedPayload = decodeURIComponent(rawPayload);
    const message = JSON.parse(decodedPayload);

    if (!message || typeof message !== "object") {
      throw new Error("Bridge payload must be an object");
    }
    if (!message.command || typeof message.command !== "string") {
      throw new Error("Bridge payload missing command");
    }
    if (!message.requestId || typeof message.requestId !== "string") {
      throw new Error("Bridge payload missing requestId");
    }

    return message;
  }

  function resolveWebEntryURL(mainPath) {
    const devServerURL = __MNGetWebDevServerURL_MNOstraconAddon();
    if (devServerURL) {
      console.log(`[WebAddon] load dev server: ${devServerURL}`);
      return {
        url: NSURL.URLWithString(devServerURL),
        kind: "remote",
      };
    }

    const localEntryPath = `${mainPath}/web-dist/index.html`;
    const fileManager = NSFileManager.defaultManager();
    if (!fileManager.fileExistsAtPath(localEntryPath)) {
      throw new Error(
        `Web build output not found: ${localEntryPath}. Run \"pnpm build\" or \"npm run build\" first.`,
      );
    }

    console.log(`[WebAddon] load local build: ${localEntryPath}`);
    return {
      url: NSURL.fileURLWithPath(localEntryPath),
      kind: "local",
    };
  }

  function sendBridgeResponse(webView, requestId, result, error) {
    const response = {
      requestId,
      payload: result === undefined ? null : result,
      error: error === undefined ? null : error,
    };

    const script = `window.__MNBridgeReceive_MNOstraconAddon('${encodeBridgeJSON(response)}')`;
    evaluateScript(webView, script);
  }

  function normalizeBridgeError(error, command) {
    return {
      message: error && error.message ? error.message : String(error),
      command: command || "unknown",
    };
  }

  function isPromiseLike(value) {
    return !!value && typeof value.then === "function";
  }

  function saveWebPanelFrame(controller) {
    if (controller._isMaximized) return;
    const frame = controller.view.frame;
    const config = {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
    NSUserDefaults.standardUserDefaults().setObjectForKey(config, FRAME_CONFIG_KEY);
  }

  function numberOr(value, fallback) {
    const number = Number(value);
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
    const safeBounds = normalizeBounds(bounds);
    const maxWidth = Math.max(320, safeBounds.width - PANEL_MARGIN * 2);
    const maxHeight = Math.max(260, safeBounds.height - PANEL_MARGIN * 2);
    const width = Math.min(DEFAULT_WIDTH, maxWidth);
    const height = Math.min(DEFAULT_HEIGHT, maxHeight);

    return {
      x: safeBounds.x + Math.max(PANEL_MARGIN, (safeBounds.width - width) / 2),
      y: safeBounds.y + Math.max(PANEL_MARGIN, (safeBounds.height - height) / 2),
      width,
      height,
    };
  }

  function isFullscreenLike(frame, bounds) {
    if (!frame || !bounds) return false;
    const safeBounds = normalizeBounds(bounds);
    return Math.abs(numberOr(frame.x, 0) - safeBounds.x) < 1 &&
      Math.abs(numberOr(frame.y, 0) - safeBounds.y) < 1 &&
      frame.width >= safeBounds.width - PANEL_MARGIN &&
      frame.height >= safeBounds.height - PANEL_MARGIN;
  }

  function normalizePanelFrame(frame, bounds) {
    const safeBounds = normalizeBounds(bounds);
    const fallback = createDefaultFrame(safeBounds);
    const source = frame || fallback;
    const maxWidth = Math.max(320, safeBounds.width - PANEL_MARGIN * 2);
    const maxHeight = Math.max(260, safeBounds.height - PANEL_MARGIN * 2);
    const width = Math.min(Math.max(MIN_WIDTH, numberOr(source.width, fallback.width)), maxWidth);
    const height = Math.min(Math.max(MIN_HEIGHT, numberOr(source.height, fallback.height)), maxHeight);
    const minX = safeBounds.x + PANEL_MARGIN;
    const minY = safeBounds.y + PANEL_MARGIN;
    const maxX = safeBounds.x + Math.max(PANEL_MARGIN, safeBounds.width - width - PANEL_MARGIN);
    const maxY = safeBounds.y + Math.max(PANEL_MARGIN, safeBounds.height - height - PANEL_MARGIN);

    return {
      x: Math.max(minX, Math.min(maxX, numberOr(source.x, fallback.x))),
      y: Math.max(minY, Math.min(maxY, numberOr(source.y, fallback.y))),
      width,
      height,
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

  function performCloseWindow(controller) {
    controller.view.hidden = true;
    if (controller.view.superview) {
      controller.view.removeFromSuperview();
    }
    NSUserDefaults.standardUserDefaults().setObjectForKey(false, PANEL_ON_KEY);

    NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
      const targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
      if (!targetWindow) return;
      Application.sharedInstance().studyController(targetWindow).refreshAddonCommands();
    });
  }

  function getStudyRootBounds(controller) {
    const targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
    const studyController = Application.sharedInstance().studyController(targetWindow);
    if (!studyController || !studyController.view) {
      throw new Error("studyController not found");
    }
    return studyController.view.bounds;
  }

  function applyDefaultFrame(controller) {
    const bounds = getStudyRootBounds(controller);
    applyRootFrame(controller, createDefaultFrame(bounds), true);
  }

  function applySavedOrDefaultFrame(controller) {
    const bounds = getStudyRootBounds(controller);
    const saved = NSUserDefaults.standardUserDefaults().objectForKey(FRAME_CONFIG_KEY);

    if (!saved || isFullscreenLike(saved, bounds)) {
      applyDefaultFrame(controller);
      return;
    }

    let x = saved.x;
    let y = saved.y;
    let width = saved.width;
    let height = saved.height;

    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      applyDefaultFrame(controller);
      return;
    }

    const isInvalid = !Number.isFinite(Number(x)) ||
      !Number.isFinite(Number(y)) ||
      !Number.isFinite(Number(width)) ||
      !Number.isFinite(Number(height));

    if (isInvalid) {
      applyDefaultFrame(controller);
      return;
    }

    applyRootFrame(controller, normalizePanelFrame({ x, y, width, height }, bounds), true);
  }

  function keepPanelWithinStudyBounds(controller) {
    if (!controller.view || !controller.view.superview) return;
    const bounds = getStudyRootBounds(controller);

    if (controller._isMaximized) {
      const maximizedFrame = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      if (!framesEqual(controller.view.frame, maximizedFrame)) {
        applyRootFrame(controller, maximizedFrame, false);
      }
      return;
    }

    const preferred = controller._preferredFrame || controller.view.frame || createDefaultFrame(bounds);
    const normalized = normalizePanelFrame(preferred, bounds);
    if (!framesEqual(controller.view.frame, normalized)) {
      applyRootFrame(controller, normalized, false);
    }
  }

  function refreshWebPanelLayout(controller) {
    const frame = controller.view.bounds;
    controller.containerView.frame = {
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height,
    };
    controller.titleBar.frame = {
      x: 0,
      y: 0,
      width: frame.width,
      height: TITLE_HEIGHT,
    };
    controller.titleLabel.frame = {
      x: 40,
      y: 0,
      width: Math.max(0, frame.width - 80),
      height: TITLE_HEIGHT,
    };
    controller.webView.frame = {
      x: 0,
      y: TITLE_HEIGHT,
      width: frame.width,
      height: Math.max(0, frame.height - TITLE_HEIGHT),
    };

    const resizeSize = 40;
    controller.resizeHandle.frame = {
      x: frame.width - resizeSize,
      y: frame.height - resizeSize,
      width: resizeSize,
      height: resizeSize,
    };
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

    const initWidth = DEFAULT_WIDTH;
    const initHeight = DEFAULT_HEIGHT;

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
    controller.closeButton.setTitleForState("×", 0);
    controller.closeButton.setTitleColorForState(UIColor.grayColor(), 0);
    controller.closeButton.titleLabel.font = UIFont.systemFontOfSize(24);
    controller.closeButton.addTargetActionForControlEvents(controller, "closeWindow", 1 << 0);
    controller.titleBar.addSubview(controller.closeButton);

    const panRecognizer = new UIPanGestureRecognizer(controller, "handlePan:");
    controller.titleBar.addGestureRecognizer(panRecognizer);

    const doubleTapRecognizer = new UITapGestureRecognizer(controller, "handleTitleBarDoubleTap:");
    doubleTapRecognizer.numberOfTapsRequired = 2;
    controller.titleBar.addGestureRecognizer(doubleTapRecognizer);
    panRecognizer.requireGestureRecognizerToFail(doubleTapRecognizer);
    controller.containerView.addSubview(controller.titleBar);

    controller.webView = new UIWebView({
      x: 0,
      y: TITLE_HEIGHT,
      width: initWidth,
      height: Math.max(0, initHeight - TITLE_HEIGHT),
    });
    controller.webView.backgroundColor = UIColor.whiteColor();
    controller.webView.scalesPageToFit = true;
    controller.webView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.webView.delegate = controller;
    controller.containerView.addSubview(controller.webView);

    const resizeSize = 40;
    controller.resizeHandle = new UIView({
      x: initWidth - resizeSize,
      y: initHeight - resizeSize,
      width: resizeSize,
      height: resizeSize,
    });
    controller.resizeHandle.backgroundColor = UIColor.clearColor();
    controller.resizeHandle.autoresizingMask = (1 << 0 | 1 << 3);
    controller.resizeHandle.userInteractionEnabled = true;

    const resizeIcon = new UILabel({ x: 15, y: 15, width: 20, height: 20 });
    resizeIcon.text = "↘";
    resizeIcon.font = UIFont.systemFontOfSize(16);
    resizeIcon.textColor = UIColor.grayColor();
    resizeIcon.alpha = 0.5;
    controller.resizeHandle.addSubview(resizeIcon);

    const resizeRecognizer = new UIPanGestureRecognizer(controller, "handleResize:");
    controller.resizeHandle.addGestureRecognizer(resizeRecognizer);

    const resizeDoubleTap = new UITapGestureRecognizer(controller, "handleResizeDoubleTap:");
    resizeDoubleTap.numberOfTapsRequired = 2;
    controller.resizeHandle.addGestureRecognizer(resizeDoubleTap);
    resizeRecognizer.requireGestureRecognizerToFail(resizeDoubleTap);

    controller.containerView.addSubview(controller.resizeHandle);
  }

  function togglePanelMaximize(controller) {
    const superview = controller.view.superview;
    const bounds = superview ? superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

    if (!controller._isMaximized) {
      controller._preMaxFrame = controller._preferredFrame || controller.view.frame;
      applyRootFrame(controller, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }, false);
      controller._isMaximized = true;
    } else {
      applyRootFrame(controller, normalizePanelFrame(controller._preMaxFrame, bounds), true);
      controller._isMaximized = false;
    }

    refreshWebPanelLayout(controller);
    saveWebPanelFrame(controller);
  }

  function dispatchBridgeCommand(controller, message) {
    const commandTable = __MN_WEB_BRIDGE_COMMANDS_MNOstraconAddon.commands;
    const handler = commandTable[message.command];

    if (typeof handler !== "function") {
      throw new Error(`Unknown bridge command: ${message.command}`);
    }

    const context = {
      controller,
      addon: controller.addon,
      closePanel: performCloseWindow,
    };

    return handler(context, message.payload);
  }

  function loadInitialWebPage(controller) {
    const entry = resolveWebEntryURL(controller.mainPath);
    const request = NSURLRequest.requestWithURL(entry.url);
    controller.webView.loadRequest(request);
  }

  const panelControllerClass = JSB.defineClass("MNWebPanelController_MNOstraconAddon : UIViewController <UIWebViewDelegate>", {
    viewDidLoad: function () {
      setupWebPanelUI(self);
      loadInitialWebPage(self);
    },

    viewDidLayoutSubviews: function () {
      keepPanelWithinStudyBounds(self);
      refreshWebPanelLayout(self);
    },

    closeWindow: function () {
      performCloseWindow(self);
    },

    handlePan: function (recognizer) {
      const translation = recognizer.translationInView(self.view.superview);
      const center = self.view.center;
      const nextCenter = {
        x: center.x + translation.x,
        y: center.y + translation.y,
      };

      const frame = self.view.frame;
      const bounds = self.view.superview ? self.view.superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

      const minX = bounds.x + frame.width / 2;
      const maxX = bounds.x + bounds.width - frame.width / 2;
      const minY = bounds.y + frame.height / 2;
      const maxY = bounds.y + bounds.height - frame.height / 2;

      nextCenter.x = Math.max(minX, Math.min(maxX, nextCenter.x));
      nextCenter.y = Math.max(minY, Math.min(maxY, nextCenter.y));

      self.view.center = nextCenter;
      self._preferredFrame = self.view.frame;
      recognizer.setTranslationInView({ x: 0, y: 0 }, self.view.superview);

      if (recognizer.state === 3) {
        saveWebPanelFrame(self);
      }
    },

    handleResize: function (recognizer) {
      const location = recognizer.locationInView(self.view.superview);
      if (recognizer.state === 1) {
        self._resizeStartLocation = location;
        self._resizeStartFrame = self.view.frame;
        return;
      }

      if (recognizer.state === 2) {
        if (!self._resizeStartLocation || !self._resizeStartFrame) {
          throw new Error("Resize state missing");
        }

        const dx = location.x - self._resizeStartLocation.x;
        const dy = location.y - self._resizeStartLocation.y;

        let width = Math.max(MIN_WIDTH, self._resizeStartFrame.width + dx);
        let height = Math.max(MIN_HEIGHT, self._resizeStartFrame.height + dy);

        const bounds = self.view.superview ? self.view.superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
        const maxX = bounds.x + bounds.width;
        const maxY = bounds.y + bounds.height;

        if (self._resizeStartFrame.x + width > maxX) {
          width = maxX - self._resizeStartFrame.x;
        }
        if (self._resizeStartFrame.y + height > maxY) {
          height = maxY - self._resizeStartFrame.y;
        }

        self.view.frame = {
          x: self._resizeStartFrame.x,
          y: self._resizeStartFrame.y,
          width,
          height,
        };
        self._preferredFrame = self.view.frame;
        self.view.setNeedsLayout();
        return;
      }

      if (recognizer.state === 3) {
        saveWebPanelFrame(self);
        self._resizeStartLocation = null;
        self._resizeStartFrame = null;
      }
    },

    handleResizeDoubleTap: function () {
      const bounds = self.view.superview ? self.view.superview.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
      self.view.center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      self._preferredFrame = self.view.frame;
      saveWebPanelFrame(self);
    },

    handleTitleBarDoubleTap: function () {
      togglePanelMaximize(self);
    },

    viewWillAppear: function () {
      self.view.hidden = false;
      self.webView.delegate = self;
      evaluateScript(self.webView, "typeof window.__onPanelShow==='function'&&window.__onPanelShow();");
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
      const message = String(error && error.localizedDescription ? error.localizedDescription : error);
      const errHTML =
        "<html><body style=\"margin:20px;font-family:-apple-system;color:#666;\"><h3>Load failed</h3><p>" +
        message.replace(/</g, "&lt;") +
        "</p></body></html>";
      self.webView.loadHTMLStringBaseURL(errHTML, null);
    },

    webViewShouldStartLoadWithRequestNavigationType: function (webView, request, navigationType) {
      try {
        const url = request.URL();
        const scheme = String(url.scheme || "").toLowerCase();

        if (scheme !== BRIDGE_SCHEME) {
          return true;
        }

        const message = decodeBridgeMessage(url);
        const result = dispatchBridgeCommand(self, message);

        if (isPromiseLike(result)) {
          result.then(function (payload) {
            sendBridgeResponse(webView, message.requestId, payload, null);
          }).catch(function (error) {
            const bridgeError = normalizeBridgeError(error, message.command);
            sendBridgeResponse(webView, message.requestId, null, bridgeError);
            console.log(`[WebAddon] bridge error: ${bridgeError.message}`);
          });
          return false;
        }

        sendBridgeResponse(webView, message.requestId, result, null);
        return false;
      } catch (error) {
        const bridgeError = normalizeBridgeError(error, "unknown");
        sendBridgeResponse(webView, "unknown", null, bridgeError);
        console.log(`[WebAddon] bridge error: ${bridgeError.message}`);
        return false;
      }
    },
  });

  function createController(mainPath, addon) {
    const controller = panelControllerClass.new();
    controller.mainPath = mainPath;
    controller.addon = addon;
    controller.addonWindow = addon.window;
    return controller;
  }

  function showPanel(controller) {
    const targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
    const studyController = Application.sharedInstance().studyController(targetWindow);
    if (!studyController || !studyController.view) {
      throw new Error("studyController not found");
    }

    if (!controller.view.superview) {
      studyController.view.addSubview(controller.view);
    }

    controller.view.autoresizingMask = 0;
    controller._isMaximized = false;
    applySavedOrDefaultFrame(controller);
    controller.view.hidden = false;
    NSUserDefaults.standardUserDefaults().setObjectForKey(true, PANEL_ON_KEY);
  }

  function hidePanel(controller) {
    performCloseWindow(controller);
  }

  function shouldRestorePanel() {
    return NSUserDefaults.standardUserDefaults().objectForKey(PANEL_ON_KEY) === true;
  }

  function ensureLayout(controller) {
    if (!controller.view) {
      return;
    }
    controller.view.autoresizingMask = 0;
    if (controller.view.frame.width === 0) {
      applySavedOrDefaultFrame(controller);
      return;
    }
    keepPanelWithinStudyBounds(controller);
    refreshWebPanelLayout(controller);
  }

  return {
    createController,
    showPanel,
    hidePanel,
    shouldRestorePanel,
    ensureLayout,
  };
})();
