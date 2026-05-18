import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const outDir = path.join(root, "dist/ui");
const assetsDir = path.join(outDir, "assets");
const htmlPath = path.join(root, "src/ui/index.html");

await rm(outDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, "src/ui/main.tsx")],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  outdir: assetsDir,
  entryNames: "index-[hash]",
  assetNames: "[name]-[hash]",
  metafile: true,
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
const entryOutput = Object.entries(result.metafile.outputs).find(([, output]) => output.entryPoint);

if (!entryOutput) {
  throw new Error("UI build did not produce an entry bundle");
}

const [jsOutputPath, jsOutput] = entryOutput;
const scriptPath = publicPath(jsOutputPath);
const cssPath = jsOutput.cssBundle ? publicPath(jsOutput.cssBundle) : null;
const cssTag = cssPath ? `    <link rel="stylesheet" href="${cssPath}" />\n` : "";

html = html
  .replace("</head>", `${cssTag}  </head>`)
  .replace(
    '    <script src="/config.js"></script>\n    <script type="module" src="/main.tsx"></script>',
    `    <script src="/config.js"></script>\n    <script type="module" src="${scriptPath}"></script>`
  );

await writeFile(path.join(outDir, "index.html"), html);

function publicPath(outputPath) {
  const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(root, outputPath);
  return `/${path.relative(outDir, absolutePath).split(path.sep).join("/")}`;
}
