import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {EOL} from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import {fileURLToPath} from "node:url";

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const GLOBAL_CONFIG = Object.freeze({
    DEFAULT_INPUT_FILE: path.join(PROJECT_ROOT, "dist", "Whalgebra.html"),
    DEFAULT_OUTPUT_DIR: path.join(PROJECT_ROOT, "src"),
    ENCODING: "utf8",
    CSS_DIR_NAME: "css",
    JS_DIR_NAME: "js"
});

export function calculateHash(content) {
    return createHash("md5").update(content, GLOBAL_CONFIG.ENCODING).digest("hex").slice(0, 8);
}

function commonWhitespacePrefix(values) {
    if (values.length === 0) {
        return "";
    }

    let prefix = values[0];
    for (const value of values.slice(1)) {
        let index = 0;
        while (index < prefix.length && index < value.length && prefix[index] === value[index]) {
            index += 1;
        }
        prefix = prefix.slice(0, index);
        if (!prefix) {
            break;
        }
    }
    return prefix;
}

export function dedent(content) {
    const lines = content.replace(/\r\n?/g, "\n").split("\n");
    const indents = lines
        .filter((line) => /\S/.test(line))
        .map((line) => line.match(/^[\t ]*/u)[0]);
    const prefix = commonWhitespacePrefix(indents);
    return lines.map((line) => line.startsWith(prefix) ? line.slice(prefix.length) : line).join("\n");
}

function nativeNewlines(content) {
    return content.replace(/\r\n?|\n/gu, EOL);
}

function getAttribute(attributes, name) {
    const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`, "iu");
    const match = attributes.match(pattern);
    return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function removeAttribute(attributes, name) {
    const pattern = new RegExp(`\\s+${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\\x60]+)`, "igu");
    return attributes.replace(pattern, "");
}

function escapeAttribute(value) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function isSameOrAncestor(candidate, target) {
    const relative = path.relative(candidate, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function uniqueFilepath(directory, filename) {
    const extension = path.extname(filename);
    const name = path.basename(filename, extension);
    let candidate = path.join(directory, filename);
    let counter = 1;

    while (existsSync(candidate)) {
        candidate = path.join(directory, `${name}_${counter}${extension}`);
        counter += 1;
    }
    return candidate;
}

async function extractTagType(html, tagName, outputDirectory, extension, doDedent, logger) {
    const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}\\s*>`, "giu");
    const matches = [...html.matchAll(pattern)];
    const protectedPatterns = [/<!--[\s\S]*?-->/gu];
    if (tagName === "style") {
        protectedPatterns.push(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu);
    }
    const protectedRanges = protectedPatterns.flatMap((protectedPattern) => [...html.matchAll(protectedPattern)]
        .map((match) => [match.index, match.index + match[0].length]));
    let result = "";
    let cursor = 0;
    let count = 0;

    for (const match of matches) {
        const [fullTag, attributes, rawContent] = match;
        const start = match.index;
        result += html.slice(cursor, start);
        cursor = start + fullTag.length;

        if (protectedRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && start < rangeEnd)) {
            result += fullTag;
            continue;
        }

        if (tagName === "script" && getAttribute(attributes, "src")) {
            result += fullTag;
            continue;
        }

        let content = doDedent ? dedent(rawContent).trim() : rawContent.trim();
        if (!content) {
            result += fullTag;
            continue;
        }

        if (tagName === "script") {
            const scriptType = (getAttribute(attributes, "type") ?? "").toLowerCase();
            const validTypes = new Set(["", "text/javascript", "application/javascript", "module"]);
            if (!validTypes.has(scriptType)) {
                result += fullTag;
                continue;
            }
        }

        const tagId = getAttribute(attributes, "id");
        const filename = tagId ? `${tagId}${extension}` : `extracted_${calculateHash(content)}${extension}`;
        const filePath = await uniqueFilepath(outputDirectory, filename);

        try {
            await writeFile(filePath, nativeNewlines(content), GLOBAL_CONFIG.ENCODING);
        } catch (error) {
            logger(`  [Error] Writing ${path.basename(filePath)}: ${error.message}`);
            result += fullTag;
            continue;
        }

        const relativePath = `./${path.basename(outputDirectory)}/${path.basename(filePath)}`;
        if (tagName === "style") {
            const media = getAttribute(attributes, "media");
            const mediaAttribute = media === null ? "" : ` media="${escapeAttribute(media)}"`;
            result += `<link rel="stylesheet" href="${relativePath}"${mediaAttribute}>`;
            logger(`  [CSS] Extracted -> ${path.basename(outputDirectory)}/${path.basename(filePath)}`);
        } else {
            const cleanAttributes = removeAttribute(attributes, "src").trimEnd();
            const separator = cleanAttributes ? " " : "";
            result += `<script${cleanAttributes}${separator} src="${relativePath}"></script>`;
            logger(`  [JS]  Extracted -> ${path.basename(outputDirectory)}/${path.basename(filePath)}`);
        }
        count += 1;
    }

    result += html.slice(cursor);
    return {html: result, count};
}

