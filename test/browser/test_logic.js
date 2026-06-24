"use strict";

const TEST_SUITES_URL = "../cases/test_suites.json";
const DEFAULT_TEST_CALC_CONFIG = Object.freeze({
    globalCalcAccuracy: 220,
    outputAccuracy: 0.9,
    globalPrintMode: "algebra"
});
const CALC_CONFIG_ALIASES = Object.freeze({
    globalCalcAccuracy: Object.freeze(["globalCalcAccuracy", "calcAcc"]),
    outputAccuracy: Object.freeze(["outputAccuracy", "outputAcc"]),
    globalPrintMode: Object.freeze(["globalPrintMode", "printMode"])
});
let whalgebraTestSuitesPromise = null;
let WhalgebraTestSuiteById = Object.freeze({});

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadWhalgebraTestSuites({signal} = {}) {
    if (!whalgebraTestSuitesPromise) {
        whalgebraTestSuitesPromise = fetchJson(TEST_SUITES_URL, {signal})
            .then((suites) => {
                const frozenSuites = Object.freeze(suites.map((suite) => Object.freeze({...suite})));
                WhalgebraTestSuiteById = Object.freeze(Object.fromEntries(
                    frozenSuites.map((suite) => [suite.id, suite])
                ));
                globalThis.WhalgebraTestSuites = frozenSuites;
                return frozenSuites;
            })
            .catch((error) => {
                whalgebraTestSuitesPromise = null;
                throw error;
            });
    }
    return whalgebraTestSuitesPromise;
}

globalThis.loadWhalgebraTestSuites = loadWhalgebraTestSuites;

function createAbortError() {
    const error = new Error("测试已取消");
    error.name = "AbortError";
    return error;
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

function getCalcConfigSource(source) {
    if (!isPlainObject(source)) {
        return null;
    }
    const nestedConfig = getNestedCalcConfigSource(source);
    if (nestedConfig) {
        return nestedConfig;
    }
    return source;
}

function getNestedCalcConfigSource(source) {
    if (!isPlainObject(source)) {
        return null;
    }
    if (isPlainObject(source.calcConfig)) {
        return source.calcConfig;
    }
    if (isPlainObject(source.config)) {
        return source.config;
    }
    return null;
}

function readConfigValue(source, aliases) {
    for (const key of aliases) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
            return source[key];
        }
    }
    return undefined;
}

function parseCalcConfigFromJson(...sources) {
    const config = {...DEFAULT_TEST_CALC_CONFIG};
    for (const source of sources) {
        const configSource = getCalcConfigSource(source);
        if (!configSource) {
            continue;
        }
        for (const [key, aliases] of Object.entries(CALC_CONFIG_ALIASES)) {
            const value = readConfigValue(configSource, aliases);
            if (value !== undefined) {
                config[key] = value;
            }
        }
    }
    return config;
}

function captureCalcConfig(win) {
    return {
        globalCalcAccuracy: win.CalcConfig.globalCalcAccuracy,
        outputAccuracy: win.CalcConfig.outputAccuracy,
        globalPrintMode: win.CalcConfig.globalPrintMode
    };
}

function restoreCalcConfig(win, config) {
    win.CalcConfig.globalCalcAccuracy = config.globalCalcAccuracy;
    win.CalcConfig.outputAccuracy = config.outputAccuracy;
    win.CalcConfig.globalPrintMode = config.globalPrintMode;
}

function assignCalcConfigFromJson(win, ...sources) {
    const config = parseCalcConfigFromJson(...sources);
    restoreCalcConfig(win, config);
    return config;
}

function createCalcConfigAssigner(win, ...baseSources) {
    return (caseSource) => assignCalcConfigFromJson(win, ...baseSources, caseSource);
}

function waitForUi(signal) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const done = () => {
            try {
                throwIfAborted(signal);
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(done);
        } else {
            setTimeout(done, 0);
        }
    });
}

async function yieldToUi(signal, index = 0, interval = 1) {
    if (index % interval === 0) {
        await waitForUi(signal);
        return;
    }
    throwIfAborted(signal);
}

function measureTime(func, signal) {
    throwIfAborted(signal);
    const s = Date.now();
    func();
    throwIfAborted(signal);
    return Date.now() - s;
}

function deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
        return true;
    }
    if (typeof obj1 === 'number' && typeof obj2 === 'number' && isNaN(obj1) && isNaN(obj2)) {
        return true;
    }
    if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') {
        return false;
    }
    if (obj1 instanceof Date && obj2 instanceof Date) {
        return obj1.getTime() === obj2.getTime();
    }
    const k1 = Object.keys(obj1), k2 = Object.keys(obj2);
    if (k1.length !== k2.length) {
        return false;
    }
    for (let k of k1) {
        if (!k2.includes(k) || !deepEqual(obj1[k], obj2[k])) {
            return false;
        }
    }
    return true;
}

async function fetchJson(url, {signal} = {}) {
    try {
        return await (await fetch(url + '?t=' + Date.now(), {signal})).json();
    } catch (e) {
        if (signal?.aborted || e?.name === "AbortError") {
            throw createAbortError();
        }
        console.error("Fetch error:", e);
        return [];
    }
}

