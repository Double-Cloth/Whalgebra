import {readFile} from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import {PROJECT_ROOT} from "./temp_directory.js";

// 计算核心在浏览器里由 dist/Whalgebra.html 提供，测试工作台通过 iframe 加载它。
// 这里从同一份产物中抽取“共用配置”和“核心计算逻辑”两段脚本，在 Node 的 vm 沙箱中还原，
// 使 Node 端可以直接驱动真实计算核心，而不必依赖浏览器环境。
const CORE_SCRIPT_IDS = Object.freeze(["shared_code_and_configuration", "core_computational_logic"]);

function extractScript(html, id) {
    const match = html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`, "u"));
    if (!match) {
        throw new Error(`dist/Whalgebra.html 中缺少脚本片段：${id}`);
    }
    return match[1];
}

// WorkerTools 在浏览器里通过 Web Worker 执行，Node 环境没有 Worker。
// 这里按照 asynchronous_logic.js 中 SyncWorker 的 callableFunctions 定义，
// 提供一份等价的同步委派，确保测试逻辑调用的入口和参数与浏览器完全一致。
function attachWorkerToolsShim(sandbox) {
    sandbox.WorkerTools = {
        isReady: false,
        exec: (expr, options = {}) => sandbox.CalcTools.exec(expr, {
            calcAcc: options.calcAcc,
            outputAcc: options.outputAcc,
            calcMode: options.calcMode,
            outputMode: options.outputMode,
            f: options.f,
            g: options.g
        }),
        powerFunctionAnalysis: (list) => sandbox.PowerFunctionTools.powerFunctionAnalysis(list),
        statisticsCalc: (listA, listB) => sandbox.StatisticsTools.statisticsCalc(listA, listB),
        radicalFunctionAnalysis: (z, n) => sandbox.RadicalFunctionTools.radicalFunctionAnalysis(z, n),
        valueList: (f, g, start, step, end) => sandbox.FuncValueListTools.valueList(f, g, start, step, end)
    };
}

// 构建一个可作为测试工作台 iframe.contentWindow 使用的计算核心沙箱。
export async function createCalcCoreWindow() {
    const html = await readFile(path.join(PROJECT_ROOT, "dist", "Whalgebra.html"), "utf8");
    // 计算核心运行时依赖的部分宿主全局。Node 已内置这些实现，直接注入沙箱即可，
    // 保持与浏览器一致的行为（例如统计回归里用 structuredClone 深拷贝矩阵）。
    const sandbox = {console, structuredClone, queueMicrotask, setTimeout, clearTimeout};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    for (const id of CORE_SCRIPT_IDS) {
        vm.runInContext(extractScript(html, id), sandbox, {filename: `${id}.js`});
    }
    attachWorkerToolsShim(sandbox);
    return sandbox;
}
