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

项目工具使用仓库内置脚本和 `assets/lib/svgo.browser.js`，无需下载 npm 依赖。

常用工具命令：

```powershell
npm run reverse-build -- --force
npm run compress-svg
```

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
├── .git/                        # Git 版本控制目录
├── .github/                     # GitHub 配置（如 CI、Issue 模板等）
├── .gitignore                   # Git 忽略文件配置
├── assets/                      # 公共静态资源目录
│   ├── ui/                      # 工作台、工具页和测试页的公共 UI 层
│   │   ├── styles/              # 公共 UI 样式
│   │   │   ├── shared.css       # 设计令牌、背景、面板、按钮与状态组件
│   │   │   ├── portal.css       # 根入口专属布局
│   │   │   ├── tool-page.css    # 工具页表单与日志布局
│   │   │   └── test-console.css # 测试控制台布局与日志样式
│   │   └── scripts/             # 公共 UI 脚本与组件
│   │       ├── shared.js        # 环境检测、状态更新与 JSON 请求工具
│   │       ├── tool_form.js     # 工具表单提交与状态管理
│   │       ├── json_tree.js     # JSON 树渲染组件
│   │       ├── log_console.js   # 浏览器日志控制台组件
│   │       └── test_console.js  # 测试控制台页面控制器
│   ├── images/                  # 图片及字体资源
│   │   ├── chinese_name_of_operators/   # 运算符中文名 SVG
│   │   ├── instructions_of_operators/   # 运算符说明 SVG
│   │   ├── fonts/                       # 数学符号/字母 SVG 字体
│   │   ├── icons/                       # 网站图标
│   │   └── others/                      # 其他图片
│   ├── lib/                    # 本地第三方浏览器库
│   │   └── svgo.browser.js     # SVG 优化引擎
│   └── previous_versions.zip   # 旧版本归档
├── index.html                  # 项目主入口页面
├── src/                        # 源码目录
│   ├── .nojekyll               # 阻止 GitHub Pages 使用 Jekyll
│   ├── css/                    # 样式文件
│   ├── js/                     # 主要 JS 逻辑
│   └── index.html              # 源码区入口页面
├── test/                       # 测试相关
│   ├── browser/                # 浏览器端测试逻辑
│   │   └── test_logic.js       # 浏览器端测试用例执行逻辑
│   ├── cases/                  # 测试用例数据
│   ├── node/                   # Node.js 工具层自动化测试
│   └── web/                    # 测试页面入口
│       └── index.html          # 测试控制台页面
├── tools/                      # 项目辅助工具
│   ├── cli/                    # 命令行工具
│   │   ├── reverse_build.js    # 逆向构建脚本
│   │   └── svg_compressor.js   # SVG 压缩工具
│   ├── server/                 # 本地服务
│   │   └── run_server.js       # 静态服务器与工具 API
│   └── web/                    # 工具页面
│       ├── reverse_build.html  # 逆向构建页面
│       └── svg_compressor.html # SVG 压缩页面
├── dist/                       # 构建输出目录
├── package.json                # Node.js 启动命令
├── README.md                   # 项目说明文档
└── LICENSE                     # 许可证
```

## 5. 关于作者

- **项目作者**: Double-Cloth [Contact me](mailto:Double-Cloth@outlook.com)
- **项目地址**: [GitHub - Whalgebra](https://github.com/Double-Cloth/Whalgebra)

## 6. 许可证

本项目基于 [MIT License](./LICENSE) 开源。