function normalizeCaseFile(json) {
    if (Array.isArray(json)) {
        return {cases: json, configSource: null};
    }
    if (isPlainObject(json) && Array.isArray(json.cases)) {
        return {cases: json.cases, configSource: json};
    }
    return {cases: [], configSource: json};
}

async function loadCaseFile(suite, {signal} = {}) {
    return normalizeCaseFile(await fetchJson(caseUrl(suite), {signal}));
}

async function loadConfiguredSuiteCases(win, suite, {signal} = {}) {
    const caseFile = await loadCaseFile(suite, {signal});
    const assignCaseCalcConfig = createCalcConfigAssigner(win, suite, caseFile.configSource);
    assignCaseCalcConfig();
    return {cases: caseFile.cases, assignCaseCalcConfig};
}

function createCalcOptions(win, c) {
    return {
        calcAcc: c.coeffs[1] ?? win.CalcConfig.globalCalcAccuracy,
        outputAcc: c.coeffs[2] ?? win.CalcConfig.outputAccuracy,
        calcMode: c.coeffs[3],
        outputMode: c.coeffs[4],
        f: c.coeffs[5],
        g: c.coeffs[6]
    };
}

async function runCalcNormalCases(win, cases, signal, logResult, assignCaseCalcConfig = () => {
}) {
    let allPass = true;
    for (let i = 0; i < cases.length; i++) {
        throwIfAborted(signal);
        const c = cases[i];
        assignCaseCalcConfig(c);
        const opts = createCalcOptions(win, c);
        const res = await win.WorkerTools.exec(c.coeffs[0], opts);
        throwIfAborted(signal);
        let pass = deepEqual(c.expected, res);

        let idealPass = true;
        if (win.Public) {
            const midRes = await win.WorkerTools.exec(c.coeffs[0], {...opts, outputMode: 'mid'});
            throwIfAborted(signal);
            const idealized = win.Public.idealizationToString(new win.ComplexNumber(midRes.result), {acc: c.coeffs[2]});
            idealPass = (idealized === res.result);
        }
        pass = pass && idealPass;

        logResult(
            `Case ${i + 1}: ${c.description[0]}`,
            pass,
            c.coeffs,
            c.expected,
            res,
            {SyntaxCheck: idealPass}
        );
        allPass = allPass && pass;
        await yieldToUi(signal);
    }
    return allPass;
}

async function runCalcErrorCases(win, cases, signal, logResult, assignCaseCalcConfig = () => {
}) {
    return runExpectedCases(cases, signal, logResult, assignCaseCalcConfig, {
        run: async (c) => {
            const opts = createCalcOptions(win, c);
            try {
                return await win.WorkerTools.exec(c.coeffs[0], opts);
            } catch (error) {
                return {error: error.message};
            }
        },
        title: (c, i) => `Case ${i + 1}: ${c.description[0]}`,
        input: (c) => c.coeffs
    });
}

async function runExpectedCases(cases, signal, logResult, assignCaseCalcConfig = () => {
}, {run, title, input}) {
    let allPass = true;
    for (let i = 0; i < cases.length; i++) {
        throwIfAborted(signal);
        const c = cases[i];
        assignCaseCalcConfig(c);
        const actual = await run(c, i);
        throwIfAborted(signal);
        const pass = deepEqual(c.expected, actual);
        allPass = allPass && pass;
        logResult(title(c, i), pass, input(c, i), c.expected, actual);
        await yieldToUi(signal);
    }
    return allPass;
}

async function runPerformanceBenchmark(win, signal) {
    console.info("--- 性能基准测试 ---");

    const count = 111; // 循环次数
    const num1 = new win.ComplexNumber('23.4-42.8[i]');
    const num2 = new win.ComplexNumber('-12.43+3.21[i]');

    const testSet = [
        {
            name: "Pow",
            run: () => win.MathPlus.pow(num1, num2),
            args: [num1, num2]
        },
        {
            name: "Fact",
            run: () => win.MathPlus.fact(num2),
            args: [num2]
        }
        // 你可以在这里继续添加其他函数...
        // { name: "Exp", run: () => win.MathPlus.exp(num1), args: [num1] },
    ];

    for (const item of testSet) {
        let totalTime = 0;

        for (let i = 0; i < count; i++) {
            await yieldToUi(signal, i, 8);
            totalTime += measureTime(item.run, signal);
        }

        throwIfAborted(signal);
        console.log(`${item.name}:`, {
            LoopCount: count,
            Input: item.args.map(arg => arg.toString()),
            Actual: item.run().toString(),
            Time: '平均一次计算耗时：' + (totalTime / count).toFixed(3) + 'ms'
        });
        await yieldToUi(signal);
    }
}

function resolveMathPlusCaseValue(win, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }
    if (Object.prototype.hasOwnProperty.call(value, "expr")) {
        return win.MathPlus.calc(value.expr)[0];
    }
    if (Object.prototype.hasOwnProperty.call(value, "constant")) {
        return new win.ComplexNumber(win.CalcConfig.constants[value.constant]);
    }
    return value;
}

