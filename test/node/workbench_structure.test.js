import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import {PROJECT_ROOT} from "./helpers/temp_directory.js";

function entryLabels(entries) {
    return entries
        .map((entry) => `${entry.isDirectory() ? "dir" : "file"}:${entry.name}`)
        .sort();
}

function browserTestLogicUrl() {
    return pathToFileURL(path.join(PROJECT_ROOT, "test", "browser", "test_logic.js")).href;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertElementWithAttributes(html, tagName, attributes) {
    const assertions = attributes.map((attribute) => {
        if (typeof attribute === "string") {
            return `(?=[^>]*\\b${escapeRegex(attribute)}\\b)`;
        }
        const [name, value] = attribute;
        return `(?=[^>]*\\b${escapeRegex(name)}="${escapeRegex(value)}")`;
    }).join("");
    assert.match(html, new RegExp(`<${tagName}\\b${assertions}[^>]*>`, "u"));
}

function assertServerOnlyLink(html, href) {
    assertElementWithAttributes(html, "a", [["href", href], "data-server-only"]);
}

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

    assertServerOnlyLink(rootHtml, "./test/web/index.html");
    assertServerOnlyLink(rootHtml, "./tools/web/reverse_build.html");
    assertServerOnlyLink(rootHtml, "./tools/web/svg_compressor.html");
    assert.match(rootHtml, /href="\.\/assets\/ui\/styles\/shared\.css"/u);
    assert.match(rootHtml, /src="\.\/assets\/ui\/scripts\/shared\.js"/u);
    assert.match(reverseHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/tool-page\.css"/u);
    assert.match(reverseHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/tool_form\.js"/u);
    assert.match(reverseHtml, /href="\.\.\/\.\.\/assets\/ui\/styles\/shared\.css"/u);
    assert.match(reverseHtml, /data-endpoint="\/api\/tools\/reverse-build"/u);
    assertElementWithAttributes(reverseHtml, "input", [["name", "force"], ["type", "checkbox"], "checked"]);
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
    assert.doesNotMatch(testHtml, /src="\.\.\/browser\/test_logic\.js"/u);
    assert.match(testHtml, /src="\.\.\/\.\.\/assets\/ui\/scripts\/test_console\.js" type="module"/u);
    assert.match(testHtml, /src="\.\.\/\.\.\/dist\/Whalgebra\.html"/u);
    assert.match(testHtml, /data-action="cancel"/u);
    assert.match(testHtml, /data-run-status/u);
    assert.match(testHtml, /<header class="console-header">[\s\S]*data-run-status[\s\S]*data-action="auto-scroll"/u);
    assert.match(sharedCss, /\.ambient-background/u);
    assert.match(sharedCss, /\.glass-panel/u);
    assert.match(sharedCss, /\.button--primary/u);
    assert.match(sharedJs, /\[data-server-only\]/u);
    assert.match(toolCss, /\.tool-form/u);
    assert.match(testCss, /\.console-panel/u);
    assert.match(testCss, /\.run-spinner/u);
    assert.match(testCss, /@keyframes test-spin/u);
    assert.match(jsonTreeJs, /WhalgebraUI\.JsonTree/u);
    assert.match(logConsoleJs, /createLogConsole/u);
    assert.match(testConsoleJs, /createLogConsole/u);
    assert.match(testConsoleJs, /AbortController/u);
    assert.match(testConsoleJs, /controller\.abort/u);
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

test("src 和 dist 目录结构保持原样", async () => {
    assert.deepEqual(
        entryLabels(await readdir(path.join(PROJECT_ROOT, "src"), {withFileTypes: true})),
        ["dir:css", "dir:js", "file:.nojekyll", "file:index.html"]
    );
    assert.deepEqual(
        entryLabels(await readdir(path.join(PROJECT_ROOT, "src", "css"), {withFileTypes: true})),
        ["file:fonts_and_images.css", "file:style.css"]
    );
    assert.deepEqual(
        entryLabels(await readdir(path.join(PROJECT_ROOT, "src", "js"), {withFileTypes: true})),
        [
            "file:asynchronous_logic.js",
            "file:core_computational_logic.js",
            "file:init.js",
            "file:shared_code_and_configuration.js",
            "file:ui_styling_control.js"
        ]
    );

    const distEntries = await readdir(path.join(PROJECT_ROOT, "dist"), {withFileTypes: true});
    assert.equal(distEntries.some((entry) => entry.isDirectory()), false);
    assert.ok(distEntries.some((entry) => entry.isFile() && entry.name === "Whalgebra.html"));
    assert.ok(distEntries.some((entry) => entry.isFile() && entry.name === "whalgebra-v3.1.1.apk"));
    assert.ok(distEntries.some((entry) => entry.isFile() && entry.name === "whalgebra-v3.1.1-win-x64.exe"));
});

test("浏览器测试逻辑通过参数接收计算核心 iframe", async () => {
    const {test: runBrowserTest} = await import(browserTestLogicUrl());

    await assert.rejects(
        runBrowserTest(0, {contentWindow: null}),
        /计算核心尚未加载/u
    );
});

test("浏览器测试集编号和描述与 cases 清单、测试 UI 保持一致", async () => {
    const source = await readFile(path.join(PROJECT_ROOT, "test", "browser", "test_logic.js"), "utf8");
    const suitesJson = await readFile(path.join(PROJECT_ROOT, "test", "cases", "test_suites.json"), "utf8");
    const testHtml = await readFile(path.join(PROJECT_ROOT, "test", "web", "index.html"), "utf8");
    const testConsoleJs = await readFile(path.join(PROJECT_ROOT, "assets", "ui", "scripts", "test_console.js"), "utf8");
    const suites = JSON.parse(suitesJson);

    assert.doesNotMatch(source, /const WhalgebraTestSuites = Object\.freeze\(\[/u);
    assert.match(source, /const TEST_SUITES_URL = "\.\.\/cases\/test_suites\.json"/u);
    assert.match(testConsoleJs, /import \{loadWhalgebraTestSuites, test\} from "\.\.\/\.\.\/\.\.\/test\/browser\/test_logic\.js"/u);
    assert.deepEqual(suites.map((suite) => suite.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (const suite of suites) {
        assert.match(testHtml, new RegExp(`data-test-mode="${suite.id}"`, "u"));
        assert.match(testHtml, new RegExp(`${suite.id}\\. ${suite.title}`, "u"));
        assert.match(testHtml, new RegExp(suite.description, "u"));
    }
});

test("浏览器测试逻辑可以从 JSON 解析并分配 CalcConfig", async () => {
    const {assignCalcConfigFromJson, parseCalcConfigFromJson} = await import(browserTestLogicUrl());

    assert.deepEqual(
        JSON.parse(JSON.stringify(parseCalcConfigFromJson())),
        {
            globalCalcAccuracy: 220,
            outputAccuracy: 0.9,
            globalPrintMode: "algebra"
        }
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(parseCalcConfigFromJson(
            {calcConfig: {globalCalcAccuracy: 120, outputAccuracy: 16, globalPrintMode: "science"}},
            {calcAcc: 60, outputAcc: 8, printMode: "algebra"}
        ))),
        {
            globalCalcAccuracy: 60,
            outputAccuracy: 8,
            globalPrintMode: "algebra"
        }
    );

    const win = {
        CalcConfig: {
            globalCalcAccuracy: 1,
            outputAccuracy: 2,
            globalPrintMode: "old"
        }
    };
    assignCalcConfigFromJson(win, {calcConfig: {globalCalcAccuracy: 80}}, {outputAcc: 12});
    assert.deepEqual(win.CalcConfig, {
        globalCalcAccuracy: 80,
        outputAccuracy: 12,
        globalPrintMode: "algebra"
    });
});

test("浏览器测试逻辑支持取消信号", async () => {
    const {test: runBrowserTest} = await import(browserTestLogicUrl());

    const controller = new AbortController();
    controller.abort();
    const frame = {
        contentWindow: {
            CalcConfig: {
                globalCalcAccuracy: 30,
                outputAccuracy: 10,
                globalPrintMode: "algebra"
            },
            ComplexNumber: class {
                constructor(value) {
                    this.value = value;
                }

                toString() {
                    return String(this.value);
                }
            },
            MathPlus: {
                fact: () => ({toString: () => "fact"}),
                pow: () => ({toString: () => "pow"})
            }
        }
    };

    await assert.rejects(
        runBrowserTest(9, frame, {signal: controller.signal}),
        {name: "AbortError"}
    );
});
