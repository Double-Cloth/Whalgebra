import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import {PROJECT_ROOT} from "./helpers/temp_directory.js";
import {createCalcCoreWindow} from "./helpers/calc_core.js";
import {installCasesFetch} from "./helpers/browser_test_harness.js";

function browserTestLogicUrl() {
    return pathToFileURL(path.join(PROJECT_ROOT, "test", "browser", "test_logic.js")).href;
}

// 把进度写到标准输出，让 `npm test` 运行时能看到“运行全部测试集”的实时进展。
function reportProgress(line) {
    process.stdout.write(`      ${line}\n`);
}

// 复用测试工作台的日志约定：
// - test_logic.js 用 info 输出 "===== [id] 标题 =====" 作为每个测试集的分隔标题；
// - 每条用例用 "%c[Passed]%c 标题" 或 "%c[Failed]%c 标题" 输出结果。
// 这里据此按测试集统计通过/失败数量并实时打印进度，同时收集失败用例便于定位。
function createProgressLogger() {
    const failures = [];
    const suiteHeader = /=+\s*\[(\d+)\]\s*(.+?)\s*=+/u;
    let current = null;

    const flushCurrent = () => {
        if (!current) {
            return;
        }
        const total = current.pass + current.fail;
        const mark = current.fail === 0 ? "✔" : "✗";
        reportProgress(`${mark} [${current.id}] ${current.title}：${current.pass}/${total} 通过`);
    };

    const stripStyles = (template) => template.replace(/%c/gu, "").trim();

    const onInfo = (args) => {
        const [template] = args;
        if (typeof template !== "string") {
            return;
        }
        const match = template.match(suiteHeader);
        if (!match) {
            return;
        }
        flushCurrent();
        current = {id: match[1], title: match[2], pass: 0, fail: 0};
        reportProgress(`▶ [${current.id}] ${current.title} 开始`);
    };

    const onLog = (args) => {
        const [template] = args;
        if (typeof template !== "string") {
            return;
        }
        const passed = template.includes("[Passed]");
        const failed = template.includes("[Failed]");
        if (!passed && !failed) {
            return;
        }
        if (current) {
            current[passed ? "pass" : "fail"] += 1;
        }
        if (failed) {
            const title = stripStyles(template).replace("[Failed]", "").trim();
            failures.push({title, detail: args[args.length - 1]});
            reportProgress(`  ✗ ${title}`);
        }
    };

    const noop = () => {
    };
    return {
        failures,
        finish: flushCurrent,
        logger: Object.freeze({
            log: (...args) => onLog(args),
            info: (...args) => onInfo(args),
            warn: noop,
            error: noop
        })
    };
}

test("测试工作台“运行全部测试集”在真实计算核心上全部通过", async () => {
    const restoreFetch = installCasesFetch();
    try {
        const {test: runBrowserTest} = await import(browserTestLogicUrl());
        const win = await createCalcCoreWindow();
        const engineFrame = {contentWindow: win};
        const {failures, finish, logger} = createProgressLogger();

        // mode=0 对应测试工作台的“运行全部测试集”，会按 includeInAll 依次执行各测试集。
        const allPassed = await runBrowserTest(0, engineFrame, {logger});
        finish();

        assert.equal(
            allPassed,
            true,
            `运行全部测试集存在未通过用例：\n${failures.map((item) => `- ${item.title}`).join("\n")}`
        );
        assert.equal(failures.length, 0);
    } finally {
        restoreFetch();
    }
});
