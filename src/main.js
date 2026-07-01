JSB.require("WebDevServerConfig");
JSB.require("CardSelectionService");
JSB.require("MarkdownExportService");
JSB.require("CanvasExportService");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNOstraconAddon");

JSB.newAddon = function (mainPath) {
  return createMNOstraconAddon(mainPath);
};
