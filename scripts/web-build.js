const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { transformSync } = require("@babel/core");
const presetEnv = require("@babel/preset-env").default;

function getLocalBin(rootDir, name) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(rootDir, "node_modules", ".bin", `${name}${ext}`);
}

function resolveSingleBundle(distAssetsDirPath) {
  const jsFiles = fs.readdirSync(distAssetsDirPath)
    .filter((name) => name.endsWith(".js"))
    .sort();

  if (jsFiles.length !== 1) {
    throw new Error(`Expected exactly one JS bundle in ${distAssetsDirPath}, got: ${jsFiles.join(", ") || "(none)"}`);
  }

  return path.join(distAssetsDirPath, jsFiles[0]);
}

function transpileLegacyBundle(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const result = transformSync(source, {
    babelrc: false,
    configFile: false,
    comments: false,
    compact: true,
    sourceType: "script",
    presets: [[presetEnv, {
      modules: false,
      targets: {
        ie: "11",
      },
      useBuiltIns: false,
    }]],
  });

  if (!result || typeof result.code !== "string") {
    throw new Error(`Legacy transpile failed: ${filePath}`);
  }

  fs.writeFileSync(filePath, result.code);
}

function main() {
  const rootDir = path.join(__dirname, "..");
  const viteConfigPath = path.join(rootDir, "web", "vite.release.config.js");
  const distDirPath = path.join(rootDir, "src", "web-dist");
  const distAssetsDirPath = path.join(distDirPath, "assets");
  const distIndexPath = path.join(rootDir, "src", "web-dist", "index.html");
  const viteBin = getLocalBin(rootDir, "vite");
  const distCssPath = path.join(distAssetsDirPath, "app.css");

  fs.rmSync(distDirPath, { recursive: true, force: true });
  fs.mkdirSync(distAssetsDirPath, { recursive: true });

  execFileSync(viteBin, ["build", "--config", viteConfigPath], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (!fs.existsSync(distCssPath)) {
    throw new Error(`Expected web build output missing: ${distCssPath}`);
  }

  const builtJsPath = resolveSingleBundle(distAssetsDirPath);
  const distJsPath = path.join(distAssetsDirPath, "app.js");
  if (builtJsPath !== distJsPath) {
    fs.renameSync(builtJsPath, distJsPath);
  }
  transpileLegacyBundle(distJsPath);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MarginNote Web Template</title>
    <link rel="stylesheet" href="./assets/app.css" />
    <script>
      (function () {
        function showBuildError(message) {
          var root = document.getElementById("root");
          if (!root) return;
          root.innerHTML = "<div style=\\"padding:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#b00020;white-space:pre-wrap;\\">Web panel failed to load:\\n" +
            String(message || "Unknown error").replace(/[<>&]/g, function (char) {
              return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char];
            }) +
            "</div>";
        }
        window.onerror = function (message, source, line, column, error) {
          var detail = error && error.message ? error.message : message;
          if (window.__OSTRACON_APP_MOUNTED__) {
            console.error("[Ostracon] runtime error:", detail);
            return;
          }
          showBuildError(detail);
        };
        if (window.addEventListener) {
          window.addEventListener("unhandledrejection", function (event) {
            var reason = event && event.reason;
            var detail = reason && reason.message ? reason.message : reason;
            if (window.__OSTRACON_APP_MOUNTED__) {
              console.error("[Ostracon] unhandled rejection:", detail);
              return;
            }
            showBuildError(detail);
          });
        }
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script src="./assets/app.js"></script>
  </body>
</html>
`;
  fs.writeFileSync(distIndexPath, html);

  console.log(`Web build successful: ${distIndexPath}`);
}

main();
