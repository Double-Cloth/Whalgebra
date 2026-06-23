import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {createServer} from "../../tools/server/run_server.js";
import {temporaryDirectory} from "./helpers/temp_directory.js";

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
