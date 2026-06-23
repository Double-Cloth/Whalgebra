import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {compressSvg} from "../../tools/cli/svg_compressor.js";
import {reverseBuild} from "../../tools/cli/reverse_build.js";
import {createServer} from "../../tools/server/run_server.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function temporaryDirectory(t) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "whalgebra-tools-"));
    t.after(() => rm(directory, {recursive: true, force: true}));
    return directory;
}

test("逆向构建会提取有效的内联 CSS 和 JavaScript", async (t) => {
    const directory = await temporaryDirectory(t);
    const inputFile = path.join(directory, "single.html");
    const outputDir = path.join(directory, "output");
    await writeFile(inputFile, `<!doctype html>
<html><head>
    <style id="theme" media="screen">
        body { color: red; }
    </style>
    <style id="theme">p { margin: 0; }</style>
    <script src="./external.js"></script>
    <script type="application/json">{"skip": true}</script>
    <script id="app" type="module">
        const template = '<style id="not-a-tag">.ignored { color: blue; }</style>';
        console.log("ok");
    </script>
</head><body></body></html>`, "utf8");

    const result = await reverseBuild({
        inputFile, outputDir, force: true, logger: () => {
        }
    });
    assert.equal(result.cssCount, 2);
    assert.equal(result.jsCount, 1);
    assert.deepEqual((await readdir(path.join(outputDir, "css"))).sort(), ["theme.css", "theme_1.css"]);
    assert.deepEqual(await readdir(path.join(outputDir, "js")), ["app.js"]);
    assert.equal(await readFile(path.join(outputDir, "css", "theme.css"), "utf8"), "body { color: red; }");

    const html = await readFile(path.join(outputDir, "index.html"), "utf8");
    assert.match(html, /<link rel="stylesheet" href="\.\/css\/theme\.css" media="screen">/u);
    assert.match(html, /<script src="\.\/external\.js"><\/script>/u);
    assert.match(html, /<script type="application\/json">\{"skip": true\}<\/script>/u);
    assert.match(html, /src="\.\/js\/app\.js"/u);
    assert.equal((await readFile(path.join(outputDir, "js", "app.js"), "utf8")).replaceAll("\r\n", "\n"), `const template = '<style id="not-a-tag">.ignored { color: blue; }</style>';
console.log("ok");`);
});

test("文件处理工具拒绝可能清理项目或输入数据的输出路径", async (t) => {
    const directory = await temporaryDirectory(t);
    const inputFile = path.join(directory, "inside.html");
    await writeFile(inputFile, "<style>body{}</style>", "utf8");
    await assert.rejects(
        reverseBuild({
            inputFile, outputDir: directory, force: true, logger: () => {
            }
        }),
        {code: "UNSAFE_OUTPUT"}
    );

    const inputDir = path.join(directory, "svg-input");
    await mkdir(inputDir, {recursive: true});
    await assert.rejects(
        compressSvg({
            inputDir, outputDir: inputDir, tempDir: path.join(directory, "temp"), logger: () => {
            }
        }),
        {code: "UNSAFE_OUTPUT"}
    );
});

