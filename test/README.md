# 测试目录说明

本目录维护 Whalgebra 的 Node.js 工具链测试、浏览器测试控制台、浏览器端计算核心测试逻辑，以及所有 JSON 测试用例。

## 目录结构

```text
test/
├── browser/      # 浏览器端测试执行逻辑，入口为 test_logic.js
├── cases/        # 浏览器测试集清单和 JSON 用例
├── node/         # Node.js 原生 test runner 测试
└── web/          # 浏览器测试控制台页面
```

## 运行测试

Node.js 测试：

```powershell
npm test
```

浏览器端计算核心测试：

```powershell
npm start
```

启动后打开入口页中的“测试控制台”。测试控制台会加载 `dist/Whalgebra.html` 作为计算核心，并由 `test/browser/test_logic.js` 执行 `test/cases/` 中的 JSON 用例。

`npm test` 只覆盖 Node.js 工具链和测试结构一致性，不会真实跑完浏览器端 JSON 计算用例。修改 `test/cases/` 的期望值后，至少要用本地脚本或测试控制台验证对应浏览器测试集。

## 测试集清单

浏览器测试集只在 `test/cases/test_suites.json` 中维护编号、标题、case 文件和是否参与“运行全部”。不要在 UI 或 `test_logic.js` 中再手写一份测试集列表。

当前测试集：

| id | 标题 | case 文件 | 全部运行 |
| --- | --- | --- | --- |
| 1 | 表达式测试 - 综合分支 | `test_mathplus_calc_complex_cases.json` | 是 |
| 2 | 表达式测试 - 正确分支 | `test_mathplus_calc_normal_cases.json` | 是 |
| 3 | 表达式测试 - 错误分支 | `test_mathplus_calc_error_cases.json` | 是 |
| 4 | MathPlus 函数测试 | `test_mathplus_functions.json` | 是 |
| 5 | 幂函数分析测试 | `test_power_function.json` | 是 |
| 6 | 根式函数测试 | `test_radical_function.json` | 是 |
| 7 | 函数值列表测试 | `test_func_value_list.json` | 是 |
| 8 | 统计计算测试 | `test_statistics.json` | 是 |
| 9 | 性能基准 | `null` | 否 |

`test_suites.json` 条目格式：

```json
{
  "id": 1,
  "title": "表达式测试 - 综合分支",
  "file": "test_mathplus_calc_complex_cases.json",
  "description": "覆盖复杂表达式综合计算",
  "includeInAll": true
}
```

字段说明：

- `id`：测试集编号，必须保持连续且与测试控制台按钮一致。
- `title`：测试控制台和日志中显示的测试集名称。
- `file`：位于 `test/cases/` 下的 case 文件名。性能基准没有 case 文件，使用 `null`。
- `description`：测试集覆盖范围说明。
- `includeInAll`：点击“运行全部测试集”时是否包含。性能基准通常为 `false`。

## CalcConfig 规则

浏览器测试每次运行前都会把计算核心配置重置为默认值：

```json
{
  "globalCalcAccuracy": 220,
  "outputAccuracy": 0.9,
  "globalPrintMode": "algebra"
}
```

配置可写在测试集、case 文件或单条 case 中。通用优先级为：

```text
默认值 < test_suites.json 中的测试集配置 < case 文件级配置 < 单条 case 配置
```

推荐使用嵌套写法：

```json
{
  "calcConfig": {
    "globalCalcAccuracy": 120,
    "outputAccuracy": 16,
    "globalPrintMode": "polar"
  },
  "cases": []
}
```

兼容旧字段名：

- `calcAcc` 等同于 `globalCalcAccuracy`
- `outputAcc` 等同于 `outputAccuracy`
- `printMode` 等同于 `globalPrintMode`

表达式和 WorkerTools 类测试会读取单条 case 顶层配置，也会读取 `calcConfig` 或 `config`。MathPlus 函数测试的单条 case 只读取嵌套的 `calcConfig` 或 `config`，不会把顶层旧字段 `calcAcc`、`outputAcc`、`printMode` 当作输出配置。

测试结束后，`test_logic.js` 会恢复计算核心原本的 `CalcConfig`。

## Case 文件格式

旧格式可以直接使用数组：

```json
[
  {
    "description": ["示例"],
    "coeffs": [],
    "expected": {}
  }
]
```

需要文件级配置时，使用对象包裹：

```json
{
  "calcConfig": {
    "globalCalcAccuracy": 220,
    "outputAccuracy": 0.9,
    "globalPrintMode": "algebra"
  },
  "cases": [
    {
      "description": ["示例"],
      "coeffs": [],
      "expected": {}
    }
  ]
}
```

`description[0]` 是控制台定位失败用例的主要文本，新增用例时要写清覆盖点。

## 表达式计算用例

适用于：

- `test_mathplus_calc_complex_cases.json`
- `test_mathplus_calc_normal_cases.json`
- `test_mathplus_calc_error_cases.json`

格式：

```json
{
  "description": ["[normal] 标准表达式"],
  "coeffs": [
    "2^3+1",
    220,
    0.9,
    "calc",
    "output",
    "sin2[x]",
    "3[x]+3f([x])"
  ],
  "expected": {
    "result": "9",
    "expr": "2^3+1"
  }
}
```

