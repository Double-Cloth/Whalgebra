# **Whalgebra**

<div align="center">
<img src="assets/images/icons/logo.png" alt="Whalgebra Logo" width="128" height="128" />
<h3>一款基于原生 Web 技术的轻量级代数计算工具</h3>
</div>

**项目简介**

**Whalgebra**（原名 D-Calculator）是一个基于原生 Web 技术栈构建的代数计算器。项目经历了从 Python 脚本原型到单文件 HTML，再到模块化前端工程的演进过程。

该项目旨在提供一个**无需依赖**、**离线可用**且**精度可控**的数学计算环境。无论是在桌面端浏览器还是移动设备上，Whalgebra 都能提供一致的计算体验。

## 🌟 核心特性

### 1. 核心计算引擎架构

- **复数域全维度支持**：全面支持复数域内的四则运算与各种函数的计算。
- **任意精度数值运算**：突破 JavaScript 标准浮点数（IEEE 754）16 位有效数字的精度限制，支持用户自定义精度的数值运算。
- **纯客户端架构设计**：所有计算逻辑均在客户端浏览器本地执行，零后端依赖，确保存储数据的隐私安全性及离线环境下的可用性。

### 2. 数学函数库

Whalgebra 内置了完备的数学函数库，涵盖以下主要计算类别：

| 类别            | 函数列表                                                                                                             |
| :-------------: | :-----------------------------------------------------------------------------------------------------------------: |
| **基础代数运算** | 加 (`+`)、减 (`-`)、乘 (`*`)、除 (`/`)、取余 (`mod`)、幂运算 (`^`)、平方根 (`sqrt`)、立方根 (`cbrt`)、N次根 (`nroot`) 等 |
| **超越函数**     | 指数函数 (`exp`)、自然对数 (`ln`)、常用对数 (`lg`)、对数函数 (`log`) 等                                                 |
| **三角函数**     | `sin`, `cos`, `tan`, `arcsin`, `arccos`, `arctan` (支持弧度/角度模式) 等                                              |
| **双曲函数**     | `sh` (`sinh`), `ch` (`cosh`), `th` (`tanh`) 及其反函数 `arsh`, `arch`, `arth` 等                                      |
| **特殊运算**     | 阶乘 (`!`)、伽马函数 (`gamma`)、符号函数 (`sgn`)、绝对值 (`abs`)、取整函数（`ceil`，`floor`）等                          |

### 3. 丰富的扩展功能

- 基础表达式计算
- 统计计算和回归分析
- 自定义函数
- 函数数表生成
- 多项式函数分析（幂次支持 0-4 次）
- 复变根式函数求根

### 4.单文件集成

- 项目采用了 “单文件 Web 应用” 结构，将 HTML 结构、CSS 样式和复杂的 JavaScript 逻辑全部集成在一个 .html 文件中，便于分发和离线使用。

## 🚀 快速开始

### 在线访问

[Click here](https://Double-Cloth.github.io/Whalgebra/)

### 浏览器端本地运行

1.通过 Git 版本控制系统获取代码库：

`git clone https://github.com/Double-Cloth/Whalgebra.git`

2.运行根目录下的 `run_server.py`。

### Android 移动端本地运行

1.访问项目发行版页面 （[Releases](https://github.com/Double-Cloth/Whalgebra/releases)）。

2.下载最新版本的 .apk 应用程序安装包。

3.在 Android 终端设备上完成安装并启动。

## ⌨️ 键盘快捷键与交互示例

为了提高输入效率，计算器支持以下键盘映射（仅部分示例）：

| 键盘按键     | 功能说明                |
| :---------: | :---------------------: |
| `Enter`     | 执行计算、返回           |
| `Backspace` | 删除光标前的一个字符      |
| `Delete`    | 删除光标后的一个字符      |
| `alt` + `e` | 快捷输入自然对数底数      |
| `alt` + `i` | 快捷输入虚数单位         |

## 🔌 应用程序接口

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

## 🛠 技术架构体系

- **核心层**: HTML5, CSS3, Vanilla JavaScript (ES6+ 标准)。坚持无框架依赖原则，确保代码的轻量化与底层控制力。
- **渲染层**: 全部使用 svg 作为字体和图片，保证了在不同设备上显示效果相同。
- **工具层**: Python (主要用于文件处理流程，不参与计算过程)。

## 📚 参考资料

- [Lanczos 近似算法](https://github.com/Double-Cloth/LanczosApproximation)

## 👨‍💻 关于作者

- **项目作者**: Double-Cloth [Contact me](mailto:Double-Cloth@outlook.com)
- **项目地址**: [GitHub - Whalgebra](https://github.com/Double-Cloth/Whalgebra)

## 📄 许可证

本项目基于 **MIT 许可证** 开源。
