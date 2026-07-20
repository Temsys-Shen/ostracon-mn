JSB.require("WebDevServerConfig");
JSB.require("CardSelectionService");
JSB.require("OstraconUtils");
JSB.require("FreehandStrokeService");
JSB.require("InkDrawingService");
JSB.require("CardContentService");
JSB.require("MarkdownExportService");
JSB.require("CanvasExportService");
JSB.require("QuoteSelectionService");
JSB.require("BridgeCommandsPersistence");
JSB.require("BridgeCommandsInfo");
JSB.require("BridgeCommandsContent");
JSB.require("ObsidianCardImportService");
JSB.require("ObsidianPdfImportService");
JSB.require("WebBridgeCommands");
JSB.require("FrameManager");
JSB.require("BridgeDispatcher");
JSB.require("WebPanelController");
JSB.require("MNOstraconAddon");

JSB.newAddon = function (mainPath) {
  return createMNOstraconAddon(mainPath);
};
