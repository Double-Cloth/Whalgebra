import {createReadStream, existsSync} from "node:fs";
import {stat} from "node:fs/promises";
import http from "node:http";
import {networkInterfaces} from "node:os";
import path from "node:path";
import process from "node:process";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {compressSvg, CONFIG as SVG_CONFIG} from "../cli/svg_compressor.js";
import {reverseBuild, GLOBAL_CONFIG as REVERSE_CONFIG} from "../cli/reverse_build.js";
import {PROJECT_ROOT, resolveProjectPath} from "../shared/filesystem.js";

export const SERVER_CONFIG = Object.freeze({
    DEFAULT_PORT: 8000,
    MAX_PORT_RETRIES: 100,
    DEFAULT_DIR: PROJECT_ROOT
});

const MIME_TYPES = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".ico", "image/x-icon"],
    [".ttf", "font/ttf"],
    [".otf", "font/otf"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
    [".eot", "application/vnd.ms-fontobject"],
    [".zip", "application/zip"],
    [".apk", "application/vnd.android.package-archive"],
    [".exe", "application/vnd.microsoft.portable-executable"],
    [".txt", "text/plain; charset=utf-8"]
]);

function setCommonHeaders(response) {
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
}

function sendJson(response, statusCode, body) {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
}

function sendText(response, statusCode, body) {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(body);
}

function resolveInside(baseDirectory, requestPath) {
    const relativePath = requestPath.replace(/^[/\\]+/u, "");
    const resolvedPath = path.resolve(baseDirectory, relativePath);
    const relative = path.relative(baseDirectory, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return null;
    }
    return resolvedPath;
}

function isSameOrChildDirectory(baseDirectory, targetPath) {
    const relative = path.relative(path.resolve(baseDirectory), path.resolve(targetPath));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWebToolPath(value, fallback, allowedDirectories, message) {
    const resolvedPath = resolveProjectPath(value, fallback);
    if (!allowedDirectories.some((directory) => isSameOrChildDirectory(directory, resolvedPath))) {
        const error = new Error(message);
        error.code = "PATH_NOT_ALLOWED";
        throw error;
    }
    return resolvedPath;
}

function isJsonRequest(request) {
    const contentType = request.headers["content-type"];
    return typeof contentType === "string" && contentType.toLowerCase().split(";")[0].trim() === "application/json";
}

function getRequestOrigin(request) {
    const host = request.headers.host;
    return host ? `http://${host}` : null;
}

function isAllowedApiOrigin(request) {
    const origin = request.headers.origin;
    return !origin || origin === getRequestOrigin(request);
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024 * 1024) {
            const error = new Error("请求体不能超过 1 MB。");
            error.code = "BODY_TOO_LARGE";
            throw error;
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
        const error = new Error("请求体不是有效 JSON。");
        error.code = "INVALID_JSON";
        throw error;
    }
}

