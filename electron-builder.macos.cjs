const { readFileSync } = require("node:fs");
const path = require("node:path");

const packageJsonPath = path.join(__dirname, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const baseConfig = packageJson.build || {};

const files = Array.from(
  new Set([
    ...(baseConfig.files || []),
    "desktop/macos-platform.cjs",
    "desktop/data-selection.cjs",
    "desktop/desktop-paths.cjs",
  ]),
);

const macosConfig = {
  ...baseConfig,
  appId: baseConfig.appId || "com.contentflow.app",
  productName: baseConfig.productName || "ContentFlow",
  publish: null,
  files,
  mac: {
    target: [
      {
        target: "dir",
        arch: ["arm64"],
      },
    ],
    category: "public.app-category.productivity",
    identity: "-",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,
    icon: "build/icon.png",
    artifactName: "ContentFlow-V1-${version}-${arch}.${ext}",
  },
};

delete macosConfig.win;
delete macosConfig.nsis;
delete macosConfig.portable;

module.exports = macosConfig;
