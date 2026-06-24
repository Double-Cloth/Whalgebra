# **Whalgebra**

<div align="center">
  <img src="./assets/images/icons/logo.png" alt="Whalgebra Logo" width="128" height="128" />
  <h3>基于原生 Web 技术的代数计算工具</h3>
</div>

**项目简介**

**Whalgebra**（前身 D-Calculator）是一个基于原生 Web 技术栈构建的代数计算器。项目经历了从 Python 脚本原型到单文件 HTML，再到模块化前端工程的演进过程。

该项目旨在提供一个**无需依赖**、**离线可用**且**精度可控**的数学计算环境，并在桌面端与移动端保持一致体验。

## 1. 核心特性

### 1.1. 核心引擎架构

- **复数域全维度支持**：全面支持复数域内的四则运算与各种常用函数的计算。
- **任意精度数值运算**：突破 JavaScript 标准浮点数（IEEE 754）16 位有效数字的精度限制，支持用户自定义精度的数值运算。
- **纯客户端架构设计**：所有计算逻辑均在客户端浏览器本地执行，零后端依赖，确保存储数据的隐私安全性及离线环境下的可用性。
- **单文件集成**：采用 “单文件 Web 应用” 结构，将 HTML 结构、CSS 样式和 JavaScript 逻辑全部集成在一个 .html 文件中，便于分发和使用。

### 1.2. 数学函数库

Whalgebra 内置了完备的数学函数库，涵盖以下主要计算类别：

| 类别            | 函数列表                                                                                                             |
| :-------------: | :-----------------------------------------------------------------------------------------------------------------: |
| **基础代数运算** | 加 (`+`)、减 (`-`)、乘 (`*`)、除 (`/`)、取余 (`mod`)、幂运算 (`^`)、平方根 (`sqrt`)、立方根 (`cbrt`)、n次方根 (`nroot`) 等 |
| **超越函数**     | 指数函数 (`exp`)、自然对数 (`ln`)、常用对数 (`lg`)、对数函数 (`log`) 等                                                 |
| **三角函数**     | `sin`, `cos`, `tan`, `arcsin`, `arccos`, `arctan` 等 (同时支持弧度/角度)                                              |
| **双曲函数**     | `sh` (`sinh`), `ch` (`cosh`), `th` (`tanh`) 及其反函数 `arsh`, `arch`, `arth` 等                                      |
| **特殊运算**     | 阶乘 (`!`)、伽马函数 (`gamma`)、符号函数 (`sgn`)、绝对值 (`abs`)、取整函数（`ceil`，`floor`）等                          |

### 1.3. 丰富的扩展功能

- 基础表达式计算
- 统计计算和回归分析
- 自定义函数
- 函数数表生成
- 多项式函数分析（0-4 次幂）
- 复变根式函数求根

## 2. 快速开始

### 2.1. 在线使用