`coeffs` 含义：

- `coeffs[0]`：待计算表达式。
- `coeffs[1]`：本次 `WorkerTools.exec()` 的 `calcAcc`。缺省时使用当前 `win.CalcConfig.globalCalcAccuracy`。
- `coeffs[2]`：本次 `WorkerTools.exec()` 的 `outputAcc`。缺省时使用当前 `win.CalcConfig.outputAccuracy`。
- `coeffs[3]`：计算模式，传给 `WorkerTools.exec()` 的 `calcMode`，常用值为 `calc` 或 `syntaxCheck`。
- `coeffs[4]`：输出模式，传给 `WorkerTools.exec()` 的 `outputMode`，常用值为 `output` 或 `mid`。
- `coeffs[5]`：自定义函数 `f`。
- `coeffs[6]`：自定义函数 `g`。

表达式输出形式由当前 `globalPrintMode` 决定，可在单条 case 顶层配置：

```json
{
  "description": ["[normal:config] globalPrintMode=polar 输出极坐标式"],
  "globalPrintMode": "polar",
  "coeffs": ["1+[i]", 220, 8, "calc", "output"],
  "expected": {
    "result": "1.4142136[toPolar]0.78539816",
    "expr": "1+[i]"
  }
}
```

错误分支用例的 `expected` 写错误对象：

```json
{
  "description": ["[error] 空字符串"],
  "coeffs": ["", 220, 0.9, "calc", "output", "sin2[x]", "3[x]+3f([x])"],
  "expected": {
    "error": "[MathPlus] syntax error: Input is empty."
  }
}
```

## MathPlus 函数用例

适用于 `test_mathplus_functions.json`，直接调用 `win.MathPlus[c.function](...args)`，再用当前 `CalcConfig` 序列化结果。

格式：

```json
{
  "description": ["[re] 复数提取实部"],
  "function": "re",
  "args": ["3+4[i]"],
  "expected": "3"
}
```

字段说明：

- `function`：要调用的 `MathPlus` 静态函数名。
- `args`：传入函数的参数数组。
- `expected`：序列化后的期望结果，或 `{ "error": "..." }`。

MathPlus 函数测试默认使用 `220 / 0.9 / algebra`。不要在单条 case 顶层写旧式 `calcAcc`、`outputAcc`、`printMode`；这些字段不会作为 MathPlus 函数测试的输出配置。确实需要单条覆盖时，使用嵌套 `calcConfig` 或 `config`：

```json
{
  "description": ["[示例] polar 输出"],
  "function": "sqrt",
  "args": ["-1"],
  "calcConfig": {
    "globalPrintMode": "polar",
    "outputAccuracy": 8
  },
  "expected": "1[toPolar]1.5707963"
}
```

特殊参数写法：

```json
{"expr": "1+[i]"}
```

表示先执行 `MathPlus.calc()`，再把结果作为参数传入。

```json
{"constant": "pi"}
```

表示使用 `CalcConfig.constants.pi` 构造复数参数。

## WorkerTools 用例

幂函数、根式函数、函数值列表、统计计算测试都通过 `WorkerTools` 执行。

通用格式：

```json
{
  "description": ["说明"],
  "coeffs": [],
  "expected": {}
}
```

不同测试集的 `coeffs` 含义由 `test/browser/test_logic.js` 中对应分支决定：

- 幂函数：`WorkerTools.powerFunctionAnalysis(c.coeffs)`
- 根式函数：`WorkerTools.radicalFunctionAnalysis(c.coeffs[0], c.coeffs[1])`
- 函数值列表：`WorkerTools.valueList(...c.coeffs)`
- 统计计算：`WorkerTools.statisticsCalc(c.coeffs[0], c.coeffs[1])`

这些测试也会在每条 case 执行前应用当前 suite、case 文件和单条 case 的 `CalcConfig`。

## 性能基准

性能基准对应测试集 `9`，没有 case 文件，不参与“运行全部测试集”。当前由 `test_logic.js` 内部固定运行核心函数循环，并输出平均耗时。

如果要增加新的性能项，应直接修改 `runPerformanceBenchmark()`，不要在 `test_suites.json` 中给性能基准补 case 文件。

## 新增或修改测试的检查项

1. 新增测试集时，先在 `test/cases/test_suites.json` 中登记编号、标题、描述和 case 文件。
2. case 文件放在 `test/cases/` 下，文件名使用 `test_*.json`。
3. 如果需要统一精度或输出模式，优先在 case 文件级 `calcConfig` 中设置。
4. 表达式测试需要覆盖 `calcAcc` / `outputAcc` 时，优先使用 `coeffs[1]` / `coeffs[2]`；需要覆盖 `globalPrintMode` 时，使用 case 顶层或嵌套 `calcConfig`。
5. MathPlus 函数测试不要使用单条 case 顶层旧字段覆盖配置；需要覆盖时使用嵌套 `calcConfig` 或 `config`。
6. 修改 JSON 后先确认文件可被 `JSON.parse()` 解析，再运行相关浏览器测试集。
7. 修改测试结构、测试控制台或 `test_logic.js` 后运行 `npm test`，确保 Node.js 一致性测试通过。