function serializeMathPlusValue(win, value) {
    const options = {
        acc: win.CalcConfig.outputAccuracy,
        printMode: win.CalcConfig.globalPrintMode
    };
    if (Array.isArray(value) && value.length === 2 && win.Public?.typeOf(value[0]) === "complexnumber") {
        return {
            result: win.Public.idealizationToString(value[0], options),
            expr: value[1]
        };
    }
    return win.Public.idealizationToString(value, options);
}

function caseUrl(suite) {
    return `../cases/${suite.file}`;
}

async function runMathPlusFunctionCases(win, cases, signal, logResult, assignCaseCalcConfig = () => {
}) {
    const assignNestedCaseCalcConfig = (c) => assignCaseCalcConfig(getNestedCalcConfigSource(c));
    return runExpectedCases(cases, signal, logResult, assignNestedCaseCalcConfig, {
        run: (c) => {
            try {
                const args = (c.args ?? []).map((value) => resolveMathPlusCaseValue(win, value));
                const raw = win.MathPlus[c.function](...args);
                return serializeMathPlusValue(win, raw);
            } catch (error) {
                return {error: error.message};
            }
        },
        title: (c, i) => `Case ${i + 1}: ${c.function} - ${c.description[0]}`,
        input: (c) => c.args
    });
}

async function test(mode = 0, engineFrame = document.getElementById("logicEngine"), {signal} = {}) {
    const win = engineFrame?.contentWindow;
    if (!win || !win.MathPlus) {
        throw new Error("计算核心尚未加载");
    }
    throwIfAborted(signal);

    const originalCalcConfig = captureCalcConfig(win);
    assignCalcConfigFromJson(win);

    let result = true;

    const logResult = (title, pass, input, expected, actual, extra = {}) => {
        const logData = {Input: input, Expected: expected, Actual: actual, ...extra};
        if (pass) {
            console.log(`%c[Passed]%c ${title}`, 'color: #34D399; font-weight: bold', '', logData);
        } else {
            console.log(`%c[Failed]%c ${title}`, 'color: #F87171; font-weight: bold', '', logData);
        }
    };

    try {
        const getSuite = async (id) => {
            await loadWhalgebraTestSuites({signal});
            return WhalgebraTestSuiteById[id];
        };
        const getSuiteCases = async (id) => {
            const suite = await getSuite(id);
            return loadConfiguredSuiteCases(win, suite, {signal});
        };

        switch (mode) {
            case 1: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(1);
                result = await runCalcNormalCases(win, cases, signal, logResult, assignCaseCalcConfig);
                break;
            }
            case 2: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(2);
                result = await runCalcNormalCases(win, cases, signal, logResult, assignCaseCalcConfig);
                break;
            }
            case 3: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(3);
                result = await runCalcErrorCases(win, cases, signal, logResult, assignCaseCalcConfig);
                break;
            }
            case 4: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(4);
                result = await runMathPlusFunctionCases(win, cases, signal, logResult, assignCaseCalcConfig);
                break;
            }
            case 5: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(5);
                result = await runExpectedCases(cases, signal, logResult, assignCaseCalcConfig, {
                    run: (c) => win.WorkerTools.powerFunctionAnalysis(c.coeffs),
                    title: (c, i) => `Case ${i + 1}: ${c.description[0]}`,
                    input: (c) => c.coeffs
                });
                break;
            }
            case 6: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(6);
                result = await runExpectedCases(cases, signal, logResult, assignCaseCalcConfig, {
                    run: (c) => win.WorkerTools.radicalFunctionAnalysis(c.coeffs[0], c.coeffs[1]),
                    title: (_c, i) => `Case ${i + 1}`,
                    input: (c) => ({z: c.coeffs[0], n: c.coeffs[1]})
                });
                break;
            }
            case 7: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(7);
                result = await runExpectedCases(cases, signal, logResult, assignCaseCalcConfig, {
                    run: (c) => win.WorkerTools.valueList(...c.coeffs),
                    title: (_c, i) => `Case ${i + 1}`,
                    input: (c) => c.coeffs
                });
                break;
            }
            case 8: {
                const {cases, assignCaseCalcConfig} = await getSuiteCases(8);
                result = await runExpectedCases(cases, signal, logResult, assignCaseCalcConfig, {
                    run: (c) => win.WorkerTools.statisticsCalc(c.coeffs[0], c.coeffs[1]),
                    title: (_c, i) => `Case ${i + 1}`,
                    input: (c) => c.coeffs
                });
                break;
            }
            case 9: {
                assignCalcConfigFromJson(win, await getSuite(9));
                await runPerformanceBenchmark(win, signal);
                break;
            }
            default: {
                const runOrder = (await loadWhalgebraTestSuites({signal})).filter((suite) => suite.includeInAll);
                for (const suite of runOrder) {
                    throwIfAborted(signal);
                    console.info(`\n============== [${suite.id}] ${suite.title} ==============`);
                    const subResult = await test(suite.id, engineFrame, {signal});
                    result = subResult && result;
                    await yieldToUi(signal);
                }
                break;
            }
        }
    } finally {
        restoreCalcConfig(win, originalCalcConfig);
    }

    return result;
}