[Whalgebra 在线地址](https://Double-Cloth.github.io/Whalgebra/)

### 2.2. 本地运行（Windows）

环境要求：Git、Node.js 20+、Chrome 109+

1. 克隆仓库并进入项目目录

```powershell
git clone https://github.com/Double-Cloth/Whalgebra.git
cd ./Whalgebra
```

2. 启动本地服务

```powershell
npm start
```

服务默认从 `8000` 端口开始寻找可用端口，并自动打开项目入口。入口页同时提供测试页、独立的逆向构建页面和 SVG 压缩页面。

本地服务默认仅监听 `127.0.0.1`，工具 API 只接受同源的 `application/json` 请求。需要在局域网内预览静态页面时，可显式开启局域网监听：

```powershell
npm start -- --lan
```

常用工具命令：

```powershell
npm run reverse-build -- --force
npm run compress-svg
```

通过网页执行工具时，逆向构建的输出目录限制在 `src` 或 `tmp` 内，SVG 压缩的输入、输出和临时目录限制在 `tmp` 内。

### 2.3. 安装发行版（Android）

1. 打开 [Releases 页面](https://github.com/Double-Cloth/Whalgebra/releases)
2. 下载最新 `.apk` 文件
3. 安装并启动应用

### 2.4. 安装发行版（Windows x64）

1. 打开 [Releases 页面](https://github.com/Double-Cloth/Whalgebra/releases)
2. 下载最新 `win-x64` 发行包或 `.exe` 文件
3. 解压并运行 `.exe` 或双击启动应用

## 3. 使用说明

### 3.1. 键盘快捷键与交互示例

为了提高输入效率，计算器支持以下键盘映射（仅部分示例）：

| 键盘按键     | 功能说明                |
| :---------: | :---------------------: |
| `enter`     | 执行计算、返回           |
| `backspace` | 删除光标前的一个字符      |
| `delete`    | 删除光标后的一个字符      |
| `alt` + `e` | 快捷输入自然对数底数      |
| `alt` + `i` | 快捷输入虚数单位         |
| `alt` + `x` | 快捷输入自变量           |

### 3.2. 应用程序接口示例

Whalgebra 提供了封装完善的核心计算类 `MathPlus`，允许开发者在浏览器控制台或进行二次开发时，通过以下标准化接口调用计算引擎：

```JavaScript
// 1. 基础代数运算示例
// 运算逻辑：计算 2 的 10 次幂与 24 之和
const [res1] = MathPlus.calc("2^10 + 24");
console.log(res1.toString()); 
// 输出结果: "1048"

// 2. 复数域与三角函数混合运算
// 运算逻辑：计算 sin(π/4 + i) 的值
const [res2] = MathPlus.calc("sin([pi]/4 + [i])");
console.log(res2.toString()); 
// 输出结果: "1.09112...+0.83099...[i]" (示例值)

// 3. 高精度大数运算
// 运算逻辑：计算 100 的阶乘
const [res3] = MathPlus.calc("100!");
console.log(res3.toString()); 
// 输出结果: "9.33262...E+157" (示例值)
```

## 4. 项目架构与体系

### 4.1. 技术说明

- **核心层**: HTML5, CSS3, Vanilla JavaScript (ES6+ 标准)。坚持无框架依赖原则，确保代码的轻量化与底层控制力。
- **渲染层**: 全部使用 svg 作为字体和图片，保证了在不同设备上显示效果相同。
- **工具层**: Node.js（静态开发服务器、单文件逆向构建和 SVG 资源处理，不参与计算过程）。

### 4.2. 目录结构

```
Whalgebra/
├── index.html                    # 本地工作台入口，集中跳转发行版、测试页与工具页
├── package.json                  # Node.js 脚本、项目版本与运行环境声明
├── README.md                     # 项目说明与本地开发指引
├── LICENSE                       # MIT License
├── dist/                         # 可直接分发的构建产物；通常只作为发布结果，不作为日常开发入口
│   ├── Whalgebra.html            # 单文件 Web 应用发行版，核心离线入口
│   ├── *.apk                     # Android 安装包
│   └── *.exe                     # Windows x64 安装/运行包
├── src/                          # 从单文件发行版逆向拆分出的源码区，用于 GitHub Pages 部署
│   ├── index.html                # 源码区页面入口
│   ├── css/                      # 计算器样式，以及由发行版拆出的内联 SVG 字体/图片样式
│   └── js/                       # 计算核心、Worker、UI 状态控制与初始化逻辑
├── assets/                       # 非业务逻辑的公共静态资源，供工作台、工具页和测试页复用
│   ├── images/                   # Logo、图标、数学符号字体、运算符中文名与说明图
│   │   ├── icons/                # Logo、favicon 等入口图标
│   │   ├── fonts/                # 计算器内使用的 SVG 字形资源
│   │   ├── chinese_name_of_operators/ # 运算符中文名 SVG 资源
│   │   └── instructions_of_operators/ # 运算符说明 SVG 资源
│   ├── lib/                      # 本地浏览器端辅助库，例如内置的 svgo.browser.js
│   ├── ui/                       # 工作台、工具页、测试页共享的 UI 资源
│   │   ├── fonts/                # 控制台、工具页和工作台使用的本地字体
│   │   ├── scripts/              # 非计算核心脚本
│   │   │   ├── shared.js         # 环境识别、状态展示和 JSON 请求封装
│   │   │   ├── log_console.js    # 工具页与测试页共享的日志控制台
│   │   │   ├── json_tree.js      # 测试输出对象的树形展示
│   │   │   ├── tool_form.js      # 逆向构建、SVG 压缩工具页表单逻辑
│   │   │   └── test_console.js   # 浏览器测试控制台交互逻辑
│   │   └── styles/               # 非计算器主体页面样式
│   │       ├── shared.css        # 字体、按钮、状态、notice 等基础样式
│   │       ├── portal.css        # 根目录工作台样式
│   │       ├── test-console.css  # 测试控制台与日志面板样式
│   │       └── tool-page.css     # 工具页表单和路径提示样式
│   └── previous_versions.zip     # 旧版本归档
├── tools/                        # 项目辅助工具，不参与计算器运行时
│   ├── cli/                      # 可单独运行的命令行工具
│   │   ├── reverse_build.js      # 从 dist/Whalgebra.html 拆分 HTML、CSS、JS 到源码目录
│   │   └── svg_compressor.js     # 批量优化 SVG，并生成 Base64 CSS
│   ├── server/                   # 本地静态服务器与受限工具 API
│   │   └── run_server.js         # npm start 入口，默认仅本机监听，可显式开启 --lan
│   ├── shared/                   # 工具链共享逻辑
│   │   └── filesystem.js         # 项目路径解析、换行标准化和安全输出路径校验
│   └── web/                      # 浏览器工具页面
│       ├── reverse_build.html    # 逆向构建工具 UI
│       └── svg_compressor.html   # SVG 压缩工具 UI
├── test/                         # 自动化测试、测试数据与浏览器测试控制台
│   ├── cases/                    # JSON 测试用例，覆盖表达式、幂函数、统计、根式和值列表
│   ├── node/                     # Node.js 原生 test runner 测试
│   │   ├── *.test.js             # 工具链、服务器、安全边界和工作台结构测试
│   │   └── helpers/              # 测试辅助逻辑
│   ├── browser/                  # 浏览器端测试执行逻辑
│   │   └── test_logic.js         # 调用计算核心 iframe 并执行各类测试集
│   └── web/                      # 测试控制台页面
│       └── index.html            # 浏览器测试入口，加载 dist/Whalgebra.html 作为计算核心
└── .github/                      # GitHub 协作与自动化配置
    ├── workflows/                # CI 与 GitHub Pages 部署流程
    └── ISSUE_TEMPLATE/           # Bug、功能请求和自定义 Issue 模板
```

## 5. 关于作者

- **项目作者**: Double-Cloth [Contact me](mailto:Double-Cloth@outlook.com)
- **项目地址**: [GitHub - Whalgebra](https://github.com/Double-Cloth/Whalgebra)

## 6. 许可证

本项目基于 [MIT License](./LICENSE) 开源。
