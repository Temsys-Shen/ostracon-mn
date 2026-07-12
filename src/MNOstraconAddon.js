function createMNOstraconAddon(mainPath) {
  return JSB.defineClass("MNOstraconAddon : JSExtension", {
    sceneWillConnect: function () {
      self.mainPath = mainPath;
      self.webController = __MN_WEB_API_MNOstraconAddon.createController(mainPath, self);

      self.layoutViewController = function () {
        __MN_WEB_API_MNOstraconAddon.ensureLayout(self.webController);
      };

      self._ostraconQuoteRoot = null;
      __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.install(self);
      console.log("[Ostracon] initialized");
    },

    sceneDidDisconnect: function () {
      __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.remove(self);
      if (self.webController && self.webController.view && self.webController.view.superview) {
        self.webController.view.removeFromSuperview();
      }
      self.webController = null;
      console.log("[Ostracon] disconnected");
    },

    notebookWillOpen: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      self.webController.addon = self;
      self.webController.addonWindow = self.window;

      if (__MN_WEB_API_MNOstraconAddon.shouldRestorePanel()) {
        __MN_WEB_API_MNOstraconAddon.showPanel(self.webController);
        self.layoutViewController();
      }
    },

    notebookWillClose: function () {
      __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.handleNotebookClose(self);
    },

    controllerWillLayoutSubviews: function (controller) {
      if (controller === Application.sharedInstance().studyController(self.window)) {
        self.layoutViewController();
      }
    },

    queryAddonCommandStatus: function () {
      const checked =
        self.webController &&
        self.webController.view &&
        self.webController.view.window
          ? true
          : false;

      return {
        image: "icon.png",
        object: self,
        selector: "toggleWebPanel:",
        checked,
      };
    },

    toggleWebPanel: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      if (self.webController.view && self.webController.view.window) {
        __MN_WEB_API_MNOstraconAddon.hidePanel(self.webController);
      } else {
        __MN_WEB_API_MNOstraconAddon.showPanel(self.webController);
        self.layoutViewController();
      }

      Application.sharedInstance().studyController(self.window).refreshAddonCommands();
    },

    onOstraconSelectionChanged: function () {
      __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.handleSelectionChanged(self);
    },
  });
}
