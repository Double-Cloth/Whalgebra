# 工具目录说明

本目录包含 Whalgebra 项目辅助工具。工具只服务于本地开发、资源处理和源码拆分，不参与计算器运行时。

## 目录结构

```text
tools/
├── cli/       # 可直接通过 Node.js 运行的命令行工具
├── server/    # 本地静态服务器和受限 Web 工具 API
├── shared/    # 工具链共享路径与文件系统逻辑
└── web/       # 浏览器工具页面
```

## 本地服务器

启动项目入口和 Web 工具页面：

```powershell
npm start
```

等同于：

```powershell
node tools/server/run_server.js --dir .
```

常用参数：

- `--dir <PATH>`：指定服务目录，默认是项目根目录。
- `--port <PORT>`：指定起始端口，默认从 `8000` 开始寻找可用端口。
- `--lan`：监听 `0.0.0.0`，允许局域网访问静态页面。
- `--local`：仅监听 `127.0.0.1`，这是默认行为。
- `--no-open`：启动后不自动打开浏览器。
- `-h, --help`：显示帮助。

默认仅本机监听。需要局域网预览时再显式使用：

```powershell
npm start -- --lan
```

服务器会禁用缓存，并添加 `X-Content-Type-Options: nosniff` 和 `Referrer-Policy: same-origin` 等基础响应头。目录没有 `index.html` 时不会列目录，会返回 `403`。

## Web 工具 API

`tools/server/run_server.js` 提供两个受限 API，供 `tools/web/` 下的页面调用：

- `POST /api/tools/reverse-build`
- `POST /api/tools/svg-compressor`

API 限制：

- 只接受同源页面调用。
- 只接受 `application/json` 请求。
- 请求体最大 `1 MB`。
- 所有路径必须位于项目目录内。
- Web 逆向构建只能输出到 `src` 或 `tmp`。
- Web SVG 工具的输入、输出和临时目录都必须位于 `tmp`。

浏览器工具入口在项目首页中提供，也可以直接访问：

- `tools/web/reverse_build.html`
- `tools/web/svg_compressor.html`

## 逆向构建工具

逆向构建工具会读取单文件 HTML，将有效的内联 `<style>` 和 `<script>` 拆成独立文件，并更新 HTML 引用。

默认命令：

```powershell
npm run reverse-build -- --force
```

等同于处理：

- 输入文件：`dist/Whalgebra.html`
- 输出目录：`src`

直接运行：

```powershell
node tools/cli/reverse_build.js [input_file] [选项]
```

参数：

- `-o, --out <PATH>`：指定输出目录。
- `--no-dedent`：禁用智能去缩进。
- `-f, --force`：目标目录存在时直接清空并继续。
- `-h, --help`：显示帮助。

示例：

```powershell
node tools/cli/reverse_build.js dist/Whalgebra.html --out src --force
node tools/cli/reverse_build.js tmp/single.html --out tmp/reverse-output --no-dedent --force
```

注意：

- 输出目录不能是磁盘根目录或项目根目录。
- 输出目录不能包含输入文件。
- 未使用 `--force` 且输出目录已存在时，CLI 会要求确认。
- 会在输出目录生成 `.nojekyll`、`index.html`、`css/` 和 `js/`。

## SVG 压缩工具

SVG 工具会优化输入目录中的 `.svg` 文件，输出优化后的 SVG，并生成包含 Base64 `content: url(...)` 的 CSS。

默认命令：

```powershell
npm run compress-svg
```

默认路径：

- 输入目录：`tmp/input`
- CSS 输出目录：`tmp/output-css`
- 优化后 SVG 输出目录：`tmp/output-svg`
- CSS 文件名：`icons.css`
- 默认高度：`5dvmin`

直接运行：

```powershell
node tools/cli/svg_compressor.js [选项]
```

参数：

- `-i, --input <PATH>`：指定 SVG 输入目录。
- `--output <PATH>`：指定 CSS 输出目录。
- `--temp <PATH>`：指定优化后 SVG 输出目录。
- `-h, --help`：显示帮助。

示例：

```powershell
node tools/cli/svg_compressor.js --input tmp/input --output tmp/output-css --temp tmp/output-svg
```

注意：

- 输入目录不存在时会自动创建目录并退出，放入 SVG 后再重新运行。
- 输出目录和临时目录会在运行前清空。
- 输出目录不能包含输入目录、项目根目录或彼此嵌套。
- 如果 SVG 中包含 `<text>`、`<tspan>`、`<textPath>` 或 `flowRoot`，工具会提示先转曲。

## 共享文件系统逻辑

`tools/shared/filesystem.js` 提供工具共用的路径安全检查：

- `PROJECT_ROOT`：项目根目录。
- `nativeNewlines()`：按当前系统换行符输出文件。
- `resolveProjectPath()`：把输入路径限制在项目目录内。
- `assertSafeOutputPaths()`：阻止输出到磁盘根目录、项目根目录、输入目录父级或互相嵌套目录。

新增工具时应复用这些方法，不要绕过路径检查直接删除或覆盖目录。

## 新增或修改工具的检查项

1. 命令行入口放在 `tools/cli/`，浏览器入口放在 `tools/web/`。
2. 会写文件或删除目录的工具必须使用 `tools/shared/filesystem.js` 的路径检查。
3. Web API 只能暴露必要能力，并保持同源、JSON 和路径限制。
4. 工具页面复用 `assets/ui/` 下的共享样式和脚本，不写内联样式或内联事件。
5. 修改工具后运行 `npm test`，确保服务器、安全路径和页面结构测试通过。
