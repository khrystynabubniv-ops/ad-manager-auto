import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const outDir = path.join(root, "dist/ui");
const assetsDir = path.join(outDir, "assets");
const htmlPath = path.join(root, "src/ui/index.html");

await rm(outDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/ui/main.tsx")],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  outdir: assetsDir,
  entryNames: "index",
  assetNames: "[name]-[hash]",
  define: {
    "process.env.NODE_ENV": '"production"'
  },
  loader: {
    ".css": "css",
    ".svg": "file",
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".webp": "file",
    ".gif": "file"
  }
});

let html = await readFile(htmlPath, "utf8");
const cssTag = await exists(path.join(assetsDir, "index.css"))
  ? '    <link rel="stylesheet" href="/assets/index.css" />\n'
  : "";

html = html
  .replace("</head>", `${cssTag}  </head>`)
  .replace(
    '    <script src="/config.js"></script>\n    <script type="module" src="/main.tsx"></script>',
    '    <script src="/config.js"></script>\n    <script type="module" src="/assets/index.js"></script>'
  );

await writeFile(path.join(outDir, "index.html"), html);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