export async function reverseBuild({
                                       inputFile = GLOBAL_CONFIG.DEFAULT_INPUT_FILE,
                                       outputDir = GLOBAL_CONFIG.DEFAULT_OUTPUT_DIR,
                                       noDedent = false,
                                       force = false,
                                       logger = console.log
                                   } = {}) {
    const inputPath = path.resolve(inputFile);
    const outputPath = path.resolve(outputDir || path.join(process.cwd(), `split_files_of_${path.parse(inputPath).name}`));

    if (!existsSync(inputPath)) {
        const error = new Error(`Input file '${inputPath}' not found.`);
        error.code = "INPUT_NOT_FOUND";
        throw error;
    }
    if (outputPath === path.parse(outputPath).root || isSameOrAncestor(outputPath, PROJECT_ROOT) || isSameOrAncestor(outputPath, inputPath)) {
        const error = new Error("输出目录不能是磁盘/项目根目录，也不能包含输入文件。");
        error.code = "UNSAFE_OUTPUT";
        throw error;
    }
    if (existsSync(outputPath) && !force) {
        const error = new Error(`目标文件夹已存在: ${outputPath}`);
        error.code = "OUTPUT_EXISTS";
        throw error;
    }

    if (existsSync(outputPath)) {
        logger(`Cleaning existing directory: ${outputPath}`);
        await rm(outputPath, {recursive: true, force: true});
    }

    const cssDirectory = path.join(outputPath, GLOBAL_CONFIG.CSS_DIR_NAME);
    const jsDirectory = path.join(outputPath, GLOBAL_CONFIG.JS_DIR_NAME);
    await mkdir(cssDirectory, {recursive: true});
    await mkdir(jsDirectory, {recursive: true});

    logger(`Processing: ${path.basename(inputPath)}`);
    logger(`Output to: ${outputPath}`);
    logger("-".repeat(40));

    const source = await readFile(inputPath, GLOBAL_CONFIG.ENCODING);
    const cssResult = await extractTagType(source, "style", cssDirectory, ".css", !noDedent, logger);
    const jsResult = await extractTagType(cssResult.html, "script", jsDirectory, ".js", !noDedent, logger);
    const outputHtmlPath = path.join(outputPath, "index.html");

    await writeFile(path.join(outputPath, ".nojekyll"), "", GLOBAL_CONFIG.ENCODING);
    await writeFile(outputHtmlPath, jsResult.html, GLOBAL_CONFIG.ENCODING);

    logger("-".repeat(40));
    logger("Success! Process completed.");
    logger(`  - Input:  ${inputPath}`);
    logger(`  - Output: ${outputHtmlPath}`);
    logger(`  - Stats:  ${cssResult.count} CSS files, ${jsResult.count} JS files extracted.`);

    return {
        inputPath,
        outputPath,
        outputHtmlPath,
        cssCount: cssResult.count,
        jsCount: jsResult.count
    };
}

function printHelp() {
    console.log(`将 HTML 文件中的内联 CSS (<style>) 和 JS (<script>) 提取为独立文件。
自动更新 HTML 中的引用链接，并生成输出文件夹。

用法:
  node tools/cli/reverse_build.js [input_file] [选项]

选项:
  -o, --out <PATH>  指定输出文件夹
  --no-dedent       禁用智能去缩进
  -f, --force       强制清空目标文件夹，跳过确认提示
  -h, --help        显示帮助

默认配置:
  Input File: dist/Whalgebra.html
  Output Dir: src`);
}

function parseArguments(argv) {
    const result = {inputFile: GLOBAL_CONFIG.DEFAULT_INPUT_FILE, outputDir: GLOBAL_CONFIG.DEFAULT_OUTPUT_DIR, noDedent: false, force: false};
    let hasInput = false;

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "-h" || argument === "--help") {
            result.help = true;
        } else if (argument === "-f" || argument === "--force") {
            result.force = true;
        } else if (argument === "--no-dedent") {
            result.noDedent = true;
        } else if (argument === "-o" || argument === "--out") {
            index += 1;
            if (!argv[index]) {
                throw new Error(`${argument} 缺少路径参数。`);
            }
            result.outputDir = path.resolve(argv[index]);
        } else if (argument.startsWith("-")) {
            throw new Error(`未知参数: ${argument}`);
        } else if (!hasInput) {
            result.inputFile = path.resolve(argument);
            hasInput = true;
        } else {
            throw new Error(`多余参数: ${argument}`);
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

    if (existsSync(options.outputDir) && !options.force) {
        const prompt = readline.createInterface({input: process.stdin, output: process.stdout});
        const answer = (await prompt.question(`\n[Warning] 目标文件夹已存在: ${options.outputDir}\n是否清空该目录并继续? [y/N]: `)).trim().toLowerCase();
        prompt.close();
        if (answer !== "y") {
            console.log("操作已取消。");
            return;
        }
        options.force = true;
    }

    await reverseBuild(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli().catch((error) => {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    });
}
