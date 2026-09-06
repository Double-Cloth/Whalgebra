/** 初始化并导出页面配置、渲染与交互工具。 */
(function () {
    "use strict";

    /** 管理页面配置和持久化的 UI 状态。 */
    class PageConfig {
        /**
         * 定义了“普通精度”模式下的计算和输出精度配置。
         * - `globalCalcAccuracy`: 30位的内部计算精度，适用于快速计算。
         * - `outputAccuracy`: 10位的输出显示精度。
         * 此配置通过 `calcAccMode` setter 应用。
         *
         * @readonly
         * @type {{globalCalcAccuracy: number, outputAccuracy: number}}
         */
        static ACC_MODE_0 = {
            globalCalcAccuracy: 36,
            outputAccuracy: 12
        };

        /**
         * 定义了“高精度”模式下的计算和输出精度配置。
         * - `globalCalcAccuracy`: 220位的内部计算精度，用于需要高准确性的科学计算。
         * - `outputAccuracy`: 100位的输出显示精度。
         * 此配置通过 `calcAccMode` setter 应用。
         *
         * @readonly
         * @type {{globalCalcAccuracy: number, outputAccuracy: number}}
         */
        static ACC_MODE_1 = {
            globalCalcAccuracy: 220,
            outputAccuracy: 100
        };

        /**
         * 一个静态映射表，将特殊的数学或结构字符转换为其对应的“安全”字符串，用作 CSS 类名的一部分。
         * 此配置由 `HtmlTools.textToHtmlClass` 方法使用，目的是将数学表达式字符串（例如 "2+3") 转换为一系列 CSS 类（例如, ['_2_', '_plus_', '_3_']）。
         * 这些类随后用于渲染表达式的视觉表示，通常是通过为每个字符/符号应用带有特定背景图像的样式。
         *
         * @type {Object<string, string>}
         */
        static classNameConverterConfig = {
            ' ': 'space',
            '+': 'plus',
            '-': 'minus',
            '*': 'times',
            '/': 'divide',
            '^': 'pow',
            '=': 'equal',
            ',': 'comma',
            ';': 'semicolon',
            '!': 'fact',
            '|': 'abs',
            '_': 'underline',
            '.': 'dp',
            ':': 'colon',
            '(': 'parentheses_left',
            ')': 'parentheses_right',
            '{': 'curlyBraces_left',
            '}': 'curlyBraces_right',

            // 中括号用于让分词器将内容识别为单个词元。
            '[e]': 'e_mathit',
            '[i]': 'i_mathit',
            '[x]': 'x_mathit',
            '[k]': 'k_mathit'
        };

        /**
         * 阻止实例化静态配置类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[PageConfig] PageConfig is a static class and should not be instantiated.');
        }

        /**
         * 存储每个主计算器模式下当前选定的子模式。
         * 对象的键是主模式的标识符（例如, '1', '2_0'），值是该主模式下活动的子模式的标识符。
         * 此状态用于管理 UI 状态，并在 `localStorage` 中持久化，以便在会话之间保持用户的选择。
         *
         * @private
         * @type {{'1':[number,number],'2_0':string,'2_1':string,'3':string,'4':string}}
         */
        static _subModes = {
            '1': [0, 0],
            '2_0': '0',
            '2_1': '0',
            '3': '0',
            '4': '0'
        };

        /**
         * 获取存储每个主计算器模式下当前选定子模式的对象。
         *
         * @type {{'1':[number,number],'2_0':string,'2_1':string,'3':string,'4':string}}
         * @returns {{'1':[number,number],'2_0':string,'2_1':string,'3':string,'4':string}} 活动子模式对象本身：
         *   `1` 保存当前统计表 `[row,column]`；`2_0`、`2_1` 保存两个函数页的输入槽；`3`、`4`
         *   保存多项式与根式页的活动字段。返回值不是副本，外部更新应使用 setter 以触发 UI 和持久化。
         */
        static get subModes() {
            return PageConfig._subModes;
        }

        /**
         * 设置一个或多个主模式的子模式，并相应地更新用户界面。
         * 此方法会处理不同主模式下子模式切换的特定 UI 逻辑（例如，高亮数据网格或切换输入区域），
         * 并将新的子模式状态持久化到 `localStorage`。
         *
         * @param {object} obj - 要合并的子模式补丁；键可为主模式
         *   `0`、`1`、`2_0`、`2_1`、`3`、`4`，或用 `default` 指代当前主模式。普通模式的值是
         *   已登记的子模式 ID；统计模式 `1` 使用 `[rowIndex, columnIndex]`，行列均按零基索引。
         *   可一次更新多个键；每项分别校验，成功项会触发对应 UI 切换并持久化当前完整状态。
         * @throws {Error} 如果提供的子模式 ID 对于其主模式是无效的。
         * @example
         * // 将模式 '2_0' 的子模式设置为 '1'
         * PageConfig.subModes = { '2_0': '1' };
         */
        static set subModes(obj) {
            /**
             * 更新单个主模式的子模式、界面和持久化状态。
             *
             * @param {string|Array<number|string>} name - 目标子模式；模式 `1` 传 `[row, column]`，
             *   其余模式传该模式白名单中的字符串 ID。
             * @param {string} dealMode - 已解析的主模式 ID；`default` 在调用此函数前替换为
             *   `PageConfig.currentMode`，并据此选择校验规则和界面副作用。
             * @throws {Error} 子模式无效时抛出。
             * @private
             */
            function _changeSubModes(name, dealMode) {
                if (dealMode === '0') {
                    return;
                }

                if (dealMode === 'default') {
                    dealMode = PageConfig.currentMode;
                }

                // 统计模式使用 [row, column] 坐标，其余模式使用固定字符串枚举。
                if (dealMode === '1') {
                    if (!Array.isArray(name)) {
                        name = name.split(',');
                    }
                    [name[0], name[1]] = [Number(name[0]), Number(name[1])];

                    const children = PageConfig.screenData['1'];
                    if (![0, 1].includes(name[1]) || name[0] >= children.length || name.length !== 2) {
                        throw new Error('[PageConfig] Unsupported sub-mode (out of range).');
                    }

                    /**
                     * 双重 requestAnimationFrame 封装，用于确保 DOM 初始状态已完全上屏（渲染），
                     * 避免浏览器由于批量渲染合并样式，从而完美触发 CSS 过渡动画。
                     * - @param {Function} callback - 在第二帧重绘前执行的回调函数
                     */
                    const safeRaf = (callback) => {
                        requestAnimationFrame(() => requestAnimationFrame(callback));
                    };

                    if (PageConfig.currentMode === '1') {
                        const gridOn = HtmlTools.getHtml('.GridOn');
                        if (gridOn) {
                            safeRaf(() => gridOn.classList.remove('GridOn'));
                        }

                        InputManager.statisticsRenderer.applyToItem(name[0], (el) => {
                            const targetEl = el.children[name[1] + 1];
                            safeRaf(() => targetEl.classList.add('GridOn'));
                        });
                    }
                } else {
                    const modeValidations = {
                        '2_0': ['0', '1'],
                        '2_1': ['0', '1', '2'],
                        '3': ['0', '1', '2', '3', '4'],
                        '4': ['0', '1']
                    };

                    const validation = modeValidations[dealMode];

                    if (!validation.includes(name)) {
                        throw new Error('[PageConfig] Unsupported sub-mode');
                    }

                    HtmlTools.getHtml(`#screen_input_${dealMode}${PageConfig._subModes[dealMode]}`).classList.remove('ScreenInputsOn');
                    HtmlTools.getHtml(`#screen_input_${dealMode}${name}`).classList.add('ScreenInputsOn');
                }

                PageConfig._subModes[dealMode] = name;
                PageControlTools.keyboardFuncBecomeX();
                PageControlTools.changeInputTip();
                try {
                    localStorage.setItem('subModes', JSON.stringify(PageConfig._subModes));
                } catch {
                    console.warn('[PageConfig] "subModes" storage failed');
                }
            }

            if (!obj) {
                throw new Error('[PageConfig] Unsupported sub-mode');
            }

            for (const key of Object.keys(obj)) {
                if (key === 'default' || PageConfig._subModes[key] !== undefined) {
                    _changeSubModes(obj[key], key);
                }
            }
        }

        /**
         * 存储当前计算器的操作模式。
         * 这是一个私有静态字段，应通过 `currentMode` 的 getter 和 setter 进行访问和修改。
         * 值的例子：`0` 为标准计算，`1` 为统计回归，`2_0` 为函数值列表。
         *
         * @private
         * @type {string}
         */
        static _currentMode = '0';

        /**
         * 获取当前计算器的操作模式。
         *
         * @type {string}
         */
        static get currentMode() {
            return PageConfig._currentMode;
        }

        /**
         * 设置当前计算器的操作模式，并触发相应的 UI 更新。
         *
         * @param {'0'|'1'|'2_0'|'2_1'|'3'|'4'} mode - 新的主计算模式：分别对应普通计算、统计、
         *   两个函数输入页、多项式分析和根式分析。重复设置当前值不会重放切换副作用；成功切换会
         *   更新标题、输入提示、活动子模式和持久化状态。
         * @throws {Error} 如果提供的模式不受支持，则抛出错误。
         */
        static set currentMode(mode) {
            if (!['0', '1', '2_0', '2_1', '3', '4'].includes(mode)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            // 标题和屏幕切换仍需读取旧模式，因此必须在覆写 _currentMode 前执行。
            PageControlTools.changeTitle(mode);
            PageControlTools.changeScreen(mode);

            // 模式切换同时维护输入区、结果区、虚拟列表、键盘提示和持久化状态。
            HtmlTools.getHtml(`#mode_${PageConfig._currentMode[0]}`).classList.remove('SelectionOn');
            HtmlTools.getHtml(`#print_content_${PageConfig._currentMode[0].slice(0, 1)}`).classList.add('NoDisplay');
            PageConfig._currentMode = mode;
            // 虚拟统计表只在统计模式保持运行，离开时暂停以免隐藏容器参与测量。
            if (mode === '1') {
                if (InputManager.statisticsRenderer.isPaused()) {
                    InputManager.statisticsRenderer.resume();
                }
                HtmlTools.getHtml('#keyboard_top').classList.add('ForMode1');
                const data = PageConfig.screenData['1'];
                InputManager.statisticsRenderer.load(data, data.length, {resetScroll: false});

                HtmlTools.scrollToView();
            } else {
                if (InputManager.statisticsRenderer.isRunning()) {
                    InputManager.statisticsRenderer.pause();
                }
                HtmlTools.getHtml('#keyboard_top').classList.remove('ForMode1');
            }

            HtmlTools.getHtml(`#mode_${PageConfig._currentMode[0]}`).classList.add('SelectionOn');
            HtmlTools.getHtml(`#print_content_${PageConfig._currentMode[0].slice(0, 1)}`).classList.remove('NoDisplay');
            PageControlTools.keyboardFuncBecomeX();
            PageControlTools.changeInputTip();
            PageControlTools.changeSubKeyboard('allNotShow');
            if (!HtmlTools.getHtml('.InputTip')) {
                InputManager.ac();
            }
            try {
                localStorage.setItem('currentMode', mode);
            } catch {
                console.warn('[PageConfig] "currentMode" storage failed');
            }
        }

        /**
         * 存储当前的输出模式。
         * '0' 代表代数式模式，'1' 代表极坐标式模式。
         * 这是一个私有静态字段，应通过 `printMode` 的 getter 和 setter 进行访问和修改。
         *
         * @private
         * @type {string}
         */
        static _printMode = '0';

        /**
         * 获取当前的输出模式。
         *
         * @type {string}
         */
        static get printMode() {
            return PageConfig._printMode;
        }

        /**
         * 设置当前的输出模式，并更新 UI 以反映更改。
         *
         * @param {'0'|'1'} mode - `0` 表示代数形式，`1` 表示极坐标形式；setter 会同步
         *   `CalcConfig.globalPrintMode`、切换开关视觉状态并持久化选择，无效值不会产生部分更新。
         * @throws {Error} 如果提供的模式不受支持，则抛出错误。
         */
        static set printMode(mode) {
            if (!['0', '1'].includes(mode)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            HtmlTools.getHtml(`#print_${PageConfig._printMode}`).classList.remove('SelectionOn');
            PageConfig._printMode = mode;
            HtmlTools.getHtml(`#print_${PageConfig._printMode}`).classList.add('SelectionOn');
            CalcConfig.globalPrintMode = mode === '0' ? 'algebra' : 'polar';

            try {
                localStorage.setItem('printMode', mode);
            } catch {
                console.warn('[PageConfig] "printMode" storage failed');
            }
        }

        /**
         * 存储当前键盘的“第二功能”（2nd）状态。
         * - `0`: 普通模式。
         * - `1`: 第二功能模式。
         * 这是一个私有静态字段，应通过 `keyboardType` 的 getter 和 setter 进行访问和修改，以确保 UI 和内部状态的同步。
         *
         * @private
         * @type {number}
         */
        static _keyboardType = 0;

        /**
         * 获取当前键盘的“第二功能”状态。
         *
         * @type {number}
         */
        static get keyboardType() {
            return PageConfig._keyboardType;
        }

        /**
         * 设置键盘的“第二功能”状态，并动态更新子键盘上所有按钮的功能和显示。
         * 此 setter 负责：
         * 1. 验证输入的状态值。
         * 2. 遍历所有受影响的子键盘按钮。
         * 3. 根据 `keyboardsConfig` 中的映射，清除并重新生成每个按钮的显示内容（通常是代表函数名的图标）。
         * 4. 如果状态发生实际变化，触发 `_2nd_` 按钮的视觉状态切换。
         * 5. 将新的状态持久化到 `localStorage`。
         *
         * @param {0|1} type - 键盘层级：`0` 使用主功能标签，`1` 使用第二功能标签；必须是数值而非
         *   字符串。设置相同状态只保持现状，实际变化时重绘键帽并保存到本地。
         * @throws {Error} 如果提供的 `type` 不是 `0` 或 `1`，则抛出错误。
         */
        static set keyboardType(type) {
            const keyboardsConfig = {
                '0': ['sin', 'arcsin'],
                '1': ['cos', 'arccos'],
                '2': ['tan', 'arctan'],
                '3': ['sh', 'arsh'],
                '4': ['ch', 'arch'],
                '5': ['th', 'arth'],
                '6': ['f', 'g'],
                '7': ['re', 'im'],
                '8': ['ceil', 'floor'],
                '9': ['arg', '[toPolar]'],
                '10': ['[pow]', 'nroot'],
                '11': ['sqrt', 'cbrt'],
                '12': ['ln', 'exp'],
                '13': ['lg', 'log']
            };

            if (![0, 1].includes(type)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            const secondaryKeyboard = [...HtmlTools.getHtml('.SecondaryKeyboard', -1)];
            // 配置索引与二级键帽的 DOM 顺序一一对应，type 直接选择主、副标签。
            for (let i = 0; i < secondaryKeyboard.length; i++) {
                const index = secondaryKeyboard[i];

                HtmlTools.appendDOMs(
                    index,
                    HtmlTools.textToHtmlClass(keyboardsConfig[i.toString()][type]),
                    {mode: 'replace'}
                );
            }

            // 仅层级实际变化时同步“2nd”按钮状态，重复赋值只重绘键帽。
            if (PageConfig._keyboardType !== type) {
                PageControlTools.changeSubKeyboard('_2nd_');
            }

            PageConfig._keyboardType = type;
            PageControlTools.keyboardFuncBecomeX();
            // 界面更新已经完成；持久化失败不回滚当前会话状态。
            try {
                localStorage.setItem('keyboardType', type.toString());
            } catch {
                console.warn('[PageConfig] "keyboardType" storage failed');
            }
        }

        /**
         * 存储当前的计算精度模式。
         * - `0`: 普通精度模式，适用于快速计算。
         * - `1`: 高精度模式，用于需要更高准确性的科学计算。
         * 这是一个私有静态字段，应通过 `calcAccMode` 的 getter 和 setter 进行访问和修改。
         *
         * @private
         * @type {number}
         */
        static _calcAccMode = 0;

        /**
         * 获取当前的计算精度模式。
         *
         * @type {number}
         */
        static get calcAccMode() {
            return PageConfig._calcAccMode;
        }

        /**
         * 设置计算精度模式，并相应地更新全局计算配置和 UI。
         * 此 setter 会：
         * 1. 验证输入的模式值。
         * 2. 根据所选模式（普通或高精度）更新 `CalcConfig` 中的 `globalCalcAccuracy` 和 `outputAccuracy`。
         * 3. 切换 UI 中精度开关的视觉状态。
         * 4. 更新内部状态并将其持久化到 `localStorage`。
         *
         * @param {0|1} mode - `0` 选择普通计算精度，`1` 选择配置的高精度；必须是数值枚举。
         *   setter 会更新主线程精度、异步同步 Worker、切换 UI 并持久化状态。
         * @throws {Error} 如果提供的 `mode` 不是 `0` 或 `1`，则抛出错误。
         */
        static set calcAccMode(mode) {
            if (![0, 1].includes(mode)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            const accMode = mode === 0 ? this.ACC_MODE_0 : this.ACC_MODE_1;
            CalcConfig.globalCalcAccuracy = accMode.globalCalcAccuracy;
            CalcConfig.outputAccuracy = accMode.outputAccuracy;

            if (mode !== PageConfig._calcAccMode) {
                HtmlTools.getHtml('#switch_container').classList.toggle('Active');
            }

            PageConfig._calcAccMode = mode;
            try {
                localStorage.setItem('calcAccMode', mode.toString());
            } catch {
                console.warn('[PageConfig] "calcAccMode" storage failed');
            }
        }

        /**
         * 存储屏幕上各个输入区域的数据。
         * 键是区域的标识符（例如 '1' 代表统计模式的网格数据，'2_00' 代表函数定义模式的 f(x) 表达式），
         * 值是该区域的输入内容。对于统计模式，值是一个二维数组 `[[x1, y1], [x2, y2], ...]`。
         * 对于其他模式，值是表达式字符串。
         *
         * @private
         * @type {Object<string, string|Array[]>}
         */
        static _screenData = {
            '1': [['', '']],
            '2_00': '',
            '2_01': '',
            // '2_1' 模式下的子模式 '0', '1', '2' 对应的值
            // '2_10': 起始值
            // '2_11': 终止值
            // '2_12': 步长
            '2_10': '',
            '2_11': '',
            '2_12': '',
            '30': '',
            '31': '',
            '32': '',
            '33': '',
            '34': '',
            '40': '',
            '41': ''
        };

        /**
         * 获取当前屏幕上所有输入区域的数据。
         *
         * @type {Object<string, string|Array<Array<string>>>}
         * @returns {Object<string, string|Array<[string,string]>>} 当前持久化状态对象本身：键 `1` 是
         *   统计表，每行固定为 `[xExpression,yExpression]`；`2_00`/`2_01` 是 f、g 函数体，
         *   `2_10`～`2_12` 是值列表边界，`30`～`34` 是四次到常数项系数，`40`/`41` 是被开方数
         *   与根指数。各表达式均使用内部词元字符串；返回值不是防御性副本，外部应通过 setter 更新。
         */
        static get screenData() {
            return PageConfig._screenData;
        }

        /**
         * 设置屏幕数据。
         * 此 setter 允许批量更新 `_screenData` 中的部分或全部字段。
         * 它会将传入对象 `data` 中的键值对合并到当前的 `_screenData` 中，但仅限于 `_screenData` 中已存在的键。
         * 更新后，新的状态会被立即持久化到 `localStorage`。
         * 注意，可以使用参数 {'1': [x, y, val]} 来修改统计模式中指定位置上的值（x,y 为修改位置的坐标，val 为修改后的值）
         *
         * @param {Object<string, string|Array<*>>} data - `_screenData` 的部分补丁；未知键被忽略。
         *   普通模式的值是内部表达式字符串；键 `1` 通常传完整二维统计表，也可传
         *   `[rowIndex, columnIndex, value]` 只更新一个单元格。局部更新会保留其他行列，成功结果持久化。
         */
        static set screenData(data) {
            if (!data || typeof data !== 'object') {
                return;
            }

            Object.entries(data).forEach(([key, value]) => {
                // 只接受已有的自有属性，避免原型链注入。
                if (!Object.hasOwn(PageConfig._screenData, key)) {
                    return;
                }

                // 统计键兼容单元格坐标补丁和完整二维表，首项不是数组时按坐标补丁解释。
                if (key === '1' && !Array.isArray(value[0])) {
                    const [row, col, newVal] = value;
                    const targetMatrix = PageConfig._screenData['1'];

                    const isValidRow = row >= 0 && row < targetMatrix.length;
                    const isValidCol = col >= 0 && col < 2;

                    if (isValidRow && isValidCol) {
                        targetMatrix[row][col] = newVal;
                    }

                    if (PageConfig.currentMode === '1') {
                        InputManager.statisticsRenderer.load(targetMatrix, targetMatrix.length, {resetScroll: false});
                    }
                    return;
                }

                // 完整数组使用深拷贝，防止调用方后续原地修改绕过 setter 的同步副作用。
                const val = Array.isArray(value) ? structuredClone(value) : value;
                PageConfig._screenData[key] = val;

                if (key === '1' && PageConfig.currentMode === '1') {
                    InputManager.statisticsRenderer.load(val, val.length, {resetScroll: false});
                }
            });
            try {
                localStorage.setItem('screenData', JSON.stringify(PageConfig._screenData));
            } catch {
                console.warn('[PageConfig] "screenData" storage failed');
            }
        }

        /**
         * 从 DOM 读取指定屏幕区域的当前输入内容，更新内部的 `_screenData` 状态，并将其持久化到 `localStorage`。
         * 此方法是连接用户界面输入和应用程序数据状态的关键环节。
         *
         * @param {string|null} [area=null] - 要更新的屏幕区域的标识符（例如 '1', '2_00'）。
         *   如果为 `null`，则根据当前模式和子模式自动确定区域。
         * @returns {void}
         */
        static syncScreenData(area = null) {
            const currentMode = PageConfig.currentMode;

            let name;
            if (area) {
                name = area;
            } else {
                name = currentMode === '1' ? '1' : currentMode + PageConfig.subModes[currentMode];
            }

            // 统计网格编辑时已直接回写数据；只有普通子屏需要从 DOM 反向提取表达式。
            if (name !== '1') {
                const target = HtmlTools.getHtml(`#screen_input_inner_${name}`);
                PageConfig._screenData[name] = HtmlTools.htmlClassToText(HtmlTools.getClassList(target));
            }

            try {
                localStorage.setItem('screenData', JSON.stringify(PageConfig._screenData));
            } catch {
                console.warn('[PageConfig] "screenData" storage failed');
            }
        }
    }

    /** 提供 DOM 查询、表达式渲染和通用页面工具。 */
    class HtmlTools {
        /**
         * `_classNameConverterConfig` 的逆向映射。
         * 此对象是动态生成的，用于将 CSS 类名的一部分（例如 "plus"）转换回其原始的特殊字符（例如 "+"）。
         * 它主要由 `HtmlTools.htmlClassToText` 方法使用，以便从 DOM 元素的类名中重建原始的数学表达式字符串。
         *
         * @private
         * @type {Object<string, string>}
         */
        static _classNameConverterReverseConfig = Object.fromEntries(
            Object.entries(PageConfig.classNameConverterConfig).map(([k, v]) => [v, k])
        );

        /**
         * 一个动态生成的正则表达式，用作词法分析器（tokenizer）。
         * 它通过一个立即调用函数表达式 (IIFE) 构建，以确保只在首次加载时编译一次，从而提高性能。
         *
         * @private
         * @const {RegExp} _tokenizerRegex
         */
        static _tokenizerRegex = (() => {
            const escape = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

            // 配置符号作为首选分支，后续才回退到 `[token]` 和单字符，避免数学词元被拆散。
            const symbolPattern = Object.keys(PageConfig.classNameConverterConfig)
                .map(escape)
                .join('|');

            return new RegExp(`(${symbolPattern})|(\\[[^\\]]*\])|([\\s\\S])`, 'g');
        })();

        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[HtmlTools] HtmlTools is a static class and should not be instantiated.');
        }

        /**
         * 按 ID、类名或标签名查询 DOM。
         *
         * @param {string} name - 查询描述：`#id` 使用 `getElementById`，`.class` 使用
         *   `getElementsByClassName`，无前缀时按标签名查询；只接受单一简单选择器，不解析组合 CSS。
         * @param {number} [index=0] - 类名/标签名结果中的零基索引；`-1` 返回实时
         *   `HTMLCollection`。ID 查询忽略该参数并直接返回单个元素或 `null`。
         * @returns {HTMLElement|HTMLCollection|null|undefined} ID 查询返回元素或 `null`；类名/标签名在
         *   `index=-1` 时返回实时 `HTMLCollection`，其他索引返回对应元素，越界时为 `undefined`。
         */
        static getHtml(name, index = 0) {
            switch (name[0]) {
                case '#':
                    return document.getElementById(name.slice(1));

                case '.':
                    if (index === -1) {
                        return document.getElementsByClassName(name.slice(1));
                    }
                    return document.getElementsByClassName(name.slice(1))[index];

                default:
                    if (index === -1) {
                        return document.getElementsByTagName(name);
                    }
                    return document.getElementsByTagName(name)[index];
            }
        }

        /**
         * 提取指定范围内直接子元素的类名或 ID 标识。
         *
         * @param {HTMLElement} area - 要读取其直接子元素的父节点；不会递归扫描后代，也不会修改 DOM。
         * @param {object} [options={}] - 子节点过滤及切片选项。
         * @param {boolean} [options.onlyP=true] - `true` 时只收集 `<p>` 子元素的首个类名；`false` 时
         *   其他元素也会以类名或 `[id]...` 标识加入结果。
         * @param {boolean} [options.ignoreSpace=false] - 是否从结果中剔除内部 `_space_` 词元；
         *   索引范围仍以原始 `children` 为准，而不是过滤后的数组。
         * @param {number} [options.startIndex=0] - 在 `area.children` 中开始读取的零基索引，包含该位置。
         * @param {number|null} [options.endIndex=null] - 排他的结束索引；`null` 表示读到最后一个直接子元素。
         * @returns {string[]} 类名或 `[id]...` 标识列表。
         */
        static getClassList(area, {
            onlyP = true,
            ignoreSpace = false,
            startIndex = 0,
            endIndex = null
        } = {}) {
            if (!area) {
                return [];
            }

            const classLists = [];

            const children = area.children;
            const totalLen = children.length;

            const validStart = Math.max(0, startIndex);

            const validEnd = (endIndex !== null && endIndex !== undefined)
                             ? Math.min(endIndex, totalLen)
                             : totalLen;

            for (let i = validStart; i < validEnd; i++) {
                const child = children[i];
                let className;
                className = child.className;

                if (ignoreSpace && className === '_space_') {
                    continue;
                }

                if (onlyP && child?.tagName?.toLowerCase() === 'p') {
                    classLists.push(className);
                } else if (!onlyP) {
                    classLists.push(className === '' ? `[id]${child.id}` : className);
                }
            }

            return classLists;
        }

        /**
         * 将数学表达式或文本字符串转换为一个 CSS 类名数组。
         * 该方法作为一种词法分析器，用于将输入字符串分解为可识别的单元（token），
         * 并将每个单元映射到一个唯一的、用作 CSS 类名的字符串。
         * 这使得 HTML 能够通过为每个字符或符号应用带有特定背景图像的样式来视觉上渲染数学表达式。
         *
         * @param {string} text - 显示文本或内部数学表达式；已知多字符词元按配置映射成 `_..._`
         *   类名，单字符保留对应映射，方括号包裹的内部词元整体识别。方法不校验表达式语法。
         * @returns {string[]} 一个包含格式化后 CSS 类名的数组。
         */
        static textToHtmlClass(text) {
            const output = [];
            const config = PageConfig.classNameConverterConfig;

            const matches = text.matchAll(HtmlTools._tokenizerRegex);
            for (const match of matches) {
                const [, symbolGroup, bracketGroup, charGroup] = match;

                if (symbolGroup) {
                    output.push(`_${config[symbolGroup]}_`);
                } else if (bracketGroup) {
                    output.push(`_${bracketGroup.slice(1, -1)}_`);
                } else if (charGroup) {
                    output.push(`_${charGroup}_`);
                }
            }

            return output;
        }

        /**
         * 将一个由 `textToHtmlClass` 方法生成的 CSS 类名数组转换回其原始的文本或数学表达式字符串。
         * 这是 `textToHtmlClass` 的逆向操作，用于从 DOM 元素的类名中重建表达式，例如在处理用户输入或从 DOM 读取表达式时。
         *
         * @param {string[]} classArray - 按 DOM 顺序排列的渲染类名；支持 `_token_`、附加样式类以及
         *   `[id]...` 标识。转换只读取首个语义类并合并连续数字，不修改原数组。
         * @returns {string} 重建后的原始文本字符串。
         */
        static htmlClassToText(classArray) {
            const reverseConfig = HtmlTools._classNameConverterReverseConfig;

            return classArray.map((cls) => {
                if (!cls.startsWith('_') || !cls.endsWith('_')) {
                    return cls === '[id]cursor' ? '[cursor]' : cls;
                }
                let core = cls.slice(1, -1);

                return reverseConfig[core] ||
                    (core.length === 1 ? core : `[${core}]`);
            }).join('');
        }

        /**
         * 批量创建并插入子元素。
         *
         * @param {HTMLElement|string|DocumentFragment} parentElement - 接收新节点的父容器；字符串按
         *   `getHtml` 规则解析，`DocumentFragment` 适合先离线组装再一次挂载。
         * @param {Array<string|string[]>} nameList - 每个数组项创建一个子元素；字符串通常作为单个
         *   `class` 值，嵌套数组则按 `nameType` 的同索引依次设置多个属性。
         * @param {object} [options={}] - 节点类型、属性解释和插入位置选项。
         * @param {HTMLElement|null} [options.referenceNode=null] - 属于父容器的参照子节点；提供时优先
         *   在其前方插入并忽略 `index`。
         * @param {number} [options.index=-1] - 未提供参照节点时的零基插入位置；`-1` 或超出尾部表示追加。
         * @param {'add'|'replace'} [options.mode='add'] - `add` 保留现有子节点，`replace` 先以新建节点集合
         *   替换全部内容；两种模式都按 `nameList` 原顺序生成。
         * @param {string[]} [options.nameType=['class']] - 嵌套属性值对应的属性名数组，例如
         *   `['class', 'data-src']`；长度不足时多余属性值不会获得隐式名称。
         * @param {string} [options.appendType='p'] - 传给 `document.createElement` 的标签名；所有新节点
         *   使用同一种标签，调用方负责选择在父容器中合法的 HTML 元素。
         */
        static appendDOMs(parentElement, nameList, {
            referenceNode = null,
            index = -1,
            mode = 'add',
            appendType = 'p',
            nameType = ['class']
        } = {}) {
            const targetParent = typeof parentElement === 'string'
                                 ? HtmlTools.getHtml(parentElement)
                                 : parentElement;

            if (!targetParent || !Array.isArray(nameList)) {
                return;
            }

            // replace 模式先清空目标，随后仍通过 fragment 一次性挂载新节点。
            if (mode === 'replace') {
                InputManager.ac({acArea: parentElement});
            }

            if (nameList.length === 0) {
                return;
            }

            const fragment = document.createDocumentFragment();

            for (const name of nameList) {
                if (!name) {
                    continue;
                }

                const element = document.createElement(appendType);

                if (Array.isArray(name)) {
                    if (nameType.length !== name.length) {
                        throw new Error('[HtmlTools] The number of attribute names does not match the number of values.');
                    }
                    for (let i = 0; i < nameType.length; i++) {
                        element.setAttribute(nameType[i], name[i]);
                    }
                } else if (typeof name === 'string') {
                    // 字符串前缀允许调用方越过默认属性，显式指定 id 或 class。
                    if (name.startsWith('[id]')) {
                        element.id = name.slice(4);
                    } else if (name.startsWith('[class]')) {
                        element.className = name.slice(7);
                    } else {
                        element.setAttribute(nameType[0], name);
                    }
                } else {
                    throw new Error('[HtmlTools] The element type in `nameList` is not supported.');
                }

                fragment.appendChild(element);
            }

            if (!fragment.hasChildNodes()) {
                return;
            }

            // 只有未提供显式参照节点时，才把 index 转换为 insertBefore 的锚点。
            if (!referenceNode && index !== -1) {
                referenceNode = targetParent.children[index];
            }

            targetParent.insertBefore(fragment, referenceNode || null);
        }

        /**
         * 从表达式字符串或 CSS 类名数组中移除被视为“非法”或不需要的特定标记。
         * 当前实现专门用于移除表示乘法中点的符号 (`[cdot]` 或 `_cdot_`)。
         * 这在处理或显示表达式时非常有用，因为在某些上下文中，乘法是隐式的，不需要显式显示点。
         *
         * @param {string|string[]} expr - 要清理的输入。可以是：
         *   - 一个包含数学表达式的字符串，例如 "2[cdot]3"。
         *   - 一个由 `textToHtmlClass` 生成的 CSS 类名数组，例如 ['_2_', '_cdot_', '_3_']。
         * @returns {string|string[]} 清理后的字符串或数组，其中已移除了所有与 `cdot` 相关的标记。
         */
        static deleteIllegal(expr) {
            const deleteStrList = ['cdot', 'syntax_error'];

            if (typeof expr === 'string') {
                // 先匹配较长词元，避免短词元提前截断。
                // 转义词元中的正则元字符。
                const sortedEscaped = deleteStrList
                    .sort((a, b) => b.length - a.length)
                    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

                const regex = new RegExp(`\\[(${sortedEscaped.join('|')})\\]`, 'g');

                return expr.replace(regex, '');
            }

            const resultList = [];
            const deleteClassList = deleteStrList.map((name) => `_${name}_`);
            for (let i = 0; i < expr.length; i++) {
                const className = expr[i];

                if (!deleteClassList.includes(className)) {
                    resultList.push(className);
                }
            }
            return resultList;
        }

        /**
         * 获取当前在屏幕上处于活动状态的子输入区域的 DOM 元素。
         * 此方法根据当前的计算器模式 (PageConfig.currentMode) 和子模式 (PageConfig.subModes) 来确定哪个输入区域是活动的。
         * - 在统计模式 ('1') 下，它返回具有 '.GridOn' 类的单元格，即用户当前选中的数据网格单元。
         * - 在其他模式下，它会构造一个特定的 ID（例如 'screen_input_inner_2_00'）来查找并返回对应的输入区域 `<div>`。
         *
         * @returns {HTMLElement|null} 当前活动的子屏幕输入区域的 DOM 元素，如果找不到则返回 null。
         */
        static getCurrentSubscreenArea() {
            const currentMode = PageConfig.currentMode;

            if (PageConfig.currentMode === '1') {
                const res = HtmlTools.getHtml('.GridOn');
                return typeof res !== 'undefined' ? res : null;
            }

            const targetName = `#screen_input_inner_${currentMode}${PageConfig.subModes[currentMode]}`;

            return HtmlTools.getHtml(targetName);
        }

        /**
         * 智能地滚动输入区域或数据网格，以确保光标或当前活动的单元格在视图中可见。
         * 此方法旨在提供比标准的 `element.scrollIntoView()` 更平滑、更上下文感知的滚动体验。
         * - 对于主输入区域，它会尝试同时将光标的左侧和右侧的“单词”带入视图，而不是简单地将光标本身滚动到边缘。
         * - 在特定模式下（如统计回归模式 '1'），它还会确保数据网格中当前高亮的单元格滚动到可见区域。
         *
         * @returns {void}
         */
        static scrollToView() {
            const input = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');

            if (!input || !cursor) {
                return;
            }

            const isAtStart = !cursor.previousElementSibling;
            const isAtEnd = !cursor.nextElementSibling;

            if (isAtStart || isAtEnd) {
                cursor.scrollIntoView({inline: 'nearest'});
            } else {
                let [leftNum, rightNum] = InputManager.inputAreaMoveNum('both');

                // 最多检查相邻 5 个元素。
                leftNum = Math.min(leftNum, 5);
                rightNum = Math.min(rightNum, 5);

                let leftTarget = cursor;
                for (let i = 0; i < leftNum && leftTarget.previousElementSibling; i++) {
                    leftTarget = leftTarget.previousElementSibling;
                }

                let rightTarget = cursor;
                for (let i = 0; i < rightNum && rightTarget.nextElementSibling; i++) {
                    rightTarget = rightTarget.nextElementSibling;
                }

                // 依次滚动两侧边界，使上下文尽量完整可见。
                if (leftTarget !== cursor) {
                    leftTarget.scrollIntoView({inline: 'nearest'});
                }
                if (rightTarget !== cursor) {
                    rightTarget.scrollIntoView({inline: 'nearest'});
                }

                cursor.scrollIntoView({inline: 'nearest'});
            }

            if (PageConfig.currentMode === '1') {
                const current = PageConfig.subModes['1'];
                InputManager.statisticsRenderer.scrollToIndex(current[0]);
            }
        }

        /**
         * 检测元素是否滚动到最右侧
         *
         * @param {HTMLElement} element - 具有横向滚动度量的目标元素；`null`/`undefined` 返回 `false`。
         *   判定允许 1px 浮点误差，调用不会改变 `scrollLeft`。
         * @returns {boolean} - 如果到底则返回 true，否则返回 false
         */
        static isScrolledToRight(element) {
            if (!element) {
                return false;
            }
            const {scrollLeft, scrollWidth, clientWidth} = element;
            return scrollLeft + clientWidth >= scrollWidth - 1;
        }

        /**
         * 防抖函数
         *
         * @param {Function} func - 被包装的目标函数；执行时保留最后一次调用的 `this` 和参数，
         *   返回的包装函数复用最近一次真正执行所得的返回值。
         * @param {number} wait - 连续调用之间的等待毫秒数；会规范化为非负数。
         * @param {object} [options={}] - 首尾触发和最长等待策略。
         * @param {boolean} [options.leading=false] - 是否在一轮等待窗口的第一次调用时立即执行。
         * @param {boolean} [options.trailing=true] - 是否在最后一次调用后满 `wait` 时执行；若只发生一次
         *   且已由 `leading` 执行，则不会无条件重复调用。
         * @param {number} [options.maxWait] - 持续高频调用时允许推迟执行的最长毫秒数；内部至少取
         *   `wait`，省略时不启用最大等待强制触发。
         * @returns {Function & {cancel:function():void, flush:function():*, pending:function():boolean}} 可调用的
         *   防抖包装器；`cancel()` 丢弃待处理调用，`flush()` 立即执行尾沿调用并返回目标函数结果，
         *   `pending()` 报告是否存在计时器。普通调用返回最近一次实际执行的结果或 `undefined`。
         */
        static debounce(func, wait, options = {}) {
            let lastArgs,
                lastThis,
                maxWait,
                result,
                timerId,
                lastCallTime;

            let lastInvokeTime = 0;
            let leading = false;
            let maxing = false;
            let trailing = true;

            wait = +wait || 0;
            if (isObject(options)) {
                leading = !!options.leading;
                maxing = 'maxWait' in options;
                // `maxWait` 必须大于常规等待时间。
                maxWait = maxing ? Math.max(+options.maxWait || 0, wait) : undefined;
                trailing = 'trailing' in options ? !!options.trailing : trailing;
            }

            /** 判断值是否为对象或函数。 */
            function isObject(value) {
                const type = typeof value;
                return value != null && (type === 'object' || type === 'function');
            }

            /** 使用最近一次参数调用目标函数。 */
            function invokeFunc(time) {
                const args = lastArgs;
                const thisArg = lastThis;

                lastArgs = lastThis = undefined;
                lastInvokeTime = time;
                result = func.apply(thisArg, args);
                return result;
            }

            /** 启动防抖计时器。 */
            function startTimer(pendingFunc, wait) {
                return setTimeout(pendingFunc, wait);
            }

            /** 计算防抖调用的剩余等待时间。 */
            function remainingWait(time) {
                const timeSinceLastCall = time - lastCallTime;
                const timeSinceLastInvoke = time - lastInvokeTime;
                const timeWaiting = wait - timeSinceLastCall;

                return maxing
                       ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
                       : timeWaiting;
            }

            /** 判断当前调用是否应立即执行。 */
            function shouldInvoke(time) {
                const timeSinceLastCall = time - lastCallTime;
                const timeSinceLastInvoke = time - lastInvokeTime;

                return (
                    lastCallTime === undefined ||
                    timeSinceLastCall >= wait ||
                    timeSinceLastCall < 0 ||
                    (maxing && timeSinceLastInvoke >= maxWait)
                );
            }

            /** 处理防抖计时器到期。 */
            function timerExpired() {
                const time = Date.now();
                if (shouldInvoke(time)) {
                    return trailingEdge(time);
                }

                timerId = startTimer(timerExpired, remainingWait(time));
            }

            /** 处理防抖周期的前沿调用。 */
            function leadingEdge(time) {
                lastInvokeTime = time;
                timerId = startTimer(timerExpired, wait);
                return leading ? invokeFunc(time) : result;
            }

            /** 处理防抖周期的尾沿调用。 */
            function trailingEdge(time) {
                timerId = undefined;

                if (trailing && lastArgs) {
                    return invokeFunc(time);
                }

                lastArgs = lastThis = undefined;
                return result;
            }

            /** 取消待执行的防抖调用。 */
            function cancel() {
                if (timerId !== undefined) {
                    clearTimeout(timerId);
                }
                lastInvokeTime = 0;
                lastArgs = lastCallTime = lastThis = timerId = undefined;
            }

            /** 立即执行待处理的防抖调用。 */
            function flush() {
                return timerId === undefined ? result : trailingEdge(Date.now());
            }

            /** 判断是否存在待处理的防抖调用。 */
            function pending() {
                return timerId !== undefined;
            }

            /** 记录并调度一次防抖调用。 */
            function debounced(...args) {
                const time = Date.now();
                const isInvoking = shouldInvoke(time);

                lastArgs = args;
                lastThis = this;
                lastCallTime = time;

                if (isInvoking) {
                    if (timerId === undefined) {
                        return leadingEdge(time);
                    }

                    if (maxing) {
                        // 持续高频调用时由 maxWait 强制执行，随后重新开始普通等待周期。
                        clearTimeout(timerId);
                        timerId = startTimer(timerExpired, wait);
                        return invokeFunc(time);
                    }
                }

                if (timerId === undefined) {
                    timerId = startTimer(timerExpired, wait);
                }
                return result;
            }

            debounced.cancel = cancel;
            debounced.flush = flush;
            debounced.pending = pending;

            return debounced;
        }
    }

    /**
     * 虚拟滚动运行指标快照。
     *
     * @typedef {object} VirtualScrollMetrics
     * @property {string} state - 状态机当前状态。
     * @property {boolean} ready - 是否处于可用的 RUNNING 或 PAUSED 状态。
     * @property {boolean} isRendering - 当前是否正在提交渲染窗口。
     * @property {boolean} isSmoothScrolling - 内部平滑滚动动画是否运行中。
     * @property {boolean} isRemeasurePending - 是否已登记下一次行高重测。
     * @property {number} itemHeight - 当前统一逻辑行高（px），未测量时为 0。
     * @property {number} containerHeight - 最近记录的容器可视高度（px）。
     * @property {number} bufferSize - 视口上下额外渲染的条目数。
     * @property {number} visibleCount - 按当前行高向上取整的可见条目数。
     * @property {number} totalCount - 当前逻辑条目总数。
     * @property {number} startIndex - 已渲染窗口起点（含）。
     * @property {number} endIndex - 已渲染窗口终点（不含）。
     * @property {number} renderedCount - 当前登记的行节点数。
     * @property {number} anchorIndex - 尺寸变化时用于恢复位置的锚点索引。
     * @property {number} anchorRatio - 锚点在行内的位置比例，保留四位小数。
     * @property {number} scrollTop - 容器当前物理滚动位置（px）。
     * @property {boolean} compressed - 虚拟高度是否已压缩到浏览器安全物理高度。
     * @property {number} virtualHeight - 未压缩的完整逻辑内容高度（px）。
     * @property {number} physicalHeight - 实际由 spacer 和节点承载的内容高度（px）。
     * @property {number} scrollRatio - 虚拟距离到物理距离的映射比例。
     * @property {number} poolSize - 当前可复用包装节点数。
     * @property {number} wrapperCount - 已创建的池化包装节点总数。
     * @property {number} userElemCount - 当前登记的用户自带 `HTMLElement` 数量。
     * @property {number} spacerTop - 顶部 spacer 当前高度（px）。
     * @property {number} spacerBottom - 底部 spacer 当前高度（px）。
     * @property {ReadonlyArray<Readonly<{index:number,behavior:string,block?:string}>>} pendingScrollQueue -
     *   暂停期间排队的滚动请求快照；队列及每个请求对象均冻结。
     */

    /**
     * 虚拟滚动控制器。
     * - 核心思路：仅渲染当前视口附近的少量 DOM 节点，通过上下两个占位 spacer
     *   撑开滚动容器，从而在数百万条数据下保持流畅滚动。
     * - 支持超长列表（超过浏览器单元素 12 MB 高度限制）的"高度压缩"模式。
     * - 内置状态机（IDLE → RUNNING ⇄ PAUSED → DESTROYED），防止非法调用。
     * - 通过 ResizeObserver（或 window.resize 降级）自动响应容器尺寸变化。
     */
    class VirtualScroll {
        /**
         * 有限状态机（FSM）辅助类。
         * - 通过转换表约束合法的状态跳转，非法跳转将抛出异常。
         * - 支持可选的转换回调，便于外部监听状态变化。
         */
        static _StateMachine = class {
            /**
             * 创建有限状态机。
             *
             * @param {string} initial - 初始状态名称；必须作为 `table` 的键存在，构造过程不触发
             *   `onTransition`，只建立当前状态。
             * @param {Object<string, string[]>} table - 状态转换表；键为当前状态，值为允许的目标状态
             *   数组。构造器冻结复制后的表与各目标数组，后续修改原对象不应作为改变状态机的方式。
             * @param {((prev: string, next: string) => void)|null} [onTransition=null] - 合法且实际发生的
             *   状态转换后同步调用；参数依次是旧状态和新状态。`null` 表示不监听，自转换不重复触发。
             */
            constructor(initial, table, onTransition) {
                this._state = initial;
                this._table = Object.freeze(
                    Object.fromEntries(
                        Object.entries(table).map(([k, v]) => [k, new Set(v)])
                    )
                );
                this._onTransition = onTransition ?? null;
            }

            /**
             * 当前状态名称（只读）。
             *
             * @type {string}
             * @readonly
             */
            get state() {
                return this._state;
            }

            /**
             * 将状态机切换到指定的下一个状态。
             * - 若目标状态不在当前状态的允许列表中，将抛出 `Error`。
             * - 切换成功后会触发构造时传入的 `onTransition` 回调。
             *
             * @param {string} next - 目标状态名称；必须同时是已知状态，并列在当前状态对应的允许数组中。
             *   非法跳转会抛错且保持原状态不变。
             * @throws {Error} 当前状态没有转换表条目，或目标状态不被允许时抛出。
             */
            transition(next) {
                const allowed = this._table[this._state];
                if (!allowed) {
                    throw new Error(
                        `[StateMachine] No transition table for state "${this._state}". Internal error.`
                    );
                }
                if (!allowed.has(next)) {
                    throw new Error(
                        `[StateMachine] Illegal transition: "${this._state}" -> "${next}". ` +
                        `Allowed: ${[...allowed].join(', ') || '(none)'}`
                    );
                }
                const prev = this._state;
                this._state = next;
                this._onTransition?.(prev, next);
            }

            /**
             * 检查当前状态是否是给定状态之一。
             *
             * @param {...string} states - 候选状态名称列表；只要当前状态严格等于其中一个即返回 `true`，
             *   空列表始终返回 `false`，此查询没有状态副作用。
             * @returns {boolean} 若当前状态命中其中任一，则返回 `true`。
             */
            is(...states) {
                return states.includes(this._state);
            }
        };

        /**
         * 高度映射器。
         * - 当列表总高度超过浏览器单元素高度上限（{@link _HeightMapper.MAX_ELEMENT_HEIGHT}，
         *   约 12 MB px）时，自动进入"压缩模式"：
         *   - 物理滚动高度固定为 `MAX_ELEMENT_HEIGHT`；
         *   - 通过 `scrollRatio` 在物理坐标与虚拟坐标之间线性映射。
         * - 不压缩时，虚拟坐标与物理坐标完全相同（ratio = 1）。
         */
        static _HeightMapper = class {
            /**
             * 浏览器单个元素允许的最大像素高度（约 12,000,000 px）。
             * 超过此值将触发压缩模式。
             *
             * @type {number}
             */
            static MAX_ELEMENT_HEIGHT = 12_000_000;

            constructor() {
                this.reset();
            }

            /**
             * 将所有映射状态重置为初始值（无压缩、ratio = 1）。
             *
             * @returns {void}
             */
            reset() {
                this.virtualHeight = 0;
                this.physicalHeight = 0;
                this.scrollRatio = 1;
                this.compressed = false;

                /**
                 * 有效物理滚动范围 = max(1, physicalHeight - clientHeight)。
                 * 由 update() 统一计算，供 physicalToVirtual / virtualToPhysical 共享，
                 * 确保两个方向的转换使用完全相同的分母，互为精确逆运算。
                 *
                 * @type {number}
                 */
                this._effP = 1;

                /**
                 * 有效虚拟滚动范围 = max(0, virtualHeight - clientHeight)。
                 * 由 update() 统一计算，供 physicalToVirtual / virtualToPhysical 共享。
                 *
                 * @type {number}
                 */
                this._effV = 0;
            }

            /**
             * 根据最新数据重新计算虚拟 / 物理高度及滚动比率。
             *
             * @param {number} totalCount - 已规范化的非负整数条目数，用于计算完整虚拟内容高度。
             * @param {number} itemHeight - 已测得且严格大于零的统一行高（px）。
             * @param {number} clientHeight - 当前容器可视高度（px）；用于判断是否需要压缩到浏览器安全高度。
             * @returns {void}
             */
            update(totalCount, itemHeight, clientHeight) {
                const MAX = VirtualScroll._HeightMapper.MAX_ELEMENT_HEIGHT;

                this.virtualHeight = totalCount * itemHeight;
                this.compressed = this.virtualHeight > MAX;
                this.physicalHeight = this.compressed ? MAX : this.virtualHeight;

                const rawEffV = this.virtualHeight - clientHeight;
                const rawEffP = this.physicalHeight - clientHeight;

                if (rawEffP <= 0) {
                    this._effV = 0;
                    this._effP = 0;
                    this.scrollRatio = 1;         // 无滚动范围时以 1 作为安全比率。
                } else {
                    this._effV = Math.max(0, rawEffV);
                    this._effP = rawEffP;
                    // 以“可滚动范围”而非总高度计算比率，保证列表顶部和底部在两套坐标中精确对齐。
                    this.scrollRatio = this.compressed ? this._effV / this._effP : 1;
                }
            }

            /**
             * 将物理 scrollTop 换算为虚拟 scrollTop。
             * 使用持久化的 _effV / _effP（与 update 和 virtualToPhysical 完全一致）。
             *
             * @param {number} physicalScroll - 浏览器容器的实际 `scrollTop`；方法先夹紧到物理可滚范围，
             *   再按持久化比例映射，压缩模式外等比例返回。
             * @returns {number} 对应的虚拟滚动偏移量（px）。
             */
            physicalToVirtual(physicalScroll) {
                if (!this.compressed) {
                    return Math.max(0, physicalScroll);
                }
                if (this._effP <= 0) {
                    return 0;
                }
                const clamped = Math.max(0, Math.min(physicalScroll, this._effP));
                // 先钳制物理位置，避免映射结果因浮点误差越界。
                const raw = clamped * this.scrollRatio;
                return Math.min(this._effV, raw);
            }

            /**
             * 将虚拟 scrollTop 换算为物理 scrollTop。
             *
             * @param {number} virtualOffset - 相对于完整逻辑内容顶部的偏移；先夹紧到虚拟可滚范围，
             *   再转换为浏览器可承载的物理坐标。
             * @returns {number} 对应的物理滚动偏移量（px）。
             */
            virtualToPhysical(virtualOffset) {
                if (!this.compressed) {
                    return Math.max(0, virtualOffset);
                }
                if (this._effV <= 0) {
                    return 0;
                }

                const raw = Math.max(0, virtualOffset) * (this._effP / this._effV);
                return Math.min(this._effP, raw);
            }

            /**
             * 计算上下两个占位 spacer 的物理高度。
             *
             * @param {number} start - 当前渲染窗口的零基起始索引，包含该条目。
             * @param {number} end - 当前渲染窗口的排他结束索引，满足 `start <= end <= totalCount`。
             * @param {number} totalCount - 全部逻辑条目数，用于计算窗口之后尚未渲染的高度。
             * @param {number} itemHeight - 正的统一逻辑行高（px），把条目索引换算为虚拟距离。
             * @param {number} physScrollTop - 当前实际滚动位置；与虚拟映射坐标共同校正顶部 spacer，
             *   使压缩映射下的首行仍贴合视口而不发生跳闪。
             * @returns {{top:number,bottom:number}} 物理占位高度：`top` 从容器顶部延伸到首个已渲染项，
             *   `bottom` 从排他末项延伸到内容底部；两者均为非负像素值，压缩模式下总和按物理高度缩放。
             */
            calcSpacerHeights(start, end, totalCount, itemHeight, physScrollTop = 0) {
                if (totalCount <= 0 || itemHeight <= 0) {
                    return {top: 0, bottom: 0};
                }

                if (!this.compressed) {
                    return {
                        top: start * itemHeight,
                        bottom: Math.max(0, (totalCount - end) * itemHeight)
                    };
                }

                const virtScrollTop = this.physicalToVirtual(physScrollTop);
                const vStart = start * itemHeight;

                let physTop = physScrollTop + vStart - virtScrollTop;
                const itemsH = (end - start) * itemHeight;
                let physBottom = this.physicalHeight - physTop - itemsH;

                // 吸收微小负值，避免滚动条因浮点误差抖动。
                if (physBottom < 0 && physBottom > -5) {
                    physTop += physBottom;
                    physBottom = 0;
                }

                return {
                    top: physTop,
                    bottom: Math.max(0, physBottom)
                };
            }
        };

        /**
         * DOM 节点对象池。
         * - 复用由 `renderItem()` 返回 HTML 字符串时创建的包装 `<div>`，
         *   减少 GC 压力和 DOM 创建开销。
         * - 对用户直接返回的 `HTMLElement` 实例维护引用计数，
         *   防止同一元素被重复挂载。
         * - 池容量上限由构造参数 `limit` 控制。
         */
        static _NodePool = class {
            /**
             * 创建指定容量的节点池。
             *
             * @param {number} limit - 最多保留的可复用包装节点数；应为非负整数，回收时超出上限的
             *   节点直接释放，用户自行返回的元素不作为普通池节点缓存。
             */
            constructor(limit) {
                this._limit = limit;
                this._pool = [];
                this._wrapperSet = new Set();
                this._userRefCnt = new Map();
            }

            /**
             * 当前池中空闲的可复用包装元素数量。
             *
             * @type {number}
             * @readonly
             */
            get poolSize() {
                return this._pool.length;
            }

            /**
             * 当前正在使用中的包装 `<div>` 数量（已出池、未回收）。
             *
             * @type {number}
             * @readonly
             */
            get wrapperCount() {
                return this._wrapperSet.size;
            }

            /**
             * 当前正在使用中的用户原生 `HTMLElement` 数量（引用计数 > 0）。
             *
             * @type {number}
             * @readonly
             */
            get userElemCount() {
                return this._userRefCnt.size;
            }

            /**
             * 将 `renderItem()` 的返回值规范化为一个 `HTMLElement`。
             * - 若返回值是字符串，则从池中取出（或新建）包装 `<div>`，
             *   将字符串赋给 `innerHTML`（使用 createContextualFragment 方法）。
             * - 若返回值是 `HTMLElement`，直接使用，同时检查重复挂载。
             * - `measureOnly = true` 时仅用于临时测量，不更新池状态和引用计数。
             *
             * @param {string|HTMLElement} result - `renderItem()` 的单项结果；字符串写入池化包装 `<div>`，
             *   元素则直接使用并检查是否已被其他索引占用。
             * @param {boolean} [measureOnly=false] - `true` 表示临时测量节点，不登记元素引用也不进入
             *   正常复用生命周期；调用方须在测量后移除或交还该节点。
             * @returns {HTMLElement} 可直接插入 DOM 的元素。
             * @throws {TypeError}  `result` 不是字符串或 `HTMLElement` 时抛出。
             * @throws {Error}      同一 `HTMLElement` 实例被二次挂载时抛出。
             */
            toElement(result, measureOnly = false) {
                if (result == null || (typeof result !== 'string' && !(result instanceof HTMLElement))) {
                    throw new TypeError(
                        `[VirtualScroll] renderItem() must return a string or HTMLElement, ` +
                        `got: ${result === null ? 'null' : typeof result}`
                    );
                }

                if (result instanceof HTMLElement) {
                    // 测量时克隆节点，避免移动正在显示的实例。
                    if (measureOnly) {
                        return result.cloneNode(true);
                    }

                    const cnt = this._userRefCnt.get(result) ?? 0;
                    if (cnt > 0) {
                        throw new Error(
                            '[VirtualScroll] renderItem() returned the same HTMLElement instance ' +
                            'that is already mounted. Each rendered slot must receive a distinct element.'
                        );
                    }

                    this._userRefCnt.set(result, cnt + 1);
                    return result;
                }

                let wrapper;
                if (measureOnly) {
                    wrapper = document.createElement('div');
                } else {
                    wrapper = this._pool.pop() ?? document.createElement('div');

                    // 清理池中的脏节点，避免复用旧内容。
                    if (wrapper.childNodes.length > 0 || wrapper.hasAttributes()) {
                        console.error(
                            '[VirtualScroll] _NodePool: a dirty wrapper was found in the pool. ' +
                            'This indicates a bug in recycle(). Cleaning it now.'
                        );
                        wrapper.replaceChildren();
                        for (const {name} of Array.from(wrapper.attributes)) {
                            wrapper.removeAttribute(name);
                        }
                    }

                    this._wrapperSet.add(wrapper);
                }

                // contextualFragment 可按当前位置的 HTML 语境解析多个根节点，再统一装入池化包装元素。
                const frag = document.createRange().createContextualFragment(result);

                wrapper.appendChild(frag);
                return wrapper;
            }

            /**
             * 将一个元素从 DOM 中移除并归还至对象池。
             * - 若该元素是用户返回的 `HTMLElement`，则递减引用计数，
             *   计数归零时从 Map 中移除。
             * - 若该元素是由池管理的包装 `<div>`，则清空其内容与样式后
             *   压入池队列（不超过上限时）。
             *
             * @param {HTMLElement} el - 已从渲染映射移除的行节点；池化包装节点会清空样式和内容后复用，
             *   用户提供的元素只减少引用计数，不会篡改其内部 DOM。
             * @returns {void}
             */
            recycle(el) {
                el.remove();

                if (this._userRefCnt.has(el)) {
                    const cnt = this._userRefCnt.get(el) - 1;
                    if (cnt <= 0) {
                        this._userRefCnt.delete(el);
                    } else {
                        this._userRefCnt.set(el, cnt);
                    }
                    return;
                }

                if (this._wrapperSet.has(el)) {
                    this._wrapperSet.delete(el);
                    if (this._pool.length < this._limit) {
                        el.replaceChildren();

                        for (const {name} of Array.from(el.attributes)) {
                            el.removeAttribute(name);
                        }

                        this._pool.push(el);
                    }
                }
            }

            /**
             * 清空对象池及所有追踪集合，释放全部内部引用。
             *
             * @returns {void}
             */
            clear() {
                this._pool = [];
                this._wrapperSet.clear();
                this._userRefCnt.clear();
            }
        };

        /**
         * 实例可处于的全部状态枚举（冻结对象，不可修改）。
         * - `IDLE`      — 初始或 `clear()` 后的空闲状态，尚未加载数据。
         * - `RUNNING`   — 正常运行，响应滚动与 resize 事件。
         * - `PAUSED`    — 暂停，滚动监听已解绑；`scrollToIndex()` 会排队。
         * - `DESTROYED` — 已销毁，所有资源释放完毕，不可再调用任何方法。
         *
         * @type {{ IDLE: string, RUNNING: string, PAUSED: string, DESTROYED: string }}
         * @readonly
         */
        static State = Object.freeze({
            IDLE: 'idle',
            RUNNING: 'running',
            PAUSED: 'paused',
            DESTROYED: 'destroyed'
        });

        /**
         * 缓冲区行数下限（视口外最少预渲染条数）。
         *
         * @type {number}
         * @default 3
         */
        static _BUFFER_MIN = 3;

        /**
         * 缓冲区行数上限，防止单次渲染节点过多。
         *
         * @type {number}
         * @default 20
         */
        static _BUFFER_MAX = 20;

        /**
         * 缓冲区行数相对于可见行数的比率（`bufferSize = ceil(visible × ratio)`）。
         *
         * @type {number}
         * @default 0.5
         */
        static _BUFFER_RATIO = 0.5;

        /**
         * 缓冲区行数变化触发更新的最小阈值（迟滞量），避免频繁重计算。
         *
         * @type {number}
         * @default 2
         */
        static _BUFFER_HYSTERESIS = 2;

        /**
         * 当行高无法测量时使用的回退高度（px）。
         *
         * @type {number}
         * @default 50
         */
        static _FALLBACK_HEIGHT = 50;

        /**
         * 节点对象池的容量上限。
         *
         * @type {number}
         * @default 100
         */
        static _POOL_LIMIT = 100;

        /**
         * 行高测量时的采样条目数（取平均值），兼顾精度与性能。
         *
         * @type {number}
         * @default 5
         */
        static _MEASURE_SAMPLES = 5;

        /**
         * 合法行高的最小值（px），低于此值时触发警告并修正。
         *
         * @type {number}
         * @default 1
         */
        static _MIN_ITEM_HEIGHT = 1;

        /**
         * 创建尚未加载数据的虚拟滚动实例。
         *
         * @param {object} config - 虚拟列表的固定配置；实例会保存渲染函数及容器选择器，数据和长度
         *   由后续 `load()` 提供。
         * @param {string} config.container - 能唯一定位可滚动元素的 CSS 选择器；构造时校验格式，
         *   真正加载和恢复时还会确认元素存在且仍连接在文档中。
         * @param {(index: number, data: any) => string|HTMLElement} config.renderItem - 条目渲染函数；
         *   `index` 是零基逻辑索引，`data` 是最近一次 `load` 的同一数据源。应返回可作为行内容的
         *   HTML 字符串或单个元素；同一索引可能因回收、重测或滚动被多次调用。
         * @param {boolean} [config.remeasureOnResize=true] - 容器尺寸改变后是否重新采样行高；关闭可减少重排，
         *   但仅适合条目高度不会随宽度或字体布局变化的列表。
         * @throws {Error} 配置无效时抛出。
         */
        constructor(config) {
            this._validateConfig(config);

            this.container = null;

            /**
             * 条目渲染函数，由外部配置传入。
             *
             * @type {function | HTMLElement}
             */
            this.renderItem = config.renderItem;
            this.data = [];
            this.totalCount = 0;
            this.itemHeight = 0;
            this.bufferSize = 0;
            this._anchorIndex = 0;
            this._anchorRatio = 0;
            this._selector = config.container;
            this._remeasureOnResize = config.remeasureOnResize ?? true;
            this._originalContainerStyle = null;

            this._sm = new VirtualScroll._StateMachine(
                VirtualScroll.State.IDLE,
                {
                    [VirtualScroll.State.IDLE]: [
                        VirtualScroll.State.RUNNING,
                        VirtualScroll.State.DESTROYED
                    ],
                    [VirtualScroll.State.RUNNING]: [
                        VirtualScroll.State.PAUSED,
                        VirtualScroll.State.IDLE,
                        VirtualScroll.State.DESTROYED
                    ],
                    [VirtualScroll.State.PAUSED]: [
                        VirtualScroll.State.RUNNING,
                        VirtualScroll.State.IDLE,
                        VirtualScroll.State.DESTROYED
                    ],
                    [VirtualScroll.State.DESTROYED]: []
                }
            );

            this._spacerTop = null;
            this._spacerBottom = null;
            this._startIndex = -1;
            this._endIndex = -1;
            this._renderedNodes = new Map();
            this._nodePool = new VirtualScroll._NodePool(VirtualScroll._POOL_LIMIT);
            this._heightMapper = new VirtualScroll._HeightMapper();
            this._lastContainerHeight = 0;
            this._lastContainerWidth = 0;
            this._handleScroll = null;
            this._handleUserInterrupt = null;
            this._handleWindowResize = null;
            this._ro = null;
            this._renderRAF = null;
            this._remeasureRAF = null;
            this._smoothRAF = null;
            this._resumeRAF = null;
            this._measured = false;
            this._remeasurePending = false;
            this._isSmoothScrolling = false;
            this._rendering = false;

            /**
             * PAUSED 状态下排队等待的 scrollToIndex 调用记录。
             *
             * @type {Array<{index: number, behavior: string}>}
             */
            this._pendingScrollQueue = [];
        }

        /**
         * 自定义 `Object.prototype.toString.call()` 的返回值。
         * 这使得 `Public.typeOf(new VirtualScroll())` 能够返回 'VirtualScroll'。
         *
         * @readonly
         * @type {string}
         */
        get [Symbol.toStringTag]() {
            return 'VirtualScroll';
        }

        /**
         * 当前实例状态名称，与 {@link VirtualScroll.State} 中的值对应（只读）。
         *
         * @type {string}
         * @readonly
         */
        get state() {
            return this._sm.state;
        }

        /**
         * 校验构造函数传入的配置对象，任何不合法项均抛出 `Error`。
         * - `config.container` 须为非空字符串。
         * - `config.renderItem` 须为函数。
         * - `config.remeasureOnResize` 若存在须为布尔值。
         *
         * @private
         *
         * @param {object} config - 构造器收到的原始配置；必须含非空选择器字符串和渲染函数，
         *   可选 `remeasureOnResize` 只能是布尔值。校验只读，不补默认字段。
         * @throws {Error} 任意必填项不合法时抛出。
         * @returns {void}
         */
        _validateConfig(config) {
            if (!config || typeof config.container !== 'string' || !config.container.trim()) {
                throw new Error('[VirtualScroll] config.container must be a non-empty CSS selector string.');
            }
            if (typeof config.renderItem !== 'function') {
                throw new Error('[VirtualScroll] config.renderItem must be a function');
            }
            if ('remeasureOnResize' in config && typeof config.remeasureOnResize !== 'boolean') {
                throw new Error('[VirtualScroll] config.remeasureOnResize must be a boolean');
            }
        }

        /**
         * 将外部传入的 `length` 参数规范化为非负整数。
         * - `null` / `undefined` → 0（警告）。
         * - 非有限数字 → 0（警告）。
         * - 非整数 → 截断为整数（警告）。
         * - 负数 → 0。
         *
         * @private
         *
         * @param {*} length - 调用方给出的逻辑长度；有限数值会截断并夹到非负范围，不能转为有效数值时
         *   使用零并发出警告，而不是读取 `data.length`。
         * @param {string} caller - 产生该长度的公开方法名，仅用于构造可定位的警告文本。
         * @returns {number} 规范化后的非负整数。
         */
        _normalizeLength(length, caller) {
            if (length == null) {
                console.warn(`[VirtualScroll] ${caller}(): length is ${length}, treating as 0.`);
                return 0;
            }

            let num;
            try {
                num = Number(length);
            } catch (e) {
                console.warn(
                    `[VirtualScroll] ${caller}(): length "${String(length)}" cannot be converted to a number, ` +
                    'treating as 0.'
                );
                return 0;
            }
            if (!Number.isFinite(num)) {
                console.warn(`[VirtualScroll] ${caller}(): length "${length}" is not a finite number, treating as 0.`);
                return 0;
            }

            const int = Math.trunc(num);

            if (int !== num) {
                console.warn(`[VirtualScroll] ${caller}(): length ${length} is not an integer, truncated to ${int}.`);
            }

            return Math.max(0, int);
        }

        /**
         * 若实例已处于 `DESTROYED` 状态则抛出错误，阻止后续操作。
         *
         * @private
         *
         * @param {string} method - 调用方方法名，用于错误信息。
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         */
        _assertNotDestroyed(method) {
            if (this._sm.is(VirtualScroll.State.DESTROYED)) {
                throw new Error(`[VirtualScroll] Instance destroyed, cannot call ${method}().`);
            }
        }

        /**
         * 解析并缓存容器 DOM 元素。
         * - 若已缓存且仍在文档中，直接返回。
         * - 若选择器非法，抛出包含原始异常信息的 `Error`。
         * - 若元素不存在或已被移出 DOM，抛出带有操作建议的 `Error`。
         *
         * @private
         *
         * @throws {Error} 选择器非法、元素不存在或已离开 DOM 时抛出。
         * @returns {void}
         */
        _resolveContainer() {
            if (this.container) {
                if (!this.container.isConnected) {
                    throw new Error(
                        `[VirtualScroll] Container "${this._selector}" was removed from the DOM. ` +
                        'Call clear() before re-mounting.'
                    );
                }
                return;
            }

            let el;
            try {
                el = document.querySelector(this._selector);
            } catch (e) {
                throw new Error(`[VirtualScroll] Invalid selector "${this._selector}": ${e.message}.`);
            }
            if (!el) {
                throw new Error(
                    `[VirtualScroll] Container "${this._selector}" not found in the DOM. ` +
                    'Ensure the element exists before calling load().'
                );
            }
            this.container = el;
        }

        /**
         * 为容器元素补全必要的 CSS 样式（仅在初次测量前调用一次）。
         * - `position: static` → 改为 `relative`（子元素绝对定位的基准）。
         * - `overflow: visible / ''` → 改为 `auto`（启用滚动条）。
         *
         * @private
         *
         * @returns {void}
         */
        _setupContainer() {
            if (!this._originalContainerStyle) {
                this._originalContainerStyle = {
                    position: this.container.style.position,
                    overflowX: this.container.style.overflowX,
                    overflowY: this.container.style.overflowY,
                    overflowAnchor: this.container.style.overflowAnchor
                };
            }

            const cs = getComputedStyle(this.container);
            if (cs.position === 'static') {
                this.container.style.position = 'relative';
            }

            if (
                cs.overflow === 'visible' ||
                cs.overflow === '' ||
                cs.overflow === 'auto' ||
                cs.overflowY === 'auto' ||
                cs.overflowY === 'scroll'
            ) {
                this.container.style.overflowY = 'auto';
                this.container.style.overflowX = cs.overflowX !== 'visible' ? cs.overflowX : 'hidden';
            }

            // 禁用原生滚动锚定，避免与 spacer 高度调整冲突。
            this.container.style.overflowAnchor = 'none';
        }

        /**
         * 将容器当前的 `clientWidth` / `clientHeight` 同步到内部缓存字段。
         * 用于后续 resize 检测的基准比对。
         *
         * @private
         *
         * @returns {void}
         */
        _syncContainerSize() {
            this._lastContainerHeight = this.container.clientHeight;
            this._lastContainerWidth = this.container.clientWidth;
        }

        /**
         * 在不重新测量（`remeasure: false`）时，通过采样少量条目来
         *   校验缓存行高与新数据实际行高是否吻合。
         * - 偏差超过 20% 时打印 `console.warn`，提示调用方传入 `{ remeasure: true }`。
         * - 若 `totalCount === 0` 或 `itemHeight <= 0`，跳过检验。
         * - 采样元素仅用于测量（`measureOnly = true`），不进入节点池。
         *
         * @private
         *
         * @returns {void}
         */
        _verifyItemHeight() {
            if (this.totalCount === 0 || this.itemHeight <= 0) {
                return;
            }

            const sampleCount = Math.min(3, this.totalCount);
            const frag = document.createDocumentFragment();
            const els = [];

            for (let i = 0; i < sampleCount; i++) {
                const result = this.renderItem(i, this.data);
                const el = this._nodePool.toElement(result, true);
                frag.appendChild(el);
                els.push(el);
            }

            this.container.appendChild(frag);
            void this.container.offsetHeight; // 触发布局计算后再读取 `offsetHeight`。

            const heights = els.map((el) => el.offsetHeight);
            const avg = heights.reduce((s, h) => s + h, 0) / heights.length;

            for (const el of els) {
                el.remove();
            }

            if (avg > 0 && Math.abs(avg - this.itemHeight) / this.itemHeight > 0.2) {
                console.warn(
                    `[VirtualScroll] New data item height (~${avg.toFixed(1)}px) differs from ` +
                    `cached height (${this.itemHeight}px) by more than 20%. ` +
                    'Consider passing { remeasure: true } to load().'
                );
            }
        }

        /**
         * 执行完整的行高测量流程。
         * - 将采样条目（最多 {@link VirtualScroll._MEASURE_SAMPLES} 条）临时插入容器，
         *   强制同步布局后读取 `offsetHeight`，取平均值作为 `itemHeight`。
         * - 测量完成后清空容器并更新 {@link VirtualScroll._HeightMapper}。
         * - 边界处理：
         *   - `totalCount === 0` → 回退到 `_FALLBACK_HEIGHT`（50px）并警告。
         *   - 测量结果 `≤ 0` → 回退到 50px 并警告。
         *   - 测量结果 `> 0` 但 `< _MIN_ITEM_HEIGHT` → 修正并警告。
         * - 测量后会尝试恢复原来的滚动位置（将旧虚拟滚动量映射到新物理坐标）。
         *
         * @private
         *
         * @returns {void}
         */
        _doMeasure() {
            const inlineOverflowY = this.container.style.overflowY;
            const clientHeight = this.container.clientHeight;
            const tempEls = [];

            try {
                // 根据已有测量或回退行高预判滚动条需求。
                const expectedHeight = this._measured
                                       ? this._heightMapper.virtualHeight
                                       : this.totalCount * VirtualScroll._FALLBACK_HEIGHT;
                const willHaveScrollbar = expectedHeight > clientHeight || this.container.scrollHeight > clientHeight;

                // 测量期间固定 `overflowY`，避免容器宽度变化影响折行。
                this.container.style.overflowY = willHaveScrollbar ? 'scroll' : 'hidden';

                this._unbindScroll();
                this._recycleRenderedNodes();
                this.container.replaceChildren();
                this._spacerTop = null;
                this._spacerBottom = null;
                this._nodePool.clear();

                if (this.totalCount === 0) {
                    this.itemHeight = VirtualScroll._FALLBACK_HEIGHT;
                    this._heightMapper.update(0, this.itemHeight, clientHeight);
                    console.warn('[VirtualScroll] Data is empty; item height falls back to 50px.');
                    return;
                }

                const sampleCount = Math.min(VirtualScroll._MEASURE_SAMPLES, this.totalCount);

                for (let i = 0; i < sampleCount; i++) {
                    const result = this.renderItem(i, this.data);
                    const el = this._nodePool.toElement(result, true);
                    this.container.appendChild(el);
                    tempEls.push(el);
                }

                void this.container.offsetHeight;

                const heights = tempEls.map((el) => el.offsetHeight);
                const sum = heights.reduce((s, h) => s + h, 0);
                let measured = sum / sampleCount;

                this.container.replaceChildren();
                tempEls.length = 0;

                if (measured > 0 && measured < VirtualScroll._MIN_ITEM_HEIGHT) {
                    console.warn(
                        `[VirtualScroll] Measured item height ${measured}px is suspiciously small; ` +
                        `clamped to ${VirtualScroll._MIN_ITEM_HEIGHT}px.`
                    );
                    measured = VirtualScroll._MIN_ITEM_HEIGHT;
                }

                if (measured <= 0) {
                    console.warn('[VirtualScroll] Measured item height is 0; falling back to 50px.');
                    measured = VirtualScroll._FALLBACK_HEIGHT;
                }

                this.itemHeight = measured;

                // 测量完成后恢复原始 `overflowY`。
                this.container.style.overflowY = inlineOverflowY;

                // 恢复滚动条后重新读取可能变化的容器高度。
                const finalClientHeight = this.container.clientHeight;
                this._heightMapper.update(this.totalCount, this.itemHeight, finalClientHeight);
            } finally {
                for (const el of tempEls) {
                    el.remove();
                }
                this.container.style.overflowY = inlineOverflowY;
            }
        }

        /**
         * 根据容器高度和行高动态计算缓冲区行数。
         * - 计算公式：`bufferSize = clamp(ceil(visibleRows × _BUFFER_RATIO), _BUFFER_MIN, _BUFFER_MAX)`。
         * - 使用迟滞（`_BUFFER_HYSTERESIS`）机制：只有新值与旧值之差 ≥ 2 时才更新，
         *   避免频繁小幅抖动。
         * - `force = true` 时跳过迟滞检查，直接写入。
         * - 容器高度或行高无效时，退化为 `_BUFFER_MIN`。
         *
         * @private
         *
         * @param {boolean} [force=false] - 是否强制更新（忽略迟滞阈值）。
         * @returns {void}
         */
        _calcBufferSize(force = false) {
            const ch = this.container.clientHeight;
            if (ch <= 0 || this.itemHeight < VirtualScroll._MIN_ITEM_HEIGHT) {
                this.bufferSize = VirtualScroll._BUFFER_MIN;
                return;
            }

            const visible = Math.ceil(ch / this.itemHeight);
            const next = Math.min(
                VirtualScroll._BUFFER_MAX,
                Math.max(VirtualScroll._BUFFER_MIN, Math.ceil(visible * VirtualScroll._BUFFER_RATIO))
            );
            // 迟滞阈值避免容器高度在边界附近轻微波动时反复改变缓冲区大小。
            if (force || Math.abs(next - this.bufferSize) >= VirtualScroll._BUFFER_HYSTERESIS) {
                this.bufferSize = next;
            }
        }

        /**
         * 重建容器内的基础 DOM 骨架（清空 + 创建上下 spacer）。
         * - 回收所有已渲染节点并清空容器。
         * - 创建两个自定义标签作为上下占位符，初始高度均为 0。
         * - spacer 样式设置为不可见、不占位但仍参与文档流高度计算。
         * - 调用后 `_startIndex` / `_endIndex` 被重置为 -1。
         *
         * @private
         *
         * @returns {void}
         */
        _buildDOM() {
            // 先回收渲染窗口内的节点，再丢弃旧 spacer 与容器骨架。
            this._recycleRenderedNodes();

            if (this._spacerTop?.parentNode === this.container) {
                this.container.removeChild(this._spacerTop);
            }
            if (this._spacerBottom?.parentNode === this.container) {
                this.container.removeChild(this._spacerBottom);
            }

            this.container.replaceChildren();

            // spacer 只贡献滚动高度，不应产生可见内容、边距或字体排版。
            const applySpacerStyle = (el) => Object.assign(el.style, {
                display: 'block',
                width: '100%',
                height: '0px',
                margin: '0',
                padding: '0',
                border: 'none',
                visibility: 'hidden',
                overflow: 'hidden',
                lineHeight: '0',
                fontSize: '0'
            });

            this._spacerTop = document.createElement('div');
            this._spacerTop.setAttribute('data-vs-spacer', 'top');
            this._spacerTop.setAttribute('aria-hidden', 'true');

            this._spacerBottom = document.createElement('div');
            this._spacerBottom.setAttribute('data-vs-spacer', 'bottom');
            this._spacerBottom.setAttribute('aria-hidden', 'true');
            applySpacerStyle(this._spacerTop);
            applySpacerStyle(this._spacerBottom);

            this.container.appendChild(this._spacerTop);
            this.container.appendChild(this._spacerBottom);

            this._startIndex = -1;
            this._endIndex = -1;

            // 空渲染窗口也要写入完整占位高度，确保首次滚动范围正确。
            const hm = this._heightMapper;
            const {top, bottom} = hm.calcSpacerHeights(
                0, 0, this.totalCount, this.itemHeight
            );
            this._spacerTop.style.height = `${top}px`;
            this._spacerBottom.style.height = `${bottom}px`;
        }

        /**
         * 同时绑定滚动事件和 resize 监听器。
         *
         * @private
         * @returns {void}
         */
        _bindEvents() {
            this._bindScroll();
            this._bindResize();
            this._bindUserInterrupt();
        }

        /**
         * 绑定用户交互事件。当处于平滑滚动状态时，若用户强行交互，则立即打断动画。
         *
         * @private
         */
        _bindUserInterrupt() {
            if (this._handleUserInterrupt) {
                return;
            }

            this._handleUserInterrupt = () => {
                if (this._isSmoothScrolling) {
                    this._cancelSmoothScroll();
                }
            };

            // 使用被动监听器，避免阻塞原生滚动。
            this.container.addEventListener('wheel', this._handleUserInterrupt, {passive: true});
            this.container.addEventListener('touchstart', this._handleUserInterrupt, {passive: true});
            this.container.addEventListener('mousedown', this._handleUserInterrupt, {passive: true});
        }

        /**
         * 向容器绑定 `scroll` 事件监听器（被动模式）。
         * - 若已绑定（`_handleScroll` 不为 `null`），直接返回，防止重复注册。
         * - 平滑滚动动画期间（`_isSmoothScrolling = true`）忽略 scroll 事件，
         *   由动画循环自行调用 `_render()`。
         *
         * @private
         *
         * @returns {void}
         */
        _bindScroll() {
            if (this._handleScroll) {
                return;
            }

            this._handleScroll = () => {
                if (this._isSmoothScrolling) {
                    return;
                }
                this._scheduleRender();
            };
            this.container.addEventListener('scroll', this._handleScroll, {passive: true});
        }

        /**
         * 从容器移除 `scroll` 事件监听器并置空引用。
         *
         * @private
         * @returns {void}
         */
        _unbindScroll() {
            if (this._handleScroll && this.container) {
                this.container.removeEventListener('scroll', this._handleScroll);
                this._handleScroll = null;
            }
        }

        /**
         * 绑定容器尺寸变化监听器。
         * - 优先使用 `ResizeObserver`（现代浏览器）：精确监听容器自身的尺寸变化。
         * - 降级方案：监听 `window.resize`，通过比对 `clientWidth / clientHeight` 判断变化。
         * - 宽度变化且 `remeasureOnResize = true` 时触发重新测量。
         * - 仅高度变化时重新计算缓冲区大小并调度渲染。
         *
         * @private
         *
         * @returns {void}
         */
        _bindResize() {
            if (typeof ResizeObserver !== 'undefined') {
                if (this._ro) {
                    return;
                }

                this._ro = new ResizeObserver((entries) => {
                    if (!this._sm.is(VirtualScroll.State.RUNNING)) {
                        return;
                    }

                    const entry = entries[0];
                    if (!entry) {
                        return;
                    }

                    if (!entry.target.isConnected) {
                        console.warn('[VirtualScroll] Container detached, auto-destroying.');
                        this.destroy();
                        return;
                    }

                    const newW = entry.target.clientWidth;
                    const newH = entry.target.clientHeight;

                    const widthChanged = Math.round(newW) !== Math.round(this._lastContainerWidth);
                    const heightChanged = Math.round(newH) !== Math.round(this._lastContainerHeight);

                    if (!widthChanged && !heightChanged) {
                        return;
                    }

                    this._lastContainerWidth = newW;
                    this._lastContainerHeight = newH;

                    if (this._remeasureOnResize) {
                        // 配置启用后，宽高变化均触发重测，以兼容 `dvh` 和 `vh`。
                        this._scheduleRemeasure();
                    } else {
                        if (heightChanged) {
                            this._handleHeightChange(newH);
                        }
                        this._scheduleRender();
                    }
                });
                this._ro.observe(this.container);
            } else {
                if (this._handleWindowResize) {
                    return;
                }
                this._handleWindowResize = () => {
                    if (!this._sm.is(VirtualScroll.State.RUNNING)) {
                        return;
                    }

                    if (!this.container || !this.container.isConnected) {
                        console.warn('[VirtualScroll] Container detached, auto-destroying fallback listener.');
                        this.destroy();
                        return;
                    }

                    const newW = this.container.clientWidth;
                    const newH = this.container.clientHeight;
                    const widthChanged = Math.round(newW) !== Math.round(this._lastContainerWidth);
                    const heightChanged = Math.round(newH) !== Math.round(this._lastContainerHeight);

                    if (!widthChanged && !heightChanged) {
                        return;
                    }

                    this._lastContainerWidth = newW;
                    this._lastContainerHeight = newH;

                    if (this._remeasureOnResize) {
                        this._scheduleRemeasure();
                    } else {
                        if (heightChanged) {
                            this._handleHeightChange(newH);
                        }
                        this._scheduleRender();
                    }
                };
                window.addEventListener('resize', this._handleWindowResize, {passive: true});
            }
        }

        /**
         * 断开 `ResizeObserver` 或移除 `window.resize` 监听器。
         *
         * @private
         * @returns {void}
         */
        _unbindResize() {
            if (this._ro) {
                this._ro.disconnect();
                this._ro = null;
            }
            if (this._handleWindowResize) {
                window.removeEventListener('resize', this._handleWindowResize);
                this._handleWindowResize = null;
            }
        }

        /**
         * 处理容器高度变化：更新高度映射、调整 spacer 并修正 scrollTop。
         * - 被 ResizeObserver 回调和 window.resize 降级共同调用。
         * - spacer 高度修正必须在 scrollTop 赋值之前完成，
         *   避免 scrollHeight 还未撑开时 scrollTop 被静默截断。
         *
         * @private
         *
         * @param {number} newH - ResizeObserver 得到的新 `clientHeight`（px）；必须为有限非负值。
         *   方法会更新高度映射并尽量保持当前虚拟锚点，而不是简单保留物理 `scrollTop`。
         * @returns {void}
         */
        _handleHeightChange(newH) {
            this._calcBufferSize();
            this._heightMapper.update(this.totalCount, this.itemHeight, newH);

            // 用逻辑行锚点重算位置，避免压缩映射变化后物理 scrollTop 指向另一行。
            const exactVirtScroll = (this._anchorIndex + this._anchorRatio) * this.itemHeight;
            const maxVirt = this._heightMapper._effV;
            const clampedVirt = Math.min(exactVirtScroll, Math.max(0, maxVirt));
            const nextPhysScrollTop = this._heightMapper.virtualToPhysical(clampedVirt);

            if (this._spacerTop && this._spacerBottom) {
                const {top, bottom} = this._heightMapper.calcSpacerHeights(
                    this._startIndex < 0 ? 0 : this._startIndex,
                    this._endIndex < 0 ? 0 : this._endIndex,
                    this.totalCount,
                    this.itemHeight,
                    nextPhysScrollTop
                );

                if (top < 0) {
                    this._spacerTop.style.height = '0px';
                    this._spacerTop.style.marginTop = `${top}px`;
                } else {
                    this._spacerTop.style.height = `${top}px`;
                    this._spacerTop.style.marginTop = '0px';
                }
                this._spacerBottom.style.height = `${bottom}px`;
            }

            this.container.scrollTop = nextPhysScrollTop;
        }

        /**
         * 使用 `requestAnimationFrame` 异步调度一次行高重测。
         * - 通过 `_remeasurePending` 标志去重，同一帧内多次调用只生效一次。
         * - 优先取消已挂起的渲染帧（`_cancelRenderRAF`），防止新旧渲染交叉。
         * - 重测完成后重建 DOM 骨架并触发强制渲染。
         *
         * @private
         *
         * @returns {void}
         */
        _scheduleRemeasure() {
            if (this._remeasurePending) {
                return;
            }
            this._remeasurePending = true;
            this._cancelRenderRAF();

            this._remeasureRAF = requestAnimationFrame(() => {
                this._remeasureRAF = null;

                if (!this._sm.is(VirtualScroll.State.RUNNING) || !this.container) {
                    this._remeasurePending = false;
                    return;
                }

                try {
                    // 重测会重建 spacer，先保存逻辑锚点才能在新行高下恢复阅读位置。
                    const savedAnchorIndex = this._anchorIndex;
                    const savedAnchorRatio = this._anchorRatio;

                    this._heightMapper.reset();
                    this._doMeasure();
                    this._syncContainerSize();
                    this._calcBufferSize(true);

                    this._buildDOM();

                    // 按原逻辑行和相对偏移恢复滚动位置。
                    const clientHeight = this.container.clientHeight;
                    this._heightMapper.update(this.totalCount, this.itemHeight, clientHeight);
                    this._syncContainerSize();

                    const exactVirtScroll = (savedAnchorIndex + savedAnchorRatio) * this.itemHeight;
                    const maxVirt = Math.max(0, this._heightMapper.virtualHeight - clientHeight);
                    const clampedVirt = Math.min(Math.max(0, exactVirtScroll), maxVirt);
                    this.container.scrollTop = this._heightMapper.virtualToPhysical(clampedVirt);

                    this._bindScroll();
                    this._forceRender();
                } finally {
                    this._remeasurePending = false;
                }
            });
        }

        /**
         * resume() 后强制重新测量行高，并尽量恢复原滚动位置。
         *
         * @private
         *
         * @param {{index: number, behavior: string, block?: string} | null} pendingScroll
         *   暂停期间最后一次 scrollToIndex 请求。
         * @returns {void}
         */
        _resumeWithRemeasure(pendingScroll = null) {
            this._cancelAllRAF();
            this._cancelSmoothScrollSilent();
            this._unbindScroll();

            if (this.container.clientWidth <= 0 || this.container.clientHeight <= 0) {
                let lastWidth = -1;
                let lastHeight = -1;

                const waitForContainer = () => {
                    this._resumeRAF = null;

                    if (!this._sm.is(VirtualScroll.State.RUNNING) || !this.container) {
                        return;
                    }

                    if (!this.container.isConnected) {
                        console.warn('[VirtualScroll] Container detached while waiting for resume.');
                        this.destroy();
                        return;
                    }

                    const width = this.container.clientWidth;
                    const height = this.container.clientHeight;

                    if (width <= 0 || height <= 0 || width !== lastWidth || height !== lastHeight) {
                        lastWidth = width;
                        lastHeight = height;
                        this._resumeRAF = requestAnimationFrame(waitForContainer);
                        return;
                    }

                    this._resumeWithRemeasure(pendingScroll);
                };

                this._resumeRAF = requestAnimationFrame(waitForContainer);
                return;
            }

            this._pendingScrollQueue = [];

            const savedAnchorIndex = this._anchorIndex;
            const savedAnchorRatio = this._anchorRatio;

            this._heightMapper.reset();
            this._doMeasure();
            this._measured = true;

            this._syncContainerSize();
            this._calcBufferSize(true);

            this._buildDOM();

            const clientHeight = this.container.clientHeight;

            this._heightMapper.update(
                this.totalCount,
                this.itemHeight,
                clientHeight
            );

            this._syncContainerSize();

            if (pendingScroll) {
                const {index, behavior, block} = pendingScroll;
                this.scrollToIndex(index, {behavior, block});

                // `_doMeasure()` 会解绑滚动监听，测量后需重新绑定。
                this._bindEvents();

                if (!this._isSmoothScrolling) {
                    this._render();
                    this._scheduleRender();
                }

                return;
            }

            // 无排队跳转时恢复暂停前的锚点。
            const exactVirtScroll = (savedAnchorIndex + savedAnchorRatio) * this.itemHeight;
            const maxVirt = Math.max(0, this._heightMapper.virtualHeight - clientHeight);
            const clampedVirt = Math.min(Math.max(0, exactVirtScroll), maxVirt);
            this.container.scrollTop = this._heightMapper.virtualToPhysical(clampedVirt);

            // `_doMeasure()` 会解绑滚动监听，恢复后需重新绑定。
            this._bindEvents();

            this._render();
            // 下一帧补充渲染，等待恢复后的布局稳定。
            this._scheduleRender();
        }

        /**
         * 通过 `requestAnimationFrame` 异步调度一次渲染。
         * - 若已有渲染帧在等待，或重测帧正在挂起，则跳过本次请求。
         *
         * @private
         *
         * @returns {void}
         */
        _scheduleRender() {
            if (this._renderRAF || this._remeasurePending) {
                return;
            }
            this._renderRAF = requestAnimationFrame(() => {
                this._renderRAF = null;
                this._render();
            });
        }

        /**
         * 取消已挂起的渲染帧（`_renderRAF`）。
         *
         * @private
         * @returns {void}
         */
        _cancelRenderRAF() {
            if (this._renderRAF) {
                cancelAnimationFrame(this._renderRAF);
                this._renderRAF = null;
            }
        }

        /**
         * 取消已挂起的重测帧（`_remeasureRAF`）并清除挂起标志。
         *
         * @private
         * @returns {void}
         */
        _cancelRemeasureRAF() {
            if (this._remeasureRAF) {
                cancelAnimationFrame(this._remeasureRAF);
                this._remeasureRAF = null;
                this._remeasurePending = false;
            }
        }

        /**
         * 用来取消 resume() 恢复过程中等待容器重新变得可测量的 requestAnimationFrame 循环。
         *
         * @private
         * @returns {void}
         */
        _cancelResumeRAF() {
            if (this._resumeRAF !== null) {
                cancelAnimationFrame(this._resumeRAF);
                this._resumeRAF = null;
            }
        }

        /**
         * 同时取消渲染帧和重测帧。
         *
         * @private
         * @returns {void}
         */
        _cancelAllRAF() {
            this._cancelRenderRAF();
            this._cancelRemeasureRAF();
            this._cancelResumeRAF();
            this._cancelSmoothScrollSilent();
        }

        /**
         * 取消挂起的渲染帧后，同步（本帧内）执行一次强制渲染。
         * - 与 {@link VirtualScroll#_scheduleRender} 的区别：本方法是同步调用，
         *   不受"已有帧挂起"的跳过逻辑限制，且 `force = true` 会绕过范围未变的
         *   提前返回检查。
         *
         * @private
         *
         * @returns {void}
         */
        _forceRender() {
            this._cancelRenderRAF();
            this._render(true);
        }

        /**
         * 计算视口渲染窗口并增量更新节点与 spacer。
         *
         * @private
         * @param {boolean} [force=false] - 是否忽略未变化的渲染范围。
         * @returns {void}
         */
        _render(force = false) {
            // 阻止 `renderItem` 的副作用在渲染期间重入。
            if (this._rendering) {
                return;
            }
            this._rendering = true;

            try {
                if (!this.container) {
                    return;
                }
                if (!this._spacerTop?.isConnected || !this._spacerBottom?.isConnected) {
                    return;
                }
                if (this.totalCount <= 0 || this.itemHeight <= 0) {
                    if (this.totalCount <= 0) {
                        this._recycleRenderedNodes();
                        this._spacerTop.style.height = '0px';
                        this._spacerTop.style.marginTop = '0px';
                        this._spacerBottom.style.height = '0px';
                    }
                    return;
                }

                const clientHeight = this.container.clientHeight;
                if (clientHeight <= 0) {
                    return;
                }

                // 先更新缓存高度，避免重入或外部更新导致误判。
                const heightChanged = clientHeight !== this._lastContainerHeight;
                if (heightChanged) {
                    this._lastContainerHeight = clientHeight;
                    this._calcBufferSize();
                    this._heightMapper.update(this.totalCount, this.itemHeight, clientHeight);

                    if (this._spacerTop && this._spacerBottom) {
                        const hm = this._heightMapper;
                        const s = this._startIndex < 0 ? 0 : this._startIndex;
                        const e = this._endIndex < 0 ? 0 : this._endIndex;
                        const {top, bottom} = hm.calcSpacerHeights(
                            s, e, this.totalCount, this.itemHeight
                        );
                        this._spacerTop.style.height = `${top}px`;
                        this._spacerBottom.style.height = `${bottom}px`;
                    }

                    const hm = this._heightMapper;
                    const maxPhysical = Math.max(0, hm.physicalHeight - clientHeight);
                    const currentST = this.container.scrollTop;

                    if (currentST > maxPhysical) {
                        this.container.scrollTop = maxPhysical;
                    }
                }

                const hm = this._heightMapper;
                const physScrollTop = this.container.scrollTop;

                // 钳制物理位置，兼容 macOS 和 iOS 的弹性滚动。
                const maxPhysScroll = Math.max(0, hm.physicalHeight - clientHeight);
                const clampedPhysScrollTop = Math.max(0, Math.min(physScrollTop, maxPhysScroll));
                const virtScrollTop = hm.physicalToVirtual(clampedPhysScrollTop);
                let visibleStart = Math.floor(virtScrollTop / this.itemHeight);
                let start = Math.max(0, visibleStart - this.bufferSize);

                // 在变更渲染窗口前记录当前逻辑锚点，供尺寸变化和重测恢复位置。
                this._updateAnchor();

                let visibleEnd = visibleStart + Math.ceil(clientHeight / this.itemHeight);
                let end = Math.min(this.totalCount, visibleEnd + this.bufferSize);
                const rangeUnchanged = start === this._startIndex && end === this._endIndex;

                // 渲染范围不变时也要更新 spacer，以同步滚动视差。
                const {top: spacerTopPx, bottom: spacerBottomPx} = hm.calcSpacerHeights(
                    start, end, this.totalCount, this.itemHeight, clampedPhysScrollTop
                );

                // 压缩映射可能产生负的顶部补偿量，此时通过负 margin 表达而非负 height。
                if (spacerTopPx < 0) {
                    this._spacerTop.style.height = '0px';
                    this._spacerTop.style.marginTop = `${spacerTopPx}px`;
                } else {
                    this._spacerTop.style.height = `${spacerTopPx}px`;
                    this._spacerTop.style.marginTop = '0px';
                }
                this._spacerBottom.style.height = `${spacerBottomPx}px`;

                if (!force && rangeUnchanged && !heightChanged) {
                    return;
                }

                const prevStart = this._startIndex;
                const prevEnd = this._endIndex;
                const noOverlap = prevStart < 0 || end <= prevStart || start >= prevEnd;

                // 大跨度跳转全量换窗；窗口相交时只回收和补充差集中的节点。
                if (noOverlap || force) {
                    this._recycleAllAndRender(start, end);
                } else {
                    this._incrementalUpdate(prevStart, prevEnd, start, end);
                }

                this._startIndex = start;
                this._endIndex = end;
            } catch (error) {
                // 渲染失败后清理节点和窗口范围，避免残留状态。
                this._recycleRenderedNodes();

                if (this._spacerTop?.isConnected && this._spacerBottom?.isConnected) {
                    const {top, bottom} = this._heightMapper.calcSpacerHeights(
                        0, 0, this.totalCount, this.itemHeight, 0
                    );

                    this._spacerTop.style.height = `${top}px`;
                    this._spacerTop.style.marginTop = '0px';
                    this._spacerBottom.style.height = `${bottom}px`;
                }

                throw error;
            } finally {
                this._rendering = false;
            }
        }

        /**
         * 在旧渲染窗口与新渲染窗口有重叠时，执行最小化 DOM 操作的增量更新。
         * - **回收**：不再需要的旧索引节点归还给节点池。
         * - **前插**：新窗口左侧扩展的索引，渲染后插入到现有节点前面。
         * - **后追**：新窗口右侧扩展的索引，渲染后追加到 spacer 前面。
         * - 最终重建 `_renderedNodes` Map，保持索引→节点的准确映射。
         *
         * @private
         *
         * @param {number} prevStart - 旧窗口零基起点（含），用于只移除离开窗口的节点。
         * @param {number} prevEnd - 旧窗口终点（不含），与 `prevStart` 共同描述当前 DOM 映射。
         * @param {number} newStart - 新窗口零基起点（含），缺少的索引将按升序创建或从池中复用。
         * @param {number} newEnd - 新窗口终点（不含），必须已夹紧到 `totalCount`。
         * @returns {void}
         */
        _incrementalUpdate(prevStart, prevEnd, newStart, newEnd) {
            const toRecycle = [];
            const prependIndices = [];
            const appendIndices = [];

            for (let i = prevStart; i < prevEnd; i++) {
                if (i < newStart || i >= newEnd) {
                    toRecycle.push(i);
                }
            }

            // 此处只处理仍有交集的渲染窗口。
            for (let i = newStart; i < Math.min(prevStart, newEnd); i++) {
                prependIndices.push(i);
            }
            for (let i = Math.max(prevEnd, newStart); i < newEnd; i++) {
                appendIndices.push(i);
            }

            for (const i of toRecycle) {
                this._removeRenderedNode(i);
            }

            const newNodes = new Map();

            try {
                for (const i of prependIndices) {
                    newNodes.set(i, this._nodePool.toElement(this.renderItem(i, this.data)));
                }
                for (const i of appendIndices) {
                    newNodes.set(i, this._nodePool.toElement(this.renderItem(i, this.data)));
                }

                if (prependIndices.length > 0) {
                    const anchor = this._getFirstRenderedNode() ?? this._spacerBottom;
                    const frag = document.createDocumentFragment();
                    for (const i of prependIndices) {
                        frag.appendChild(newNodes.get(i));
                    }
                    this.container.insertBefore(frag, anchor);
                }

                if (appendIndices.length > 0) {
                    const frag = document.createDocumentFragment();
                    for (const i of appendIndices) {
                        frag.appendChild(newNodes.get(i));
                    }
                    this.container.insertBefore(frag, this._spacerBottom);
                }

                const orderedMap = new Map();
                for (let i = newStart; i < newEnd; i++) {
                    const el = newNodes.get(i) ?? this._renderedNodes.get(i);
                    if (el !== undefined) {
                        orderedMap.set(i, el);
                    } else {
                        console.error(
                            `[VirtualScroll] _incrementalUpdate: missing element for index ${i}. ` +
                            'This is an internal bug; please file an issue.'
                        );
                    }
                }
                this._renderedNodes = orderedMap;
            } catch (error) {
                // 异常时单独回收尚未登记的新节点，避免对象池泄漏。
                for (const el of newNodes.values()) {
                    this._nodePool.recycle(el);
                }

                throw error;
            }
        }

        /**
         * 获取当前 `_renderedNodes` Map 中第一个（最小索引）已渲染节点。
         * - Map 的迭代顺序即插入顺序，与索引递增顺序一致。
         *
         * @private
         *
         * @returns {HTMLElement | null} 第一个节点，若 Map 为空则返回 `null`。
         */
        _getFirstRenderedNode() {
            const first = this._renderedNodes.values().next();
            return first.done ? null : first.value;
        }

        /**
         * 全量回收当前所有已渲染节点，然后从零渲染新窗口 `[start, end)` 内的条目。
         * - 适用于新旧渲染窗口无重叠时的场景（例如大幅度跳转）。
         * - 使用 `DocumentFragment` 批量插入，减少重排次数。
         *
         * @private
         *
         * @param {number} start - 新渲染窗口起始索引（含）。
         * @param {number} end   - 新渲染窗口结束索引（不含）。
         * @returns {void}
         */
        _recycleAllAndRender(start, end) {
            this._recycleRenderedNodes();
            const frag = document.createDocumentFragment();
            for (let i = start; i < end; i++) {
                const el = this._nodePool.toElement(this.renderItem(i, this.data));
                this._renderedNodes.set(i, el);
                frag.appendChild(el);
            }
            this.container.insertBefore(frag, this._spacerBottom);
        }

        /**
         * 更新虚拟滚动的锚点信息，根据容器当前滚动位置计算视口顶部对应的项索引和偏移比例。
         * - 用于确定虚拟列表中哪些项应该被渲染以及它们在视口中的位置。
         * - 计算结果会存储在 `_anchorIndex` 和 `_anchorRatio` 属性中。
         *
         * @private
         *
         * @returns {void}
         *
         * @throws {Error} 当 `itemHeight` 小于等于 0 或 `container` 未定义时，函数会静默返回
         */
        _updateAnchor() {
            if (this.itemHeight <= 0 || !this.container) {
                return;
            }

            const hm = this._heightMapper;
            const physScrollTop = this.container.scrollTop;

            // 钳制锚点，避免弹性滚动越过数据范围。
            const maxPhysScroll = Math.max(0, hm.physicalHeight - this.container.clientHeight);
            const clampedPhysScrollTop = Math.max(0, Math.min(physScrollTop, maxPhysScroll));
            const virtScrollTop = hm.physicalToVirtual(clampedPhysScrollTop);
            const exactIdx = virtScrollTop / this.itemHeight;
            this._anchorIndex = Math.floor(exactIdx);
            this._anchorRatio = (exactIdx % 1);
        }

        /**
         * 从 `_renderedNodes` 中移除单个索引对应的节点，并将其归还节点池。
         * - 若指定索引不存在于 Map 中，静默返回。
         *
         * @private
         *
         * @param {number} index - `_rendered` 映射中的零基逻辑索引；未渲染索引静默忽略，命中时会
         *   同步删除映射、从 DOM 分离节点并交给节点池回收。
         * @returns {void}
         */
        _removeRenderedNode(index) {
            const el = this._renderedNodes.get(index);
            if (!el) {
                return;
            }

            this._renderedNodes.delete(index);
            this._nodePool.recycle(el);
        }

        /**
         * 将 `_renderedNodes` 中的所有节点批量归还节点池，并清空 Map。
         * - 同时将 `_startIndex` / `_endIndex` 重置为 -1（表示当前无渲染窗口）。
         *
         * @private
         *
         * @returns {void}
         */
        _recycleRenderedNodes() {
            for (const el of this._renderedNodes.values()) {
                this._nodePool.recycle(el);
            }
            this._renderedNodes.clear();
            this._startIndex = -1;
            this._endIndex = -1;
        }

        /**
         * 移除用户交互打断监听器。
         *
         * @private
         */
        _unbindUserInterrupt() {
            if (this._handleUserInterrupt && this.container) {
                this.container.removeEventListener('wheel', this._handleUserInterrupt);
                this.container.removeEventListener('touchstart', this._handleUserInterrupt);
                this.container.removeEventListener('mousedown', this._handleUserInterrupt);
                this._handleUserInterrupt = null;
            }
        }

        /**
         * 执行完整的资源清理流程，被 `clear()` 和 `destroy()` 共同调用。
         * - 解绑事件、取消所有 rAF、清空节点池、清空 DOM、重置所有内部状态字段。
         * - 执行后 `container` 置为 `null`，`_measured` 置为 `false`。
         *
         * @private
         *
         * @param {boolean} _keepContainer
         *   保留参数（当前未使用，为未来扩展预留；传 `false` 即可）。
         * @returns {void}
         */
        _teardown(_keepContainer) {
            // 先停止所有可能再次触发渲染的事件、动画和滚动任务。
            this._unbindScroll();
            this._unbindResize();
            this._unbindUserInterrupt();
            this._cancelAllRAF();
            this._cancelSmoothScrollSilent();

            // 再释放节点缓存与待处理队列，避免残留任务继续引用旧数据。
            this._nodePool.clear();
            this._renderedNodes.clear();
            this._pendingScrollQueue = [];
            this._remeasurePending = false;

            if (this.container) {
                this.container.replaceChildren();

                if (this._originalContainerStyle) {
                    Object.assign(this.container.style, this._originalContainerStyle);
                }
            }

            // 最后清空容器引用和测量状态，使实例回到不可渲染的基线。
            this._originalContainerStyle = null;
            this._spacerTop = null;
            this._spacerBottom = null;
            this._startIndex = -1;
            this._endIndex = -1;
            this._lastContainerHeight = 0;
            this._lastContainerWidth = 0;
            this._anchorIndex = 0;
            this._anchorRatio = 0;
            this._measured = false;
            this.data = [];
            this.totalCount = 0;
            this.container = null;
            this._heightMapper.reset();
            this._rendering = false;
        }

        /**
         * 在压缩模式下使用 rAF 动画实现平滑滚动到指定物理偏移量。
         * - 浏览器原生 `scrollTo({ behavior: 'smooth' })` 在压缩模式下因高度不真实而
         *   表现异常，此方法作为替代，在每一帧手动计算 easeInOut 插值并调用 `_render()`。
         * - 动画时长固定 300 ms，缓动函数为二次 easeInOut。
         * - 开始前取消上一次尚未完成的平滑滚动动画。
         * - 动画期间 scroll 事件被 `_isSmoothScrolling` 标志屏蔽。
         *
         * @private
         *
         * @param {number} targetPhysical - 已由虚拟坐标映射得到的物理目标位置；进入动画前夹紧到当前
         *   可滚范围，新请求会取消并替换尚未完成的平滑滚动。
         * @returns {void}
         */
        _smoothScrollTo(targetPhysical) {
            this._cancelSmoothScrollSilent();

            const start = this.container.scrollTop;
            const delta = targetPhysical - start;

            if (Math.abs(delta) < 1) {  // 使用 `< 1` 吸收浮点误差。
                return;
            }

            const distance = Math.abs(delta);
            const clientHeight = this.container.clientHeight;

            const screens = distance / (clientHeight || 1);
            const dur = Math.min(800, Math.max(300, screens * 100));

            let t0 = null;
            const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            this._isSmoothScrolling = true;

            const step = (ts) => {
                if (this._sm.is(VirtualScroll.State.DESTROYED) || !this.container) {
                    this._smoothRAF = null;
                    this._isSmoothScrolling = false;
                    return;
                }

                if (t0 === null) {
                    t0 = ts;
                }
                const elapsed = Math.min(ts - t0, dur);
                const progress = easeInOut(elapsed / dur);

                this.container.scrollTop = start + delta * progress;
                this._render();

                if (elapsed < dur) {
                    this._smoothRAF = requestAnimationFrame(step);
                } else {
                    // 动画结束时校正最终位置和锚点。
                    this.container.scrollTop = targetPhysical;
                    this._smoothRAF = null;
                    this._isSmoothScrolling = false;
                    this._updateAnchor();
                    this._scheduleRender();
                }
            };

            this._smoothRAF = requestAnimationFrame(step);
        }

        /**
         * 取消正在进行的平滑滚动动画，并在之前处于动画状态时调度一次补充渲染。
         * - 用于 `scrollToIndex({ behavior: 'auto' })` 打断 smooth 动画的场景。
         *
         * @private
         *
         * @returns {void}
         */
        _cancelSmoothScroll() {
            const wasScrolling = this._isSmoothScrolling;
            this._cancelSmoothScrollSilent();
            if (wasScrolling) {
                this._scheduleRender();
            }
        }

        /**
         * 静默取消平滑滚动动画，不触发后续渲染。
         * - 用于 `load()` / `_teardown()` 等需要立即停止动画但不额外渲染的场合。
         *
         * @private
         *
         * @returns {void}
         */
        _cancelSmoothScrollSilent() {
            if (this._smoothRAF) {
                cancelAnimationFrame(this._smoothRAF);
                this._smoothRAF = null;
            }
            this._isSmoothScrolling = false;
        }

        /**
         * 加载数据并启动或刷新虚拟滚动。
         *
         * @param {any[]|object} data - 原样传给每次 `renderItem(index, data)` 的数据源；实例仅保存引用，
         *   不复制、冻结或推断其长度，因此后续原地修改会影响再次渲染。
         * @param {number} length - 逻辑条目总数；有限数值会截断为非负整数，不要求等于 `data.length`，
         *   因而也可配合对象、稀疏数组或按需数据源。
         * @param {object} [options={}] - 本次加载对测量缓存和滚动位置的处理方式。
         * @param {boolean} [options.remeasure=false] - 即使已有有效 `itemHeight` 也重新渲染样本测量；
         *   数据模板、字体或行样式变化后应设为 `true`。
         * @param {boolean} [options.resetScroll=true] - `true` 从逻辑顶部开始；`false` 尽量保留当前虚拟
         *   偏移并夹紧到新内容范围，适合刷新同一列表的数据。
         * @throws {Error} 实例或容器不可用时抛出。
         */
        load(data, length, {remeasure = false, resetScroll = true} = {}) {
            this._assertNotDestroyed('load');

            if (!this._sm.is(
                VirtualScroll.State.IDLE,
                VirtualScroll.State.RUNNING,
                VirtualScroll.State.PAUSED
            )) {
                throw new Error(`[VirtualScroll] load() cannot be called in state "${this.state}"`);
            }

            const normalizedLength = this._normalizeLength(length, 'load');

            try {
                this._unbindScroll();
                this._unbindResize();
                this._cancelAllRAF();
                this._cancelSmoothScrollSilent();
                this._pendingScrollQueue = [];

                this._resolveContainer();

                // 数据长度变化前先保存逻辑偏移，resetScroll=false 时才能跨映射恢复位置。
                const oldVirtScroll = this._heightMapper.physicalToVirtual(this.container.scrollTop);

                this.data = data;
                this.totalCount = normalizedLength;

                if (!this._measured || remeasure) {
                    this._setupContainer();
                    this._doMeasure();
                    this._measured = true;
                } else {
                    this._verifyItemHeight();
                    this._heightMapper.update(
                        this.totalCount, this.itemHeight, this.container.clientHeight
                    );
                }

                this._calcBufferSize(true);

                if (!this._spacerTop?.isConnected || !this._spacerBottom?.isConnected) {
                    this._buildDOM();
                }

                this._syncContainerSize();

                // 先撑开完整占位高度，避免浏览器钳制随后设置的 `scrollTop`。
                {
                    const hm = this._heightMapper;
                    const {top, bottom} = hm.calcSpacerHeights(
                        0, 0, this.totalCount, this.itemHeight
                    );
                    this._spacerTop.style.height = `${top}px`;
                    this._spacerBottom.style.height = `${bottom}px`;
                }

                if (resetScroll) {
                    this.container.scrollTop = 0;
                } else {
                    const clientHeight = this.container.clientHeight;
                    const hm = this._heightMapper;
                    const newVirtScroll = Math.min(
                        oldVirtScroll,
                        Math.max(0, hm.virtualHeight - clientHeight)
                    );

                    this.container.scrollTop = hm.virtualToPhysical(newVirtScroll);
                }

                this._bindEvents();
                this._forceRender();
                if (!this._sm.is(VirtualScroll.State.RUNNING)) {
                    this._sm.transition(VirtualScroll.State.RUNNING);
                }
            } catch (error) {
                // 加载失败后清理现场，回到可重新加载的空闲状态。
                this._teardown(false);

                if (!this._sm.is(VirtualScroll.State.IDLE)) {
                    this._sm.transition(VirtualScroll.State.IDLE);
                }

                throw error;
            }
        }

        /**
         * 对指定索引的已渲染 DOM 节点执行自定义操作。
         * - 如果该索引当前不在渲染窗口内（未被挂载到 DOM），则跳过执行并返回 `false`。
         *
         * @param {number} index - 要查找的零基逻辑索引；只有它当前位于渲染窗口且节点仍挂载时才命中。
         * @param {(el: HTMLElement) => void} callback - 命中后同步执行的操作；参数是列表持有的实际行节点。
         *   回调可以修改节点内容或样式，但不应移除节点、改变索引映射或把它转移到其他父元素。
         * @returns {boolean} 若节点存在并执行了回调返回 `true`，否则返回 `false`。
         */
        applyToItem(index, callback) {
            this._assertNotDestroyed('applyToItem');

            if (typeof callback !== 'function') {
                throw new TypeError('[VirtualScroll] applyToItem() requires a callback function.');
            }

            const i = Number(index);
            const el = this._renderedNodes.get(i);

            if (!el) {
                return false;
            }

            callback(el);
            return true;
        }

        /**
         * 暂停虚拟滚动，解绑 scroll 事件监听器。
         * - 仅在 `RUNNING` 状态下有效，其他状态下只打印警告。
         * - 暂停期间调用 {@link VirtualScroll#scrollToIndex} 会将请求排队，
         *   待 {@link VirtualScroll#resume} 后按序执行（仅最后一条生效）。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         */
        pause() {
            this._assertNotDestroyed('pause');
            if (!this._sm.is(VirtualScroll.State.RUNNING)) {
                console.warn(`[VirtualScroll] pause() requires RUNNING state, current: ${this.state}`);
                return;
            }

            this._unbindScroll();
            this._cancelAllRAF();
            this._sm.transition(VirtualScroll.State.PAUSED);
        }

        /**
         * 从暂停状态恢复虚拟滚动。
         * - 仅在 `PAUSED` 状态下有效，其他状态下只打印警告。
         * - 若暂停期间有排队的 `scrollToIndex()` 请求，恢复后将执行最后一条，
         *   其余请求被丢弃（打印警告）。
         *
         * @param {object} [options={}] - 恢复时的测量策略。
         * @param {boolean} [options.remeasure=true] - 是否在重新绑定滚动监听后测量当前行高；`true`
         *   会先保存最后一条排队定位请求，待测量完成后再执行，`false` 直接复用暂停前的行高。
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         */
        resume({remeasure = true} = {}) {
            this._assertNotDestroyed('resume');

            if (!this._sm.is(VirtualScroll.State.PAUSED)) {
                console.warn(`[VirtualScroll] resume() requires PAUSED state, current: ${this.state}`);
                return;
            }

            this._sm.transition(VirtualScroll.State.RUNNING);
            this._bindScroll();

            let pendingScroll = null;

            if (this._pendingScrollQueue.length > 0) {
                if (this._pendingScrollQueue.length > 1) {
                    console.warn(
                        `[VirtualScroll] ${this._pendingScrollQueue.length - 1} scrollToIndex() ` +
                        'call(s) were dropped while PAUSED (only the last one is applied).'
                    );
                }

                // 多次定位只保留最后意图，避免恢复后连续动画到已经过时的位置。
                pendingScroll = this._pendingScrollQueue.at(-1);
            }

            // 恢复时重新测量行高。
            if (remeasure && this.container && this.totalCount > 0) {
                this._resumeWithRemeasure(pendingScroll);
                return;
            }

            this._pendingScrollQueue = [];

            if (pendingScroll) {
                const {index, behavior, block} = pendingScroll;
                this.scrollToIndex(index, {behavior, block});

                if (!this._isSmoothScrolling) {
                    this._forceRender();
                }
                return;
            }

            this._forceRender();
        }

        /**
         * 清空列表并将实例重置为 `IDLE` 状态。
         * - 解绑所有事件、取消所有 rAF、清空 DOM 和节点池。
         * - 清空后可再次调用 {@link VirtualScroll#load} 重新启动。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         */
        clear() {
            this._assertNotDestroyed('clear');

            if (!this._sm.is(VirtualScroll.State.IDLE)) {
                this._sm.transition(VirtualScroll.State.IDLE);
            }
            this._teardown(false);
        }

        /**
         * 永久销毁实例，释放所有资源。
         * - 销毁后不可再调用任何方法（会抛出异常），也无法通过 `load()` 重启。
         * - 若已处于 `DESTROYED` 状态则直接返回，不重复执行。
         *
         * @returns {void}
         */
        destroy() {
            if (this._sm.is(VirtualScroll.State.DESTROYED)) {
                return;
            }

            this._sm.transition(VirtualScroll.State.DESTROYED);
            this._teardown(false);
        }

        /**
         * 将滚动位置跳转到指定索引对应的条目。
         * - `IDLE` 状态或容器不存在时静默返回。
         * - `PAUSED` 状态时请求入队，`resume()` 后执行最后一条。
         * - 压缩模式下 `'smooth'` 行为由内部 rAF 动画实现，而非浏览器原生滚动。
         * - 索引会被夹紧到 `[0, totalCount - 1]`。
         *
         * @param {number} index - 目标条目的零基逻辑索引；有限小数先取整，再夹紧到现有内容范围。
         *   空列表、空闲状态或无效数值不会产生可见滚动。
         * @param {object} [options={}] - 本次定位的动画和视口对齐策略。
         * @param {'auto'|'smooth'} [options.behavior='auto'] - `auto` 立即设置目标偏移；`smooth` 在普通
         *   范围内交给浏览器，在压缩映射范围内使用内部 `requestAnimationFrame` 动画。
         * @param {'start'|'end'|'center'|'nearest'} [options.block='nearest'] - 条目相对可视区的纵向位置；
         *   `nearest` 在已可见时不滚动，否则选择位移较小的一侧。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         */
        scrollToIndex(index, {behavior = 'auto', block = 'nearest'} = {}) {
            this._assertNotDestroyed('scrollToIndex');

            if (this._sm.is(VirtualScroll.State.IDLE) || !this.container || this.totalCount === 0) {
                return;
            }
            if (this.itemHeight <= 0) {
                console.warn('[VirtualScroll] scrollToIndex() called before item height was measured');
                return;
            }

            const numericIndex = Number(index);
            const normalizedIndex = Number.isFinite(numericIndex) ? Math.trunc(numericIndex) : 0;
            const i = Math.max(0, Math.min(normalizedIndex, this.totalCount - 1));

            // 暂停期间容器尺寸可能无效，只记录逻辑索引，恢复后再换算物理位置。
            if (this._sm.is(VirtualScroll.State.PAUSED)) {
                this._pendingScrollQueue.push({index: i, behavior, block});
                return;
            }

            const clientHeight = this.container.clientHeight;
            const itemVirtualTop = i * this.itemHeight;
            const itemVirtualBottom = itemVirtualTop + this.itemHeight;

            let virtualTop;
            switch (block) {
                case 'end':
                    virtualTop = itemVirtualBottom - clientHeight;
                    break;
                case 'center':
                    virtualTop = (itemVirtualTop + itemVirtualBottom) / 2 - clientHeight / 2;
                    break;
                case 'nearest': {
                    const visStartVirtual = this._heightMapper.physicalToVirtual(this.container.scrollTop);
                    const visEndVirtual = visStartVirtual + clientHeight;

                    if (itemVirtualTop >= visStartVirtual && itemVirtualBottom <= visEndVirtual) {
                        return;
                    } else if (itemVirtualTop < visStartVirtual) {
                        virtualTop = itemVirtualTop;
                    } else {
                        virtualTop = itemVirtualBottom - clientHeight;
                    }
                    break;
                }
                case 'start':
                default:
                    virtualTop = itemVirtualTop;
                    break;
            }

            // 计算并钳制目标的虚拟坐标。
            const maxVirt = Math.max(0, this._heightMapper.virtualHeight - clientHeight);
            virtualTop = Math.min(Math.max(0, virtualTop), maxVirt);

            // 通过高度映射器转换为物理坐标。
            const physicalTop = this._heightMapper.virtualToPhysical(virtualTop);

            if (behavior === 'smooth') {
                if (this._heightMapper.compressed) {
                    this._smoothScrollTo(physicalTop);
                } else {
                    this.container.scrollTo({top: physicalTop, behavior: 'smooth'});
                }
            } else {
                this._cancelSmoothScroll();
                this.container.scrollTop = physicalTop;
            }
        }

        /**
         * 滚动到列表顶部。
         *
         * @param {object} [options={}] - 透传给 `scrollToIndex(0, options)` 的定位选项。
         * @param {'auto'|'smooth'} [options.behavior='auto'] - 立即或平滑滚动到顶部。
         * @param {'start'|'end'|'center'|'nearest'} [options.block='start'] - 顶部条目相对视口的对齐方式；
         *   一般保持 `start`，其他值仍按 `scrollToIndex` 的通用规则执行。
         * @returns {void}
         */
        scrollToTop({behavior = 'auto', block = 'start'} = {}) {
            this.scrollToIndex(0, {behavior, block});
        }

        /**
         * 滚动到列表底部。
         * - 内部计算虚拟底部偏移量后转换为物理坐标进行滚动。
         * - 压缩模式下 `'smooth'` 使用内部动画实现。
         *
         * @param {object} [options={}] - 底部定位的动画选项。
         * @param {'auto'|'smooth'} [options.behavior='auto'] - `auto` 立即写入最大物理滚动位置；
         *   `smooth` 在压缩模式使用内部动画，在普通模式使用浏览器原生平滑滚动。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         */
        scrollToBottom({behavior = 'auto'} = {}) {
            this._assertNotDestroyed('scrollToBottom');
            if (this._sm.is(VirtualScroll.State.IDLE) || !this.container || this.totalCount === 0) {
                return;
            }
            if (this.itemHeight <= 0) {
                return;
            }

            if (this._sm.is(VirtualScroll.State.PAUSED)) {
                this._pendingScrollQueue.push({
                    index: this.totalCount - 1,
                    behavior,
                    block: 'end'
                });
                return;
            }

            const clientHeight = this.container.clientHeight;

            const physicalBottom = Math.max(0, this._heightMapper.physicalHeight - clientHeight);

            if (behavior === 'smooth') {
                if (this._heightMapper.compressed) {
                    this._smoothScrollTo(physicalBottom);
                } else {
                    this.container.scrollTo({top: physicalBottom, behavior: 'smooth'});
                }
            } else {
                this._cancelSmoothScroll();
                this.container.scrollTop = physicalBottom;
            }
        }

        /**
         * 返回深度冻结的运行状态与性能指标。
         *
         * @returns {Readonly<VirtualScrollMetrics>} 新创建并冻结的指标快照；数值和布尔字段不会随实例
         *   后续滚动自动变化，`pendingScrollQueue` 也复制并逐项冻结，可安全用于调试或性能采样。
         */
        getMetrics() {
            const clientHeight = this.container ? this.container.clientHeight : 0;
            const visibleCount = (this.itemHeight && clientHeight)
                                 ? Math.ceil(clientHeight / this.itemHeight)
                                 : 0;
            const hm = this._heightMapper;

            return Object.freeze({
                state: this.state,
                ready: this._sm.is(VirtualScroll.State.RUNNING, VirtualScroll.State.PAUSED),

                isRendering: this._rendering,
                isSmoothScrolling: this._isSmoothScrolling,
                isRemeasurePending: this._remeasurePending,

                itemHeight: this.itemHeight,
                containerHeight: this._lastContainerHeight,
                bufferSize: this.bufferSize,
                visibleCount,
                totalCount: this.totalCount,

                startIndex: this._startIndex,
                endIndex: this._endIndex,
                renderedCount: this._renderedNodes.size,
                anchorIndex: this._anchorIndex,
                anchorRatio: Number(this._anchorRatio.toFixed(4)),

                scrollTop: this.container?.scrollTop ?? 0,
                compressed: hm.compressed,
                virtualHeight: hm.virtualHeight,
                physicalHeight: hm.physicalHeight,
                scrollRatio: hm.scrollRatio,

                poolSize: this._nodePool.poolSize,
                wrapperCount: this._nodePool.wrapperCount,
                userElemCount: this._nodePool.userElemCount,

                spacerTop: this._spacerTop ? parseFloat(this._spacerTop.style.height) : 0,
                spacerBottom: this._spacerBottom ? parseFloat(this._spacerBottom.style.height) : 0,

                pendingScrollQueue: Object.freeze(
                    this._pendingScrollQueue.map((e) => Object.freeze({...e}))
                )
            });
        }

        /**
         * 判断实例是否处于 `PAUSED` 状态。
         *
         * @returns {boolean}
         */
        isPaused() {
            return this._sm.is(VirtualScroll.State.PAUSED);
        }

        /**
         * 判断实例是否处于 `RUNNING` 状态。
         *
         * @returns {boolean}
         */
        isRunning() {
            return this._sm.is(VirtualScroll.State.RUNNING);
        }
    }

    /** 管理输入区和统计数据网格。 */
    class InputManager {
        /**
         * 输入框最多能输入的字符数。
         *
         * @private
         * @readonly
         * @type {number}
         */
        static _MAX_INPUT_LEN = 1234;

        /**
         * 统计模式最大统计数据行数。
         *
         * @type {number}
         */
        static MAX_STATISTICS_ROW = 985;

        /**
         * statisticsRenderer 实例。
         * 用于管理统计模式的列表显示。
         *
         * @type {VirtualScroll}
         */
        static statisticsRenderer = new VirtualScroll({
            container: '#grid_data',

            /**
             * 渲染统计数据行。
             *
             * @param {number} index - 要渲染的零基统计行索引，同时写入返回节点的行号与定位数据。
             * @param {Array<[string|string[],string|string[]]>} dataSource - 最近加载的二维统计表；
             *   `dataSource[index][0]`、`[1]` 分别是 X、Y 的内部字符串或既有类名数组。
             * @returns {HTMLElement} 尚未挂载的完整行 `<div>`，含序号、X 单元格和 Y 单元格三个子区。
             */
            renderItem: (index, dataSource) => {
                /**
                 * 将字符串转换为 HTML 类名列表。
                 *
                 * @param {string|string[]} input - 单元格内部表达式或已转换的渲染类名；字符串会词元化，
                 *   数组直接沿用且不复制。
                 * @returns {string[]} 可交给 `_statisticsCreateLine` 的类名序列；输入数组时返回同一引用。
                 */
                const toClassList = (input) => typeof input === 'string' ? HtmlTools.textToHtmlClass(input) : input;

                return this._statisticsCreateLine({
                    index,
                    inputListX: toClassList(dataSource[index][0]),
                    inputListY: toClassList(dataSource[index][1])
                });
            }
        });

        /**
         * 阻止实例化静态输入管理器。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[InputManager] InputManager is a static class and should not be instantiated.');
        }

        /**
         * 计算一个词法单元（token）在 HTML 中渲染时所占用的 DOM 元素数量。
         * 大多数符号和单字符 token 占用 1 个元素。
         * 多字符的函数名（如 "sin"）会根据其字符串长度占用多个元素，每个字符一个。
         * 但有一些特殊的多字符函数名（如 "gamma"）被设计为使用单个 CSS 类和图标来渲染，因此它们只占用 1 个元素。
         * 此方法通过检查 `tokenInfo.isHtmlClassLenOne` 标志来区分这两种情况。
         *
         * @private
         *
         * @param {string|null|undefined} token - 需要计算显示长度的词法单元字符串。
         * @returns {number} 该 token 在渲染时占用的 DOM 元素数量（通常是 `<p>` 元素的数量）。
         */
        static _getTokenLen(token) {
            if (!token) {
                return 0;
            }

            const tokenInfo = Public.getTokenInfo(token);
            if (tokenInfo.class === 'func' && !tokenInfo.isHtmlClassLenOne) {
                return token.length;
            }

            return 1;
        }

        /**
         * 计算光标移动步长。
         * - 优化亮点：
         * 1. 【极致性能】无论光标位置在哪，整个生命周期严格只调用一次 `tokenizer`。
         * 2. 【窗口机制】只提取光标附近局部范围的文本进行拼接分析，避免处理超长输入时的性能损耗。
         * 3. 【精准定位】通过文本长度偏移量，精确计算光标是否卡在函数名（如 "sin"）的边缘。
         *
         * @param {'left'|'right'|'both'} direction - 要计算的移动侧；`left`、`right` 返回对应单个步长，
         *   `both` 返回两侧步长数组。词元函数名视为整体，普通字符通常占一个 DOM 节点。
         * @param {HTMLElement|null} [asCursor=null] - 用于点击定位的临时光标参照；`null` 使用主输入区
         *   当前 `.InputCursor`。传入元素必须位于同一直接子节点序列中，方法不会移动真实光标。
         * @returns {number|[number,number]} `left` 或 `right` 返回该侧需要跨越的 DOM 节点数；`both`
         *   返回 `[leftStep,rightStep]`。若光标位于边缘，缺失方向用相反侧步长的负值编码。
         */
        static inputAreaMoveNum(direction, asCursor = null) {
            const input = HtmlTools.getHtml('#input');
            const children = input.children;
            const len = children.length;
            const range = TokenConfig.MAX_TOKEN_LENGTH + 2;
            let cursorIndex = -1;

            if (!asCursor) {
                for (let i = 0; i < len; i++) {
                    if (children[i].id === 'cursor') {
                        cursorIndex = i;
                        break;
                    }
                }
            } else {
                let targetIndex = -1;
                let realCursorIndex = -1;

                for (let i = 0; i < len; i++) {
                    const child = children[i];

                    if (targetIndex === -1 && child === asCursor) {
                        targetIndex = i;
                    }
                    if (realCursorIndex === -1 && child.id === 'cursor') {
                        realCursorIndex = i;
                    }

                    if (targetIndex !== -1 && realCursorIndex !== -1) {
                        break;
                    }
                }

                // 目标位于光标之后时，扣除光标节点占用的索引。
                if (targetIndex !== -1) {
                    const gap = targetIndex - realCursorIndex;
                    cursorIndex = (realCursorIndex !== -1 && gap > 0 && gap <= range)
                                  ? targetIndex - 1
                                  : targetIndex;
                }
            }

            if (cursorIndex === -1) {
                return direction === 'both' ? [0, 0] : 0;
            }

            // 仅提取光标附近的文本窗口。
            const startIndex = Math.max(0, cursorIndex - range);
            const endIndex = Math.min(len - 1, cursorIndex + range);
            const classList = HtmlTools.getClassList(input, {
                startIndex: startIndex,
                endIndex: endIndex + 1
            });

            const offset = cursorIndex - startIndex;
            const leftText = HtmlTools.htmlClassToText(classList.slice(0, offset));
            const rightText = HtmlTools.htmlClassToText(classList.slice(offset));
            const fullText = leftText + rightText;

            if (!fullText) {
                return direction === 'both' ? [0, 0] : 0;
            }

            const splitPoint = leftText.replace(/\[[a-zA-Z0-9_]+]/g, '1').length;
            // 词元文本长度与 DOM 节点数并不总相同，分词后按显示长度定位光标所在词元。
            const tokens = Public.tokenizer(fullText, {strictMode: false});

            let leftToken = null;
            let rightToken = null;
            let currentPos = 0;

            for (const token of tokens) {
                const tokenLen = this._getTokenLen(token);
                const tokenEnd = currentPos + tokenLen;

                if (currentPos < splitPoint && tokenEnd > splitPoint) {
                    const leftDist = splitPoint - currentPos;
                    const rightDist = tokenEnd - splitPoint - (asCursor ? 1 : 0);
                    switch (direction) {
                        case 'left':
                            return leftDist;
                        case 'right':
                            return rightDist;
                        case 'both':
                            return [leftDist, rightDist];
                        default:
                            return 0;
                    }
                }

                if (tokenEnd === splitPoint) {
                    leftToken = token;
                } else if (currentPos === splitPoint) {
                    rightToken = token;
                    break;
                }

                currentPos += tokenLen;
            }

            const leftLen = this._getTokenLen(leftToken);
            const rightLen = this._getTokenLen(rightToken);
            const leftStep = asCursor ? 0 : leftLen;
            const rightStep = asCursor ? (leftLen - 1) : rightLen;

            if (direction === 'both') {
                return [leftStep, rightStep];
            }

            const isAtLeftEdge = (cursorIndex === 0) && !asCursor;
            const isAtRightEdge = (cursorIndex === len - 1) && !asCursor;

            // 负步长表示指定方向已到边界，调用方应改为处理光标另一侧的完整词元。
            if (direction === 'left') {
                return isAtLeftEdge ? -rightStep : leftStep;
            } else {
                return isAtRightEdge ? -leftStep : rightStep;
            }
        }

        /**
         * 自动在数学表达式的 DOM 表示或 ClassList 数组中添加或移除空格，以提高可读性。
         *
         * @param {object} [options={}] - 选择 DOM 模式或纯数组模式，以及 DOM 扫描范围。
         * @param {HTMLElement|null} [options.area=null] - DOM 模式下要整理其直接子节点的容器；`null`
         *   使用 `#input`。传入 `classList` 时忽略该项且不访问 DOM。
         * @param {Array<string>|null} [options.classList=null] - 纯数组模式的渲染类名序列；方法复制后
         *   插入/删除 `_space_` 并返回新数组，不修改传入数组。`null` 才表示 DOM 模式。
         * @param {boolean} [options.rangeLimit=false] - DOM 模式下是否只重算光标附近可能受本次编辑
         *   影响的边界；批量载入或全量恢复后应使用 `false`，数组模式下该项无效。
         * @returns {void|string[]} DOM 模式直接重排目标子节点并返回 `undefined`；纯数组模式返回新的
         *   规范化类名数组。两种模式都会移除不再需要的 `_space_`，再在语义边界插入空格。
         */
        static addSpace({area = null, classList = null, rangeLimit = false} = {}) {
            const REGEX_ALPHA = /[a-zA-Z]/;

            const specialCharacters = '_syntax_error_';
            const space = '_space_';

            /**
             * 判断两个词元之间是否需要空格。
             *
             * @param {string} prevToken - 前一个 token。
             * @param {string} currToken - 后一个 token。
             * @returns {boolean}
             * @private
             */
            const shouldAddSpace = (prevToken, currToken) => {
                if (!prevToken || !currToken) {
                    return false;
                }

                const prevInfo = Public.getTokenInfo(prevToken);
                const currInfo = Public.getTokenInfo(currToken);

                const isAlphaSeq = REGEX_ALPHA.test(prevToken) && REGEX_ALPHA.test(currToken);
                const hasFunc = prevInfo.class === 'func' || currInfo.class === 'func';
                const notSpecialSymbol = !(prevInfo.isHtmlClassLenOne || currInfo.isHtmlClassLenOne);
                const illegal = prevInfo.class !== 'illegal' && currInfo.class !== 'illegal';

                if (isAlphaSeq && hasFunc && notSpecialSymbol && illegal) {
                    return true;
                }

                const isBoundaryIllegal = (prevInfo.class === 'illegal') !== (currInfo.class === 'illegal');
                const isIgnoredChar = [prevToken, currToken].includes(' ') || prevInfo.isHtmlClassLenOne || currInfo.isHtmlClassLenOne;

                return isBoundaryIllegal && !isIgnoredChar;
            };

            /**
             * 计算无范围限制时的空格插入位置。
             *
             * @param {string[]} classList - HTML 类名数组。
             * @returns {number[]} 零基空格插入索引。
             * @private
             */
            const getUnlimitedAddIndex = (classList) => {
                const clonedList = [...classList];

                let haveSpecialCharacters = false;
                if (clonedList[0] === specialCharacters) {
                    haveSpecialCharacters = true;
                    clonedList.shift();
                }

                const textList = HtmlTools.htmlClassToText(clonedList);
                const tokens = Public.tokenizer(textList, {strictMode: false});
                const addIndex = [];

                if (tokens && tokens.length > 0) {
                    let pointer = this._getTokenLen(tokens[0]);

                    for (let i = 1; i < tokens.length; i++) {
                        const currToken = tokens[i];
                        const prevToken = tokens[i - 1];

                        if (shouldAddSpace(prevToken, currToken)) {
                            addIndex.push(pointer);
                        }

                        pointer += this._getTokenLen(currToken);
                    }
                }

                if (haveSpecialCharacters) {
                    for (let i = 0; i < addIndex.length; i++) {
                        addIndex[i] = addIndex[i] + 1;
                    }
                    addIndex.unshift(1);
                }

                return addIndex;
            };

            // 数组模式只返回规范化副本，不触碰页面上的输入节点。
            if (classList) {
                const pureClassList = classList.filter((c) => c !== space);
                if (pureClassList.length === 0) {
                    return pureClassList;
                }

                const addIndex = getUnlimitedAddIndex(pureClassList);

                for (let i = addIndex.length - 1; i >= 0; i--) {
                    pureClassList.splice(addIndex[i], 0, space);
                }

                return pureClassList;
            }

            if (!area && HtmlTools.getHtml('.InputTip')) {
                return;
            }

            const target = area || HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');
            const children = target.children;

            let totalRangeStart = 0;
            let totalRangeEnd = children.length;

            let addIndex = [];
            // 局部模式只观察光标两侧最近的语义词元，足以覆盖一次编辑造成的空格变化。
            if (rangeLimit) {
                const childrenArray = Array.from(children);
                const centerIndex = childrenArray.indexOf(cursor);

                if (centerIndex === -1) {
                    return;
                }

                const range = TokenConfig.MAX_TOKEN_LENGTH * 2 + 3;
                const startIndex = Math.max(0, centerIndex - range);
                const endIndex = Math.min(childrenArray.length - 1, centerIndex + range);

                const leftClassList = HtmlTools.getClassList(target, {
                    onlyP: false,
                    startIndex: startIndex,
                    endIndex: centerIndex
                });

                const rightClassList = HtmlTools.getClassList(target, {
                    onlyP: false,
                    startIndex: centerIndex + 1,
                    endIndex: endIndex + 1
                });

                const leftTokens = Public.tokenizer(HtmlTools.htmlClassToText(leftClassList), {strictMode: false}).slice(-4);
                const rightTokens = Public.tokenizer(HtmlTools.htmlClassToText(rightClassList), {strictMode: false}).slice(0, 4);

                let tokenStack = [];
                let leftSpaceCount = 0;
                let addPos;
                for (let i = leftTokens.length - 1; i >= 0; i--) {
                    if (leftTokens[i] === ' ') {
                        leftSpaceCount += 1;
                    } else {
                        if (tokenStack.length > 0) {
                            addPos = centerIndex - leftSpaceCount - this._getTokenLen(tokenStack[0]);
                        }
                        tokenStack.push(leftTokens[i]);
                    }

                    if (tokenStack.length === 2) {
                        break;
                    }
                }
                if (tokenStack.length !== 2) {
                    const len0 = this._getTokenLen(tokenStack[0]);
                    totalRangeStart = centerIndex - leftSpaceCount - len0;
                } else {
                    if (shouldAddSpace(tokenStack[0], tokenStack[1])) {
                        addIndex.push(addPos);
                    }
                    const len0 = this._getTokenLen(tokenStack[0]);
                    const len1 = this._getTokenLen(tokenStack[1]);
                    totalRangeStart = centerIndex - leftSpaceCount - len0 - len1;
                }

                tokenStack.length = 0;
                let rightSpaceCount = 0;
                for (let i = 0; i < rightTokens.length; i++) {
                    if (rightTokens[i] === ' ') {
                        rightSpaceCount += 1;
                    } else {
                        if (tokenStack.length > 0) {
                            addPos = centerIndex - leftSpaceCount + this._getTokenLen(tokenStack[0]) + 1;
                        }
                        tokenStack.push(rightTokens[i]);
                    }

                    if (tokenStack.length === 2) {
                        break;
                    }
                }
                if (tokenStack.length !== 2) {
                    const len0 = this._getTokenLen(tokenStack[0]);
                    totalRangeEnd = centerIndex + len0 + rightSpaceCount;
                } else {
                    if (shouldAddSpace(tokenStack[0], tokenStack[1])) {
                        addIndex.push(addPos);
                    }
                    const len0 = this._getTokenLen(tokenStack[0]);
                    const len1 = this._getTokenLen(tokenStack[1]);
                    totalRangeEnd = centerIndex + len0 + len1 + rightSpaceCount;
                }
            } else {
                const classList = HtmlTools.getClassList(target, {ignoreSpace: true, onlyP: false});
                if (classList.length === 0) {
                    return;
                }

                addIndex = getUnlimitedAddIndex(classList);
            }

            const originalDisplay = target.style.display;

            // 批量移除和插入空格时暂时隐藏容器，减少逐节点变更引发的中间重排。
            target.style.display = 'none';

            for (let i = totalRangeStart; i < totalRangeEnd; i++) {
                const curr = children[i];
                if (curr.className === space) {
                    curr.remove();
                    totalRangeEnd -= 1;
                }
            }

            for (let i = addIndex.length - 1; i >= 0; i--) {
                HtmlTools.appendDOMs(target, [space], {index: addIndex[i]});
            }

            target.style.display = originalDisplay;

            HtmlTools.scrollToView();
        }

        /**
         * 清除指定 DOM 区域的内容，或在未指定区域时重置主输入区域。
         *
         * @param {object} [options={}] - 清除目标和模式覆盖选项。
         * @param {HTMLElement|string|null} [options.acArea=null] - 明确要清空的容器元素或 `getHtml`
         *   可解析的选择描述；提供时只清空该区域，不执行主输入区的模式联动。
         * @param {boolean} [options.forcedMode=false] - 未指定 `acArea` 时，是否跳过当前页面/遮罩状态限制，
         *   强制按活动子屏幕规则清空；用于模式切换和内部恢复，不应由普通点击随意设置。
         */
        static ac({acArea = null, forcedMode = false} = {}) {
            // 指定区域时执行纯 DOM 清空，不触发主输入区的模式联动。
            if (acArea) {
                const target = typeof acArea === 'string' ? HtmlTools.getHtml(acArea) : acArea;

                if (target) {
                    target.replaceChildren();
                }
                return;
            }

            const inputBox = HtmlTools.getHtml('#input');

            if (!inputBox) {
                return;
            }

            // 初始提示态或强制清空按当前模式处理屏幕数据，而不是重建主输入光标。
            if (HtmlTools.getHtml('.InputTip') || forcedMode) {
                const currentMode = PageConfig.currentMode;
                if (currentMode === '1') {
                    PageConfig.subModes = {'1': [0, 0]};
                    PageConfig.screenData = {'1': [['', '']]};
                } else if (currentMode !== '0') {
                    const len = HtmlTools.getHtml(`#screen_${currentMode}`).children.length;
                    for (let i = 0; i < len; i++) {
                        const area = `${currentMode}${i}`;
                        this.ac({acArea: HtmlTools.getHtml(`#screen_input_inner_${area}`)});
                        PageConfig.syncScreenData(area);
                    }
                    PageConfig.subModes = {'default': '0'};
                }
                return;
            }

            // 普通清空保留一个新光标，使主输入区立即恢复可编辑状态。
            const cursor = document.createElement('div');
            cursor.id = 'cursor';

            inputBox.replaceChildren(cursor);

            // 标准计算模式还需取消实时预览及其可能仍在运行的 Worker。
            if (PageConfig.currentMode === '0') {
                HtmlTools.getHtml('#screen_0_display').classList.add('NoDisplay');
                PrintManager.mode0ShowOnScreen.cancel();
                if (PrintManager.mode0ScreenInCalc) {
                    WorkerTools.restart();
                    PrintManager.mode0ScreenInCalc = false;
                }
            }

            PageControlTools.changeInputTip();
            HtmlTools.getHtml('#screen_0_display').classList.add('NoDisplay');
            HtmlTools.scrollToView();
        }

        /**
         * 向主输入区域的光标前插入一个或多个代表数学符号或字符的 DOM 元素。
         * 此方法负责处理用户通过虚拟键盘或物理键盘输入时的 DOM 更新。
         * 它会移除初始的输入提示，将新元素插入到光标位置，并确保光标保持在视图中。
         *
         * @param {string[]} classArray - 按输入顺序插入的内部渲染类名；每项创建一个 `<p>` 并放在
         *   当前光标前。方法随后局部重排空格且不修改该数组；调用方应先完成词元到类名的转换。
         * @returns {void}
         */
        static input(classArray) {
            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay') || !HtmlTools.getHtml('#main').classList.contains('Input')) {
                return;
            }

            const inputArea = HtmlTools.getHtml('#input');
            if (inputArea.children.length > this._MAX_INPUT_LEN) { // 限制输入长度。
                return;
            }
            const cursor = HtmlTools.getHtml('#cursor');

            if (inputArea.lastElementChild.classList.contains('InputTip')) {
                inputArea.lastElementChild.remove();
            }

            HtmlTools.appendDOMs(inputArea, classArray, {referenceNode: cursor});
            this.addSpace({rangeLimit: true});
            HtmlTools.scrollToView();
        }

        /**
         * 按词元向指定方向删除输入内容。
         *
         * @param {'left'|'right'} direction - 相对光标删除的方向；函数名等多节点词元按
         *   `inputAreaMoveNum` 给出的完整跨度删除，不会只留下半个词元。
         * @param {boolean} [forcedMode=false] - 是否忽略普通输入状态限制并对当前子屏幕输入区执行删除；
         *   `false` 用于用户编辑主输入，`true` 只供内部同步流程使用。
         * @returns {void}
         */
        static del(direction = 'left', forcedMode = false) {
            const currentMode = PageConfig.currentMode;
            // 提示态或强制模式操作的是活动子屏数据；普通编辑态才删除主输入 DOM。
            if (HtmlTools.getHtml('.InputTip') || forcedMode) {
                if (currentMode === '0') {
                    return;
                }
                if (currentMode === '1') {
                    const current = PageConfig.subModes['1'];
                    const brotherTarget = PageConfig.screenData['1'][current[0]][1 - current[1]];
                    if (brotherTarget.length === 0) {
                        InputManager.statisticsDelLine();
                    } else {
                        // 统计单元格更新格式为 `[行, 列, 值]`。
                        PageConfig.screenData = {'1': [...current, '']};
                    }
                } else {
                    this.ac({acArea: HtmlTools.getCurrentSubscreenArea()});
                }
                PageConfig.syncScreenData();
                return;
            }

            const input = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');
            const cursorPlace = [...input.children].indexOf(cursor);

            let delNum = this.inputAreaMoveNum(direction);
            const range = document.createRange();
            // 负步长表示请求方向已到边界，改删光标另一侧仍存在的完整词元。
            if (delNum < 0) {
                direction = direction === 'left' ? 'right' : 'left';
                delNum = -delNum;
            }
            if (direction === 'right') {
                const endPlace = Math.min(cursorPlace + delNum, input.children.length - 1);
                range.setStartAfter(cursor);
                range.setEndAfter(input.children[endPlace]);
            } else if (direction === 'left') {
                const startPlace = Math.max(cursorPlace - delNum, 0);
                range.setStartBefore(input.children[startPlace]);
                range.setEndBefore(cursor);
            }
            range.deleteContents();

            if (input.children.length === 1) {
                PageControlTools.changeInputTip();
            }

            this.addSpace({rangeLimit: true});
            HtmlTools.scrollToView();
        }

        /**
         * 在指定的 DOM 区域内移动光标元素。
         *
         * @param {'left'|'right'|'up'|'down'|'end'} direction - 移动意图；左右按完整词元跨越，
         *   上下在统计表中切换行，`end` 直接定位到当前可编辑区域末尾。
         * @param {boolean} [forcedMode=false] - 是否在非普通输入状态下仍移动活动子屏幕的光标；
         *   强制模式会服从当前主/子模式边界，但跳过主输入区可编辑性检查。
         * @returns {void}
         */
        static moveCursor(direction, forcedMode = false) {
            const currentMode = PageConfig.currentMode;

            // 提示态没有可移动的文本光标，方向键改为在模式字段或统计单元格间导航。
            if (HtmlTools.getHtml('.InputTip') || forcedMode) {
                let len, nextNum;
                let makeValue;
                switch (currentMode) {
                    case '0':
                        return;

                    case '1': {
                        const currentSubModes = PageConfig.subModes['1'];
                        switch (direction) {
                            case 'left':
                            case 'right':
                                PageConfig.subModes = {'1': [currentSubModes[0], 1 - currentSubModes[1]]};
                                PageControlTools.syncScreenToInput();

                                HtmlTools.scrollToView();
                                return;
                            case 'up':
                            case 'down':
                                len = PageConfig.screenData['1'].length - 1;
                                nextNum = currentSubModes[0] + (direction === 'up' ? -1 : 1);
                                makeValue = (nextNum) => [nextNum, currentSubModes[1]];
                                break;
                        }
                        break;
                    }

                    case '3':
                        // 五个系数字段按两列视觉布局循环，上下移动跨两个索引。
                        len = 4;
                        if (['left', 'right'].includes(direction)) {
                            nextNum = Number(PageConfig.subModes[currentMode]) + (direction === 'left' ? -1 : 1);
                            makeValue = (nextNum) => nextNum.toString();
                            break;
                        }
                        nextNum = Number(PageConfig.subModes[currentMode]) + (direction === 'up' ? -2 : 2);
                        if (nextNum < 0) {
                            nextNum = nextNum % 2 === 0 ? 4 : 3;
                        }
                        if (nextNum > len) {
                            nextNum = nextNum % 2 === 0 ? 0 : 1;
                        }
                        PageConfig.subModes = {'default': nextNum.toString()};
                        PageControlTools.syncScreenToInput();

                        HtmlTools.scrollToView();
                        return;

                    default: {
                        len = HtmlTools.getHtml(`#screen_${currentMode}`).children.length - 1;
                        let addNum = 1;
                        if (['up', 'left'].includes(direction)) {
                            addNum = -1;
                        }
                        nextNum = Number(PageConfig.subModes[currentMode]) + addNum;
                        makeValue = (nextNum) => nextNum.toString();
                        break;
                    }
                }
                // 统一处理首尾环绕，并把不同模式的索引形态写回 subModes。
                if (typeof makeValue === 'function') {
                    if (nextNum < 0) {
                        nextNum = len;
                    }
                    if (nextNum > len) {
                        nextNum = 0;
                    }
                    PageConfig.subModes = {'default': makeValue(nextNum)};
                    PageControlTools.syncScreenToInput();
                }

                HtmlTools.scrollToView();
                return;
            }

            const targetArea = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');

            if (!targetArea || !cursor) {
                return;
            }

            if (direction === 'end') {
                targetArea.appendChild(cursor);

                this.addSpace();
            } else {
                const moveNum = this.inputAreaMoveNum(direction);

                if (moveNum < 0) {
                    if (direction === 'left') {
                        // 移动现有节点以保留引用和属性。
                        targetArea.appendChild(cursor);
                    } else {
                        targetArea.insertBefore(cursor, targetArea.children[0]);
                    }
                } else {
                    let targetNode = cursor;

                    if (direction === 'left') {
                        for (let i = 0; i < moveNum && targetNode.previousElementSibling; i++) {
                            targetNode = targetNode.previousElementSibling;
                        }

                        // 目标位置未变时，`insertBefore` 不会改变节点。
                        targetArea.insertBefore(cursor, targetNode);
                    } else {
                        for (let i = 0; i < moveNum && targetNode.nextElementSibling; i++) {
                            targetNode = targetNode.nextElementSibling;
                        }

                        targetArea.insertBefore(cursor, targetNode.nextElementSibling);
                    }

                    this.addSpace({rangeLimit: true});
                }
            }

            HtmlTools.scrollToView();
        }

        /**
         * 将光标移动到输入区域内用户点击的位置。
         * 此方法实现了“按词移动”的智能定位：如果用户点击了一个多字符 token（如函数名 "sin"）的中间，
         * 它会将光标定位到该 token 的起始位置，而不是点击的精确字符位置。
         *
         * @param {HTMLElement} target - 点击命中的输入子节点或其可定位后代；必须属于当前活动输入区。
         *   方法用它计算最近的词元边界并重放唯一光标，不接收坐标事件本身。
         * @returns {void}
         */
        static clickMoveCursor(target) {
            if (target.classList.contains('InputTip')) {
                return;
            }

            const input = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');

            const contentChildren = [...input.children].filter((el) => el.id !== 'cursor');
            const targetIndex = contentChildren.indexOf(target);

            if (targetIndex === -1) {
                return;
            }

            const offsetToStart = this.inputAreaMoveNum('left', target);
            const finalIndex = targetIndex - offsetToStart;

            // 先移除光标，避免旧位置影响插入索引。
            const refNode = contentChildren[finalIndex] || null;
            input.insertBefore(cursor, refNode);
            this.addSpace();
            HtmlTools.scrollToView();
        }

        /**
         * 创建并返回统计模式数据网格中的单行 DOM 结构。
         * 此方法负责组装包含序号、X 值和 Y 值的三列，并为懒加载背景图设置必要的类和数据属性。
         *
         * @private
         *
         * @param {object} options - 新行的逻辑位置与两个单元格的渲染数据。
         * @param {number} [options.index=0] - 零基数据行索引；显示序号在此基础上转换，且该值会写入
         *   行节点供虚拟滚动和点击定位使用。
         * @param {string[]} [options.inputListX=[]] - X 单元格的内部类名序列；空数组生成可编辑空单元格，
         *   输入数组只读并由 `addSpace` 的数组模式产生规范化副本。
         * @param {string[]} [options.inputListY=[]] - Y 单元格的内部类名序列；语义和处理方式与 X 相同。
         * @returns {HTMLElement} 一个 `<div>` 元素，代表完整的数据网格行。
         */
        static _statisticsCreateLine(
            {
                index = 0,
                inputListX = [],
                inputListY = []
            }
        ) {
            const insert = document.createElement('div');
            const currentMode = PageConfig.subModes['1'];
            const isCurrent = index === currentMode[0];

            const serialNumberGrandfather = document.createElement('div');
            const serialNumberFather = document.createElement('div');

            HtmlTools.appendDOMs(serialNumberFather, HtmlTools.textToHtmlClass((index + 1).toString()));
            serialNumberGrandfather.appendChild(serialNumberFather);

            // GridOn 同时匹配当前逻辑行与列，虚拟化重建节点后也能恢复活动单元格。
            const gridX = document.createElement('div');
            gridX.classList.add('DataX');
            if (isCurrent && currentMode[1] === 0) {
                gridX.classList.add('GridOn');
            }
            HtmlTools.appendDOMs(gridX, InputManager.addSpace({
                classList: inputListX
            }));

            const gridY = document.createElement('div');
            gridY.classList.add('DataY');
            if (isCurrent && currentMode[1] === 1) {
                gridY.classList.add('GridOn');
            }
            HtmlTools.appendDOMs(gridY, InputManager.addSpace({
                classList: inputListY
            }));

            insert.appendChild(serialNumberGrandfather);
            insert.appendChild(gridX);
            insert.appendChild(gridY);

            return insert;
        }

        /**
         * 在统计模式的数据网格中添加一行新的数据。
         * 此方法可以根据指定的位置插入新行，并填充初始的 x 和 y 值。
         * 如果未指定位置，则默认在网格末尾添加。
         *
         * @param {object} [options={}] - 配置选项。
         * @param {Array<number|string>|null} [options.location=null] - 插入位置；`null` 追加到数据末尾，
         *   `[rowIndex, columnIndex]` 在指定行前插入并用列索引决定插入后应激活 X 还是 Y 单元格。
         *   - 如果为 `null`，则在网格末尾添加。
         *   - 如果为数组 `[rowIndex, colIndex]`，则在指定行之前插入。
         * @param {string} [options.inputX=''] - X 单元格的内部表达式字符串；会转换为渲染类名，
         *   空字符串表示空单元格而不是数值零。
         * @param {string} [options.inputY=''] - Y 单元格的内部表达式字符串；与 `inputX` 独立处理。
         * @returns {boolean} 成功写入 `screenData`、刷新虚拟列表并更新活动位置时为 `true`；达到
         *   `MAX_STATISTICS_ROW`、位置无效或内部插入失败时为 `false`，不会留下半行数据。
         */
        static statisticsAddLine(
            {
                location = null,
                inputX = '',
                inputY = ''
            } = {}
        ) {
            const gridData = PageConfig.screenData['1'];
            const len = gridData.length;
            let position;

            if (location === null) {
                const pos = len - 1;
                position = pos < 0 ? 0 : pos;
            } else {
                position = Array.isArray(location) ? location[0] : location;
            }

            if (len + 1 > InputManager.MAX_STATISTICS_ROW) {
                return false;
            }

            const newItems = [
                [inputX, inputY]
            ];

            try {
                gridData.splice(position + 1, 0, ...newItems);
                PageConfig.screenData = {'1': gridData};

                InputManager.statisticsRenderer.load(gridData, gridData.length, {resetScroll: false});
            } catch {
                return false;
            }

            return true;
        }

        /**
         * 在统计模式的数据网格中删除一行数据。
         * 此方法根据指定的位置删除行。如果未指定位置，则默认删除当前高亮行。
         * 删除行后，会更新后续行的序号，并确保如果删除的是高亮行，则重新设置高亮。
         *
         * @param {Array<number>|number|null} [location=null] - 要删除的零基行位置；`null` 使用当前高亮
         *   单元格所在行，数字直接指定行，`[rowIndex, columnIndex]` 只用首项定位行并用列信息恢复高亮。
         *   - 如果为 `null`，则删除当前高亮行。
         *   - 如果为数组 `[rowIndex, colIndex]`，则删除指定行。
         *   - 如果为数字，则删除指定行。
         * @returns {void}
         */
        static statisticsDelLine(location = null) {
            let target, position;
            const gridData = PageConfig.screenData['1'];
            const len = gridData.length;

            if (location === null) {
                position = PageConfig.subModes['1'][0];
            } else {
                position = Array.isArray(location) ? location[0] : location;
            }

            target = gridData[position];
            if (!target) {
                return;
            }

            // 末尾空行是持续录入的占位行，不能被删除到完全消失。
            const noInner = target[0].length === 0 && target[1].length === 0;
            if (noInner && position + 1 === len) {
                return;
            }

            gridData.splice(position, 1);
            PageConfig.screenData = {'1': gridData};

            // 删除原末行后立即补回空占位行，维持统计表可继续输入的约定。
            if (gridData.length === position) {
                InputManager.statisticsAddLine();
            }

            if (position === PageConfig.subModes['1'][0]) {
                PageControlTools.syncScreenToInput(false);
            }

            // 新增行后重新读取网格数据。
            const newData = PageConfig.screenData['1'];
            InputManager.statisticsRenderer.load(newData, newData.length, {resetScroll: false});
        }
    }

    /** 计算并渲染各模式的输出结果。 */
    class PrintManager {
        /**
         * 定义了在用户输入时，用于防抖（debounce）UI更新（如模式0下的实时计算结果显示）的延迟时间（以毫秒为单位）。
         * 这可以防止在用户快速连续输入时过于频繁地触发计算和DOM更新，从而提高性能和用户体验。
         *
         * @private
         * @readonly
         * @type {number}
         */
        static _DELAY_TIME = 164;

        /**
         * 定义了在用户输入时，用于防抖（debounce）UI更新（如模式0下的实时计算结果显示）的最长延迟时间（以毫秒为单位）。
         *
         * @private
         * @readonly
         * @type {number}
         */
        static _MAX_DELAY_TIME = 1640;

        /**
         * VirtualScroll 实例。
         * 用于管理函数列表输出的显示。
         *
         * @type {VirtualScroll}
         */
        static printListRenderer = new VirtualScroll({
            container: '#print_content_2_inner',

            /**
             * 渲染函数值列表行。
             *
             * @param {number} index - 要渲染的零基采样点索引；用于从三个对齐数组读取同一行数据，
             *   不直接显示为额外序号列。
             * @param {{result:{varList:string[],f:string[],g:string[]},onlyFuncG:boolean}} dataSource - 列表数据；
             *   `result` 是 `FuncValueListTools.valueList` 的三数组结果，`onlyFuncG` 为 `true` 时交换 f、g
             *   两个显示列，使单独输入的 g 位于主函数列。三个数组必须在 `index` 处都有对应项。
             * @returns {HTMLElement} 尚未挂载的函数值行 `<div>`；包含三个子列，顺序为自变量、主函数、
             *   次函数，错误和省略哨兵已转换为对应渲染类。
             */
            renderItem(index, dataSource) {
                const {result, onlyFuncG} = dataSource;

                const sources = onlyFuncG ?
                    [result.varList[index], result.g[index], result.f[index]] :
                    [result.varList[index], result.f[index], result.g[index]];

                const currentDiv = document.createElement('div');

                sources.forEach((dataItem) => {
                    const subWrapper = document.createElement('div');
                    const subContent = document.createElement('div');
                    const formattedNodes = PrintManager._printHandleError(dataItem);
                    HtmlTools.appendDOMs(subContent, formattedNodes);
                    subWrapper.appendChild(subContent);
                    currentDiv.appendChild(subWrapper);
                });

                if (result.varList.length > 4) {
                    currentDiv.classList.add(index % 2 === 0 ? 'Even' : 'Odd');
                }

                return currentDiv;
            }
        });

        /**
         * Worker 是否正在计算 mode0ShowOnScreen 发送的任务。
         *
         * @type {boolean}
         */
        static mode0ScreenInCalc = false;

        /**
         * 一个防抖（debounced）函数，用于在标准计算模式（模式 '0'）下，在屏幕上异步显示当前输入表达式的实时计算结果。
         *
         * @returns {Promise<void>|undefined} 前沿或尾沿真正触发 `_mode0ShowOnScreenFunc` 时返回该异步
         *   Promise；仅重新安排计时器的中间调用返回上一次结果或 `undefined`，调用方通常无需等待它。
         */
        static mode0ShowOnScreen = HtmlTools.debounce(this._mode0ShowOnScreenFunc, this._DELAY_TIME, {
            leading: true,
            trailing: true,
            maxWait: this._MAX_DELAY_TIME
        });

        /**
         * 阻止实例化静态输出管理器。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[PrintManager] PrintManager is a static class and should not be instantiated.');
        }

        /**
         * 处理输出字符串，将其转换为用于显示的 HTML 类名数组。
         * 如果输入是错误标识 'error'，则返回特定的错误类名 ['_error_']；
         * 否则，调用 HtmlTools.textToHtmlClass 将字符串转换为对应的类名数组。
         *
         * @private
         * @param {string} str - 需要处理的字符串，通常是计算结果或 'error'。
         * @returns {string[]} `str==='error'` 时固定返回 `['_error_']`；其他字符串按内部词元顺序映射为
         *   可交给 `HtmlTools.appendDOMs` 的渲染类名数组。
         */
        static _printHandleError(str) {
            if (str !== 'error') {
                return HtmlTools.textToHtmlClass(str);
            }
            return ['_error_'];
        }

        /**
         * 批量渲染列表数据到目标容器，利用 DocumentFragment 优化性能。
         *
         * @private
         *
         * @param {HTMLElement} outputTarget - 最终接收全部渲染节点的容器；先在 `DocumentFragment` 中
         *   构建，完成后一次性替换或追加到这里。
         * @param {Array<any>} list - 按显示顺序遍历的数据源；方法只读，不对元素排序或转换。
         * @param {(container: DocumentFragment|HTMLDivElement, item: any, index?: number) => void} toDomFunc - 同步渲染回调；
         *   前两项是离线容器和当前数据，启用 `needIndex` 时第三项为零基索引。
         * @param {boolean} [needIndex=false] - 是否把索引作为第三个实参传给回调；不改变前两个参数顺序。
         * @returns {void}
         */
        static _multipleLinesPrint(outputTarget, list, toDomFunc, needIndex = false) {
            const fragment = document.createDocumentFragment();

            for (let i = 0; i < list.length; i++) {
                const div = document.createElement('div');
                if (list[i].includes('error') || list[i].includes('_error_')) {
                    HtmlTools.appendDOMs(div, ['_error_']);
                } else {
                    needIndex ? toDomFunc(div, list[i], i) : toDomFunc(div, list[i]);
                }

                fragment.appendChild(div);
            }

            outputTarget.replaceChildren(fragment);
        }

        /**
         * 渲染统计结果并选择最佳回归模型。
         *
         * @private
         * @param {StatisticsAnalysisResult|'error'} resultList - `StatisticsTools.statisticsCalc` 的完整结果，或顶层失败标记
         *   `error`；对象中的单项 `error` 会按对应指标分别渲染，不等同于整页失败。
         * @returns {void}
         */
        static _setMode1Results(resultList) {
            /**
             * 将回归模型名称映射到对应的 UI 选择器 ID。
             *
             * @param {string} modelName - `StatisticsTools` 返回的回归模型键，如 `linear`、`square`；
             *   必须存在于本地模型到选择器 ID 的映射中，未知键不会生成可用按钮 ID。
             * @returns {'choose_ra_0'|'choose_ra_1'|'choose_ra_2'|'choose_ra_3'|'choose_ra_4'|'choose_ra_5'|'choose_ra_6'|undefined}
             *   已知模型对应的选择按钮 ID；未知模型没有分支，返回 `undefined`。
             */
            function modelToId(modelName) {
                switch (modelName) {
                    case 'linear':
                        return 'choose_ra_0';
                    case 'square':
                        return 'choose_ra_1';
                    case 'ln':
                        return 'choose_ra_2';
                    case 'exp':
                        return 'choose_ra_3';
                    case 'abx':
                        return 'choose_ra_4';
                    case 'axb':
                        return 'choose_ra_5';
                    case 'reciprocal':
                        return 'choose_ra_6';
                }
            }

            if (resultList === 'error') {
                PrintManager.setMode1RaResults('error');

                for (let i = 2; i < 22; i++) {
                    HtmlTools.appendDOMs(HtmlTools.getHtml(`#print_content_1_content_${i}`), ['_error_'], {mode: 'replace'});
                }

                PageControlTools.changePrint1Ra('choose_ra_0', 'init');
                return;
            }

            // 统计结果键与固定 DOM 槽位一一映射，避免依赖对象枚举顺序渲染。
            const resultsToOutputArea = {
                'n': '#print_content_1_content_2',
                'averageA': '#print_content_1_content_3',
                'sumA': '#print_content_1_content_4',
                'sum2A': '#print_content_1_content_5',
                'totalVarianceA': '#print_content_1_content_6',
                'sampleVarianceA': '#print_content_1_content_7',
                'maxA': '#print_content_1_content_8',
                'minA': '#print_content_1_content_9',
                'averageB': '#print_content_1_content_10',
                'sumB': '#print_content_1_content_11',
                'sum2B': '#print_content_1_content_12',
                'totalVarianceB': '#print_content_1_content_13',
                'sampleVarianceB': '#print_content_1_content_14',
                'maxB': '#print_content_1_content_15',
                'minB': '#print_content_1_content_16',
                'dotAB': '#print_content_1_content_17',
                'dotA2B': '#print_content_1_content_18',
                'totalCovariance': '#print_content_1_content_19',
                'sampleCovariance': '#print_content_1_content_20',
                'r': '#print_content_1_content_21'
            };

            this.setMode1RaResults(resultList[resultList.bestModel]);
            PageControlTools.changePrint1Ra(modelToId(resultList.bestModel), 'init');

            Object.entries(resultsToOutputArea).forEach(([key, value]) => {
                HtmlTools.appendDOMs(HtmlTools.getHtml(value), this._printHandleError(resultList[key]), {mode: 'replace'});
            });
        }

        /**
         * 渲染指定回归模型的参数与决定系数。
         *
         * @param {RegressionModelResult|'error'} RaList - 当前所选回归模型的完整结果，或字符串 `error`；
         *   参数数组顺序由模型定义，方法据此生成系数行和导出状态。
         * @returns {void}
         */
        static setMode1RaResults(RaList) {
            const content0 = HtmlTools.getHtml('#print_content_1_content_0');

            if ([RaList, RaList.regressionEquation].includes('error')) {
                const element = document.createElement('div');
                HtmlTools.appendDOMs(element, ['_error_']);
                content0.replaceChildren(element);
                HtmlTools.appendDOMs(HtmlTools.getHtml('#print_content_1_content_1'), ['_error_'], {mode: 'replace'});
                return;
            }

            HtmlTools.appendDOMs(HtmlTools.getHtml('#print_content_1_content_1'), this._printHandleError(RaList.R2), {mode: 'replace'});

            // 复制后再调整显示顺序，避免 reverse() 改写缓存中的回归参数。
            const parameter = structuredClone(RaList.parameter);

            if (['linear', 'square'].includes(RaList.model)) {
                parameter.reverse();
            }

            this._multipleLinesPrint(
                content0,
                parameter,
                (div, str, i) => HtmlTools.appendDOMs(div, [`_${i === 0 ? 'a' : i === 1 ? 'b' : 'c'}_mathit_`, '_space_', '_equal_', '_space_', ...HtmlTools.textToHtmlClass(str)]),
                true
            );
        }

        /**
         * 这是 `mode0ShowOnScreen` 防抖函数的实际执行体。
         * 它负责获取当前输入，调用 Web Worker 进行计算，并将结果或错误状态反映到 UI 上。
         * 这是一个异步函数，因为它需要等待 `WorkerTools.exec` 的 Promise 解析。
         *
         * @private
         * @returns {Promise<void>} 一个在 UI 更新完成后解析的 Promise。
         */
        static async _mode0ShowOnScreenFunc() {
            // 使用请求 ID 忽略过期结果。
            const requestId = Date.now();
            if (this.mode0ScreenInCalc) {
                WorkerTools.restart();
            }
            this.mode0ScreenInCalc = true;
            this._currentRequestId = requestId;

            const screen0Display = HtmlTools.getHtml('#screen_0_display');
            const screen0DisplayInner = HtmlTools.getHtml('#screen_0_display_inner');

            let currentInput = HtmlTools.htmlClassToText(HtmlTools.getClassList(HtmlTools.getHtml('#input'), {ignoreSpace: true}));

            // 实时预览允许输入尚未完成；去掉末尾连续中缀运算符后再计算最近的有效前缀。
            let isMiddleFunc = true;
            while (isMiddleFunc) {
                const lastFragment = currentInput.slice(-TokenConfig.MAX_TOKEN_LENGTH - 2);
                const lastToken = Public.tokenizer(lastFragment, {strictMode: false}).slice(-1)[0];
                isMiddleFunc = Public.getTokenInfo(lastToken)?.funcPlace === 'middle';
                if (isMiddleFunc) {
                    currentInput = currentInput.slice(0, -lastToken.length);
                }
            }

            try {
                const result = await WorkerTools.exec(currentInput, {
                    calcAcc: PageConfig.ACC_MODE_0.globalCalcAccuracy,
                    outputAcc: PageConfig.ACC_MODE_0.outputAccuracy,
                    f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                    g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                });

                if (this._currentRequestId !== requestId) {
                    return;
                }

                screen0Display.classList.remove('NoDisplay');

                HtmlTools.appendDOMs(screen0DisplayInner, HtmlTools.textToHtmlClass(result.result), {mode: 'replace'});
            } catch (e) {
                // 取消操作不改变结果区可见性。
                if (e.name !== 'CancellationError' && this._currentRequestId === requestId) {
                    screen0Display.classList.add('NoDisplay');
                }
            } finally {
                // 较新的请求负责管理计算状态。
                if (this._currentRequestId === requestId) {
                    this.mode0ScreenInCalc = false;
                }
            }
        }

        /**
         * 执行模式0（Mode 0）的核心计算逻辑与 UI 渲染。
         * 该方法负责从 DOM 获取用户输入，清洗数据后调用 Worker 进行异步计算。
         * 它包含完整的错误处理流程：若计算失败，会自动判断是否为语法错误，并尝试通过 syntaxCheck 模式获取修正后的表达式，最终将格式化后的结果或错误信息渲染回界面。
         *
         * @private
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode0() {
            const inputEl = HtmlTools.getHtml('#input');
            const textDisplay = HtmlTools.getHtml('#print_content_0_content_0');
            const resultDisplay = HtmlTools.getHtml('#print_content_0_content_1');
            const screenDisplay = HtmlTools.getHtml('#screen_0_display');

            const currentInputArray = HtmlTools.getClassList(inputEl, {ignoreSpace: true});
            if (currentInputArray[0].includes('InputTip')) {
                currentInputArray.length = 0;
            }
            const currentInput = HtmlTools.htmlClassToText(currentInputArray);

            InputManager.ac({acArea: textDisplay});
            InputManager.ac({acArea: resultDisplay});
            const needReshow = this.mode0ScreenInCalc || this.mode0ShowOnScreen.pending();
            if (needReshow) {
                this.mode0ShowOnScreen.cancel();
                screenDisplay.classList.add('NoDisplay');
                if (this.mode0ScreenInCalc) {
                    WorkerTools.restart();
                }

                this.mode0ScreenInCalc = false;
            }

            let expr, result;

            try {
                const realResult = await WorkerTools.exec(currentInput, {
                    f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                    g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                });
                ({expr, result} = realResult);

                expr = HtmlTools.textToHtmlClass(expr);
                result = HtmlTools.textToHtmlClass(result);
            } catch (error) {
                if (error.name === 'TerminationError' || error.name === 'CancellationError') {
                    // 取消或重启后停止后续语法检查和 UI 更新。
                    return;
                }

                result = ['_error_'];
                const syntaxErrorOutput = ['_syntax_error_', ...currentInputArray];

                try {
                    const syntaxResult = await WorkerTools.exec(currentInput, {
                        calcMode: 'syntaxCheck',
                        f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                        g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                    });
                    expr = HtmlTools.textToHtmlClass(syntaxResult.expr);
                } catch (e) {
                    expr = syntaxErrorOutput;
                }
            }

            HtmlTools.appendDOMs(textDisplay, expr);
            HtmlTools.appendDOMs(resultDisplay, result);
            InputManager.addSpace({area: textDisplay});

            if (result[0] !== '_error_' && screenDisplay.classList.contains('NoDisplay')) {
                if (PageConfig.calcAccMode === 0) {
                    const screenDisplayInner = HtmlTools.getHtml('#screen_0_display_inner');
                    screenDisplay.classList.remove('NoDisplay');
                    HtmlTools.appendDOMs(screenDisplayInner, result, {mode: 'replace'});
                } else {
                    PrintManager.mode0ShowOnScreen();
                    PrintManager.mode0ShowOnScreen.flush();
                }
            }
        }

        /**
         * 执行模式 1（统计回归模式）的核心计算逻辑。
         * 该方法负责：
         * 1. 从数据网格 DOM 中提取 X 和 Y 列的数据。
         * 2. 验证数据的有效性（检查是否有语法错误标记）。
         * 3. 处理空单元格（默认填充为 0）。
         * 4. 将提取的数据转换为文本格式。
         * 5. 调用 Web Worker 执行统计和回归计算。
         * 6. 将计算结果渲染到界面，并缓存结果以便导出。
         *
         * @private
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode1() {
            const screenData = PageConfig.screenData['1'];
            const listA = [], listB = [];

            // 每次计算都先回到 X 统计页，避免沿用上次结果页的横向偏移。
            PageControlTools.triggerSelection(HtmlTools.getHtml('#statistics_results_top_x'));
            PageControlTools.switchStatisticsResults('x');

            for (let i = 0; i < screenData.length; i++) {
                let currentPushA = screenData[i][0];
                let currentPushB = screenData[i][1];

                if (currentPushA.startsWith('[syntax_error]') || currentPushB.startsWith('[syntax_error]')) {
                    this._setMode1Results('error');
                    this.mode1Results = 'error';
                    PageConfig.syncScreenData();
                    return;
                }

                // 整行为空时忽略；仅一侧为空时以 0 补齐成有效数据对。
                if (currentPushA.length === 0 && currentPushB.length === 0) {
                    continue;
                } else if (currentPushA.length === 0) {
                    PageConfig.screenData = {'1': [i, 0, '0']};
                    currentPushA = '0';
                } else if (currentPushB.length === 0) {
                    PageConfig.screenData = {'1': [i, 1, '0']};
                    currentPushB = '0';
                }

                listA.push(currentPushA);
                listB.push(currentPushB);
            }

            PageConfig.syncScreenData();

            try {
                const resultList = await WorkerTools.statisticsCalc(listA, listB);

                this._setMode1Results(resultList);

                // 以选择项 DOM ID 建索引，让模型切换和导出共用同一份结果缓存。
                this.mode1Results = {
                    'choose_ra_0': resultList.linear,
                    'choose_ra_1': resultList.square,
                    'choose_ra_2': resultList.ln,
                    'choose_ra_3': resultList.exp,
                    'choose_ra_4': resultList.abx,
                    'choose_ra_5': resultList.axb,
                    'choose_ra_6': resultList.reciprocal
                };
            } catch {
                this._setMode1Results('error');
                this.mode1Results = 'error';
            }
        }

        /**
         * 执行模式2（“函数列表”模式）的核心计算与UI渲染逻辑。
         * 该方法负责从UI获取一个或两个函数表达式（f(x), g(x)）以及一个数值范围（起始、终止、步长），
         * 然后调用Web Worker异步计算在指定范围内的函数值。
         * 计算完成后，它会动态生成一个HTML表格来展示自变量（x）、f(x)和g(x)的对应值。
         *
         * @private
         *
         * @returns {Promise<void>} 此方法没有返回值，其主要作用是通过DOM操作来更新页面内容。
         */
        static async _exeMode2() {
            const headInit = HtmlTools.getHtml('#print_content_2_head').children[1].children[0];
            // 先恢复双函数表头，单函数分支再按本次输入收窄列数与标签。
            HtmlTools.getHtml('#print_content_2').classList.add('TwoFunc');
            headInit.classList.add('_f_');
            headInit.classList.remove('_g_');

            const fx = PageConfig.screenData['2_00'];
            const gx = PageConfig.screenData['2_01'];

            const start = PageConfig.screenData['2_10'];
            const step = PageConfig.screenData['2_12'];
            const end = PageConfig.screenData['2_11'];

            try {
                let onlyFuncG = false;

                // 异或成立表示恰有一个函数；若仅有 g(x)，还需把第二列表头改为 g。
                if (fx === '' !== (gx === '')) {
                    if (fx === '') {
                        headInit.classList.add('_g_');
                        headInit.classList.remove('_f_');
                        onlyFuncG = true;
                    }

                    HtmlTools.getHtml('#print_content_2').classList.remove('TwoFunc');
                } else if (fx === '') {
                    HtmlTools.getHtml('#print_content_2_error').classList.remove('NoDisplay');
                    return;
                }

                const result = await WorkerTools.valueList(fx, gx, start, step, end);

                // 虚拟列表自行异步渲染；此处只提交新数据并继续解除加载遮罩。
                void this.printListRenderer.load(
                    {result, onlyFuncG},
                    result.varList.length,
                    {remeasure: true}
                );

                HtmlTools.getHtml('#print_content_2_error').classList.add('NoDisplay');
            } catch {
                HtmlTools.getHtml('#print_content_2_error').classList.remove('NoDisplay');
                HtmlTools.getHtml('#print_content_2_inner').replaceChildren();
            }
        }

        /**
         * 执行模式 3（多项式函数分析）的核心计算与 UI 渲染逻辑。
         * 该方法负责：
         * 1. 从屏幕输入数据中收集多项式的系数（a, b, c, d, e）。
         * 2. 调用 Web Worker 进行多项式函数的全面分析（求导、求根、极值、拐点等）。
         * 3. 将分析结果格式化并渲染到页面的相应输出区域。
         * 4. 处理计算过程中的错误，并在界面上显示错误状态。
         *
         * @private
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode3() {
            /**
             * 将所有分析结果区域重置为错误显示状态。
             *
             * 用于处理输入为空或 Worker 分析失败等异常情况。
             * 单行显示区域（函数表达式和值域）直接替换为错误图标；
             * 多行显示区域则渲染一行包含错误标识的数据，以保持统一的显示结构。
             */
            const errorPrint = () => {
                for (let i = 0; i < 10; i++) {
                    switch (i) {
                        case 0:
                        case 1:
                            HtmlTools.appendDOMs(HtmlTools.getHtml(`#print_content_3_content_${i}`), ['_error_'], {mode: 'replace'});
                            break;
                        default:
                            this._multipleLinesPrint(
                                HtmlTools.getHtml(`#print_content_3_content_${i}`),
                                [['error']],
                                HtmlTools.appendDOMs
                            );
                            break;
                    }
                }
            };

            /**
             * 将分析结果的文本项转换为 HTML DOM 元素并插入目标容器。
             * 专门处理区间（如 `(-inf, 2)`）和点坐标（如 `(1, 5)`）的格式化显示。
             *
             * @param {HTMLElement} target - 目标 DOM 容器。
             * @param {[string,string]} textList - 区间边界或点坐标 `[left,right]`；支持 `-inf`、`+inf`
             *   无穷端点和 `['null','null']` 不适用哨兵。含 `error` 时直接渲染错误状态。
             * @param {boolean} [useBracket=false] - 是否强制使用方括号 `[]` (通常用于闭区间，但在当前逻辑中似乎主要用于区分)。
             *   注意：代码逻辑中 `useBracket` 为 true 时使用 `_bracket_` (方括号)，否则使用 `_parentheses_` (圆括号)。
             *   对于无穷大 `inf`，通常保持开区间（圆括号）。
             */
            const powerFunctionTextToHtml = (target, textList, useBracket = false) => {
                if (textList.includes('error')) {
                    HtmlTools.appendDOMs(target, ['error']);
                    return;
                }

                if (textList[0] === 'null') {
                    HtmlTools.appendDOMs(target, ['_null_'], {mode: 'replace'});
                    return;
                }

                if (textList[0] === '-inf' && textList[1] === '+inf') {
                    HtmlTools.appendDOMs(target, ['_R_mathbb_'], {mode: 'replace'});
                    return;
                }
                if (textList[0] === textList[1] && useBracket) {
                    HtmlTools.appendDOMs(target, [
                        '_curlyBraces_left_',
                        ...HtmlTools.textToHtmlClass(textList[0]),
                        '_curlyBraces_right_'
                    ], {mode: 'replace'});
                    return;
                }

                switch (textList[0]) {
                    case '-inf':
                        HtmlTools.appendDOMs(target, [
                            '_parentheses_left_',
                            '_minus_',
                            '_infty_',
                            '_comma_'
                        ], {mode: 'replace'});
                        break;
                    default:
                        HtmlTools.appendDOMs(target, [
                            `_${useBracket ? 'bracket' : 'parentheses'}_left_`,
                            ...HtmlTools.textToHtmlClass(textList[0]),
                            '_comma_'
                        ], {mode: 'replace'});
                        break;
                }

                switch (textList[1]) {
                    case '+inf':
                        HtmlTools.appendDOMs(target, [
                            '_plus_',
                            '_infty_',
                            '_parentheses_right_'
                        ]);
                        break;
                    default:
                        HtmlTools.appendDOMs(target, [
                            ...HtmlTools.textToHtmlClass(textList[1]),
                            `_${useBracket ? 'bracket' : 'parentheses'}_right_`
                        ]);
                        break;
                }
            };

            /**
             * 将多项式函数的根（零点）列表转换为 HTML DOM 元素并插入目标容器。
             * 它处理特殊情况，如无实根 ('null') 或恒等式 ('anyRealNumber')，以及常规的数值根。
             *
             * @param {HTMLElement} target - 目标 DOM 容器。
             * @param {string} text - 单个已格式化根；`null` 表示没有实根，`anyRealNumber` 表示恒等式的
             *   任意实数解，其他值按普通数学表达式词元渲染。
             */
            const powerFunctionRootToHtml = (target, text) => {
                if (text === 'null') {
                    HtmlTools.appendDOMs(target, ['_null_'], {mode: 'replace'});
                    return;
                }

                if (text === 'anyRealNumber') {
                    HtmlTools.appendDOMs(target, ['_any_real_num_'], {mode: 'replace'});
                    return;
                }

                HtmlTools.appendDOMs(target, HtmlTools.textToHtmlClass(text));
            };

            // 数字键对应结果区域后缀，值对应 Worker 返回对象中的分析字段。
            const outputList = {
                '2': 'increasingInterval',
                '3': 'decreasingInterval',
                '4': 'maximumPoint',
                '5': 'minimumPoint',
                '6': 'concaveInterval',
                '7': 'convexInterval',
                '8': 'inflectionPoint',
                '9': 'roots'
            };

            // 空系数按 0 参与计算，但五项全空仍视为没有有效输入。
            const list = [];
            let noInput = true;
            for (let i = 0; i < 5; i++) {
                const screenData = PageConfig.screenData[`3${i}`];

                const emptyInput = screenData === '';
                list[i] = emptyInput ? '0' : screenData;

                if (noInput && !emptyInput) {
                    noInput = false;
                }
            }

            if (noInput) {
                errorPrint();
                return;
            }

            try {
                const result = await WorkerTools.powerFunctionAnalysis(list);

                for (let i = 0; i < 10; i++) {
                    switch (i) {
                        case 0:
                            HtmlTools.appendDOMs(
                                HtmlTools.getHtml('#print_content_3_content_0'),
                                result.equation === 'error' ?
                                    ['_error_'] :
                                    ['_y_mathit_', '_equal_', '_f_', '_parentheses_left_', '_x_mathit_', '_parentheses_right_', '_equal_', ...HtmlTools.textToHtmlClass(result.equation)],
                                {mode: 'replace'}
                            );
                            break;
                        case 1:
                            powerFunctionTextToHtml(HtmlTools.getHtml('#print_content_3_content_1'), result.range, true);
                            break;
                        case 9:
                            this._multipleLinesPrint(
                                HtmlTools.getHtml(`#print_content_3_content_${i}`),
                                result[outputList[i]],
                                powerFunctionRootToHtml
                            );
                            break;
                        default:
                            this._multipleLinesPrint(
                                HtmlTools.getHtml(`#print_content_3_content_${i}`),
                                result[outputList[i]],
                                powerFunctionTextToHtml
                            );
                            break;
                    }
                }
            } catch {
                errorPrint();
            }
        }

        /**
         * 执行模式 4（复数 N 次方根）的核心计算与 UI 渲染逻辑。
         * 该方法负责：
         * 1. 从屏幕输入数据中收集复数 z 和根指数 n。
         * 2. 调用 Web Worker 计算复数 z 的 n 个根。
         * 3. 将计算结果（包括原表达式、通项公式、数值解列表）格式化并渲染到页面的相应输出区域。
         * 4. 处理计算过程中的错误，并在界面上显示错误状态。
         *
         * @private
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode4() {
            /**
             * 将单个数值解格式化为 HTML DOM 元素并插入目标容器。
             * 格式为：z_k = value
             *
             * @param {HTMLElement} target - 目标 DOM 容器。
             * @param {string} text - 数值解的字符串表示。
             * @param {number} i - 当前解的索引 k。
             */
            const indexingNumericalResults = (target, text, i) => {
                HtmlTools.appendDOMs(
                    target,
                    ['_z_mathit_', '_underline_', ...HtmlTools.textToHtmlClass(i.toString()), '_space_', '_equal_', '_space_'],
                    {mode: 'replace'}
                );

                HtmlTools.appendDOMs(target, HtmlTools.textToHtmlClass(text));
            };

            const z = PageConfig.screenData['40'];
            const n = PageConfig.screenData['41'];

            const content40 = HtmlTools.getHtml('#print_content_4_content_0');
            const content41 = HtmlTools.getHtml('#print_content_4_content_1');
            const content42 = HtmlTools.getHtml('#print_content_4_content_2');
            try {
                const result = await WorkerTools.radicalFunctionAnalysis(z, n);

                if ([result.z, result.n].includes('error')) {
                    HtmlTools.appendDOMs(content40, ['_error_'], {mode: 'replace'});
                } else {
                    HtmlTools.appendDOMs(
                        content40,
                        [...HtmlTools.textToHtmlClass(result.z), '_space_', '_de_'],
                        {mode: 'replace'}
                    );

                    switch (result.n) {
                        case '2':
                            HtmlTools.appendDOMs(content40, ['_print_4_sqrt_']);
                            break;
                        case '3':
                            HtmlTools.appendDOMs(content40, ['_cbrt_ch_']);
                            break;
                        default:
                            HtmlTools.appendDOMs(
                                content40,
                                ['_space_', ...HtmlTools.textToHtmlClass(result.n), '_space_', '_print_4_root_']
                            );
                            break;
                    }
                }

                if (result.kRange.includes('error') || result.formula === 'error') {
                    HtmlTools.appendDOMs(content41, ['_error_'], {mode: 'replace'});
                } else {
                    HtmlTools.appendDOMs(
                        content41,
                        ['_z_mathit_', '_underline_', '_k_mathit_', '_space_', '_equal_', '_space_'],
                        {mode: 'replace'}
                    );
                    HtmlTools.appendDOMs(content41, HtmlTools.textToHtmlClass(result.formula));

                    if (result.kRange[0] === result.kRange[1]) {
                        HtmlTools.appendDOMs(content41, ['_comma_', '_k_mathit_', '_in_', '_curlyBraces_left_', '_0_', '_curlyBraces_right_']);
                    } else {
                        HtmlTools.appendDOMs(content41, ['_comma_', '_k_mathit_', '_in_', '_bracket_left_',
                            ...HtmlTools.textToHtmlClass(result.kRange[0]),
                            '_comma_',
                            ...HtmlTools.textToHtmlClass(result.kRange[1]),
                            '_bracket_right_',
                            '_cap_',
                            '_Z_mathbb_'
                        ]);
                    }
                }

                this._multipleLinesPrint(
                    content42,
                    result.numericalResults,
                    indexingNumericalResults,
                    true
                );

                HtmlTools.getHtml('#print_omit').classList[result.overflow ? 'remove' : 'add']('NoDisplay');
            } catch {
                HtmlTools.appendDOMs(content40, ['_error_'], {mode: 'replace'});
                HtmlTools.appendDOMs(content41, ['_error_'], {mode: 'replace'});
                this._multipleLinesPrint(
                    content42,
                    [['error']],
                    HtmlTools.appendDOMs
                );
                HtmlTools.getHtml('#print_omit').classList.add('NoDisplay');
            }
        }

        /**
         * 处理“执行”按钮的点击事件，根据当前计算器模式执行不同的操作。
         * - 在函数列表定义模式 ('2_0') 下，此方法会切换到函数求值范围的设置界面 ('2_1')。
         * - 在其他模式下，它会触发主界面的切换，并执行计算。
         *
         * @returns {void}
         */
        static async exe() {
            const currentMode = PageConfig.currentMode;
            // 非标准模式先把编辑区提交到当前子屏幕，本次点击不立即进入结果页。
            if (HtmlTools.getHtml('.InputTip') === undefined && currentMode !== '0') {
                await PageControlTools.syncInputToScreen();
                return;
            }

            // 函数列表模式分两步输入：函数定义完成后先进入范围设置页。
            if (currentMode === '2_0') {
                PageConfig.currentMode = '2_1';

                return;
            }

            HtmlTools.getHtml('#load_cover').classList.remove('NoDisplay');
            HtmlTools.getHtml('#main').classList.remove('Input');
            switch (currentMode) {
                case '0':
                    await this._exeMode0();
                    break;
                case '1':
                    await this._exeMode1();

                    // 结果页接管视图后暂停输入网格，返回时再由 closePrint 恢复。
                    if (!HtmlTools.getHtml('#main').classList.contains('Input') && InputManager.statisticsRenderer.isRunning()) {
                        InputManager.statisticsRenderer.pause();
                    }
                    break;
                case '2_1':
                    await this._exeMode2();
                    break;
                case '3':
                    await this._exeMode3();
                    break;
                case '4':
                    await this._exeMode4();
                    break;
            }

            HtmlTools.getHtml('#load_cover').classList.add('NoDisplay');
        }
    }

    /** 控制页面模式、面板和交互状态。 */
    class PageControlTools {
        /**
         * 存储当前选中的回归分析模型的 DOM ID。
         * 用于在统计模式（模式 1）下，记录用户当前查看的是哪种回归模型（例如线性回归、二次回归等）。
         * 默认值为 'choose_ra_0'（线性回归）。
         * 此属性主要用于在导出回归方程时确定要导出的内容。
         *
         * @private
         * @type {string}
         */
        static _currentRaModel = 'choose_ra_0';

        /**
         * 阻止实例化静态页面控制器。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[PageControlTools] PageControlTools is a static class and should not be instantiated.');
        }

        /**
         * 切换或设置回归模型选择菜单的显示状态。
         * 此方法通过控制 `#print_content_1_choose` 元素的 `PrintContent1ChooseOff` 类来实现菜单的显示与隐藏。
         *
         * @private
         * @param {string|undefined} [mode] - (可选) 控制类切换的行为。
         *   - 如果为 `undefined`，则切换 'PrintContent1ChooseOff' 类（如果存在则移除，不存在则添加）。
         *   - 如果是字符串（例如 'add' 或 'remove'），则直接调用 classList 上的相应方法。
         *     - 'add': 添加类，即隐藏菜单。
         *     - 'remove': 移除类，即显示菜单。
         * @returns {void}
         */
        static _changePrintContent1Choose(mode) {
            HtmlTools.getHtml('#print_content_1_choose').classList[mode === undefined ? 'toggle' : mode]('PrintContent1ChooseOff');
        }

        /**
         * 重置回归分析导出按钮的视觉状态。
         * 此方法将“导出到 f(x)”和“导出到 g(x)”按钮恢复为默认图标（_export_fx_ 和 _export_gx_）。
         * 通常在切换回归模型或退出结果页面时调用，以清除之前的“成功”或“失败”状态反馈。
         *
         * @private
         * @returns {void}
         */
        static _exportRaRecover() {
            const
                export0 = HtmlTools.getHtml('#export_0'),
                export1 = HtmlTools.getHtml('#export_1');

            HtmlTools.appendDOMs(HtmlTools.getHtml('#export_0'), ['_export_fx_'], {mode: 'replace'});
            HtmlTools.appendDOMs(HtmlTools.getHtml('#export_1'), ['_export_gx_'], {mode: 'replace'});

            export0.classList.remove('Failed');
            export1.classList.remove('Failed');
        }

        /**
         * 重置按钮状态，与 triggerSelection 相配合
         *
         * @private
         * @param {HTMLElement} btn - 需要重置的按钮元素
         */
        static _resetButton(btn) {
            if (!btn) {
                return;
            }

            const ripples = btn.querySelectorAll('.Ripple');

            ripples.forEach((r) => {
                r.classList.add('IsFadingOut');
                setTimeout(() => r.remove(), 600);
            });

            btn.classList.remove('IsSelected');
        }

        /**
         * 处理列表项的单选逻辑。
         * 用于在设置菜单或其他选项列表中，当用户点击某一项时，更新 UI 样式（添加选中态类名）并触发相应的后续操作。
         *
         * @param {HTMLElement} target - 要成为唯一选中项的按钮；已选中或空目标直接忽略，其他同组选项
         *   会先清除状态。目标必须包含本控件约定的标签/图标结构。
         * @param {MouseEvent} [e] - 触发选择的指针事件；提供时以 `clientX/clientY` 计算波纹原点，
         *   省略时仍切换选择状态，但使用控件默认的视觉位置。
         */
        static triggerSelection(target, e) {
            if (!target || target.classList.contains('IsSelected')) {
                return;
            }

            target.classList.add('IsSelected');

            const circle = document.createElement('span');
            circle.classList.add('Ripple');

            const diameter = Math.max(target.clientWidth, target.clientHeight);
            const radius = diameter / 2;
            const rect = target.getBoundingClientRect();

            let x = rect.width / 2;
            let y = rect.height / 2;

            if (e && e.clientX !== undefined) {
                x = e.clientX - rect.left;
                y = e.clientY - rect.top;
            }

            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${x - radius}px`;
            circle.style.top = `${y - radius}px`;

            target.appendChild(circle);
        }

        /**
         * 切换统计结果窗口的显示模式（X、Y 或 XY）。
         * 此函数通过修改 DOM 元素的类名来控制统计结果面板的滑动切换效果。
         *
         * @param {'x'|'y'|'xy'} target - 要切换到的目标模式。
         *   - `'x'`: 显示 X 数据的统计结果。
         *   - `'y'`: 显示 Y 数据的统计结果。
         *   - `'xy'`: 显示 X 和 Y 的回归分析/相关性结果。
         */
        static switchStatisticsResults(target) {
            const topBar = HtmlTools.getHtml('#statistics_results_top');
            const resultWindow = HtmlTools.getHtml('#statistics_results_window');

            const modeClasses = ['ResultX', 'ResultY', 'ResultXY'];
            const targetUpper = target.toUpperCase();

            [topBar, resultWindow].forEach((el) => {
                if (!el) {
                    return;
                }
                el.classList.remove(...modeClasses);
                el.classList.add(`Result${targetUpper}`);
            });

            const indexMap = {'x': 0, 'y': 1, 'xy': 2};
            const skipIndex = indexMap[target.toLowerCase()] ?? 3;

            Array.from(topBar.children).forEach((child, index) => {
                if (index !== skipIndex) {
                    this._resetButton(child);
                }
            });
        }

        /**
         * 控制彩蛋动画的函数。
         *
         * @returns {void}
         */
        static moveShip() {
            HtmlTools.getHtml('._ship_').classList.toggle('ShipLeft');
        }

        /**
         * 处理主遮罩层（main_cover）上的点击事件。
         * 当用户点击设置菜单外部的遮罩区域时，此函数被调用，以关闭设置面板并隐藏遮罩本身。
         *
         * @returns {void}
         */
        static clickMainCover() {
            PageControlTools.headChangeModes('add');
            PageControlTools.headChangeExplain('add');
            HtmlTools.getHtml('#main_cover').classList.add('NoDisplay');
        }

        /**
         * 切换或设置头部设置图标的显示方向（水平或垂直）。
         *
         * @param {string|undefined} [mode] - (可选) 控制类切换的行为。
         *   - 如果为 `undefined`，则切换 'Horizontal' 类。
         *   - 如果是字符串（例如 'add' 或 'remove'），则直接调用 classList 上的相应方法。
         * @returns {void}
         */
        static headChangeModes(mode) {
            const setting = HtmlTools.getHtml('#setting');
            HtmlTools.getHtml('._head_setting_').classList[mode === undefined ? 'toggle' : mode]('Horizontal');
            setting.classList[mode === undefined ? 'toggle' : mode]('SettingNotShow');
            HtmlTools.getHtml('#main_cover').classList[mode === undefined ? 'toggle' : mode]('NoDisplay');

            if (PageConfig.currentMode === '0' && setting.classList.contains('SettingNotShow')) {
                PrintManager.mode0ShowOnScreen();
            }
        }

        /**
         * 切换或设置说明面板和主遮罩层的可见性。
         * 此方法通过切换或强制添加/移除 CSS 类来控制 `#explain` 面板和 `#main_cover` 遮罩的显示状态。
         *
         * @param {string|undefined} [mode] - (可选) 控制类切换的行为。
         *   - 如果为 `undefined`，则切换 'ExplainNotShow' 和 'NoDisplay' 类。
         *   - 如果是字符串（例如 'add' 或 'remove'），则直接调用 classList 上的相应方法，强制显示或隐藏。
         * @returns {void}
         */
        static headChangeExplain(mode) {
            const showOrNot = mode === undefined ? 'toggle' : mode;
            HtmlTools.getHtml('#explain').classList[showOrNot]('ExplainNotShow');
            HtmlTools.getHtml('#head_explain').classList[showOrNot]('ExplainNotShow');
            HtmlTools.getHtml('#main_cover').classList[showOrNot]('NoDisplay');
        }

        /**
         * 切换显示在屏幕顶部的标题，以匹配当前的计算模式。
         * 它通过隐藏当前的标题元素并显示与新模式对应的标题元素来工作。
         *
         * @param {string} mode - 与标题元素 ID 后缀对应的主模式标识；调用前应已通过
         *   `PageConfig.currentMode` 白名单校验，方法只负责隐藏旧标题并显示目标标题。
         * @returns {void}
         */
        static changeTitle(mode) {
            HtmlTools.getHtml('#title_mode_' + PageConfig.currentMode).classList.add('NoDisplay');
            HtmlTools.getHtml('#title_mode_' + mode).classList.remove('NoDisplay');
        }

        /**
         * 处理打印内容1（统计回归结果）遮罩层的点击事件。
         * 当用户点击遮罩层时，此方法被调用，用于关闭回归模型选择菜单并隐藏遮罩层本身。
         *
         * @returns {void}
         */
        static clickPrint1Cover() {
            PageControlTools._changePrintContent1Choose('add');
            HtmlTools.getHtml('#print_content_1_cover').classList.add('NoDisplay');
        }

        /**
         * 处理点击回归模型选择区域的事件。
         * 当用户点击显示当前回归模型的区域时调用此方法，用于打开模型选择菜单并显示遮罩层。
         *
         * @returns {void}
         */
        static clickPrint1Choose() {
            PageControlTools._changePrintContent1Choose('remove');
            HtmlTools.getHtml('#print_content_1_cover').classList.remove('NoDisplay');
        }

        /**
         * 切换统计模式（模式 1）下的回归分析模型。
         * 此方法负责：
         * 1. 更新 UI 以显示当前选中的回归模型。
         * 2. 处理模型切换时的视觉状态（高亮选中项，取消旧选中项）。
         * 3. 如果模型发生变化，重置导出按钮的状态。
         * 4. 根据选择的模型显示或隐藏特定的结果控件（如线性回归的额外信息）。
         * 5. 触发结果数据的重新渲染。
         * 6. 关闭模型选择菜单。
         *
         * @param {string} id - 回归模型选择项的完整 DOM ID，例如 `choose_ra_0`；它同时作为
         *   `PrintManager.mode1Results` 的模型键，必须对应已渲染且已有结果的选项。
         * @param {'change'|'init'} [mode='change'] - 操作阶段。
         *   - 'change': (默认) 这是一个用户交互触发的更改，需要更新显示的结果数据。
         *   - 'init': 这是一个初始化操作（例如计算完成后自动选择最佳模型），不需要重新触发结果渲染逻辑（或者由调用者处理）。
         * @returns {void}
         */
        static changePrint1Ra(id, mode = 'change') {
            const model = HtmlTools.getClassList(HtmlTools.getHtml(`#${id}`).lastElementChild);

            const modelShow = HtmlTools.getHtml('#print_1_0_choose');
            let lastModel;

            HtmlTools.appendDOMs(modelShow, [
                '_print_1_0_choose_',
                '_space_',
                '_y_mathit_',
                '_equal_',
                ...model,
                '_print_content_1_arrow_'
            ], {mode: 'replace'});

            // 从已高亮项反向定位旧模型，确保视觉状态以实际 DOM 为准。
            for (let i = HtmlTools.getHtml('#print_content_1_choose').children.length - 2; i >= 0; i--) {
                const dealArea = HtmlTools.getHtml(`#choose_ra_${i}`);
                if (dealArea.classList.contains('Print1ChooseOn')) {
                    dealArea.classList.remove('Print1ChooseOn');
                    lastModel = `choose_ra_${i}`;
                    break;
                }
            }

            // 仅模型真正变化时清除上一次导出的成功或失败反馈。
            if (lastModel !== id) {
                PageControlTools._exportRaRecover();
            }

            HtmlTools.getHtml(`#${id}`).classList.add('Print1ChooseOn');

            this._currentRaModel = id;

            // 初始化阶段由计算流程负责首屏渲染，用户切换时才在这里刷新结果。
            if (mode === 'change') {
                PrintManager.setMode1RaResults(PrintManager.mode1Results === 'error' ? 'error' : PrintManager.mode1Results[id]);
            }

            PageControlTools.clickPrint1Cover();
        }

        /**
         * 将当前选中的回归分析模型的方程导出到函数定义区域（f(x) 或 g(x)）。
         * 此方法响应导出按钮的点击事件，将计算出的回归方程填充到对应的函数输入框中，
         * 以便用户可以在函数列表模式下进一步使用该方程（例如求值或绘图）。
         *
         * @param {'export_0'|'export_1'} func - 触发导出的按钮 ID，也决定回归表达式写入哪个函数槽位。
         *   - `'export_0'`: 导出到 f(x) (对应 DOM ID `#screen_input_inner_2_00`)。
         *   - `'export_1'`: 导出到 g(x) (对应 DOM ID `#screen_input_inner_2_01`)。
         * @returns {void}
         */
        static exportRa(func) {
            const clickArea = HtmlTools.getHtml(`#${func}`);

            // 忽略已成功导出的重复点击。
            if (!clickArea.children[0].classList.contains('_success_')) {
                const exportTarget = func === 'export_0' ? '2_00' : '2_01';

                const exportContent = PrintManager.mode1Results;

                if (exportContent === 'error' || exportContent[this._currentRaModel].regressionEquation === 'error') {
                    HtmlTools.appendDOMs(clickArea, ['_failed_'], {mode: 'replace'});
                    clickArea.classList.add('Failed');
                    return;
                }
                const equation = MathPlus.calc(exportContent[this._currentRaModel].regressionEquation, {mode: 'syntaxCheck'})[1];

                PageConfig.screenData = {[exportTarget]: equation};
                HtmlTools.appendDOMs(
                    HtmlTools.getHtml(`#screen_input_inner_${exportTarget}`),
                    HtmlTools.textToHtmlClass(equation), {mode: 'replace'}
                );
                HtmlTools.appendDOMs(clickArea, ['_success_'], {mode: 'replace'});
            }
        }

        /**
         * 切换当前显示的屏幕内容，以匹配新的计算模式。
         * 此方法通过为当前屏幕添加隐藏类并为新屏幕移除隐藏类来工作。
         * 它会根据模式的不同使用不同的 CSS 类，以支持不同的过渡动画效果。
         *
         * @param {'0'|'1'|'2_0'|'2_1'|'3'|'4'} mode - 目标主屏幕 ID 后缀；决定使用普通还是方向性过渡类，
         *   并在动画结束后清理旧屏幕状态。该方法不负责校验或持久化模式。
         * @returns {void}
         */
        static changeScreen(mode) {
            const currentMode = PageConfig.currentMode;
            const currentNoDisplayStr = ['0', '1'].includes(currentMode) ? 'NoDisplay' : 'ScreenNoDisplay';
            const nextNoDisplayStr = ['0', '1'].includes(mode) ? 'NoDisplay' : 'ScreenNoDisplay';

            HtmlTools.getHtml('#screen_' + currentMode).classList.add(currentNoDisplayStr);
            HtmlTools.getHtml('#screen_' + mode).classList.remove(nextNoDisplayStr);
        }

        /**
         * 更新主输入区域的视觉提示，以反映当前的计算器模式和子模式。
         * 此函数通过更改提示元素的CSS类来动态显示不同的背景图片，从而向用户指示当前上下文所期望的输入类型（例如，表达式、实数、复数等）。
         * 它会检查当前模式，并根据预定义的 `modeTips` 映射来决定显示哪个提示。
         *
         * @returns {void}
         */
        static changeInputTip() {
            const input = HtmlTools.getHtml('#input');

            let currentTip = HtmlTools.getHtml('.InputTip');

            // 只有输入区仅剩光标时才补建提示，避免把提示混入已有表达式。
            if (currentTip === undefined) {
                if (input.children.length !== 1) {
                    return;
                }
                HtmlTools.appendDOMs('#input', ['InputTip']);
                currentTip = HtmlTools.getHtml('.InputTip');
            } else if (input.children.length !== 2) {
                return;
            }

            const modeTips = {
                '0': [0, 'expr'],
                '1': [0, 'R'],
                '2_0': [0, 'expr'],
                '2_1': [1, 'R', 'R', 'positive'],
                '3': [0, 'R'],
                '4': [1, 'C', 'N']
            };

            const currentMode = PageConfig.currentMode;
            const currentTipList = modeTips[currentMode];
            let currentTipStr;

            // 映射首项为 0 时提示固定；为 1 时按当前子模式选择后续提示。
            if (currentTipList[0] === 0) {
                currentTipStr = currentTipList[1];
            } else {
                currentTipStr = currentTipList[1 + Number(PageConfig.subModes[currentMode])];
            }

            currentTip.classList.value = '';
            currentTip.classList.add(`_input_tip_${currentTipStr}_`);
            currentTip.classList.add('InputTip');
        }

        /**
         * 管理和切换子键盘的显示状态。
         * 此方法根据被点击的键盘切换按钮，控制哪个子键盘面板（如三角函数、高级函数等）是可见的。
         * 它会处理：
         * 1. 高亮/取消高亮顶部工具栏中的触发按钮。
         * 2. 显示或隐藏对应的子键盘面板。
         * 3. 确保同一时间只有一个子键盘面板是打开的。
         * 4. 管理一个背景遮罩，当点击遮罩时可以关闭所有打开的子键盘。
         *
         * @param {string} className - 触发此操作的按钮内部图标的 CSS 类名，或一个特殊指令。
         *   - '_trigonometry_', '_functions_', '_more_': 切换对应的子键盘。
         *   - '_2nd_': 切换“第二功能”键的状态，不打开子键盘。
         *   - 'allNotShow': 一个特殊指令，用于关闭所有打开的子键盘和遮罩。
         * @returns {void}
         */
        static changeSubKeyboard(className) {
            const children = HtmlTools.getHtml('#keyboard_top').children;

            // 特殊指令同时收起全部面板，并清除两套键盘遮罩。
            if (className === 'allNotShow') {
                HtmlTools.getHtml('#keyboard_cover_ForMode1').classList.remove('KeyboardCover');
                HtmlTools.getHtml('#keyboard_cover').classList.remove('KeyboardCover');

                for (let i = 1; i < 4; i++) {
                    const dealSubKeyboard = `#sub_keyboard_${i < 3 ? i - 1 : 'ForMode1'}`;
                    HtmlTools.getHtml(dealSubKeyboard).classList.add('NotShow');
                    children[i].classList.add('Ordinary');
                }
                return;
            }

            const parent = HtmlTools.getHtml(`.${className}`).parentNode;
            const place = [...children].indexOf(parent);

            parent.classList.toggle('Ordinary');

            // “2nd”只切换按钮状态，键帽重绘由 keyboardType setter 完成。
            if (className === '_2nd_') {
                return;
            }

            // 切换目标面板前先收起其余面板，保证子键盘互斥。
            for (let i = 1; i < 4; i++) {
                if (i !== place) {
                    const dealSubKeyboard = `#sub_keyboard_${i < 3 ? i - 1 : 'ForMode1'}`;
                    HtmlTools.getHtml(dealSubKeyboard).classList.add('NotShow');
                    children[i].classList.add('Ordinary');
                }
            }

            const dealSubKeyboard = HtmlTools.getHtml(`#sub_keyboard_${place < 3 ? place - 1 : 'ForMode1'}`);
            dealSubKeyboard.classList.toggle('NotShow');
            HtmlTools.getHtml('#keyboard_cover_ForMode1').classList.remove('KeyboardCover');
            HtmlTools.getHtml('#keyboard_cover').classList.remove('KeyboardCover');

            // 统计专用面板和普通子键盘分别使用独立遮罩。
            if (dealSubKeyboard.id === 'sub_keyboard_ForMode1' && !dealSubKeyboard.classList.contains('NotShow')) {
                HtmlTools.getHtml('#keyboard_cover_ForMode1').classList.add('KeyboardCover');
            } else if (/sub_keyboard_[01]/.test(dealSubKeyboard.id) && !dealSubKeyboard.classList.contains('NotShow')) {
                HtmlTools.getHtml('#keyboard_cover').classList.add('KeyboardCover');
            }
        }

        /**
         * 动态更新特定键盘按钮（在f(x), g(x), x之间切换的那个）的显示和功能。
         * 此更新取决于当前的计算器模式 ({@link PageConfig.currentMode})、
         * 第二功能键的状态 ({@link PageConfig.keyboardType})，以及在函数列表模式下选择的子模式。
         *
         * @returns {void}
         */
        static keyboardFuncBecomeX() {
            const dealArea = HtmlTools.getHtml('.BecomeX').firstElementChild;

            if (PageConfig.currentMode !== '2_0') {
                dealArea.className = PageConfig.keyboardType === 0 ? '_f_' : '_g_';
                return;
            }

            if (PageConfig.keyboardType === 0) {
                dealArea.className = '_x_mathit_';
            } else if (PageConfig.keyboardType === 1) {
                dealArea.className = PageConfig.subModes['2_0'] === '1' ? '_f_' : '_g_';
            }
        }

        /**
         * 关闭打印/结果视图，并返回到主输入视图。
         * 此方法通过为 `#main` 容器元素添加 'Input' CSS 类来工作。
         * 根据 CSS 规则，这个类的存在会调整 `#main` 容器的 `left` 属性，
         * 从而触发一个平滑的过渡效果，将主输入界面滑动回视图中。
         *
         * @returns {void}
         */
        static closePrint() {
            HtmlTools.getHtml('#main').classList.add('Input');
            switch (PageConfig.currentMode) {
                case '0':
                    PrintManager.mode0ShowOnScreen.cancel();
                    if (PrintManager.mode0ScreenInCalc) {
                        WorkerTools.restart();
                    }
                    InputManager.ac({acArea: HtmlTools.getHtml('#print_content_0_content_0')});
                    InputManager.ac({acArea: HtmlTools.getHtml('#print_content_0_content_1')});
                    return;
                case '1':
                    if (InputManager.statisticsRenderer.isPaused()) {
                        InputManager.statisticsRenderer.resume();
                    }
                    PageControlTools._exportRaRecover();
                    return HtmlTools.scrollToView();
                case '2_1':
                    PrintManager.printListRenderer.clear();
                    return HtmlTools.getHtml('#print_content_2_inner').replaceChildren();
            }
        }

        /**
         * 取消当前正在进行的计算任务或操作。
         * 此方法作为一个“紧急停止”机制，不仅关闭结果展示界面，还会强制重启后台 Worker 线程以立即终止任何卡住或耗时的计算任务，同时移除 UI 上的加载锁定状态。
         *
         * @returns {void}
         */
        static cancelPrint() {
            PageControlTools.closePrint();

            WorkerTools.restart();

            HtmlTools.getHtml('#load_cover').classList.add('NoDisplay');
        }

        /**
         * 隐藏当前的详细解释面板，并将界面恢复至默认状态。
         * 此方法通常在鼠标移出特定符号或检测到非法输入时调用，用于重置顶部标题栏的显示状态，并将解释区域的内容恢复为基础说明信息。
         *
         * @returns {void}
         */
        static hideExplain() {
            if (!HtmlTools.getHtml('#explain').classList.contains('ExplainNotShow')) {
                return;
            }

            HtmlTools.getHtml('#head_inputs').classList.add('NoDisplay');
            HtmlTools.getHtml('#head_title').classList.remove('NoDisplay');

            HtmlTools.appendDOMs(HtmlTools.getHtml('#explain_title_inner'), ['_basic_explain_title_'], {mode: 'replace'});
            HtmlTools.appendDOMs(HtmlTools.getHtml('#explain_content'), ['_basic_explain_content_'], {mode: 'replace'});
        }

        /**
         * 根据输入的符号信息，动态生成并显示其详细解释、优先级和结合性。
         * 此方法负责解析输入的符号（如运算符、函数），构建包含中文含义、优先级（Priority）和结合性（Associativity）的 DOM 结构。
         *
         * @param {Array<string>} input - 当前符号的渲染类名序列；方法先还原内部词元，再读取
         *   `TokenConfig` 的参数个数、优先级和结合性。空数组或未知词元只显示基础说明。
         * @returns {void}
         */
        static showExplain(input) {
            /**
             * 构建并追加优先级和结合性的详细信息块。
             * 根据传入的优先级数值和结合性方向，生成对应的 DOM 结构并插入到目标容器中。
             *
             * @param {HTMLElement|DocumentFragment} target - 目标 DOM 容器（通常是 DocumentFragment）。
             * @param {number} priority - 运算符的优先级数值。
             * @param {string|null} associativity - 运算符的结合性 ('left', 'right' 或 null)。
             */
            function funcInfoShow(target, priority, associativity) {
                /**
                 * 创建一个 div 容器，将指定内容添加到其中，
                 * 然后将该 div 追加到目标容器。
                 *
                 * @param {HTMLElement|DocumentFragment} target - 要追加内容的目标容器。
                 * @param {Array<string|string[]>} content - 交给 `HtmlTools.appendDOMs` 的渲染描述；每项是
                 *   单个类名或按属性数组解释的复合描述，顺序决定说明块中的 DOM 顺序。
                 * @returns {void}
                 */
                const addContent = (target, content) => {
                    const tempDIV = document.createElement('div');
                    HtmlTools.appendDOMs(tempDIV, content);
                    target.appendChild(tempDIV);
                };

                const additionalInfoShow = document.createElement('div');
                additionalInfoShow.classList.add('AdditionalInfo');
                target.appendChild(additionalInfoShow);

                addContent(additionalInfoShow,
                    ['_priority_level_', '_space_']
                );
                addContent(additionalInfoShow,
                    ['_L_', '_e_', '_v_', '_e_', '_l_', '_space_', ...HtmlTools.textToHtmlClass(priority.toString())]
                );

                if (associativity === null) {
                    return;
                }

                addContent(additionalInfoShow,
                    ['_operator_associativity_', '_space_']
                );
                addContent(additionalInfoShow,
                    [`_${associativity}_associative_`]
                );
            }

            /**
             * 向目标容器添加一条视觉分割线。
             * 用于在 UI 上区分同一符号的不同含义（例如区分 "+" 作为加法运算符和正号）。
             *
             * @param {HTMLElement|DocumentFragment} target - 要追加分割线的目标容器。
             */
            function addLine(target) {
                const line = document.createElement('div');
                line.classList.add('Lines');
                target.appendChild(line);
            }

            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay') ||
                !HtmlTools.getHtml('#main').classList.contains('Input')) {
                return;
            }

            const inputStr = HtmlTools.htmlClassToText(input);
            const info = Public.getTokenInfo(inputStr);
            const converterConfig = PageConfig.classNameConverterConfig;

            if (info.class === 'illegal') {
                this.hideExplain();
                return;
            }

            const inputClassStr = (inputStr in converterConfig ? converterConfig[inputStr] : inputStr).replace(/[\[\]]/g, '');

            const headInputs = HtmlTools.getHtml('#head_inputs');
            headInputs.classList.remove('NoDisplay');
            HtmlTools.getHtml('#head_title').classList.add('NoDisplay');
            switch (inputClassStr) {
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                case 'f':
                case 'g':
                    const ch = ['f', 'g'].includes(inputClassStr) ? '_custom_function_ch_' : '_num_ch_';
                    HtmlTools.appendDOMs(
                        headInputs,
                        ['_input_', '_space_', ch, '_space_', `_${inputClassStr}_`],
                        {mode: 'replace'}
                    );
                    HtmlTools.appendDOMs(
                        HtmlTools.getHtml('#explain_title_inner'),
                        [ch, '_space_', ...input],
                        {mode: 'replace'}
                    );
                    break;

                default:
                    const chinese = `_${inputClassStr}_ch_`;
                    HtmlTools.appendDOMs(
                        headInputs,
                        ['_input_', '_space_', chinese],
                        {mode: 'replace'}
                    );
                    HtmlTools.appendDOMs(
                        HtmlTools.getHtml('#explain_title_inner'),
                        [chinese, '_colon_', '_space_', ...input],
                        {mode: 'replace'}
                    );
                    break;
            }

            const fragment = document.createDocumentFragment();
            switch (inputStr) {
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                    const div = document.createElement('div');
                    const num = Number(inputStr);
                    HtmlTools.appendDOMs(
                        div,
                        [`_${num}_`, '_space_', '_is_between_', '_space_', `_${num - 1}_`, '_space_', '_and_', '_space_', `_${num + 1}_`, '_space_', '_natural_numbers_']
                    );
                    fragment.replaceChildren(div);
                    break;

                case 'f':
                case 'g':
                    HtmlTools.appendDOMs(fragment, ['_custom_function_expl_']);
                    break;

                default:
                    HtmlTools.appendDOMs(fragment, [`_${inputClassStr}_expl_`]);
                    break;
            }

            if (info.class === 'func') {
                addLine(fragment);
                const plusAndMinusPriority = info.priority + 2;
                const plusAndMinusAssociativity = info.associativity;

                switch (inputStr) {
                    case '-':
                    case '+':
                        const positiveAndNegative = Public.getTokenInfo('N');
                        const positiveAndNegativePriority = positiveAndNegative.priority + 2;
                        const positiveAndNegativeAssociativity = positiveAndNegative.associativity;

                        HtmlTools.appendDOMs(fragment, [`_as_${inputStr === '+' ? 'plus' : 'minus'}_sign_ ExplainLeft`]);
                        funcInfoShow(fragment, plusAndMinusPriority, plusAndMinusAssociativity);

                        addLine(fragment);

                        HtmlTools.appendDOMs(fragment, [`_as_${inputStr === '+' ? 'positive' : 'negative'}_sign_ ExplainLeft`]);
                        funcInfoShow(fragment, positiveAndNegativePriority, positiveAndNegativeAssociativity);
                        break;

                    case '*':
                        const explicit = Public.getTokenInfo('*');
                        const implicit = Public.getTokenInfo('&');

                        HtmlTools.appendDOMs(fragment, ['_as_explicit_multiplication_ ExplainLeft']);
                        funcInfoShow(fragment, explicit.priority + 2, explicit.associativity);

                        addLine(fragment);

                        HtmlTools.appendDOMs(fragment, ['_as_implicit_multiplication_ ExplainLeft']);
                        funcInfoShow(fragment, implicit.priority + 2, implicit.associativity);
                        break;

                    default:
                        funcInfoShow(fragment, plusAndMinusPriority, plusAndMinusAssociativity);
                }
            } else if (inputStr === '|') {
                addLine(fragment);
                funcInfoShow(fragment, 1, null);
            }

            HtmlTools.getHtml('#explain_content').replaceChildren(fragment);
        }

        /**
         * 将当前活动子屏幕区域的内容同步到主输入区域。
         * 此函数用于在用户切换子模式或点击特定区域时，确保主输入区域显示的是当前子模式的正确内容。
         * 它会清除主输入区域（如果需要），从当前子屏幕区域读取内容，并将其插入到主输入区域。
         * 对于统计模式（模式 '1'），它还处理添加新行或移动光标的逻辑。
         *
         * @param {boolean} [skipEmpty=true] - 当前子屏幕没有内容时，`true` 保留主输入区现状，
         *   `false` 仍执行清空与同步；统计模式的空行定位逻辑不完全等同于普通字符串为空。
         * @returns {void}
         */
        static syncScreenToInput(skipEmpty = true) {
            let classList;
            // 统计行可能未挂载在虚拟窗口中，因此从 screenData 读取；普通子屏直接读取 DOM。
            if (PageConfig.currentMode === '1') {
                const current = PageConfig.subModes['1'];
                classList = HtmlTools.textToHtmlClass(PageConfig.screenData['1'][current[0]][current[1]]);
            } else {
                const target = HtmlTools.getCurrentSubscreenArea();
                classList = HtmlTools.getClassList(target, {ignoreSpace: true});
            }
            if (skipEmpty && classList.length === 0) {
                return;
            }

            if (!HtmlTools.getHtml('.InputTip')) {
                InputManager.ac();
            }

            if (classList.length > 0) {
                InputManager.input(HtmlTools.deleteIllegal(classList));
            }
            InputManager.addSpace();

            HtmlTools.scrollToView();
        }

        /**
         * 将主输入区域的内容同步到当前活动的子屏幕输入区域。
         * 此函数负责获取主输入框的表达式，通过 Web Worker 进行语法检查和美化，
         * 然后将格式化后的内容更新到对应的子屏幕区域。
         * 它还处理了特定模式下的后续 UI 交互，例如在统计模式下自动添加新行或在其他模式下移动到下一个输入字段。
         *
         * @param {boolean} [moveCursor=true] - 成功写回后是否按当前模式进入下一个可编辑位置；
         *   `false` 只保存和重绘当前字段，常用于提交前同步而不改变用户焦点。
         * @returns {Promise<void>} 此方法不返回任何值，其作用是直接修改 DOM。
         */
        static async syncInputToScreen(moveCursor = true) {
            const currentMode = PageConfig.currentMode;

            if (currentMode === '0') {
                return;
            }

            const inputEl = HtmlTools.getHtml('#input');
            const currentInputArray = HtmlTools.getClassList(inputEl, {ignoreSpace: true});
            const currentInput = HtmlTools.htmlClassToText(currentInputArray);
            let expr;

            // 传入已保存的 f、g，使语法检查能正确解析自定义函数引用。
            try {
                const syntaxResult = await WorkerTools.exec(currentInput, {
                    calcMode: 'syntaxCheck',
                    f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                    g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                });

                expr = HtmlTools.textToHtmlClass(syntaxResult.expr);
            } catch (e) {
                // 保留原输入并加错误前缀，后续 DOM 渲染据此显示语法错误而不丢失用户内容。
                expr = ['_syntax_error_', ...currentInputArray];
            }

            if (currentMode === '1') {
                const current = PageConfig.subModes['1'];
                PageConfig.screenData = {'1': [current[0], current[1], HtmlTools.htmlClassToText(expr)]};

                const gridData = PageConfig.screenData['1'];
                const gridDataLast = gridData.at(-1);
                let addSucceed = true;

                // 最后一行一旦含值就追加空占位行，保证连续录入无需手动新增。
                if (gridDataLast[0].length !== 0 || gridDataLast[1].length !== 0) {
                    addSucceed = InputManager.statisticsAddLine();
                }

                if (moveCursor && addSucceed) {
                    InputManager.moveCursor('down', true);
                }

                InputManager.ac();
            } else {
                const target = HtmlTools.getCurrentSubscreenArea();
                if (!target) {
                    throw new Error('[PageControlTools] There is no active area on the current screen.');
                }

                // 普通模式先重绘活动子屏，再从该 DOM 持久化规范化后的表达式。
                HtmlTools.appendDOMs(target, expr, {mode: 'replace'});
                InputManager.addSpace({area: target});
                PageConfig.syncScreenData();

                if (moveCursor && HtmlTools.getHtml(`#screen_${currentMode}`).children.length !== Number(PageConfig.subModes[currentMode]) + 1) {
                    InputManager.moveCursor('right', true);
                }

                InputManager.ac();
            }

            HtmlTools.scrollToView();
        }
    }

    window.PageConfig = PageConfig;
    window.HtmlTools = HtmlTools;
    window.VirtualScroll = VirtualScroll;
    window.InputManager = InputManager;
    window.PrintManager = PrintManager;
    window.PageControlTools = PageControlTools;
})();