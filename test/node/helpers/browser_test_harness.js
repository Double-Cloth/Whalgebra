import {readFile} from "node:fs/promises";
import path from "node:path";
import {PROJECT_ROOT} from "./temp_directory.js";

// test/browser/test_logic.js 在浏览器里通过 fetch 读取 test/cases 下的清单和用例。
// Node 端没有对应的静态服务器，这里用一个只服务 test/cases 目录的 fetch 兜底实现，
// 把 "../cases/xxx.json?t=..." 这类 URL 映射到本地文件，使测试逻辑无需改动即可运行。
const CASES_DIR = path.join(PROJECT_ROOT, "test", "cases");

function resolveCaseFile(requestUrl) {
    const withoutQuery = String(requestUrl).split("?")[0];
    const fileName = path.basename(withoutQuery);
    if (!/^[\w.-]+\.json$/u.test(fileName)) {
        throw new Error(`测试用例 fetch 兜底不支持的 URL：${requestUrl}`);
    }
    return path.join(CASES_DIR, fileName);
}

// 安装一个仅覆盖 test/cases JSON 读取的 globalThis.fetch，返回卸载函数。
export function installCasesFetch() {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (requestUrl) => {
        const filePath = resolveCaseFile(requestUrl);
        const text = await readFile(filePath, "utf8");
        return {
            ok: true,
            json: async () => JSON.parse(text)
        };
    };
    return () => {
        globalThis.fetch = previousFetch;
    };
}
