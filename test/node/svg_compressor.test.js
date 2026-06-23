import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {compressSvg} from "../../tools/cli/svg_compressor.js";
import {temporaryDirectory} from "./helpers/temp_directory.js";

test("SVG 工具拒绝可能清理输入数据的输出路径", async (t) => {
    const directory = await temporaryDirectory(t);
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
