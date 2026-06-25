import {existsSync} from "node:fs";
import {mkdir, readdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {optimize} from "../../assets/lib/svgo.browser.js";
import {assertSafeOutputPaths, nativeNewlines, PROJECT_ROOT} from "../shared/filesystem.js";

export {PROJECT_ROOT};

export const CONFIG = Object.freeze({
    inputDir: path.join(PROJECT_ROOT, "tmp", "input"),
    outputDir: path.join(PROJECT_ROOT, "tmp", "output-css"),
    tempDir: path.join(PROJECT_ROOT, "tmp", "output-svg"),
    outputCssName: "icons.css",
    defaultHeight: "5dvmin"
});

const ANSI = Object.freeze({
    cyan: "\u001b[96m",
    green: "\u001b[92m",
    yellow: "\u001b[93m",
    red: "\u001b[91m",
    grey: "\u001b[90m",
    bold: "\u001b[1m",
    reset: "\u001b[0m"
});

function colorize(text, color, enabled) {
    return enabled ? `${color}${text}${ANSI.reset}` : text;
}

function formatBytes(size) {
    const labels = ["B", "KB", "MB", "GB", "TB"];
    let value = size;
    let index = 0;
    while (value > 1024 && index < labels.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(1)}${labels[index]}`;
}

function sanitizeCssClassname(filename) {
    let cleanName = path.parse(filename).name.replace(/[^a-zA-Z0-9_-]/gu, "_");
    if (/^\d/u.test(cleanName)) {
        cleanName = `_${cleanName}`;
    }
    return `._${cleanName}_`;
}

function formatPath(targetPath) {
    return path.relative(process.cwd(), targetPath).replaceAll(path.sep, "/") || ".";
}

export function optimizeSvg(source) {
    const normalizedSource = source
        .replace(/\s+data-name=(["']).*?\1/gu, "")
        .replace(/\s+id=["']_图层_\d+["']/gu, "");

    return optimize(normalizedSource, {
        multipass: true,
        js2svg: {pretty: false},
        plugins: [
            {
                name: "preset-default"
            },
            "removeDimensions"
        ]
    }).data;
}

export async function compressSvg({
                                      inputDir = CONFIG.inputDir,
                                      outputDir = CONFIG.outputDir,
                                      tempDir = CONFIG.tempDir,
                                      outputCssName = CONFIG.outputCssName,
                                      defaultHeight = CONFIG.defaultHeight,
                                      logger = console.log,
                                      colors = process.stdout.isTTY
                                  } = {}) {
    const inputPath = path.resolve(inputDir);
    const [outputPath, tempPath] = assertSafeOutputPaths([outputDir, tempDir], {
        inputPath,
        disallowOverlapping: true,
        message: "输出目录不能包含输入目录、项目根目录或彼此嵌套。"
    });

    if (!existsSync(inputPath)) {
        await mkdir(inputPath, {recursive: true});
        const error = new Error(`未找到输入目录，已自动创建: ${formatPath(inputPath)}`);
        error.code = "INPUT_CREATED";
        throw error;
    }

    await rm(outputPath, {recursive: true, force: true});
    await rm(tempPath, {recursive: true, force: true});
    await mkdir(outputPath, {recursive: true});
    await mkdir(tempPath, {recursive: true});

    const inputFiles = (await readdir(inputPath, {withFileTypes: true}))
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".svg")
        .map((entry) => entry.name);

    if (inputFiles.length === 0) {
        logger(`[WARN] 目录为空: ${formatPath(inputPath)}`);
        return {inputPath, outputPath, tempPath, totalFiles: 0, successCount: 0};
    }

    logger("");
    logger(colorize("== SVG OPTIMIZER ENGINE ==", ANSI.cyan, colors));
    logger(`Input Dir       : ${formatPath(inputPath)}`);
    logger(`Target Files    : ${inputFiles.length} SVG(s)`);
    logger("-".repeat(60));

    const startTime = performance.now();
    const cssRules = [];
    let successCount = 0;
    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;

    for (const [index, filename] of inputFiles.entries()) {
        const filePath = path.join(inputPath, filename);
        const originalSize = (await stat(filePath)).size;
        totalOriginalSize += originalSize;

        try {
            const source = await readFile(filePath, "utf8");
            const optimizedSvg = optimizeSvg(source);
            if (!optimizedSvg) {
                throw new Error("优化结果为空");
            }

            const optimizedSize = Buffer.byteLength(optimizedSvg, "utf8");
            totalOptimizedSize += optimizedSize;
            const savingsPercent = originalSize > 0 ? ((originalSize - optimizedSize) / originalSize) * 100 : 0;
            logger(`${String(index + 1).padEnd(4)} DONE     ${filename.slice(0, 24).padEnd(25)} ${formatBytes(originalSize)} -> ${formatBytes(optimizedSize)} (v${savingsPercent.toFixed(0)}%)`);

            if (/<(text|tspan|textPath|flowRoot)\b/iu.test(source)) {
                logger(colorize("     [WARN] Font detected (<text>). Please convert to outlines.", ANSI.yellow, colors));
            }

            await writeFile(path.join(tempPath, filename), nativeNewlines(optimizedSvg), "utf8");
            const base64 = Buffer.from(optimizedSvg, "utf8").toString("base64");
            cssRules.push(`${sanitizeCssClassname(filename)} {\n    height: ${defaultHeight};\n    content: url(data:image/svg+xml;base64,${base64});\n}`);
            successCount += 1;
        } catch (error) {
            logger(colorize(`${String(index + 1).padEnd(4)} FAIL     ${filename.slice(0, 24).padEnd(25)} ${error.message}`, ANSI.red, colors));
        }
    }

    logger("-".repeat(60));
    if (cssRules.length === 0) {
        const error = new Error("No valid SVG content processed.");
        error.code = "NO_VALID_SVG";
        throw error;
    }

    const outputFile = path.join(outputPath, outputCssName);
    const header = "/* Generated by svg_compressor */\n/* Icons Base64 Data */\n\n";
    await writeFile(outputFile, nativeNewlines(header + cssRules.join("\n\n")), "utf8");

    const duration = (performance.now() - startTime) / 1000;
    const totalSaved = totalOriginalSize - totalOptimizedSize;
    const totalSavedPercent = totalOriginalSize > 0 ? (totalSaved / totalOriginalSize) * 100 : 0;
    logger("");
    logger(colorize("== BUILD SUCCESSFUL ==", ANSI.green, colors));
    logger(`Time            : ${duration.toFixed(2)}s`);
    logger(`Status          : ${successCount}/${inputFiles.length} files processed`);
    logger(`Total Size      : ${formatBytes(totalOriginalSize)} -> ${formatBytes(totalOptimizedSize)}`);
    logger(`Saved           : ${formatBytes(totalSaved)} (-${totalSavedPercent.toFixed(1)}%)`);
    logger(`Output          : ${formatPath(outputFile)}`);
    logger(`Temp Dir        : ${formatPath(tempPath)}`);

    return {
        inputPath,
        outputPath,
        tempPath,
        outputFile,
        totalFiles: inputFiles.length,
        successCount,
        totalOriginalSize,
        totalOptimizedSize
    };
}

function printHelp() {
    console.log(`SVG 压缩与 CSS 生成工具

用法:
  node tools/cli/svg_compressor.js [选项]

选项:
  -i, --input <PATH>  指定输入文件夹路径
  --output <PATH>     指定 CSS 输出文件夹
  --temp <PATH>       指定优化后 SVG 输出文件夹
  -h, --help          显示帮助`);
}

function parseArguments(argv) {
    const result = {inputDir: CONFIG.inputDir, outputDir: CONFIG.outputDir, tempDir: CONFIG.tempDir};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "-h" || argument === "--help") {
            result.help = true;
        } else if (["-i", "--input", "--output", "--temp"].includes(argument)) {
            const value = argv[index + 1];
            if (!value) {
                throw new Error(`${argument} 缺少路径参数。`);
            }
            index += 1;
            if (argument === "-i" || argument === "--input") {
                result.inputDir = path.resolve(value);
            }
            if (argument === "--output") {
                result.outputDir = path.resolve(value);
            }
            if (argument === "--temp") {
                result.tempDir = path.resolve(value);
            }
        } else {
            throw new Error(`未知参数: ${argument}`);
        }
    }
    return result;
}

async function runCli() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    await compressSvg(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli().catch((error) => {
        console.error(`[ERROR] ${error.message}`);
        if (error.code === "INPUT_CREATED") {
            console.error("[INFO] 操作指南: 请将 SVG 文件放入输入文件夹后重新运行本工具。");
        }
        process.exitCode = 1;
    });
}
