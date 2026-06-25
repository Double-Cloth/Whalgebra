const TEST_SUITES_URL = "../cases/test_suites.json";
const NOOP = () => {
};
const LOG_STYLE_PASS = "color: #34D399; font-weight: bold";
const LOG_STYLE_FAIL = "color: #F87171; font-weight: bold";
const BENCHMARK_LOOP_COUNT = 111;
const BENCHMARK_YIELD_INTERVAL = 8;
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

function createLogger(logger = console) {
    const fallback = console;
    const log = typeof logger?.log === "function" ? logger.log.bind(logger) : fallback.log.bind(fallback);
    const info = typeof logger?.info === "function" ? logger.info.bind(logger) : log;
    const warn = typeof logger?.warn === "function" ? logger.warn.bind(logger) : log;
    const error = typeof logger?.error === "function" ? logger.error.bind(logger) : log;
    return Object.freeze({log, info, warn, error});
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function loadWhalgebraTestSuites({signal, logger} = {}) {
    if (!whalgebraTestSuitesPromise) {
        whalgebraTestSuitesPromise = fetchJson(TEST_SUITES_URL, {signal, logger})
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

async function loadSuiteById(id, {signal, logger} = {}) {
    await loadWhalgebraTestSuites({signal, logger});
    return WhalgebraTestSuiteById[id];
}

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

export function parseCalcConfigFromJson(...sources) {
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

export function assignCalcConfigFromJson(win, ...sources) {
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
    const start = Date.now();
    func();
    throwIfAborted(signal);
    return Date.now() - start;
}

function deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
        return true;
    }
    if (typeof obj1 === "number" && typeof obj2 === "number" && Number.isNaN(obj1) && Number.isNaN(obj2)) {
        return true;
    }
    if (obj1 === null || typeof obj1 !== "object" || obj2 === null || typeof obj2 !== "object") {
        return false;
    }
    if (obj1 instanceof Date && obj2 instanceof Date) {
        return obj1.getTime() === obj2.getTime();
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }
    return true;
}

async function fetchJson(url, {signal, logger} = {}) {
    const outputLogger = createLogger(logger);
    try {
        return await (await fetch(`${url}?t=${Date.now()}`, {signal})).json();
    } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") {
            throw createAbortError();
        }
        outputLogger.error("Fetch error:", error);
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

function caseUrl(suite) {
    return `../cases/${suite.file}`;
}

async function loadCaseFile(suite, {signal, logger} = {}) {
    return normalizeCaseFile(await fetchJson(caseUrl(suite), {signal, logger}));
}

async function loadConfiguredSuiteCases(win, suite, {signal, logger} = {}) {
    const caseFile = await loadCaseFile(suite, {signal, logger});
    const assignCaseCalcConfig = createCalcConfigAssigner(win, suite, caseFile.configSource);
    assignCaseCalcConfig();
    return {cases: caseFile.cases, assignCaseCalcConfig};
}

async function loadConfiguredSuiteCasesById(win, id, {signal, logger} = {}) {
    const suite = await loadSuiteById(id, {signal, logger});
    return loadConfiguredSuiteCases(win, suite, {signal, logger});
}

function createTestLogger(logger = console) {
    const outputLogger = createLogger(logger);
    return (title, pass, input, expected, actual, extra = {}) => {
        const logData = {Input: input, Expected: expected, Actual: actual, ...extra};
        if (pass) {
            outputLogger.log(`%c[Passed]%c ${title}`, LOG_STYLE_PASS, "", logData);
        } else {
            outputLogger.log(`%c[Failed]%c ${title}`, LOG_STYLE_FAIL, "", logData);
        }
    };
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

async function runCalcNormalCases(win, cases, signal, logResult, assignCaseCalcConfig = NOOP) {
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
            const midRes = await win.WorkerTools.exec(c.coeffs[0], {...opts, outputMode: "mid"});
            throwIfAborted(signal);
            const idealized = win.Public.idealizationToString(new win.ComplexNumber(midRes.result), {acc: c.coeffs[2]});
            idealPass = idealized === res.result;
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

async function runCalcErrorCases(win, cases, signal, logResult, assignCaseCalcConfig = NOOP) {
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

async function runExpectedCases(cases, signal, logResult, assignCaseCalcConfig = NOOP, {run, title, input}) {
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

function createPerformanceBenchmarks(win) {
    const num1 = new win.ComplexNumber("23.4-42.8[i]");
    const num2 = new win.ComplexNumber("-12.43+3.21[i]");
    return [
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
    ];
}

async function runPerformanceBenchmark(win, signal, logger) {
    const outputLogger = createLogger(logger);
    outputLogger.info("--- 性能基准测试 ---");

    for (const item of createPerformanceBenchmarks(win)) {
        let totalTime = 0;

        for (let i = 0; i < BENCHMARK_LOOP_COUNT; i++) {
            await yieldToUi(signal, i, BENCHMARK_YIELD_INTERVAL);
            totalTime += measureTime(item.run, signal);
        }

        throwIfAborted(signal);
        outputLogger.log(`${item.name}:`, {
            LoopCount: BENCHMARK_LOOP_COUNT,
            Input: item.args.map((arg) => arg.toString()),
            Actual: item.run().toString(),
            Time: `平均一次计算耗时：${(totalTime / BENCHMARK_LOOP_COUNT).toFixed(3)}ms`
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

async function runMathPlusFunctionCases(win, cases, signal, logResult, assignCaseCalcConfig = NOOP) {
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

async function runConfiguredCaseSuite({win, signal, logResult, logger}, suiteId, runCases) {
    const {cases, assignCaseCalcConfig} = await loadConfiguredSuiteCasesById(win, suiteId, {signal, logger});
    return runCases(win, cases, signal, logResult, assignCaseCalcConfig);
}

async function runExpectedCaseSuite({win, signal, logResult, logger}, suiteId, definition) {
    const {cases, assignCaseCalcConfig} = await loadConfiguredSuiteCasesById(win, suiteId, {signal, logger});
    return runExpectedCases(cases, signal, logResult, assignCaseCalcConfig, {
        run: async (c, i) => {
            try {
                return await definition.run(win, c, i);
            } catch (error) {
                return {error: error.message};
            }
        },
        title: definition.title,
        input: definition.input
    });
}

async function runBenchmarkSuite({win, signal, logger}) {
    assignCalcConfigFromJson(win, await loadSuiteById(9, {signal, logger}));
    await runPerformanceBenchmark(win, signal, logger);
    return true;
}

async function runAllIncludedSuites(engineFrame, signal, logger) {
    const outputLogger = createLogger(logger);
    let result = true;
    const runOrder = (await loadWhalgebraTestSuites({signal, logger})).filter((suite) => suite.includeInAll);
    for (const suite of runOrder) {
        throwIfAborted(signal);
        outputLogger.info(`\n============== [${suite.id}] ${suite.title} ==============`);
        const subResult = await test(suite.id, engineFrame, {signal, logger});
        result = subResult && result;
        await yieldToUi(signal);
    }
    return result;
}

const EXPECTED_CASE_SUITES = Object.freeze({
    5: Object.freeze({
        run: (win, c) => win.WorkerTools.powerFunctionAnalysis(c.coeffs),
        title: (c, i) => `Case ${i + 1}: ${c.description[0]}`,
        input: (c) => c.coeffs
    }),
    6: Object.freeze({
        run: (win, c) => win.WorkerTools.radicalFunctionAnalysis(c.coeffs[0], c.coeffs[1]),
        title: (c, i) => `Case ${i + 1}: ${c.description[0]}`,
        input: (c) => ({z: c.coeffs[0], n: c.coeffs[1]})
    }),
    7: Object.freeze({
        run: (win, c) => win.WorkerTools.valueList(...c.coeffs),
        title: (c, i) => `Case ${i + 1}: ${c.description[0]}`,
        input: (c) => c.coeffs
    }),
    8: Object.freeze({
        run: (win, c) => win.WorkerTools.statisticsCalc(c.coeffs[0], c.coeffs[1]),
        title: (c, i) => `Case ${i + 1}: ${c.description[0]}`,
        input: (c) => c.coeffs
    })
});

const TEST_MODE_RUNNERS = Object.freeze({
    1: (context) => runConfiguredCaseSuite(context, 1, runCalcNormalCases),
    2: (context) => runConfiguredCaseSuite(context, 2, runCalcNormalCases),
    3: (context) => runConfiguredCaseSuite(context, 3, runCalcErrorCases),
    4: (context) => runConfiguredCaseSuite(context, 4, runMathPlusFunctionCases),
    5: (context) => runExpectedCaseSuite(context, 5, EXPECTED_CASE_SUITES[5]),
    6: (context) => runExpectedCaseSuite(context, 6, EXPECTED_CASE_SUITES[6]),
    7: (context) => runExpectedCaseSuite(context, 7, EXPECTED_CASE_SUITES[7]),
    8: (context) => runExpectedCaseSuite(context, 8, EXPECTED_CASE_SUITES[8]),
    9: (context) => runBenchmarkSuite(context)
});

function getTestModeRunner(mode) {
    return Number.isInteger(mode) ? TEST_MODE_RUNNERS[mode] : undefined;
}

export async function test(mode = 0, engineFrame = document.getElementById("logicEngine"), {signal, logger} = {}) {
    const win = engineFrame?.contentWindow;
    if (!win || !win.MathPlus) {
        throw new Error("计算核心尚未加载");
    }
    throwIfAborted(signal);

    const outputLogger = createLogger(logger);
    const originalCalcConfig = captureCalcConfig(win);
    assignCalcConfigFromJson(win);

    try {
        const context = {
            win,
            signal,
            logger: outputLogger,
            logResult: createTestLogger(outputLogger)
        };
        const runner = getTestModeRunner(mode);
        if (runner) {
            return await runner(context);
        }
        return await runAllIncludedSuites(engineFrame, signal, outputLogger);
    } finally {
        restoreCalcConfig(win, originalCalcConfig);
    }
}