test("SVG 工具会输出优化文件和 Base64 CSS", async (t) => {
    const directory = await temporaryDirectory(t);
    const inputDir = path.join(directory, "input");
    const outputDir = path.join(directory, "output-css");
    const tempDir = path.join(directory, "output-svg");
    await mkdir(inputDir, {recursive: true});
    await writeFile(path.join(inputDir, "9 icon.svg"), `<?xml version="1.0"?>
<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" data-name="icon">
    <!-- comment --><text x="1" y="12">A</text><path id="unused" fill="#ff0000" d="M0 0h24v24H0z"/>
</svg>`, "utf8");

    const logs = [];
    const result = await compressSvg({inputDir, outputDir, tempDir, logger: (line) => logs.push(line), colors: false});
    assert.equal(result.totalFiles, 1);
    assert.equal(result.successCount, 1);
    assert.match(logs.join("\n"), /Font detected/u);

    const optimized = await readFile(path.join(tempDir, "9 icon.svg"), "utf8");
    assert.doesNotMatch(optimized, /<\?xml|<!--|data-name=/u);
    const css = await readFile(path.join(outputDir, "icons.css"), "utf8");
    assert.match(css, /\.__9_icon_ \{/u);
    assert.match(css, /height: 5dvmin/u);
    assert.match(css, /content: url\(data:image\/svg\+xml;base64,/u);
});

test("入口、工具和测试页面共享公共 UI 资源且不包含内联实现", async () => {
    const rootHtml = await readFile(path.join(PROJECT_ROOT, "index.html"), "utf8");
    const reverseHtml = await readFile(path.join(PROJECT_ROOT, "tools", "web", "reverse_build.html"), "utf8");
    const svgHtml = await readFile(path.join(PROJECT_ROOT, "tools", "web", "svg_compressor.html"), "utf8");
    const testHtml = await readFile(path.join(PROJECT_ROOT, "test", "web", "index.html"), "utf8");
    const packageJson = JSON.parse(await readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"));
    const sharedCss = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "styles", "shared.css"), "utf8");
    const sharedJs = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "scripts", "shared.js"), "utf8");
    const toolCss = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "styles", "tool-page.css"), "utf8");
    const testCss = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "styles", "test-console.css"), "utf8");
    const jsonTreeJs = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "scripts", "json_tree.js"), "utf8");
    const logConsoleJs = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "scripts", "log_console.js"), "utf8");
    const testConsoleJs = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "scripts", "test_console.js"), "utf8");
    const svgToolJs = await readFile(path.join(PROJECT_ROOT, "tools", "cli", "svg_compressor.js"), "utf8");
    const toolJs = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "scripts", "tool_form.js"), "utf8");

    assert.match(rootHtml, /href="\.\/test\/web\/index\.html" data-server-only/u);
    assert.match(rootHtml, /href="\.\/tools\/web\/reverse_build\.html" data-server-only/u);
    assert.match(rootHtml, /href="\.\/tools\/web\/svg_compressor\.html" data-server-only/u);
    assert.match(rootHtml, /href="\.\/assets\/ui\/styles\/shared\.css"/u);
    assert.match(rootHtml, /src="\.\/assets\/ui\/scripts\/shared\.js"/u);
    assert.match(reverseHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/tool-page\.css"/u);
    assert.match(reverseHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/tool_form\.js"/u);
    assert.match(reverseHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/shared\.css"/u);
    assert.match(reverseHtml, /data-endpoint="\/api\/tools\/reverse-build"/u);
    assert.match(reverseHtml, /<input name="force" type="checkbox" checked>/u);
    assert.doesNotMatch(reverseHtml, /\/api\/tools\/svg-compressor/u);
    assert.match(svgHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/tool-page\.css"/u);
    assert.match(svgHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/tool_form\.js"/u);
    assert.match(svgHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/shared\.css"/u);
    assert.match(svgHtml, /data-endpoint="\/api\/tools\/svg-compressor"/u);
    assert.doesNotMatch(svgHtml, /\/api\/tools\/reverse-build/u);
    assert.match(testHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/shared\.css"/u);
    assert.match(testHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/test-console\.css"/u);
    assert.match(testHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/json_tree\.js"/u);
    assert.match(testHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/log_console\.js"/u);
    assert.match(testHtml, /src="\.\.\/browser\/test_logic\.js"/u);
    assert.match(testHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/test_console\.js"/u);
    assert.match(testHtml, /src="\.\.\/\.\.\/dist\/Whalgebra\.html"/u);
    assert.match(sharedCss, /\.ambient-background/u);
    assert.match(sharedCss, /\.glass-panel/u);
    assert.match(sharedCss, /\.button--primary/u);
    assert.match(sharedJs, /\[data-server-only\]/u);
    assert.match(toolCss, /\.tool-form/u);
    assert.match(testCss, /\.console-panel/u);
    assert.match(jsonTreeJs, /WhalgebraUI\.JsonTree/u);
    assert.match(logConsoleJs, /createLogConsole/u);
    assert.match(testConsoleJs, /createLogConsole/u);
    assert.match(svgToolJs, /assets\/lib\/svgo\.browser\.js/u);
    assert.equal(packageJson.dependencies?.svgo, undefined);
    assert.equal(packageJson.devDependencies?.svgo, undefined);
    assert.match(toolJs, /\/api\/tools\/status/u);
    assert.doesNotMatch(rootHtml + reverseHtml + svgHtml + testHtml, /<style\b|\sstyle=|\sonclick=/u);
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "tools", "index.html"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "test", "index.html"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "tools", "web", "css", "tools.css"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "tools", "web", "js", "tool_ui.js"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "test", "css", "test_console.css"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "test", "js", "test_console.js"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "assets", "ui", "shared.css"), "utf8"), {code: "ENOENT"});
    await assert.rejects(readFile(path.join(PROJECT_ROOT, "assets", "ui", "shared.js"), "utf8"), {code: "ENOENT"});
});

test("浏览器测试逻辑通过参数接收计算核心 iframe", async () => {
    const source = await readFile(path.join(PROJECT_ROOT, "test", "browser", "test_logic.js"), "utf8");
    const context = vm.createContext({console, document: {getElementById: () => null}});
    vm.runInContext(`${source}\nglobalThis.testFunction = test;`, context);

    await assert.rejects(
        context.testFunction(0, {contentWindow: null}),
        /计算核心尚未加载/u
    );
});

test("静态服务器提供禁用缓存、CORS 和 OPTIONS", async (t) => {
    const directory = await temporaryDirectory(t);
    await writeFile(path.join(directory, "index.html"), "server-ok", "utf8");
    await writeFile(path.join(directory, "font.ttf"), "font-ok", "utf8");
    const {server, port} = await createServer(directory, 0, false, () => {
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await response.text(), "server-ok");
    assert.equal(response.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
    assert.equal(response.headers.get("access-control-allow-origin"), "*");

    const options = await fetch(`http://127.0.0.1:${port}/anything`, {method: "OPTIONS"});
    assert.equal(options.status, 200);
    assert.equal(options.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");

    const font = await fetch(`http://127.0.0.1:${port}/font.ttf`);
    assert.equal(font.headers.get("content-type"), "font/ttf");
});
