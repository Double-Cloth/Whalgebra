"use strict";

function measureTime(func) {
    const s = Date.now();
    func();
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

async function fetchJson(url) {
    try {
        return await (await fetch(url + '?t=' + Date.now())).json();
    } catch (e) {
        console.error("Fetch error:", e);
        return [];
    }
}

async function test(mode = 0) {
    const win = iframe.contentWindow;
    if (!win || !win.MathPlus) {
        throw new Error("Core not loaded");
    }

    const
        a = win.CalcConfig.globalCalcAccuracy,
        b = win.CalcConfig.outputAccuracy;
    const printMode = win.CalcConfig.globalPrintMode;
    win.CalcConfig.globalCalcAccuracy = 220;
    win.CalcConfig.outputAccuracy = 0.9;
    win.CalcConfig.globalPrintMode = 'algebra';

    let result = true;

    const logResult = (title, pass, input, expected, actual, extra = {}) => {
        const logData = {Input: input, Expected: expected, Actual: actual, ...extra};
        if (pass) {
            console.log(`✅ ${title}`, logData);
        } else {
            console.error(`❌ ${title}`, logData);
        }
    };

    switch (mode) {
        case 1: {
            console.info("--- 性能基准测试 (Batch) ---");

            // 1. 定义测试配置
            const count = 111; // 循环次数
            const num1 = new win.ComplexNumber('23.4-42.8[i]');
            const num2 = new win.ComplexNumber('-12.43+3.21[i]');

            // 2. 定义要测试的函数集
            // name: 显示名称
            // run:  实际执行的包装函数
            // args: 用于在日志中显示的输入参数列表 (仅作展示用)
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

            // 3. 批量循环测试
            for (const item of testSet) {
                let totalTime = 0;

                // 执行性能测试循环
                for (let i = 0; i < count; i++) {
                    totalTime += measureTime(item.run);
                }

                // 4. 按照你的格式输出日志
                console.log(`${item.name}:`, {
                    LoopCount: count,
                    Input: item.args.map(arg => arg.toString()), // 转换参数为字符串以便阅读
                    Actual: item.run().toString(),               // 获取实际计算结果
                    Time: '平均一次计算耗时：' + (totalTime / count).toFixed(3) + 'ms' // 平均耗时
                });
            }
            break;
        }
        case 2: { // Power
            let allPass = true;
            const cases = await fetchJson('test_cases/test_power_function.json');
            for (let i = 0; i < cases.length; i++) {
                const c = cases[i];
                const res = await win.WorkerTools.powerFunctionAnalysis(c.coeffs);
                const pass = deepEqual(c.expected, res);
                allPass = allPass && pass;
                logResult(`Case ${i + 1}: ${c.description[0]}`, pass, c.coeffs, c.expected, res);
            }
            result = allPass;
            break;
        }
        case 3: { // Stats
            let allPass = true;
            const cases = await fetchJson('test_cases/test_statistics.json');
            for (let i = 0; i < cases.length; i++) {
                const c = cases[i];
                const res = await win.WorkerTools.statisticsCalc(c.coeffs[0], c.coeffs[1]);
                const pass = deepEqual(c.expected, res);
                allPass = allPass && pass;
                logResult(`Case ${i + 1}`, pass, c.coeffs, c.expected, res);
            }
            result = allPass;
            break;
        }
        case 4: { // Radical
            let allPass = true;
            const cases = await fetchJson('test_cases/test_radical_function.json');
            for (let i = 0; i < cases.length; i++) {
                const c = cases[i];
                const res = await win.WorkerTools.radicalFunctionAnalysis(c.coeffs[0], c.coeffs[1]);
                const pass = deepEqual(c.expected, res);
                allPass = allPass && pass;
                logResult(`Case ${i + 1}`, pass, {z: c.coeffs[0], n: c.coeffs[1]}, c.expected, res);
            }
            result = allPass;
            break;
        }
        case 5: { // ValueList
            let allPass = true;
            const cases = await fetchJson('test_cases/test_func_value_list.json');
            for (let i = 0; i < cases.length; i++) {
                const c = cases[i];
                const res = await win.WorkerTools.valueList(...c.coeffs);
                const pass = deepEqual(c.expected, res);
                allPass = allPass && pass;
                logResult(`Case ${i + 1}`, pass, c.coeffs, c.expected, res);
            }
            result = allPass;
            break;
        }
        case 6: { // Expr
            let allPass = true;
            const cases = await fetchJson('test_cases/test_calc_expr.json');
            for (let i = 0; i < cases.length; i++) {
                const c = cases[i];
                const opts = {
                    calcAcc: c.coeffs[1],
                    outputAcc: c.coeffs[2],
                    calcMode: c.coeffs[3],
                    outputMode: c.coeffs[4],
                    f: c.coeffs[5],
                    g: c.coeffs[6]
                };
                const res = await win.WorkerTools.exec(c.coeffs[0], opts);
                let pass = deepEqual(c.expected, res);

                let idealPass = true;
                if (win.Public) {
                    const midRes = await win.WorkerTools.exec(c.coeffs[0], {...opts, outputMode: 'mid'});
                    const idealized = win.Public.idealizationToString(new win.ComplexNumber(midRes.result), {acc: c.coeffs[2]});
                    idealPass = (idealized === res.result);
                }
                pass = pass && idealPass;

                logResult(
                    `Case ${i + 1}: ${c.coeffs[0]}`,
                    pass,
                    c.coeffs,
                    c.expected,
                    res,
                    {SyntaxCheck: idealPass}
                );
                allPass = allPass && pass;
            }
            result = allPass;
            break;
        }
        default: {
            const sections = {
                2: "幂函数分析",
                3: "统计计算",
                4: "根式函数",
                5: "函数值列表",
                6: "表达式解析"
            };
            for (let i = 2; i <= 6; i++) {
                console.info(`\n============== [${i}] ${sections[i]} ==============`);
                const subResult = await test(i);
                result = subResult && result;
            }
            break;
        }
    }

    win.CalcConfig.globalCalcAccuracy = a;
    win.CalcConfig.outputAccuracy = b;
    win.CalcConfig.globalPrintMode = printMode;
    return result;
}