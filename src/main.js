JSB.require("WebDevServerConfig");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNOstraconAddon");

JSB.newAddon = function (mainPath) {
  return createMNOstraconAddon(mainPath);
};
