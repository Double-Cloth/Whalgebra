import assert from "node:assert/strict";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {createServer} from "../../tools/server/run_server.js";
import {PROJECT_ROOT, temporaryDirectory} from "./helpers/temp_directory.js";

async function projectTemporaryDirectory(t, prefix) {
    const tmpRoot = path.join(PROJECT_ROOT, "tmp");
    await mkdir(tmpRoot, {recursive: true});
    const directory = await mkdtemp(path.join(tmpRoot, prefix));
    t.after(() => rm(directory, {recursive: true, force: true}));
    return directory;
}

function postJson(url, body, headers = {}) {
    return fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json", ...headers},
        body: JSON.stringify(body)
    });
}

test("静态服务器默认仅本机监听并提供安全响应头", async (t) => {
    const directory = await temporaryDirectory(t);
    await mkdir(path.join(directory, "empty"), {recursive: true});
    await writeFile(path.join(directory, "index.html"), "server-ok", "utf8");
    await writeFile(path.join(directory, "font.ttf"), "font-ok", "utf8");
    const {server, port} = await createServer(directory, 0, false, () => {
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    assert.equal(server.address().address, "127.0.0.1");

    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await response.text(), "server-ok");
    assert.equal(response.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "same-origin");

    const options = await fetch(`http://127.0.0.1:${port}/anything`, {method: "OPTIONS"});
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("allow"), "GET, HEAD, POST, OPTIONS");

    const font = await fetch(`http://127.0.0.1:${port}/font.ttf`);
    assert.equal(font.headers.get("content-type"), "font/ttf");

    const directoryListing = await fetch(`http://127.0.0.1:${port}/empty/`);
    assert.equal(directoryListing.status, 403);
    assert.doesNotMatch(await directoryListing.text(), /Directory listing/u);
});

test("工具状态接口不暴露项目绝对路径", async (t) => {
    const directory = await temporaryDirectory(t);
    const {server, port} = await createServer(directory, 0, false, () => {
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const response = await fetch(`http://127.0.0.1:${port}/api/tools/status`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok: true});
    assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("工具 API 拒绝跨源和非 JSON 请求", async (t) => {
    const directory = await temporaryDirectory(t);
    const {server, port} = await createServer(directory, 0, false, () => {
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${port}/api/tools/reverse-build`;

    const crossOrigin = await postJson(endpoint, {}, {Origin: "http://example.invalid"});
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).code, "FORBIDDEN_ORIGIN");

    const formPost = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "force=true"
    });
    assert.equal(formPost.status, 415);
    assert.equal((await formPost.json()).code, "UNSUPPORTED_MEDIA_TYPE");
});

test("Web 工具 API 限制可写目录", async (t) => {
    const directory = await temporaryDirectory(t);
    const {server, port} = await createServer(directory, 0, false, () => {
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const rootUrl = `http://127.0.0.1:${port}`;

    const reverseReject = await postJson(`${rootUrl}/api/tools/reverse-build`, {
        outputDir: "assets/api-output",
        force: true
    });
    assert.equal(reverseReject.status, 400);
    assert.equal((await reverseReject.json()).code, "PATH_NOT_ALLOWED");

    const svgReject = await postJson(`${rootUrl}/api/tools/svg-compressor`, {
        inputDir: "assets/images",
        outputDir: "tmp/output-css",
        tempDir: "tmp/output-svg"
    });
    assert.equal(svgReject.status, 400);
    assert.equal((await svgReject.json()).code, "PATH_NOT_ALLOWED");
});

test("Web 逆向构建允许输出到 tmp 目录", async (t) => {
    const directory = await temporaryDirectory(t);
    const {server, port} = await createServer(directory, 0, false, () => {
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const workspace = await projectTemporaryDirectory(t, "server-reverse-");
    const inputFile = path.join(workspace, "single.html");
    const outputDir = path.join(workspace, "output");
    await writeFile(inputFile, "<!doctype html><style>body { color: red; }</style><script>console.log('ok');</script>", "utf8");

    const response = await postJson(`http://127.0.0.1:${port}/api/tools/reverse-build`, {
        inputFile: path.relative(PROJECT_ROOT, inputFile),
        outputDir: path.relative(PROJECT_ROOT, outputDir),
        force: true
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.result.cssCount, 1);
    assert.equal(body.result.jsCount, 1);
    assert.match(await readFile(path.join(outputDir, "index.html"), "utf8"), /href="\.\/css\/extracted_/u);
});