async function handleToolApi(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/tools/status") {
        sendJson(response, 200, {ok: true});
        return true;
    }
    if (request.method !== "POST") {
        return false;
    }

    if (!isAllowedApiOrigin(request)) {
        sendJson(response, 403, {ok: false, code: "FORBIDDEN_ORIGIN", error: "工具 API 只允许同源页面调用。"});
        return true;
    }
    if (!isJsonRequest(request)) {
        sendJson(response, 415, {ok: false, code: "UNSUPPORTED_MEDIA_TYPE", error: "工具 API 只接受 application/json 请求。"});
        return true;
    }

    const logs = [];
    const logger = (message) => logs.push(String(message));
    const tmpDirectory = path.join(PROJECT_ROOT, "tmp");
    const reverseBuildOutputDirectories = [REVERSE_CONFIG.DEFAULT_OUTPUT_DIR, tmpDirectory];

    try {
        const body = await readJson(request);
        if (pathname === "/api/tools/reverse-build") {
            const result = await reverseBuild({
                inputFile: resolveProjectPath(body.inputFile, REVERSE_CONFIG.DEFAULT_INPUT_FILE),
                outputDir: resolveWebToolPath(
                    body.outputDir,
                    REVERSE_CONFIG.DEFAULT_OUTPUT_DIR,
                    reverseBuildOutputDirectories,
                    "Web 逆向构建只能输出到 src 或 tmp 目录。"
                ),
                noDedent: Boolean(body.noDedent),
                force: Boolean(body.force),
                logger
            });
            sendJson(response, 200, {ok: true, result, logs});
            return true;
        }

        if (pathname === "/api/tools/svg-compressor") {
            const result = await compressSvg({
                inputDir: resolveWebToolPath(body.inputDir, SVG_CONFIG.inputDir, [tmpDirectory], "Web SVG 工具路径必须位于 tmp 目录内。"),
                outputDir: resolveWebToolPath(body.outputDir, SVG_CONFIG.outputDir, [tmpDirectory], "Web SVG 工具路径必须位于 tmp 目录内。"),
                tempDir: resolveWebToolPath(body.tempDir, SVG_CONFIG.tempDir, [tmpDirectory], "Web SVG 工具路径必须位于 tmp 目录内。"),
                logger,
                colors: false
            });
            sendJson(response, 200, {ok: true, result, logs});
            return true;
        }
        return false;
    } catch (error) {
        const conflictCodes = new Set(["OUTPUT_EXISTS"]);
        const statusCode = conflictCodes.has(error.code) ? 409 : 400;
        sendJson(response, statusCode, {ok: false, code: error.code || "TOOL_ERROR", error: error.message, logs});
        return true;
    }
}

async function serveStatic(request, response, rootDirectory, pathname) {
    let filePath = resolveInside(rootDirectory, decodeURIComponent(pathname));
    if (!filePath || !existsSync(filePath)) {
        sendText(response, 404, "404 - File not found");
        return;
    }

    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
        if (!pathname.endsWith("/")) {
            response.statusCode = 301;
            response.setHeader("Location", `${pathname}/`);
            response.end();
            return;
        }
        const indexPath = path.join(filePath, "index.html");
        if (existsSync(indexPath)) {
            filePath = indexPath;
        } else {
            sendText(response, 403, "403 - Forbidden");
            return;
        }
    }

    const finalStat = await stat(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream");
    response.setHeader("Content-Length", finalStat.size);
    if (request.method === "HEAD") {
        response.end();
        return;
    }
    createReadStream(filePath).on("error", () => {
        if (!response.headersSent) {
            sendText(response, 500, "500 - Read error");
        } else {
            response.destroy();
        }
    }).pipe(response);
}

export function createRequestHandler(rootDirectory, logger = console.log) {
    return async (request, response) => {
        setCommonHeaders(response);
        const requestUrl = new URL(request.url, "http://localhost");
        logger(`[${new Date().toLocaleString()}] ${request.method} ${requestUrl.pathname}`);

        if (request.method === "OPTIONS") {
            response.statusCode = 204;
            response.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
            response.end();
            return;
        }

        try {
            if (requestUrl.pathname.startsWith("/api/tools/") && await handleToolApi(request, response, requestUrl.pathname)) {
                return;
            }
            if (request.method !== "GET" && request.method !== "HEAD") {
                sendText(response, 501, "501 - Unsupported method");
                return;
            }
            await serveStatic(request, response, rootDirectory, requestUrl.pathname);
        } catch (error) {
            if (!response.headersSent) {
                sendText(response, 400, `400 - ${error.message}`);
            } else {
                response.destroy();
            }
        }
    };
}

function listen(server, port, host) {
    return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(port, host, () => {
            server.off("error", onError);
            resolve();
        });
    });
}

