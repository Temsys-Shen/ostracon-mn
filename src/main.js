JSB.require("WebDevServerConfig");
JSB.require("CardSelectionService");
JSB.require("OstraconUtils");
JSB.require("MarkdownExportService");
JSB.require("CanvasExportService");
JSB.require("NoteChangeEvents");
JSB.require("BridgeCommandsPersistence");
JSB.require("BridgeCommandsInfo");
JSB.require("BridgeCommandsSync");
JSB.require("BridgeCommandsContent");
JSB.require("ObsidianCardImportService");
JSB.require("WebBridgeCommands");
JSB.require("FrameManager");
JSB.require("BridgeDispatcher");
JSB.require("WebPanelController");
JSB.require("MNOstraconAddon");

JSB.newAddon = function (mainPath) {
  return createMNOstraconAddon(mainPath);
};