export async function createServer(targetDirectory, startPort, bindAll, logger = console.log) {
    const host = bindAll ? "0.0.0.0" : "127.0.0.1";
    for (let offset = 0; offset < SERVER_CONFIG.MAX_PORT_RETRIES; offset += 1) {
        const port = startPort + offset;
        const server = http.createServer(createRequestHandler(targetDirectory, logger));
        try {
            await listen(server, port, host);
            const actualPort = server.address().port;
            return {server, port: actualPort, host};
        } catch (error) {
            server.close();
            if (error.code !== "EADDRINUSE" && error.code !== "EACCES") {
                throw error;
            }
        }
    }
    throw new Error(`无法在 ${startPort} - ${startPort + SERVER_CONFIG.MAX_PORT_RETRIES - 1} 范围内找到可用端口。`);
}

export function getLocalIp() {
    for (const interfaces of Object.values(networkInterfaces())) {
        for (const item of interfaces || []) {
            if (item.family === "IPv4" && !item.internal) {
                return item.address;
            }
        }
    }
    return "127.0.0.1";
}

function openBrowser(url) {
    const commands = {
        win32: ["cmd", ["/c", "start", "", url]],
        darwin: ["open", [url]],
        linux: ["xdg-open", [url]]
    };
    const command = commands[process.platform];
    if (!command) {
        return;
    }
    const child = spawn(command[0], command[1], {detached: true, stdio: "ignore", windowsHide: true});
    child.unref();
}

function printHelp() {
    console.log(`Node.js 静态文件服务器
支持：并发请求、禁用缓存、开发工具 API。

用法:
  node tools/server/run_server.js [选项]

选项:
  --dir <PATH>   指定服务目录（默认：项目根目录）
  --port <PORT>  指定起始端口（默认：8000）
  --lan          监听 0.0.0.0，允许局域网访问静态页面
  --local        仅监听 127.0.0.1（默认）
  --no-open      启动后不自动打开浏览器
  -h, --help     显示帮助`);
}

function parseArguments(argv) {
    const options = {directory: SERVER_CONFIG.DEFAULT_DIR, port: SERVER_CONFIG.DEFAULT_PORT, lan: false, open: true};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "-h" || argument === "--help") {
            options.help = true;
        } else if (argument === "--lan") {
            options.lan = true;
        } else if (argument === "--local") {
            options.lan = false;
        } else if (argument === "--no-open") {
            options.open = false;
        } else if (argument === "--dir" || argument === "--port") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error(`${argument} 缺少参数。`);
            }
            index += 1;
            if (argument === "--dir") {
                options.directory = path.resolve(value);
            } else {
                options.port = Number.parseInt(value, 10);
            }
        } else {
            throw new Error(`未知参数: ${argument}`);
        }
    }
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
        throw new Error("端口必须是 0 到 65535 之间的整数。");
    }
    return options;
}

async function runCli() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    if (!existsSync(options.directory)) {
        throw new Error(`目录 '${options.directory}' 不存在。`);
    }

    const {server, port} = await createServer(options.directory, options.port, options.lan);
    const localhostUrl = `http://localhost:${port}`;
    console.log("=".repeat(60));
    console.log("服务器已启动");
    console.log(`根目录: ${options.directory}`);
    console.log("-".repeat(60));
    console.log(`本机访问: ${localhostUrl}`);
    if (options.lan) {
        console.log(`局域网访问: http://${getLocalIp()}:${port}`);
    } else {
        console.log("局域网访问: 未开启（需要时使用 --lan）");
    }
    console.log("-".repeat(60));
    console.log("提示: 修改文件后刷新即生效。按 Ctrl+C 停止。");
    console.log("=".repeat(60));

    if (options.open) {
        setTimeout(() => openBrowser(localhostUrl), 500);
    }
    process.once("SIGINT", () => {
        console.log("\n正在停止服务器...");
        server.close(() => {
            console.log("服务器已关闭。");
            process.exit(0);
        });
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli().catch((error) => {
        console.error(`发生错误: ${error.message}`);
        process.exitCode = 1;
    });
}
