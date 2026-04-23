(function () {
    /**
     * @todo 性能优化：使用 VirtualScroll 替换 AsyncListRenderer
     * @description
     * 1. 核心目标：提升主列表与统计模式输入框的渲染性能。
     * 2. 技术约束：VirtualScroll 模式下无法直接访问 `.GridOn` 实例。
     * @step
     * - 抽象数据层：创建独立类管理 `#grid_data`，解耦对 `.GridOn` 的直接依赖。
     * - 逻辑映射：重构所有 `#grid_data` 读取操作，通过管理类进行代理。
     * - 组件迁移：完成上述重构后，将全量业务场景切换至 VirtualScroll。
     */

    "use strict";

    /**
     * @class PageConfig
     * @description 一个静态类，用于管理和配置与 HTML 界面相关的全局状态。
     * 它不应该被实例化，其所有属性和方法都应静态访问。
     */
    class PageConfig {
        /**
         * @static
         * @readonly
         * @type {{globalCalcAccuracy: number, outputAccuracy: number}}
         * @description 定义了“普通精度”模式下的计算和输出精度配置。
         * - `globalCalcAccuracy`: 30位的内部计算精度，适用于快速计算。
         * - `outputAccuracy`: 10位的输出显示精度。
         * 此配置通过 `calcAccMode` setter 应用。
         */
        static ACC_MODE_0 = {
            globalCalcAccuracy: 36,
            outputAccuracy: 12
        };

        /**
         * @static
         * @readonly
         * @type {{globalCalcAccuracy: number, outputAccuracy: number}}
         * @description 定义了“高精度”模式下的计算和输出精度配置。
         * - `globalCalcAccuracy`: 220位的内部计算精度，用于需要高准确性的科学计算。
         * - `outputAccuracy`: 100位的输出显示精度。
         * 此配置通过 `calcAccMode` setter 应用。
         */
        static ACC_MODE_1 = {
            globalCalcAccuracy: 220,
            outputAccuracy: 100
        };

        /**
         * @static
         * @type {Object<string, string>}
         * @description 一个静态映射表，将特殊的数学或结构字符转换为其对应的“安全”字符串，用作 CSS 类名的一部分。
         * 此配置由 `HtmlTools.textToHtmlClass` 方法使用，目的是将数学表达式字符串（例如 "2+3") 转换为一系列 CSS 类（例如, ['_2_', '_plus_', '_3_']）。
         * 这些类随后用于渲染表达式的视觉表示，通常是通过为每个字符/符号应用带有特定背景图像的样式。
         * @example
         * // '+' 字符被映射到 'plus'，最终生成的 CSS 类将是 '_plus_'。
         * '+': 'plus',
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

            // 注意：以下中括号是便于分词器将他们识别为1个 token
            '[e]': 'e_mathit',
            '[i]': 'i_mathit',
            '[x]': 'x_mathit',
            '[k]': 'k_mathit'
        };

        /**
         * @constructor
         * @description PageConfig 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 PageConfig 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[PageConfig] PageConfig is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @type {Object<string, string|array>}
         * @description 存储每个主计算器模式下当前选定的子模式。
         * 对象的键是主模式的标识符（例如, '1', '2_0'），值是该主模式下活动的子模式的标识符。
         * 此状态用于管理 UI 状态，并在 `localStorage` 中持久化，以便在会话之间保持用户的选择。
         */
        static _subModes = {
            '1': [0, 0],
            '2_0': '0',
            '2_1': '0',
            '3': '0',
            '4': '0'
        };

        /**
         * @static
         * @type {Object<string, string|array>}
         * @description 获取存储每个主计算器模式下当前选定子模式的对象。
         */
        static get subModes() {
            return PageConfig._subModes;
        }

        /**
         * @static
         * @description 设置一个或多个主模式的子模式，并相应地更新用户界面。
         * 此方法会处理不同主模式下子模式切换的特定 UI 逻辑（例如，高亮数据网格或切换输入区域），
         * 并将新的子模式状态持久化到 `localStorage`。
         * @param {object} obj - 一个对象，其键是主模式的 ID（或特殊值 'default'，代表当前活动的主模式），
         * 值是新的子模式 ID。
         * @example
         * // 将模式 '2_0' 的子模式设置为 '1'
         * PageConfig.subModes = { '2_0': '1' };
         * @throws {Error} 如果提供的子模式 ID 对于其主模式是无效的。
         */
        static set subModes(obj) {
            /**
             * @private
             * @function _changeSubModes
             * @description (内部辅助函数) 负责更新单个主模式的子模式状态并同步UI。
             * 此函数根据 `dealMode`（主模式）的不同，执行特定的UI更新逻辑。
             * 例如，在统计模式（'1'）下，它会高亮数据网格中的单元格；
             * 在其他模式下，它会切换不同输入区域的激活状态。
             * 完成UI更新后，它会更新全局的 `_subModes` 状态并将其持久化到localStorage。
             * @param {string|Array<number|string>} name - 新的子模式标识符。对于模式 '1'，这是一个坐标数组 `[row, col]`；对于其他模式，这是一个字符串ID。
             * @param {string} dealMode - 需要更新子模式的主模式ID。
             * @throws {Error} 如果 `name` 对于给定的 `dealMode` 是一个无效的子模式标识符。
             */
            function _changeSubModes(name, dealMode) {
                // 模式 '0' (标准计算) 没有子模式，直接返回。
                if (dealMode === '0') {
                    return;
                }
                // 如果 `dealMode` 是 'default'，则将其解析为当前活动的主模式。
                if (dealMode === 'default') {
                    dealMode = PageConfig.currentMode;
                }
                // --- 模式 '1' (统计回归) 的特殊处理逻辑 ---
                if (dealMode === '1') {
                    let index;
                    let children = HtmlTools.getHtml('#grid_data').children;
                    if (!Array.isArray(name)) {
                        name = name.split(',');
                    }
                    [name[0], name[1]] = [Number(name[0]), Number(name[1])];
                    // 验证数组格式和索引范围。
                    if (![0, 1].includes(name[1]) || name[0] >= children.length || name.length !== 2) {
                        throw new Error('[PageConfig] Unsupported sub-mode (out of range).');
                    }
                    // `children[name[0]]` 是行 `<div>`，其子元素中数据单元格从索引 1 开始。
                    index = children[name[0]].children[name[1] + 1];
                    // 移除当前已激活单元格的高亮。
                    HtmlTools.getHtml('.GridOn')?.classList?.remove('GridOn');
                    // 为新选中的单元格添加 'GridOn' 类，使其高亮。
                    index.classList.add('GridOn');
                } else {
                    // --- 其他模式 ('2_0', '2_1', '3', '4') 的通用处理逻辑 ---
                    // 这些模式的子模式切换表现为在多个输入区域之间切换激活状态。
                    // `modeValidations` 定义了每个主模式所支持的子模式标识符列表。
                    const modeValidations = {
                        '2_0': ['0', '1'],
                        '2_1': ['0', '1', '2'],
                        '3': ['0', '1', '2', '3', '4'],
                        '4': ['0', '1']
                    };

                    // 获取对应主模式的验证规则。
                    const validation = modeValidations[dealMode];
                    // 检查 `name` 是否在数组中。
                    if (!validation.includes(name)) {
                        throw new Error('[PageConfig] Unsupported sub-mode');
                    }
                    // 移除旧子模式输入区域的激活类。
                    HtmlTools.getHtml(`#screen_input_${dealMode}${PageConfig._subModes[dealMode]}`).classList.remove('ScreenInputsOn');
                    // 为新子模式的输入区域添加激活类。
                    HtmlTools.getHtml(`#screen_input_${dealMode}${name}`).classList.add('ScreenInputsOn');
                }
                // 更新全局配置中的子模式状态。
                PageConfig._subModes[dealMode] = name;
                // 更新键盘以反映上下文变化（例如，'f(x)' 按钮可能变为 'x'）。
                PageControlTools.keyboardFuncBecomeX();
                // 更新输入框的视觉提示。
                PageControlTools.changeInputTip();
                // 将更新后的状态持久化到 localStorage。
                localStorage.setItem('subModes', JSON.stringify(PageConfig._subModes));
            }

            if (!obj) {
                throw new Error('[PageConfig] Unsupported sub-mode');
            }

            // 遍历输入对象中的每个键值对。
            for (const key of Object.keys(obj)) {
                if (key === 'default' || PageConfig._subModes[key] !== undefined) {
                    _changeSubModes(obj[key], key);
                }
            }
        }

        /**
         * @private
         * @static
         * @type {string}
         * @description 存储当前计算器的操作模式。
         * 这是一个私有静态字段，应通过 `currentMode` 的 getter 和 setter 进行访问和修改。
         * 值的例子: '0' (标准计算), '1' (函数列表), '2_0' (统计), 等。
         */
        static _currentMode = '0';

        /**
         * @static
         * @type {string}
         * @description 获取当前计算器的操作模式。
         */
        static get currentMode() {
            return PageConfig._currentMode;
        }

        /**
         * @static
         * @description 设置当前计算器的操作模式，并触发相应的 UI 更新。
         * @param {string} mode - 要设置的新模式的标识符。必须是预定义模式之一 ('0', '1', '2_0', '2_1', '3', '4')。
         * @throws {Error} 如果提供的模式不受支持，则抛出错误。
         */
        static set currentMode(mode) {
            if (!['0', '1', '2_0', '2_1', '3', '4'].includes(mode)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            // 调用工具函数来更新页面标题以反映新模式。
            PageControlTools.changeTitle(mode);
            PageControlTools.changeScreen(mode);
            // 更新设置
            HtmlTools.getHtml(`#mode_${PageConfig._currentMode[0]}`).classList.remove('SelectionOn');
            // 更新输出
            HtmlTools.getHtml(`#print_content_${PageConfig._currentMode[0].slice(0, 1)}`).classList.add('NoDisplay');
            PageConfig._currentMode = mode;
            if (mode === '1') {
                HtmlTools.getHtml('#keyboard_top').classList.add('ForMode1');
            } else {
                HtmlTools.getHtml('#keyboard_top').classList.remove('ForMode1');
            }
            // 更新设置
            HtmlTools.getHtml(`#mode_${PageConfig._currentMode[0]}`).classList.add('SelectionOn');
            // 更新输出
            HtmlTools.getHtml(`#print_content_${PageConfig._currentMode[0].slice(0, 1)}`).classList.remove('NoDisplay');
            // 更新键盘
            PageControlTools.keyboardFuncBecomeX();
            // 更新输入框提示
            PageControlTools.changeInputTip();
            // 关闭副键盘
            PageControlTools.changeSubKeyboard('allNotShow');
            if (!HtmlTools.getHtml('.InputTip')) {
                InputManager.ac();
            }
            localStorage.setItem('currentMode', mode);
        }

        /**
         * @private
         * @static
         * @type {string}
         * @description 存储当前的输出模式。
         * '0' 代表代数式模式，'1' 代表极坐标式模式。
         * 这是一个私有静态字段，应通过 `printMode` 的 getter 和 setter 进行访问和修改。
         */
        static _printMode = '0';

        /**
         * @static
         * @type {string}
         * @description 获取当前的输出模式。
         */
        static get printMode() {
            return PageConfig._printMode;
        }

        /**
         * @static
         * @description 设置当前的输出模式，并更新 UI 以反映更改。
         * @param {string} mode - 要设置的新输出模式。必须是 '0' 或 '1'。
         * @throws {Error} 如果提供的模式不受支持，则抛出错误。
         */
        static set printMode(mode) {
            // 验证输入模式是否为支持的 '0' 或 '1'。
            if (!['0', '1'].includes(mode)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            // 从当前活动的打印模式按钮上移除高亮类。
            HtmlTools.getHtml(`#print_${PageConfig._printMode}`).classList.remove('SelectionOn');
            // 更新内部状态以反映新模式。
            PageConfig._printMode = mode;
            // 为新激活的打印模式按钮添加高亮类。
            HtmlTools.getHtml(`#print_${PageConfig._printMode}`).classList.add('SelectionOn');

            // 为计算核心设置输出模式
            // 线程同步更新主线程，保持一致性
            CalcConfig.globalPrintMode = mode === '0' ? 'algebra' : 'polar';

            // 将新模式保存到 localStorage，以便在下次加载时恢复状态。
            localStorage.setItem('printMode', mode);
        }

        /**
         * @private
         * @static
         * @type {number}
         * @description 存储当前键盘的“第二功能”（2nd）状态。
         * - `0`: 普通模式。
         * - `1`: 第二功能模式。
         * 这是一个私有静态字段，应通过 `keyboardType` 的 getter 和 setter 进行访问和修改，以确保 UI 和内部状态的同步。
         */
        static _keyboardType = 0;

        /**
         * @static
         * @type {number}
         * @description 获取当前键盘的“第二功能”状态。
         */
        static get keyboardType() {
            return PageConfig._keyboardType;
        }

        /**
         * @static
         * @description 设置键盘的“第二功能”状态，并动态更新子键盘上所有按钮的功能和显示。
         * 此 setter 负责：
         * 1. 验证输入的状态值。
         * 2. 遍历所有受影响的子键盘按钮。
         * 3. 根据 `keyboardsConfig` 中的映射，清除并重新生成每个按钮的显示内容（通常是代表函数名的图标）。
         * 4. 如果状态发生实际变化，触发 `_2nd_` 按钮的视觉状态切换。
         * 5. 将新的状态持久化到 `localStorage`。
         * @param {number} type - 要设置的新状态。`0` 代表普通模式，`1` 代表“第二功能”模式。
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
            // 验证输入的状态值是否有效。
            if (![0, 1].includes(type)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            // 获取所有需要根据“第二功能”状态动态更新的键盘按钮。
            const secondaryKeyboard = [...HtmlTools.getHtml('.SecondaryKeyboard', -1)];
            for (let i = 0; i < secondaryKeyboard.length; i++) {
                const index = secondaryKeyboard[i];
                // 清空按钮的当前内容，并根据新的状态和 `keyboardsConfig` 映射重新生成其显示。
                HtmlTools.appendDOMs(
                    index,
                    HtmlTools.textToHtmlClass(keyboardsConfig[i.toString()][type]),
                    {mode: 'replace'}
                );
            }
            // 如果状态确实发生了变化，则切换“2nd”按钮的视觉高亮状态。
            if (PageConfig._keyboardType !== type) {
                PageControlTools.changeSubKeyboard('_2nd_');
            }
            // 更新内部状态并将其保存到 localStorage。
            PageConfig._keyboardType = type;
            // 更新键盘
            PageControlTools.keyboardFuncBecomeX();
            localStorage.setItem('keyboardType', type.toString());
        }

        /**
         * @private
         * @static
         * @type {number}
         * @description 存储当前的计算精度模式。
         * - `0`: 普通精度模式，适用于快速计算。
         * - `1`: 高精度模式，用于需要更高准确性的科学计算。
         * 这是一个私有静态字段，应通过 `calcAccMode` 的 getter 和 setter 进行访问和修改。
         */
        static _calcAccMode = 0;

        /**
         * @static
         * @type {number}
         * @description 获取当前的计算精度模式。
         */
        static get calcAccMode() {
            return PageConfig._calcAccMode;
        }

        /**
         * @static
         * @description 设置计算精度模式，并相应地更新全局计算配置和 UI。
         * 此 setter 会：
         * 1. 验证输入的模式值。
         * 2. 根据所选模式（普通或高精度）更新 `CalcConfig` 中的 `globalCalcAccuracy` 和 `outputAccuracy`。
         * 3. 切换 UI 中精度开关的视觉状态。
         * 4. 更新内部状态并将其持久化到 `localStorage`。
         * @param {number} mode - 要设置的新精度模式。`0` 代表普通精度，`1` 代表高精度。
         * @throws {Error} 如果提供的 `mode` 不是 `0` 或 `1`，则抛出错误。
         */
        static set calcAccMode(mode) {
            // 验证输入模式是否有效。
            if (![0, 1].includes(mode)) {
                throw new Error('[PageConfig] Unsupported mode');
            }

            // 根据所选模式，从预定义的配置对象中获取精度设置，并更新全局计算配置。
            CalcConfig.globalCalcAccuracy = this[`ACC_MODE_${mode}`].globalCalcAccuracy;
            CalcConfig.outputAccuracy = this[`ACC_MODE_${mode}`].outputAccuracy;

            // 切换 UI 中精度开关的视觉状态。
            if (mode !== PageConfig._calcAccMode) {
                HtmlTools.getHtml('#switch_container').classList.toggle('Active');
            }
            // 更新内部状态。
            PageConfig._calcAccMode = mode;
            // 将新模式保存到 localStorage，以便在下次加载时恢复状态。
            localStorage.setItem('calcAccMode', mode.toString());
        }

        /**
         * @private
         * @static
         * @type {Object<string, string|Array<Array<string>>>}
         * @description 存储屏幕上各个输入区域的数据。
         * 键是区域的标识符（例如 '1' 代表统计模式的网格数据，'2_00' 代表函数定义模式的 f(x) 表达式），
         * 值是该区域的输入内容。对于统计模式，值是一个二维数组 `[[x1, y1], [x2, y2], ...]`。
         * 对于其他模式，值是表达式字符串。
         */
        static _screenData = {
            '1': [],
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
         * @static
         * @type {Object<string, string|Array<Array<string>>>}
         * @description 获取当前屏幕上所有输入区域的数据。
         * @returns {Object<string, string|Array<Array<string>>>} 包含所有屏幕输入数据的对象。
         */
        static get screenData() {
            return PageConfig._screenData;
        }

        /**
         * @static
         * @description 设置屏幕数据。
         * 此 setter 允许批量更新 `_screenData` 中的部分或全部字段。
         * 它会将传入对象 `data` 中的键值对合并到当前的 `_screenData` 中，但仅限于 `_screenData` 中已存在的键。
         * 更新后，新的状态会被立即持久化到 `localStorage`。
         * @param {Object<string, string|Array<Array<string>>>} data - 包含要更新的屏幕数据的对象。
         */
        static set screenData(data) {
            // 遍历传入数据的每个键值对
            Object.entries(data).forEach(([key, value]) => {
                // 仅当键在当前 _screenData 中存在时才更新，防止注入非法键
                if (key in PageConfig._screenData) {
                    PageConfig._screenData[key] = value;
                }
            });
            // 将更新后的 _screenData 序列化并保存到 localStorage
            localStorage.setItem('screenData', JSON.stringify(PageConfig._screenData));
        }

        /**
         * @static
         * @method setScreenData
         * @description 从 DOM 读取指定屏幕区域的当前输入内容，更新内部的 `_screenData` 状态，并将其持久化到 `localStorage`。
         * 此方法是连接用户界面输入和应用程序数据状态的关键环节。
         *
         * 它根据 `area` 参数或当前的计算器模式来确定要读取哪个屏幕区域：
         * - **统计模式 (area '1')**: 它会遍历数据网格 (`#grid_data`) 的每一行，提取 X 和 Y 值，并将它们作为一个二维数组存储在 `_screenData['1']` 中。
         * - **其他模式**: 它会找到对应的输入 `div` (例如 `#screen_input_inner_2_00`)，并将其内容（由代表字符的 `<p>` 元素组成）转换回文本字符串，然后存储在 `_screenData` 的相应键下。
         *
         * @param {string|null} [area=null] - 要更新的屏幕区域的标识符（例如 '1', '2_00'）。
         *   如果为 `null`，则根据当前模式和子模式自动确定区域。
         * @returns {void}
         */
        static setScreenData(area = null) {
            // 获取当前的主模式，以确定上下文。
            const currentMode = PageConfig.currentMode;
            // 确定要操作的屏幕区域的标识符 ('name')。
            let name;
            if (area) {
                // 如果显式提供了 area，则直接使用它。
                name = area;
            } else {
                // 否则，根据当前模式和子模式动态构造标识符。
                // 统计模式 '1' 是一个特例，它没有子模式标识符。
                name = currentMode === '1' ? '1' : currentMode + PageConfig.subModes[currentMode];
            }

            // --- 根据区域类型执行不同的数据提取逻辑 ---
            if (name !== '1') {
                // --- 路径 1: 非统计模式 (例如，函数表达式输入) ---
                // 从 DOM 中获取目标输入区域的元素。
                const target = HtmlTools.getHtml(`#screen_input_inner_${name}`);
                // 将该区域内的 DOM 元素（通常是 <p> 标签）的类名转换回文本字符串，并更新 _screenData。
                PageConfig._screenData[name] = HtmlTools.htmlClassToText(HtmlTools.getClassList(target));
            } else {
                // --- 路径 2: 统计模式 (数据网格) ---
                // 在更新之前，先清空旧的数组数据，以确保完全重写。
                PageConfig._screenData[name].length = 0;
                // 获取数据网格中的所有行元素。
                const gridData = HtmlTools.getHtml('#grid_data').children;
                const len = gridData.length;
                // 遍历每一行。
                for (let i = 0; i < len; i++) {
                    const targetFather = gridData[i];
                    // 获取 X 和 Y 值的单元格。
                    const targetX = targetFather.children[1];
                    const targetY = targetFather.children[2];
                    // 只有当行中至少有一个单元格有内容时，才处理该行。
                    if (!(targetX.children.length === 0 && targetY.children.length === 0)) {
                        // 将单元格内容从 DOM 类名转换回文本字符串。
                        const dataX = HtmlTools.htmlClassToText(HtmlTools.getClassList(targetX));
                        const dataY = HtmlTools.htmlClassToText(HtmlTools.getClassList(targetY));
                        // 将 [x, y] 对存储到 _screenData['1'] 数组中。
                        PageConfig._screenData[name][i] = [dataX, dataY];
                    }
                }
            }
            // 将更新后的 _screenData 对象序列化为 JSON 字符串，并保存到 localStorage。
            localStorage.setItem('screenData', JSON.stringify(PageConfig._screenData));
        }
    }

    /**
     * @class HtmlTools
     * @description 一个静态工具类，提供用于 HTML 页面与后端交互的函数和页面需要的基础函数。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class HtmlTools {
        /**
         * @private
         * @static
         * @type {Object<string, string>}
         * @description `_classNameConverterConfig` 的逆向映射。
         * 此对象是动态生成的，用于将 CSS 类名的一部分（例如 "plus"）转换回其原始的特殊字符（例如 "+"）。
         * 它主要由 `HtmlTools.htmlClassToText` 方法使用，以便从 DOM 元素的类名中重建原始的数学表达式字符串。
         */
        static _classNameConverterReverseConfig = Object.fromEntries(
            Object.entries(PageConfig.classNameConverterConfig).map(([k, v]) => [v, k])
        );

        /**
         * @private
         * @const {RegExp} _tokenizerRegex
         * @description 一个动态生成的正则表达式，用作词法分析器（tokenizer）。
         * 它通过一个立即调用函数表达式 (IIFE) 构建，以确保只在首次加载时编译一次，从而提高性能。
         *
         * 该正则表达式的逻辑是按优先级匹配以下三种模式：
         * 1. `(${symbolPattern})`: 第二个捕获组。匹配在 `HtmlTools._classNameConverterConfig` 中定义的任何一个特殊符号。
         *    `symbolPattern` 是一个由 `|` 分隔的、经过正则转义的符号列表（例如 `\+|\*|\/`）。
         * 2. `(\\[[^\\]]*\\])`: 第一个捕获组。匹配由方括号 `[]` 包围的任何内容（例如 `[toPolar]`）。
         *    这用于识别特殊的多字符标识符。
         * 3. `([\\s\\S])`: 第三个捕获组。这是一个备用模式，匹配任何单个字符，包括空白符。
         *    这确保了输入字符串中的每个字符都会被捕获为一个词法单元。
         *
         * `g` 标志确保正则表达式在全局范围内进行匹配，即找到所有匹配项，而不是在第一个匹配后停止。
         */
        static _tokenizerRegex = (() => { // IIFE 开始
            // 内部辅助函数：转义正则表达式中的特殊字符，以防止它们被解释为元字符。
            const escape = s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

            // 从配置中获取所有特殊符号，对它们进行转义，然后用 '|' (OR) 连接起来，形成一个匹配模式。
            const symbolPattern = Object.keys(PageConfig.classNameConverterConfig)
                .map(escape)
                .join('|');
            // 创建并返回最终的正则表达式对象。
            return new RegExp(`(${symbolPattern})|(\\[[^\\]]*\])|([\\s\\S])`, 'g');
        })(); // IIFE 结束

        /**
         * @constructor
         * @description HtmlTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 HtmlTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[HtmlTools] HtmlTools is a static class and should not be instantiated.');
        }

        /**
         * @static
         * @method getHtml
         * @description 根据选择器字符串和可选的索引获取一个或多个 HTML 元素。
         * 这是一个便捷的 DOM 查询工具函数，封装了常见的 `getElementById`、`getElementsByClassName` 和 `getElementsByTagName` 方法。
         * 选择器 `name` 的第一个字符决定了查询模式：
         * - `#` 开头：通过 ID 选择 (例如, '#my-id')。
         * - `.` 开头：通过类名选择 (例如, '.my-class')。
         * - 其他情况：通过标签名选择 (例如, 'div')。
         * @param {string} name - 选择器字符串。
         * @param {number} [index=0] - (可选) 当通过类名或标签名选择时，指定要返回的元素在 HTMLCollection 中的索引。默认为 0，即返回第一个匹配的元素。如果 `index` 为 -1，则返回包含所有匹配元素的 `HTMLCollection`。
         * @returns {HTMLElement | HTMLCollection | null} 匹配的 HTML 元素。如果 `index` 为 -1，则返回一个 `HTMLCollection`。如果未找到任何元素，则返回 `null`。
         */
        static getHtml(name, index = 0) {
            switch (name[0]) {
                // 如果选择器以 '#' 开头，则通过 ID 获取元素。
                case '#':
                    return document.getElementById(name.slice(1));
                // 如果选择器以 '.' 开头，则通过类名获取元素集合，并返回指定索引的元素。
                case '.':
                    if (index === -1) {
                        return document.getElementsByClassName(name.slice(1));
                    }
                    return document.getElementsByClassName(name.slice(1))[index];
                // 默认情况下，将选择器视为标签名，并返回指定索引的元素。
                default:
                    if (index === -1) {
                        return document.getElementsByTagName(name);
                    }
                    return document.getElementsByTagName(name)[index];
            }
        }

        /**
         * @static (获取类名列表)
         * @method getClassList
         * @description 遍历指定父元素的所有直接子节点，并返回一个包含它们类名或特殊标识符的数组。
         * 支持指定遍历范围（startIndex 和 endIndex）以提高处理局部 DOM 更新时的性能。
         *
         * @param {HTMLElement} area - 要检查其子元素的父 DOM 元素。
         * @param {object} [options={}] - (可选) 一个包含配置选项的对象。
         * @param {boolean} [options.onlyP=true] - (可选) 控制收集范围的布尔值。
         * - `true` (默认): 只收集 `<p>` 标签的子元素的 `className`。
         * - `false`: 收集所有直接子元素的 `className`。如果子元素没有类名，则会生成一个格式为 `[id]${child.id}` 的特殊标识符字符串。
         * @param {boolean} [options.ignoreSpace=false] - (可选) 控制是否提取代表空格的元素的类名 (`_space_`)。
         * - `true`: 跳过空格。
         * - `false` (默认): 收集空格。
         * @param {number} [options.startIndex=0] - (可选) 遍历的起始索引（包含）。默认为 0。
         * @param {number|null} [options.endIndex=null] - (可选) 遍历的结束索引（不包含）。如果不传或为 null，默认遍历到最后一个子元素。
         *
         * @returns {string[]} 一个包含所选子元素的类名或特殊标识符的字符串数组。
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
            // 初始化一个空数组，用于存储最终的类名或标识符列表。
            const classLists = [];

            // 获取 children 集合引用和总长度
            const children = area.children;
            const totalLen = children.length;

            // 计算安全的遍历范围
            // 1. 确保 start 不小于 0
            const validStart = Math.max(0, startIndex);
            // 2. 确保 end 不超过实际长度；如果未传入 endIndex (null/undefined)，则默认为总长度
            const validEnd = (endIndex !== null && endIndex !== undefined)
                             ? Math.min(endIndex, totalLen)
                             : totalLen;

            // 使用 for 循环进行指定范围的遍历 (替换了原有的 for...of 全量遍历)
            for (let i = validStart; i < validEnd; i++) {
                const child = children[i];
                let className;
                if (child.classList.contains('lazy-bg')) {
                    className = child.dataset.lazyBgClass;
                } else {
                    className = child.className;
                }

                // 根据 ignoreSpace 选项，决定是否跳过代表空格的元素。
                if (ignoreSpace && className === '_space_') {
                    continue;
                }

                // 根据 onlyP 选项，决定是只处理 <p> 标签还是处理所有标签。
                if (onlyP && child.tagName.toLowerCase() === 'p') {
                    // 如果只处理 <p> 标签，并且当前子元素是 <p>，则将其类名推入结果数组。
                    classLists.push(className);
                } else if (!onlyP) {
                    // 如果处理所有标签，则检查子元素是否有类名。
                    // 如果有，直接使用类名；如果没有，则使用其 ID 构造一个特殊的 `[id]...` 标识符。
                    classLists.push(className === '' ? `[id]${child.id}` : className);
                }
            }

            // 返回收集到的类名和标识符数组。
            return classLists;
        }

        /**
         * @static
         * @method textToHtmlClass
         * @description 将数学表达式或文本字符串转换为一个 CSS 类名数组。
         * 该方法作为一种词法分析器，用于将输入字符串分解为可识别的单元（token），
         * 并将每个单元映射到一个唯一的、用作 CSS 类名的字符串。
         * 这使得 HTML 能够通过为每个字符或符号应用带有特定背景图像的样式来视觉上渲染数学表达式。
         *
         * 转换规则如下：
         * 1. 对于由方括号 `[]` 包围的特殊多字符标识符（例如 `[toPolar]`），会提取括号内的内容并格式化为 `_toPolar_`。
         * 2. 对于在 `HtmlTools._classNameConverterConfig` 中定义的特殊单字符（例如 `+`, `*`），会将其转换为对应的名称，如 `_plus_`。
         * 3. 对于所有其他单个字符（字母、数字等），会直接将其本身作为类名的一部分，例如 `a` 变为 `_a_`。
         *
         * @param {string} text - 需要转换的原始文本或数学表达式字符串。
         * @returns {string[]} 一个包含格式化后 CSS 类名的数组。
         * @example
         * // 返回: ['_a_', '_plus_', '_sin_', '_parentheses_left_', '_x_mathit_', '_parentheses_right_']
         * HtmlTools.textToHtmlClass("a+sin(x)");
         */
        static textToHtmlClass(text) {
            const output = [];
            const config = PageConfig.classNameConverterConfig;

            const matches = text.matchAll(HtmlTools._tokenizerRegex);
            for (const match of matches) {
                const [, symbolGroup, bracketGroup, charGroup] = match;

                if (symbolGroup) {
                    // 查表
                    output.push(`_${config[symbolGroup]}_`);
                } else if (bracketGroup) {
                    // 去除首尾括号 [name] -> name
                    output.push(`_${bracketGroup.slice(1, -1)}_`);
                } else if (charGroup) {
                    // 单字符
                    output.push(`_${charGroup}_`);
                }
            }

            return output;
        }

        /**
         * @static
         * @method htmlClassToText
         * @description 将一个由 `textToHtmlClass` 方法生成的 CSS 类名数组转换回其原始的文本或数学表达式字符串。
         * 这是 `textToHtmlClass` 的逆向操作，用于从 DOM 元素的类名中重建表达式，例如在处理用户输入或从 DOM 读取表达式时。
         *
         * 转换规则如下：
         * 1. 移除每个类名的前缀和后缀 `_`。
         * 2. 使用 `HtmlTools._classNameConverterReverseConfig` 查找表将名称（如 "plus"）转换回其原始特殊字符（如 "+"）。
         * 3. 如果在查找表中找不到，且核心字符串长度为 1，则假定它是一个普通字符。
         * 4. 如果在查找表中找不到，且核心字符串长度大于 1，则假定它是一个由方括号 `[]` 包围的特殊标识符。
         *
         * @param {string[]} classArray - 一个包含 CSS 类名的数组，每个类名都应符合 `_token_` 的格式。
         * @returns {string} 重建后的原始文本字符串。
         * @example
         * // 返回: "a+sin(x)"
         * HtmlTools.htmlClassToText(['_a_', '_plus_', '_sin_', '_parentheses_left_', '_x_mathit_', '_parentheses_right_']);
         */
        static htmlClassToText(classArray) {
            const reverseConfig = HtmlTools._classNameConverterReverseConfig;

            return classArray.map(cls => {
                if (!cls.startsWith('_') || !cls.endsWith('_')) {
                    return cls === '[id]cursor' ? '[cursor]' : cls;
                }
                let core = cls.slice(1, -1);

                return reverseConfig[core] ||
                    (core.length === 1 ? core : `[${core}]`);
            }).join('');
        }

        /**
         * @static
         * @method appendDOMs
         * @description 高效地向指定的父元素批量添加或插入子元素。
         * @param {HTMLElement | string | DocumentFragment} parentElement - 目标父元素或其标识符。
         * @param {Array<string | string[]>} nameList - 属性值数组。可包含字符串或字符串数组（与 nameType 一一对应）。
         * @param {object} [options={}] - 配置选项。
         * @param {HTMLElement|null} [options.referenceNode=null] - 明确的参照插入节点。
         * @param {number} [options.index=-1] - 插入位置的子节点索引（当未指定 referenceNode 时生效）。
         * @param {string} [options.mode='add'] - 插入模式：
         * - `'add'`: (默认) 追加或插入元素。
         * - `'replace'`: 先清空父元素，再添加元素。
         * @param {string[]} [options.nameType=['class']] - 默认绑定的属性名数组，对应 nameList 中的子数组。
         * @param {string} [options.appendType='p'] - 要创建的 HTML 标签类型。
         */
        static appendDOMs(parentElement, nameList, {
            referenceNode = null,
            index = -1,
            mode = 'add',
            appendType = 'p',
            nameType = ['class']
        } = {}) {
            // 1. 获取并统一目标父元素
            const targetParent = typeof parentElement === 'string'
                                 ? HtmlTools.getHtml(parentElement)
                                 : parentElement;

            // 2. 健壮性检查
            if (!targetParent || !Array.isArray(nameList) || nameList.length === 0) {
                return;
            }

            // 清空父元素
            if (mode === 'replace') {
                InputManager.ac(parentElement);
            }

            const fragment = document.createDocumentFragment();

            // 4. 批量创建并组装 DOM
            for (const name of nameList) {
                // 过滤空值
                if (!name) {
                    continue;
                }

                const element = document.createElement(appendType);

                // 使用原生 Array.isArray，性能更好
                if (Array.isArray(name)) {
                    if (nameType.length !== name.length) {
                        throw new Error('[HtmlTools] The number of attribute names does not match the number of values.');
                    }
                    for (let i = 0; i < nameType.length; i++) {
                        element.setAttribute(nameType[i], name[i]);
                    }
                } else if (typeof name === 'string') {
                    // 业务逻辑：处理带有特殊前缀的字符串标识
                    if (name.startsWith('[id]')) {
                        element.id = name.slice(4);
                    } else if (name.startsWith('[class]')) {
                        element.className = name.slice(7);
                    } else {
                        element.setAttribute(nameType[0], name);
                    }
                }

                fragment.appendChild(element);
            }

            // 直接使用原生 API 判断 fragment 是否有子节点，替代手动布尔值标记
            if (!fragment.hasChildNodes()) {
                return;
            }

            // 5. 确定插入参照节点
            if (!referenceNode && index !== -1) {
                referenceNode = targetParent.children[index];
            }

            // 6. 统一插入逻辑（insertBefore 第二个参数为 null 时等同于 appendChild）
            targetParent.insertBefore(fragment, referenceNode || null);
        }

        /**
         * @static
         * @method deleteIllegal
         * @description 从表达式字符串或 CSS 类名数组中移除被视为“非法”或不需要的特定标记。
         * 当前实现专门用于移除表示乘法中点的符号 (`[cdot]` 或 `_cdot_`)。
         * 这在处理或显示表达式时非常有用，因为在某些上下文中，乘法是隐式的，不需要显式显示点。
         *
         * @param {string|string[]} expr - 要清理的输入。可以是：
         *   - 一个包含数学表达式的字符串，例如 "2[cdot]3"。
         *   - 一个由 `textToHtmlClass` 生成的 CSS 类名数组，例如 ['_2_', '_cdot_', '_3_']。
         * @returns {string|string[]} 清理后的字符串或数组，其中已移除了所有与 `cdot` 相关的标记。
         *
         * @example
         * // 从字符串中移除
         * HtmlTools.deleteIllegal("2[cdot]x"); // 返回 "2x"
         *
         * @example
         * // 从类名数组中移除
         * HtmlTools.deleteIllegal(['_a_', '_cdot_', '_b_']); // 返回 ['_a_', '_b_']
         */
        static deleteIllegal(expr) {
            // 定义要移除的目标标记的核心字符串。
            const deleteStrList = ['cdot', 'syntax_error'];
            // 检查输入是字符串还是数组，并执行相应的逻辑。
            if (typeof expr === 'string') {
                // 1. 按长度降序排序（防止 'google' 被 'go' 提前截断匹配）
                // 2. 转义正则特殊字符（防止关键词中有 + ? . 等导致报错）
                const sortedEscaped = deleteStrList
                    .sort((a, b) => b.length - a.length)
                    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

                // 3. 构造正则：生成类似于 /\[keyword1|keyword2|...\]/g 的正则
                const regex = new RegExp(`\\[(${sortedEscaped.join('|')})\\]`, 'g');

                // 4. 执行替换
                return expr.replace(regex, '');
            }

            // 如果是数组，则遍历它以构建一个不包含 `_cdot_` 的新数组。
            const resultList = [];
            const deleteClassList = deleteStrList.map(name => `_${name}_`);
            for (let i = 0; i < expr.length; i++) {
                const className = expr[i];
                // 如果当前类名不是 `_cdot_`...，则将其添加到结果数组中。
                if (!deleteClassList.includes(className)) {
                    resultList.push(className);
                }
            }
            return resultList;
        }

        /**
         * @static
         * @method getCurrentSubscreenArea
         * @description 获取当前在屏幕上处于活动状态的子输入区域的 DOM 元素。
         * 此方法根据当前的计算器模式 (PageConfig.currentMode) 和子模式 (PageConfig.subModes) 来确定哪个输入区域是活动的。
         * - 在统计模式 ('1') 下，它返回具有 '.GridOn' 类的单元格，即用户当前选中的数据网格单元。
         * - 在其他模式下，它会构造一个特定的 ID（例如 'screen_input_inner_2_00'）来查找并返回对应的输入区域 `<div>`。
         * @returns {HTMLElement|null} 当前活动的子屏幕输入区域的 DOM 元素，如果找不到则返回 null。
         */
        static getCurrentSubscreenArea() {
            const currentMode = PageConfig.currentMode;
            // 特殊处理统计模式 ('1')，其活动区域由 '.GridOn' 类标识。
            if (PageConfig.currentMode === '1') {
                return HtmlTools.getHtml('.GridOn');
            }

            // 对于所有其他模式，根据当前主模式和子模式构造目标元素的 ID。
            const targetName = `#screen_input_inner_${currentMode}${PageConfig.subModes[currentMode]}`;
            // 使用构造的 ID 获取并返回对应的 DOM 元素。
            return HtmlTools.getHtml(targetName);
        }

        /**
         * @static
         * @method scrollToView
         * @description 智能地滚动输入区域或数据网格，以确保光标或当前活动的单元格在视图中可见。
         * 此方法旨在提供比标准的 `element.scrollIntoView()` 更平滑、更上下文感知的滚动体验。
         * - 对于主输入区域，它会尝试同时将光标的左侧和右侧的“单词”带入视图，而不是简单地将光标本身滚动到边缘。
         * - 在特定模式下（如统计回归模式 '1'），它还会确保数据网格中当前高亮的单元格滚动到可见区域。
         * @returns {void}
         */
        static scrollToView() {
            // 1. 获取元素并进行安全检查
            const input = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');

            if (!input || !cursor) {
                return;
            }

            // 2. 检查光标是否在边缘（利用 DOM 属性直接判断，无需计算索引）
            const isAtStart = !cursor.previousElementSibling;
            const isAtEnd = !cursor.nextElementSibling;

            if (isAtStart || isAtEnd) {
                // 简单场景：直接滚动光标
                cursor.scrollIntoView({inline: 'nearest'});
            } else {
                // 3. 上下文感知滚动
                let [leftNum, rightNum] = InputManager.inputAreaMoveNum('both');

                // 限制最大上下文长度为 5
                leftNum = Math.min(leftNum, 5);
                rightNum = Math.min(rightNum, 5);

                // 3.1 向左寻找目标元素 (代替索引计算)
                let leftTarget = cursor;
                for (let i = 0; i < leftNum && leftTarget.previousElementSibling; i++) {
                    leftTarget = leftTarget.previousElementSibling;
                }

                // 3.2 向右寻找目标元素
                let rightTarget = cursor;
                for (let i = 0; i < rightNum && rightTarget.nextElementSibling; i++) {
                    rightTarget = rightTarget.nextElementSibling;
                }

                // 3.3 执行滚动
                // 先滚动左边界，再滚动右边界。'nearest' 会确保两个元素尽量都在视野内。
                // 如果屏幕太窄无法同时容纳，最后调用的（右侧）会优先对齐，这符合从左到右的阅读习惯。
                if (leftTarget !== cursor) {
                    leftTarget.scrollIntoView({inline: 'nearest'});
                }
                if (rightTarget !== cursor) {
                    rightTarget.scrollIntoView({inline: 'nearest'});
                }

                // 保底策略，确保光标可见。
                cursor.scrollIntoView({inline: 'nearest'});
            }

            // 4. 统计回归模式下的网格滚动
            if (PageConfig.currentMode === '1') {
                const activeCell = HtmlTools.getHtml('.GridOn');
                // 仅当元素存在时滚动
                activeCell?.scrollIntoView({block: 'nearest'});
            }
        }

        /**
         * @static
         * @method isScrolledToRight
         * @description 检测元素是否滚动到最右侧
         * @param {HTMLElement} element - 需要检测的 DOM 元素
         * @returns {boolean} - 如果到底则返回 true，否则返回 false
         */
        static isScrolledToRight(element) {
            if (!element) {
                return false;
            }

            const {scrollLeft, scrollWidth, clientWidth} = element;
            // scrollLeft + clientWidth 大于等于 scrollWidth - 1 (容错 1px)
            return scrollLeft + clientWidth >= scrollWidth - 1;
        }

        /**
         * @static
         * @method debounce
         * @description 防抖函数
         * @param {Function} func - 要执行的函数
         * @param {Number} wait - 等待时间 (毫秒)
         * @param {Object} options - 配置对象
         * @param {Boolean} [options.leading=false] - 指定在延迟开始前是否调用
         * @param {Boolean} [options.trailing=true] - 指定在延迟结束后是否调用
         * @param {Number} [options.maxWait] - 设置函数允许被延迟的最大值
         * @returns {Function} - 返回防抖处理后的函数
         */
        static debounce(func, wait, options = {}) {
            let lastArgs,
                lastThis,
                maxWait,
                result,
                timerId,
                lastCallTime;

            let lastInvokeTime = 0; // 上次真正执行 func 的时间
            let leading = false;
            let maxing = false; // 是否设置了 maxWait
            let trailing = true;

            // 1. 初始化配置
            wait = +wait || 0; // 转为数字
            if (isObject(options)) {
                leading = !!options.leading;
                maxing = 'maxWait' in options;
                // 如果设置了 maxWait，则最大等待时间必须大于 wait
                maxWait = maxing ? Math.max(+options.maxWait || 0, wait) : undefined;
                trailing = 'trailing' in options ? !!options.trailing : trailing;
            }

            // 辅助函数：判断是否是对象
            function isObject(value) {
                const type = typeof value;
                return value != null && (type === 'object' || type === 'function');
            }

            // 2. 真正执行 func 的函数
            function invokeFunc(time) {
                const args = lastArgs;
                const thisArg = lastThis;

                lastArgs = lastThis = undefined;
                lastInvokeTime = time;
                result = func.apply(thisArg, args);
                return result;
            }

            // 3. 开始定时器
            function startTimer(pendingFunc, wait) {
                return setTimeout(pendingFunc, wait);
            }

            // 4. 计算剩余等待时间
            function remainingWait(time) {
                const timeSinceLastCall = time - lastCallTime;
                const timeSinceLastInvoke = time - lastInvokeTime;
                const timeWaiting = wait - timeSinceLastCall;

                // 如果设置了 maxWait，通过比较 "剩余wait时间" 和 "剩余maxWait时间" 决定
                return maxing
                       ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
                       : timeWaiting;
            }

            // 5. 判断是否应该执行 func
            function shouldInvoke(time) {
                const timeSinceLastCall = time - lastCallTime;
                const timeSinceLastInvoke = time - lastInvokeTime;

                // 几种情况需要执行：
                // 1. 第一次调用
                // 2. 距离上次调用已经超过了 wait 时间 (正常防抖结束)
                // 3. 系统时间倒退 (极其罕见)
                // 4. 设置了 maxWait 并且距离上次真正执行早已超过 maxWait
                return (
                    lastCallTime === undefined ||
                    timeSinceLastCall >= wait ||
                    timeSinceLastCall < 0 ||
                    (maxing && timeSinceLastInvoke >= maxWait)
                );
            }

            // 6. 定时器回调
            function timerExpired() {
                const time = Date.now();
                if (shouldInvoke(time)) {
                    return trailingEdge(time);
                }
                // 如果没到时间，重置定时器
                timerId = startTimer(timerExpired, remainingWait(time));
            }

            // 7. 处理边界：Leading (开始边界)
            function leadingEdge(time) {
                // 重置 lastInvokeTime
                lastInvokeTime = time;
                // 开启定时器
                timerId = startTimer(timerExpired, wait);
                // 如果配置了 leading，则立即执行
                return leading ? invokeFunc(time) : result;
            }

            // 8. 处理边界：Trailing (结束边界)
            function trailingEdge(time) {
                timerId = undefined;

                // 只有在有参数并且配置了 trailing 时才执行
                // (lastArgs 存在意味着在 wait 期间有新的调用)
                if (trailing && lastArgs) {
                    return invokeFunc(time);
                }
                // 如果 args 为空，说明 leading 已经执行过了，且后续没有新调用
                lastArgs = lastThis = undefined;
                return result;
            }

            // 9. 取消功能
            function cancel() {
                if (timerId !== undefined) {
                    clearTimeout(timerId);
                }
                lastInvokeTime = 0;
                lastArgs = lastCallTime = lastThis = timerId = undefined;
            }

            // 10. 立即执行功能 (Flush)
            function flush() {
                return timerId === undefined ? result : trailingEdge(Date.now());
            }

            // 11. 判断当前是否有挂起的任务
            function pending() {
                return timerId !== undefined;
            }

            // 12. 返回的主函数
            function debounced(...args) {
                const time = Date.now();
                const isInvoking = shouldInvoke(time);

                lastArgs = args;
                lastThis = this;
                lastCallTime = time;

                if (isInvoking) {
                    // 如果没有定时器，说明是周期的开始 (Leading edge)
                    if (timerId === undefined) {
                        return leadingEdge(time);
                    }
                    // 如果设置了 maxWait，即使定时器存在，也要在 maxWait 到达时执行
                    if (maxing) {
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

            // 挂载工具方法
            debounced.cancel = cancel;
            debounced.flush = flush;
            debounced.pending = pending;

            return debounced;
        }
    }

    /**
     * @class AsyncListRenderer
     * @description 异步长列表渲染核心类。
     * 解决大数据量场景下单次渲染造成的主线程卡顿（掉帧）问题。
     *
     * 核心特性：
     * 1. 时间分片 (Time Slicing)：将巨量 DOM 挂载任务拆分到多个浏览器的渲染帧中。
     * 2. 懒加载 (Lazy Load)：内置 IntersectionObserver，支持图片/背景/动画的按需触发。
     * 3. 强行插入接管：内置 MutationObserver，自动监听并接管第三方组件库或业务代码强行插入容器的 DOM 节点。
     * 4. 任务控制：支持随时暂停 (pause)、恢复 (resume)、追加 (append) 和彻底终止 (stop)。
     *
     * 局限性说明：
     * 当前的时间分片 (Time Slicing) 机制虽解决了“单次挂载卡顿”问题，但当 DOM 节点总数突破 5000+ 时，
     * 驻留的庞大 DOM 树依然会导致严重的内存占用和滚动时的 Reflow (回流) 掉帧。
     */
    class AsyncListRenderer {
        /**
         * 实例化异步渲染器
         * @param {Object} options - 配置参数
         * @param {string} options.scrollSelector - 滚动容器的 CSS 选择器（作为 IntersectionObserver 的 root 边界）。
         * @param {string} options.containerSelector - 列表真实挂载容器的 CSS 选择器（如 <ul> 或 <tbody>）。
         * @param {function(any[]|{}, number): (HTMLElement|null|DocumentFragment)} options.rowRenderer - 行渲染函数，接收数据源和当前索引，需返回构建好的 DOM 节点。
         * @param {string} [options.lazyBgSelector='.lazy-bg[data-lazy-bg-class]'] - 触发懒加载的内部元素选择器。
         * @param {number} [options.timeSliceMs=14] - 每帧最大执行时间（毫秒），建议控制在 16.6ms 内以避免影响 60Hz 屏幕的刷新。
         * @param {number} [options.maxChunkSize=100] - 单帧最大允许渲染的节点数量阈值（双重保险，防止极小节点死循环）。
         * @param {string} [options.rootMargin='500px'] - 懒加载触发的缓冲区大小。
         */
        constructor(options) {
            // --- 基础配置 ---
            /** @type {string} */
            this._scrollSelector = options.scrollSelector;
            /** @type {string} */
            this._containerSelector = options.containerSelector;
            /** @type {function(any[], number): (HTMLElement|null|DocumentFragment)} */
            this._rowRenderer = options.rowRenderer;
            /** @type {string} */
            this._lazyBgSelector = options.lazyBgSelector || '.lazy-bg[data-lazy-bg-class]';

            // --- 性能调优参数 ---
            /** @type {number} */
            this._timeSliceMs = options.timeSliceMs || 14;
            /** @type {number} */
            this._maxChunkSize = options.maxChunkSize || 100;
            /** @type {string} */
            this._rootMargin = options.rootMargin || '500px';

            // --- 核心状态与观察者实例 ---
            /**
             * @type {IntersectionObserver|null}
             * @description 交叉观察器，用于元素进入可视区时的懒加载
             */
            this._observerInstance = null;
            /**
             * @type {MutationObserver|null}
             * @description DOM 变动观察器，用于监听容器内部的外部节点插入
             */
            this._mutationObserver = null;
            /**
             * @type {AbortController|null}
             * @description 中断控制器，用于 stopRender 时快速阻断后续 Promise 执行
             */
            this._abortController = null;
            /**
             * @type {WeakMap<Element, Element[]>}
             * @description 弱引用映射，建立 DOM 节点与其内部懒加载目标的映射，防止内存泄漏
             */
            this._lazyTargetsMap = new WeakMap();
            /**
             * @type {Promise<void>}
             * @description 记录当前正在执行的渲染任务 Promise 链，用于 append 时的队列排期
             */
            this._renderTask = Promise.resolve();

            // --- 暂停与恢复控制 ---
            /** @type {boolean} 当前是否处于暂停状态 */
            this._isPaused = false;
            /**
             * @type {Function|null}
             * @description 被挂起的渲染函数引用。当触发暂停时，保存下一帧本该执行的函数
             */
            this._resumeCallback = null;
        }

        /**
         * 获取数据源的长度或键数量
         * 作为内部辅助函数，兼容处理数组和对象类型的数据源，并对空值进行安全兜底。
         * * @private
         * @param {any[] | Object | null | undefined} data - 需要计算长度的数据源
         * @returns {number} 如果是数组则返回 length，如果是对象则返回 keys 的数量，空值返回 0
         */
        _getLength(data) {
            return Array.isArray(data) ? data.length : Object.keys(data || {}).length;
        }

        /**
         * 创建用于背景图、动态类名懒加载的 IntersectionObserver
         * @private
         * @returns {IntersectionObserver|null} 观察器实例或 null（找不到滚动容器时）
         */
        _createLazyObserver() {
            const bigContainer = document.querySelector(this._scrollSelector);
            if (!bigContainer) {
                return null;
            }

            return new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    let isVisible = entry.isIntersecting;

                    // 过滤水平方向的移出判定
                    // 如果原生判定为不可见，且拿得到根节点边界信息，进行垂直维度的二次校验
                    if (!isVisible && entry.rootBounds) {
                        const rect = entry.boundingClientRect;
                        const rootRect = entry.rootBounds;

                        // 动态解析 rootMargin 的垂直安全距离（兼容百分比和像素）
                        let marginY = 0;
                        if (typeof this._rootMargin === 'string') {
                            marginY = this._rootMargin.includes('%') ?
                                      marginY = rootRect.height * (parseFloat(this._rootMargin) / 100) :
                                      marginY = parseFloat(this._rootMargin) || 0;
                        }

                        // 只判断垂直方向是否仍在视口/缓冲区内
                        const isVerticallyInView = (rect.bottom >= rootRect.top - marginY) &&
                            (rect.top <= rootRect.bottom + marginY);

                        // 如果垂直方向还在安全区，证明仅仅是水平方向移出去了，强制保持可见状态
                        if (isVerticallyInView) {
                            isVisible = true;
                        }
                    }

                    let targetElements;

                    // 1. 判断该节点是否已经被 WeakMap 记录过（用 .has 判断）
                    if (!this._lazyTargetsMap.has(entry.target)) {
                        targetElements = [];

                        // 2. 如果没记录过，且是外部强插的节点，现场查一次 DOM
                        if (entry.target.dataset?.asyncInternal !== 'true') {
                            const lazyNodes = Array.from(entry.target.querySelectorAll(this._lazyBgSelector));
                            if (entry.target.matches?.(this._lazyBgSelector)) {
                                lazyNodes.push(entry.target);
                            }
                            targetElements.push(...lazyNodes);
                        }

                        // 3. 无论查到几个懒加载节点（哪怕是 0 个），都作为结果缓存进去
                        this._lazyTargetsMap.set(entry.target, targetElements);
                    } else {
                        // 4. 命中缓存，直接取值
                        targetElements = this._lazyTargetsMap.get(entry.target);
                    }

                    targetElements.forEach(el => {
                        const bgClassAttr = el.getAttribute('data-lazy-bg-class');
                        if (!bgClassAttr) {
                            return;
                        }

                        const bgClasses = bgClassAttr.split(' ').filter(Boolean);
                        if (bgClasses.length > 0) {
                            if (isVisible) {
                                el.classList.add(...bgClasses);
                            } else {
                                el.classList.remove(...bgClasses);
                            }
                        }
                    });
                });
            }, {
                root: bigContainer,
                rootMargin: `${this._rootMargin} 2000%`,
                threshold: 0
            });
        }

        /**
         * @private
         * @param {HTMLElement} container - 需要被深度监听的挂载容器
         * @description 启动 MutationObserver 监听，接管任何非内部流程生成的 DOM 节点，
         * 并负责清理被删除节点的监听以防止内存泄漏。
         */
        _startDOMWatcher(container) {
            if (this._mutationObserver) {
                this._mutationObserver.disconnect();
            }

            this._mutationObserver = new MutationObserver((mutationsList) => {
                if (!this._observerInstance) {
                    return;
                }

                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {

                        // 1. 处理新增节点（接管外部强插节点）
                        if (mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === 1 && node.dataset.asyncInternal !== 'true') {
                                    this._observerInstance?.observe(node);
                                }
                            });
                        }

                        // 2. 处理被删除的节点，切断强引用防止内存泄漏
                        if (mutation.removedNodes.length > 0) {
                            mutation.removedNodes.forEach(node => {
                                if (node.nodeType === 1) {
                                    // 解除节点本身的观察并清理 Map
                                    this._observerInstance?.unobserve(node);
                                    this._lazyTargetsMap.delete(node);
                                }
                            });
                        }
                    }
                }
            });

            // 开启深层监听 (subtree: true)
            this._mutationObserver.observe(container, {childList: true, subtree: true});
        }

        /**
         * 核心渲染引擎：利用 requestAnimationFrame 配合时间分片处理 DOM 挂载
         * @private
         * @param {HTMLElement} container - 目标挂载容器
         * @param {any[]} dataSource - 完整数据源
         * @param {number} startIndex - 批次渲染的起始索引
         * @param {number} endIndex - 批次渲染的结束索引
         * @param {AbortSignal} signal - 任务终止信号
         * @param {string|HTMLElement|null} [insertTarget=null] - 插入基准节点（如有，则使用 insertBefore）
         * @returns {Promise<void>} 渲染全部完成时 resolve
         */
        _batchRender(container, dataSource, startIndex, endIndex, signal, insertTarget = null) {
            return new Promise((resolve, reject) => {
                let index = startIndex;
                let rafId = null;

                if (signal?.aborted) {
                    return reject(new DOMException('[AsyncListRenderer] Rendering aborted initially.', 'AbortError'));
                }

                const abortHandler = () => {
                    if (rafId !== null) {
                        cancelAnimationFrame(rafId);
                    }
                    reject(new DOMException('[AsyncListRenderer] Rendering aborted during process.', 'AbortError'));
                };
                signal.addEventListener('abort', abortHandler, {once: true});

                const renderNextBatch = () => {
                    if (signal?.aborted) {
                        return;
                    }

                    if (this._isPaused) {
                        this._resumeCallback = renderNextBatch;
                        return;
                    }

                    // 必须使用当前回调真实开始执行的时间，防止被同帧内的其他任务“偷拍”时间。
                    const frameStartTime = performance.now();
                    let renderedInThisFrame = 0;

                    const fragment = document.createDocumentFragment();
                    const elementsToObserve = [];

                    try {
                        while (
                            index < endIndex &&
                            renderedInThisFrame < this._maxChunkSize &&
                            performance.now() - frameStartTime < this._timeSliceMs &&
                            !signal.aborted
                            ) {
                            const rowDOM = this._rowRenderer(dataSource, index);
                            // 在 _batchRender 的 while 循环中处理 rowDOM 时：
                            if (rowDOM) {
                                let topLevelElements = [];

                                if (rowDOM.nodeType === 1) { // 普通元素
                                    topLevelElements = [rowDOM];
                                } else if (rowDOM.nodeType === 11) { // DocumentFragment
                                    // 提取 Fragment 中所有的顶级 Element
                                    topLevelElements = Array.from(rowDOM.children);
                                }

                                topLevelElements.forEach(el => {
                                    const lazyElements = Array.from(el.querySelectorAll(this._lazyBgSelector));
                                    if (el.matches(this._lazyBgSelector)) {
                                        lazyElements.push(el);
                                    }

                                    if (lazyElements.length > 0) {
                                        this._lazyTargetsMap.set(el, lazyElements);
                                        elementsToObserve.push(el);
                                    }
                                    // 标记为内部节点
                                    el.dataset.asyncInternal = 'true';
                                });

                                fragment.appendChild(rowDOM);
                            }
                            index++;
                            renderedInThisFrame++;
                        }
                    } catch (error) {
                        // 捕获 rAF 内部错误，释放 Promise 并清理监听
                        signal.removeEventListener('abort', abortHandler);
                        reject(error);
                        return;
                    }

                    // 将本帧攒好的节点一次性挂载到真实 DOM 树
                    if (insertTarget) {
                        const refNode = typeof insertTarget === 'string'
                                        ? container.querySelector(insertTarget)
                                        : insertTarget;
                        if (refNode && refNode.parentNode === container) {
                            container.insertBefore(fragment, refNode);
                        } else {
                            container.appendChild(fragment);
                        }
                    } else {
                        container.appendChild(fragment);
                    }

                    if (this._observerInstance && elementsToObserve.length > 0) {
                        // 使用 queueMicrotask 替代 requestAnimationFrame
                        // 微任务会在当前宏任务（即本次 rAF 的渲染工作）和 UI 重绘之间执行。
                        // 这样既能保证 Observer 绑定及时，又不会导致过多的 rAF 嵌套，减轻调度引擎负担。
                        queueMicrotask(() => {
                            if (signal?.aborted) {
                                return;
                            }
                            elementsToObserve.forEach(el => {
                                if (this._observerInstance && el.isConnected) {
                                    this._observerInstance.observe(el);
                                }
                            });
                        });
                    }

                    // 测试稳定后移除 console，频繁的 I/O 也会影响极端情况下的性能
                    // if (renderedInThisFrame > 0) {
                    //     console.log(`[AsyncListRenderer] Frame took ${(performance.now() - frameStartTime).toFixed(2)}ms; rendered ${renderedInThisFrame} node(s) (${index}/${endIndex}).`);
                    // }

                    // 调度下一帧
                    if (index < endIndex) {
                        rafId = requestAnimationFrame(renderNextBatch);
                    } else {
                        signal.removeEventListener('abort', abortHandler);
                        resolve();
                    }
                };

                // 立即同步启动第一批渲染
                renderNextBatch();
            });
        }

        /**
         * 开始全量渲染（会清空容器现存内容）
         * @async
         * @param {any[]|{}} dataSource - 列表数据源
         * @param {number} [totalCount] - 限制最大渲染数量，默认为 dataSource.length
         * @returns {Promise<void>} 渲染完成的 Promise
         */
        async startRender(dataSource, totalCount) {
            // 先停掉上一轮可能还在执行的旧任务
            this.stopRender();

            const container = document.querySelector(this._containerSelector);
            if (!container) {
                console.warn(`[AsyncListRenderer] The specified container cannot be found: ${this._containerSelector}`);
                return Promise.resolve();
            }

            this._observerInstance = this._createLazyObserver();
            this._startDOMWatcher(container);

            this._abortController = new AbortController();
            const signal = this._abortController.signal;

            // 原生高效清空容器
            container.replaceChildren();

            const count = totalCount ?? this._getLength(dataSource);
            if (typeof count !== 'number' || count <= 0) {
                return Promise.resolve();
            }

            // 将渲染任务赋给 this._renderTask 形成队列
            this._renderTask = this._batchRender(container, dataSource, 0, count, signal).catch(err => {
                if (err?.name !== 'AbortError') {
                    console.error(err);
                }
            });

            return this._renderTask;
        }

        /**
         * 追加渲染：在不清理现有节点的情况下，向列表尾部或指定位置追加新内容
         * 任务会自动链式调用排队，确保渲染顺序正确
         * @async
         * @param {any[]|{}} dataSource - 列表数据源
         * @param {Object} [options={}] - 追加配置项
         * @param {number} [options.startIndex=0] - 提取 dataSource 时的起始索引
         * @param {number} [options.appendCount] - 需要追加的数据量
         * @param {string|HTMLElement|Element|null} [options.insertTarget=null] - 指定插入位置的参考节点
         * @returns {Promise<void>}
         */
        async appendRender(dataSource, options = {}) {
            const {startIndex = 0, appendCount, insertTarget = null} = options;

            if (!this._abortController) {
                this._abortController = new AbortController();
            }
            const signal = this._abortController.signal;

            // 利用 Promise 链确保上一次渲染或追加结束后，才执行本次追加
            this._renderTask = this._renderTask.then(async () => {
                if (signal.aborted) {
                    return;
                }

                const count = appendCount ?? (this._getLength(dataSource) - startIndex);
                const endIndex = startIndex + count;

                const freshContainer = document.querySelector(this._containerSelector);
                if (!freshContainer) {
                    return;
                }

                // Observer 健康度检查：如果根容器丢失，则销毁重建
                if (this._observerInstance && this._observerInstance.root && !this._observerInstance.root.isConnected) {
                    this._observerInstance.disconnect();
                    this._observerInstance = null;
                }
                if (!this._observerInstance) {
                    this._observerInstance = this._createLazyObserver();
                    this._startDOMWatcher(freshContainer);

                    // 1. 获取容器内所有已被标记为内部渲染的顶层节点
                    const legacyNodes = freshContainer.querySelectorAll('[data-async-internal="true"]');

                    legacyNodes.forEach(node => {
                        // 2. 利用 WeakMap 过滤：只有存在懒加载目标的节点才重新 observe
                        // 这样既恢复了监听，又避免了将没有懒加载需求的纯文本节点误加进去浪费性能
                        if (this._lazyTargetsMap.has(node)) {
                            this._observerInstance.observe(node);
                        }
                    });
                }

                await this._batchRender(freshContainer, dataSource, startIndex, endIndex, signal, insertTarget);
            }).catch(err => {
                if (err?.name !== 'AbortError') {
                    console.error(err);
                }
            });

            return this._renderTask;
        }

        /**
         * 暂停当前正在执行的时间分片渲染任务。
         * 渲染会在当前帧结束后挂起，并且不会销毁容器节点和所有的监听器。
         * 常用于为优先级更高的用户交互（如高频拖拽、动画）让出主线程。
         */
        pauseRender() {
            this._isPaused = true;
        }

        /**
         * 恢复之前被 pauseRender 暂停的渲染任务。
         * 采用无缝唤醒机制，任务将紧接着暂停前的那个索引继续渲染。
         */
        resumeRender() {
            if (!this._isPaused) {
                return;
            }

            this._isPaused = false;

            // 提取被封存的渲染函数上下文，并重新扔进 rAF 调度队列
            if (this._resumeCallback) {
                const callback = this._resumeCallback;
                this._resumeCallback = null;
                requestAnimationFrame(callback);
            }
        }

        /**
         * 硬终止渲染。
         * 彻底抛弃当前进行中的所有渲染任务、清理内存并注销所有 Observer 监听。
         * 容器内的已有节点会保留，但不会再继续渲染新节点。
         */
        stopRender() {
            if (this._abortController) {
                this._abortController.abort();
                this._abortController = null;
            }
            if (this._observerInstance) {
                this._observerInstance.disconnect();
                this._observerInstance = null;
            }
            if (this._mutationObserver) {
                this._mutationObserver.disconnect();
                this._mutationObserver = null;
            }

            // 重置暂停状态机
            this._isPaused = false;
            this._resumeCallback = null;

            // 将主任务队列置为空 Promise，防止旧任务阻塞未来的 startRender
            this._renderTask = Promise.resolve();
        }
    }

    /**
     * @class VirtualScroll
     * @description 虚拟滚动控制器。
     * * 核心思路：仅渲染当前视口附近的少量 DOM 节点，通过上下两个占位 spacer
     *   撑开滚动容器，从而在数百万条数据下保持流畅滚动。
     * * 支持超长列表（超过浏览器单元素 12 MB 高度限制）的"高度压缩"模式。
     * * 内置状态机（IDLE → RUNNING ⇄ PAUSED → DESTROYED），防止非法调用。
     * * 通过 ResizeObserver（或 window.resize 降级）自动响应容器尺寸变化。
     *
     * @example
     * // 基础用法
     * const vs = new VirtualScroll({
     *   container: '#list',
     *   renderItem: (index, data) => `<div class="item">${data[index]}</div>`,
     * });
     * vs.load(myArray, myArray.length);
     */
    class VirtualScroll {

        /* ══════════════════════════════════════════════════════════════════════
           内部辅助类
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @class VirtualScroll._StateMachine
         * @description 有限状态机（FSM）辅助类。
         * * 通过转换表约束合法的状态跳转，非法跳转将抛出异常。
         * * 支持可选的转换回调，便于外部监听状态变化。
         *
         * @example
         * // 创建一个简单的状态机
         * const sm = new VirtualScroll._StateMachine('idle', {
         *   idle:    ['running'],
         *   running: ['paused', 'idle'],
         *   paused:  ['running', 'idle'],
         * }, (prev, next) => console.log(`${prev} → ${next}`));
         * sm.transition('running'); // 'idle → running'
         */
        static _StateMachine = class {

            /**
             * @constructor
             * @param {string} initial - 初始状态名称。
             * @param {Object.<string, string[]>} table
             *   状态转换表，键为当前状态，值为允许跳转的目标状态数组。
             * @param {((prev: string, next: string) => void) | null} [onTransition=null]
             *   状态发生转换时的回调函数，参数依次为前一状态和新状态；可为 `null`。
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
             * @description 当前状态名称（只读）。
             * @type {string}
             * @readonly
             */
            get state() {
                return this._state;
            }

            /**
             * @method transition
             * @description 将状态机切换到指定的下一个状态。
             * * 若目标状态不在当前状态的允许列表中，将抛出 `Error`。
             * * 切换成功后会触发构造时传入的 `onTransition` 回调。
             *
             * @param {string} next - 目标状态名称，必须在转换表中合法定义。
             * @throws {Error} 当前状态没有转换表条目，或目标状态不被允许时抛出。
             * @example
             * sm.transition('running');
             * sm.transition('paused');
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
                        `[StateMachine] Illegal transition: "${this._state}" → "${next}". ` +
                        `Allowed: ${[...allowed].join(', ') || '(none)'}`
                    );
                }
                const prev = this._state;
                this._state = next;
                this._onTransition?.(prev, next);
            }

            /**
             * @method is
             * @description 检查当前状态是否是给定状态之一。
             *
             * @param {...string} states - 一个或多个待比对的状态名称。
             * @returns {boolean} 若当前状态命中其中任一，则返回 `true`。
             * @example
             * sm.is('running', 'paused'); // true / false
             */
            is(...states) {
                return states.includes(this._state);
            }
        };

        /**
         * @class VirtualScroll._HeightMapper
         * @description 高度映射器。
         * * 当列表总高度超过浏览器单元素高度上限（{@link _HeightMapper.MAX_ELEMENT_HEIGHT}，
         *   约 12 MB px）时，自动进入"压缩模式"：
         *   - 物理滚动高度固定为 `MAX_ELEMENT_HEIGHT`；
         *   - 通过 `scrollRatio` 在物理坐标与虚拟坐标之间线性映射。
         * * 不压缩时，虚拟坐标与物理坐标完全相同（ratio = 1）。
         *
         * @example
         * const hm = new VirtualScroll._HeightMapper();
         * hm.update(1_000_000, 50, 800); // totalCount=1M, itemHeight=50px, clientHeight=800px
         * hm.compressed; // true（总高 50M px > 12M px 上限）
         */
        static _HeightMapper = class {

            /**
             * @static
             * @description 浏览器单个元素允许的最大像素高度（约 12,000,000 px）。
             * 超过此值将触发压缩模式。
             * @type {number}
             */
            static MAX_ELEMENT_HEIGHT = 12_000_000;

            /**
             * @constructor
             * @description 创建高度映射器并初始化所有状态。
             */
            constructor() {
                this.reset();
            }

            /**
             * @method reset
             * @description 将所有映射状态重置为初始值（无压缩、ratio = 1）。
             * @returns {void}
             */
            reset() {
                /** @type {number} 虚拟总高度（px），等于 totalCount * itemHeight。 */
                this.virtualHeight = 0;

                /** @type {number} 物理总高度（px），压缩时上限为 MAX_ELEMENT_HEIGHT。 */
                this.physicalHeight = 0;

                /** @type {number} 物理滚动量 → 虚拟滚动量的换算比率（压缩时 > 1）。 */
                this.scrollRatio = 1;

                /** @type {boolean} 是否处于压缩模式。 */
                this.compressed = false;

                /**
                 * @type {number}
                 * 由 update() 持久化的容器可视高度（px）。
                 * physicalToVirtual / virtualToPhysical 使用此值保证跨调用一致性。
                 */
                this.clientHeight = 0;

                /**
                 * @type {number}
                 * 有效物理滚动范围 = max(1, physicalHeight - clientHeight)。
                 * 由 update() 统一计算，供 physicalToVirtual / virtualToPhysical 共享，
                 * 确保两个方向的转换使用完全相同的分母，互为精确逆运算。
                 */
                this._effP = 1;

                /**
                 * @type {number}
                 * 有效虚拟滚动范围 = max(0, virtualHeight - clientHeight)。
                 * 由 update() 统一计算，供 physicalToVirtual / virtualToPhysical 共享。
                 */
                this._effV = 0;
            }

            // ─────────────────────────────────────────────────────────────────────────
            // 内部工具
            // ─────────────────────────────────────────────────────────────────────────

            /**
             * @private
             * @method _positionToPhysical
             * @description 将虚拟文档流坐标（非 scrollTop）线性映射到物理文档流坐标。
             * 与 virtualToPhysical 的区别：不 clamp 到 scrollTop 上限，
             * 因为 spacer 位置可以合法地落在 (physicalHeight - clientHeight, physicalHeight] 区间。
             *
             * @param {number} virtualOffset - 虚拟文档中的绝对坐标（px）。
             * @returns {number} 物理文档中的绝对坐标（px）。
             */
            _positionToPhysical(virtualOffset) {
                if (!this.compressed || this.virtualHeight <= 0) {
                    return virtualOffset;
                }
                return virtualOffset * (this.physicalHeight / this.virtualHeight);
            }

            // ─────────────────────────────────────────────────────────────────────────
            // 公开 API
            // ─────────────────────────────────────────────────────────────────────────

            /**
             * @method update
             * @description 根据最新数据重新计算虚拟 / 物理高度及滚动比率。
             *
             * 修复点：
             * 1. 持久化 clientHeight，供后续转换方法共享，避免 resize 竞态。
             * 2. 统一计算并持久化 _effP / _effV，消除 update / physicalToVirtual /
             *    virtualToPhysical 三处分别计算时保护值不一致的问题。
             * 3. _effP 统一使用 max(1, ...) 保证分母非零；
             *    scrollRatio 由 _effV / _effP 得出，与 virtualToPhysical 完全对称。
             *
             * 比率公式：scrollRatio = effV / effP
             * 确保：physicalToVirtual(virtualToPhysical(v)) === v（在浮点精度内）
             *
             * @param {number} totalCount   - 列表总条数。
             * @param {number} itemHeight   - 单条目高度（px）。
             * @param {number} clientHeight - 容器可视高度（px）。
             * @returns {void}
             *
             * @example
             * hm.update(100_000, 50, 600);
             * console.log(hm.compressed);  // false（总高 5 000 000 < 12 000 000）
             * console.log(hm.scrollRatio); // 1
             */
            update(totalCount, itemHeight, clientHeight) {
                const MAX = VirtualScroll._HeightMapper.MAX_ELEMENT_HEIGHT;

                this.virtualHeight = totalCount * itemHeight;
                this.compressed = this.virtualHeight > MAX;
                this.physicalHeight = this.compressed ? MAX : this.virtualHeight;
                this.clientHeight = clientHeight;

                const rawEffV = this.virtualHeight - clientHeight;
                const rawEffP = this.physicalHeight - clientHeight;

                if (rawEffP <= 0) {
                    // ── 物理高度不超过容器：无可滚动空间 ──────────────────────────────
                    // 无论 rawEffV 多大，物理上都无法滚动，强制两者归零保持一致性
                    this._effV = 0;
                    this._effP = 0;          // 不强制置 1
                    this.scrollRatio = 1;         // ratio 无意义，置 1 作为安全默认值
                } else {
                    // ── 正常可滚动状态 ────────────────────────────────────────────────
                    this._effV = Math.max(0, rawEffV);
                    this._effP = rawEffP;    // rawEffP > 0，无需 max(1,...) 保护
                    this.scrollRatio = this.compressed ? this._effV / this._effP : 1;
                }
            }

            /**
             * @method physicalToVirtual
             * @description 将物理 scrollTop 换算为虚拟 scrollTop。
             *
             * 修复点：
             * - 使用持久化的 _effV / _effP（与 update 和 virtualToPhysical 完全一致）。
             * - 结果 clamp 到 [0, _effV]，防止因浮点误差或越界 scrollTop 产生非法值。
             *
             * @param {number} physicalScroll - 物理 scrollTop（px），应 ≥ 0。
             * @returns {number} 对应的虚拟滚动偏移量（px）。
             *
             * @example
             * const virtScroll = hm.physicalToVirtual(container.scrollTop);
             */
            physicalToVirtual(physicalScroll) {
                if (!this.compressed) {
                    return Math.max(0, physicalScroll);
                }
                if (this._effP <= 0) {
                    // 物理上无滚动空间，恒返回 0
                    return 0;
                }

                // scrollRatio = _effV / _effP，与 virtualToPhysical 互为逆运算
                const raw = Math.max(0, physicalScroll) * this.scrollRatio;
                return Math.min(this._effV, raw);
            }

            /**
             * @method virtualToPhysical
             * @description 将虚拟 scrollTop 换算为物理 scrollTop。
             *
             * 修复点：
             * - 使用持久化的 _effV / _effP，与 update 和 physicalToVirtual 完全对称。
             * - _effV 为 0 时（内容不足一屏）直接返回 0，避免除零。
             * - _effP 保证 ≥ 1（由 update 确保），此处无需再做保护。
             * - 结果 clamp 到 [0, _effP]。
             *
             * @param {number} virtualOffset - 虚拟偏移量（px），应 ≥ 0。
             * @returns {number} 对应的物理滚动偏移量（px）。
             *
             * @example
             * container.scrollTop = hm.virtualToPhysical(index * itemHeight);
             */
            virtualToPhysical(virtualOffset) {
                if (!this.compressed) {
                    return Math.max(0, virtualOffset);
                }
                if (this._effV <= 0) {
                    // 内容高度 ≤ 容器高度，无需滚动
                    return 0;
                }

                // _effP > 0 由 update() 保证（_effV>0 时 _effP 必然 >0）
                const raw = Math.max(0, virtualOffset) * (this._effP / this._effV);
                return Math.min(this._effP, raw);
            }

            /**
             * @method calcSpacerHeights
             * @description 计算上下两个占位 spacer 的物理高度。
             *
             * 修复点：
             * 1. 底部 spacer 改用 Math.ceil 取整，补偿顶部 floor 引入的向下偏差，
             *    使三段之和（top spacer + 渲染条目 + bottom spacer）尽可能等于
             *    physicalHeight，消除累积误差导致的底部留白或溢出。
             * 2. 非压缩模式逻辑不变，保持原始精度（整数 itemHeight 无误差）。
             *
             * @param {number} start        - 当前渲染窗口起始索引（含）。
             * @param {number} end          - 当前渲染窗口结束索引（不含）。
             * @param {number} totalCount   - 列表总条数。
             * @param {number} itemHeight   - 单条目高度（px）。
             * @returns {{ top: number, bottom: number }} 上下 spacer 应设置的像素高度。
             *
             * @example
             * const { top, bottom } = hm.calcSpacerHeights(50, 80, 10_000, 50);
             * spacerTop.style.height    = `${top}px`;
             * spacerBottom.style.height = `${bottom}px`;
             */
            calcSpacerHeights(start, end, totalCount, itemHeight) {
                if (totalCount <= 0 || itemHeight <= 0) {
                    return {top: 0, bottom: 0};
                }

                if (!this.compressed) {
                    return {
                        top: start * itemHeight,
                        bottom: Math.max(0, (totalCount - end) * itemHeight)
                    };
                }

                // ── 压缩模式 ──────────────────────────────────────────────────────────
                // _positionToPhysical：全程线性映射，不 clamp，
                // 因为 spacer 是文档流坐标，不是 scrollTop。
                const physTop = this._positionToPhysical(start * itemHeight);
                const physEnd = this._positionToPhysical(end * itemHeight);

                // 底部用 ceil 补偿顶部 floor 的向下偏差，减少累积误差
                const physBottom = Math.max(0, this.physicalHeight - physEnd);

                return {
                    top: Math.floor(physTop),
                    bottom: Math.ceil(physBottom)
                };
            }
        };

        /**
         * @class VirtualScroll._NodePool
         * @description DOM 节点对象池。
         * * 复用由 `renderItem()` 返回 HTML 字符串时创建的包装 `<div>`，
         *   减少 GC 压力和 DOM 创建开销。
         * * 对用户直接返回的 `HTMLElement` 实例维护引用计数，
         *   防止同一元素被重复挂载。
         * * 池容量上限由构造参数 `limit` 控制。
         *
         * @example
         * const pool = new VirtualScroll._NodePool(100);
         * const el = pool.toElement('<span>hello</span>');
         * pool.recycle(el); // 归还至池
         */
        static _NodePool = class {

            /**
             * @constructor
             * @param {number} limit - 池的最大容量（超出后多余节点直接丢弃）。
             */
            constructor(limit) {
                /** @type {number} 池容量上限。 */
                this._limit = limit;

                /** @type {HTMLElement[]} 可复用的包装元素队列。 */
                this._pool = [];

                /** @type {Set<HTMLElement>} 当前由池管理的包装元素集合。 */
                this._wrapperSet = new Set();

                /** @type {Map<HTMLElement, number>} 用户返回的原生元素 → 当前挂载引用计数。 */
                this._userRefCnt = new Map();
            }

            /**
             * @method toElement
             * @description 将 `renderItem()` 的返回值规范化为一个 `HTMLElement`。
             * * 若返回值是字符串，则从池中取出（或新建）包装 `<div>`，
             *   将字符串赋给 `innerHTML`。
             * * 若返回值是 `HTMLElement`，直接使用，同时检查重复挂载。
             * * `measureOnly = true` 时仅用于临时测量，不更新池状态和引用计数。
             *
             * @param {string | HTMLElement} result     - `renderItem()` 的返回值。
             * @param {boolean}              [measureOnly=false] - 是否仅用于测量（不入池、不计引用）。
             * @returns {HTMLElement} 可直接插入 DOM 的元素。
             * @throws {TypeError}  `result` 不是字符串或 `HTMLElement` 时抛出。
             * @throws {Error}      同一 `HTMLElement` 实例被二次挂载时抛出。
             * @example
             * const el = pool.toElement('<li>Item 1</li>');
             * container.appendChild(el);
             */
            toElement(result, measureOnly = false) {
                if (result == null || (typeof result !== 'string' && !(result instanceof HTMLElement))) {
                    throw new TypeError(
                        `[VirtualScroll] renderItem() must return a string or HTMLElement, ` +
                        `got: ${result === null ? 'null' : typeof result}`
                    );
                }

                if (result instanceof HTMLElement) {
                    // 如果是测量模式，直接深拷贝一份节点，
                    // 既跳过了引用计数检查，又避免了把视口中正在渲染的真实节点扯下来
                    if (measureOnly) {
                        return result.cloneNode(true);
                    }

                    // 无论是否 measureOnly，都先检查冲突
                    // 理由：measureOnly 只表示"不计入引用"，不表示"允许重复挂载"
                    const cnt = this._userRefCnt.get(result) ?? 0;
                    if (cnt > 0) {
                        throw new Error(
                            '[VirtualScroll] renderItem() returned the same HTMLElement instance ' +
                            'that is already mounted. Each rendered slot must receive a distinct element.'
                        );
                    }
                    // 只有正式渲染时才写引用计数
                    this._userRefCnt.set(result, cnt + 1);
                    return result;
                }

                // 字符串分支：从池中取包装 div 或新建
                const wrapper = (measureOnly ? null : this._pool.pop()) ?? document.createElement('div');
                wrapper.innerHTML = result;
                if (!measureOnly) {
                    this._wrapperSet.add(wrapper);
                }
                return wrapper;
            }

            /**
             * @method recycle
             * @description 将一个元素从 DOM 中移除并归还至对象池。
             * * 若该元素是用户返回的 `HTMLElement`，则递减引用计数，
             *   计数归零时从 Map 中移除。
             * * 若该元素是由池管理的包装 `<div>`，则清空其内容与样式后
             *   压入池队列（不超过上限时）。
             *
             * @param {HTMLElement} el - 待回收的元素。
             * @returns {void}
             * @example
             * pool.recycle(el); // el 被移出 DOM 并放回池
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
                        // 清空子节点，不触发 HTML 解析
                        el.replaceChildren();

                        // 一次性清除全部 attribute，含 class / style / data-*
                        for (const {name} of Array.from(el.attributes)) {
                            el.removeAttribute(name);
                        }

                        this._pool.push(el);
                    }
                }
            }

            /**
             * @method clear
             * @description 清空对象池及所有追踪集合，释放全部内部引用。
             * @returns {void}
             */
            clear() {
                this._pool = [];
                this._wrapperSet.clear();
                this._userRefCnt.clear();
            }

            /**
             * @description 当前池中空闲的可复用包装元素数量。
             * @type {number}
             * @readonly
             */
            get poolSize() {
                return this._pool.length;
            }

            /**
             * @description 当前正在使用中的包装 `<div>` 数量（已出池、未回收）。
             * @type {number}
             * @readonly
             */
            get wrapperCount() {
                return this._wrapperSet.size;
            }

            /**
             * @description 当前正在使用中的用户原生 `HTMLElement` 数量（引用计数 > 0）。
             * @type {number}
             * @readonly
             */
            get userElemCount() {
                return this._userRefCnt.size;
            }
        };

        /* ══════════════════════════════════════════════════════════════════════
           公开常量
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @static
         * @description 实例可处于的全部状态枚举（冻结对象，不可修改）。
         * * `IDLE`      — 初始或 `clear()` 后的空闲状态，尚未加载数据。
         * * `RUNNING`   — 正常运行，响应滚动与 resize 事件。
         * * `PAUSED`    — 暂停，滚动监听已解绑；`scrollToIndex()` 会排队。
         * * `DESTROYED` — 已销毁，所有资源释放完毕，不可再调用任何方法。
         * @type {{ IDLE: string, RUNNING: string, PAUSED: string, DESTROYED: string }}
         * @readonly
         */
        static State = Object.freeze({
            IDLE: 'idle',
            RUNNING: 'running',
            PAUSED: 'paused',
            DESTROYED: 'destroyed'
        });

        /* ══════════════════════════════════════════════════════════════════════
           私有调参常量
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @static
         * @description 缓冲区行数下限（视口外最少预渲染条数）。
         * @type {number}
         * @default 3
         */
        static _BUFFER_MIN = 3;

        /**
         * @static
         * @description 缓冲区行数上限，防止单次渲染节点过多。
         * @type {number}
         * @default 20
         */
        static _BUFFER_MAX = 20;

        /**
         * @static
         * @description 缓冲区行数相对于可见行数的比率（`bufferSize = ceil(visible × ratio)`）。
         * @type {number}
         * @default 0.5
         */
        static _BUFFER_RATIO = 0.5;

        /**
         * @static
         * @description 缓冲区行数变化触发更新的最小阈值（迟滞量），避免频繁重计算。
         * @type {number}
         * @default 2
         */
        static _BUFFER_HYSTERESIS = 2;

        /**
         * @static
         * @description 当行高无法测量时使用的回退高度（px）。
         * @type {number}
         * @default 50
         */
        static _FALLBACK_HEIGHT = 50;

        /**
         * @static
         * @description 节点对象池的容量上限。
         * @type {number}
         * @default 100
         */
        static _POOL_LIMIT = 100;

        /**
         * @static
         * @description 行高测量时的采样条目数（取平均值），兼顾精度与性能。
         * @type {number}
         * @default 5
         */
        static _MEASURE_SAMPLES = 5;

        /**
         * @static
         * @description 合法行高的最小值（px），低于此值时触发警告并修正。
         * @type {number}
         * @default 1
         */
        static _MIN_ITEM_HEIGHT = 1;

        /* ══════════════════════════════════════════════════════════════════════
           构造
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @constructor
         * @description 创建一个新的 `VirtualScroll` 实例。
         * * 构造时只做参数校验和内部状态初始化，不访问 DOM。
         * * 须调用 {@link VirtualScroll#load} 后实例才进入 `RUNNING` 状态。
         *
         * @param {Object}   config                         - 配置对象。
         * @param {string}   config.container               - 滚动容器的 CSS 选择器（非空字符串）。
         * @param {function | HTMLElement} config.renderItem
         *   条目渲染函数，接收索引和数据数组，返回 HTML 字符串或 `HTMLElement`。
         * @param {boolean}  [config.remeasureOnResize=true]
         *   宽度变化时是否重新测量行高（适合响应式布局；若行高固定可设为 `false`）。
         *
         * @throws {Error} `config.container` 不是非空字符串时抛出。
         * @throws {Error} `config.renderItem` 不是函数时抛出。
         * @throws {Error} `config.remeasureOnResize` 存在但不是布尔值时抛出。
         *
         * @example
         * const vs = new VirtualScroll({
         *   container: '#scroll-container',
         *   renderItem: (i, data) => `<div>${data[i].name}</div>`,
         *   remeasureOnResize: true,
         * });
         */
        constructor(config) {
            this._validateConfig(config);

            /** @type {HTMLElement | null} 已解析的滚动容器 DOM 元素。 */
            this.container = null;

            /**
             * @type {function | HTMLElement}
             * 条目渲染函数，由外部配置传入。
             */
            this.renderItem = config.renderItem;

            /** @type {any[]|{}} 当前加载的数据源数组。 */
            this.data = [];

            /** @type {number} 当前渲染的列表总条数。 */
            this.totalCount = 0;

            /** @type {number} 测量所得的单条目高度（px）；0 表示尚未测量。 */
            this.itemHeight = 0;

            /** @type {number} 当前视口外预渲染的缓冲行数。 */
            this.bufferSize = 0;

            /** @type {string} 容器 CSS 选择器字符串。 */
            this._selector = config.container;

            /** @type {boolean} 宽度变化时是否触发重新测量。 */
            this._remeasureOnResize = config.remeasureOnResize ?? true;

            /** @type {VirtualScroll._StateMachine} 内部状态机实例。 */
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

            /** @type {HTMLElement | null} 顶部占位 spacer 元素。 */
            this._spacerTop = null;
            /** @type {HTMLElement | null} 底部占位 spacer 元素。 */
            this._spacerBottom = null;
            /** @type {number} 当前渲染窗口起始索引（含）；-1 表示尚未渲染。 */
            this._startIndex = -1;
            /** @type {number} 当前渲染窗口结束索引（不含）；-1 表示尚未渲染。 */
            this._endIndex = -1;

            /** @type {Map<number, HTMLElement>} 索引 → 已渲染 DOM 节点的映射表。 */
            this._renderedNodes = new Map();
            /** @type {VirtualScroll._NodePool} DOM 节点对象池。 */
            this._nodePool = new VirtualScroll._NodePool(VirtualScroll._POOL_LIMIT);
            /** @type {VirtualScroll._HeightMapper} 高度映射器。 */
            this._heightMapper = new VirtualScroll._HeightMapper();

            /** @type {number} 上一次记录的容器可视高度（px），用于检测尺寸变化。 */
            this._lastContainerHeight = 0;
            /** @type {number} 上一次记录的容器可视宽度（px），用于检测尺寸变化。 */
            this._lastContainerWidth = 0;

            /** @type {((event: Event) => void) | null} 绑定到容器的 scroll 事件处理器。 */
            this._handleScroll = null;
            /** @type {((event: Event) => void) | null} 绑定到容器的用户交互中断处理器。 */
            this._handleUserInterrupt = null;
            /** @type {(() => void) | null} 绑定到 window 的 resize 降级处理器。 */
            this._handleWindowResize = null;
            /** @type {ResizeObserver | null} 容器尺寸观测器（优先于 window.resize）。 */
            this._ro = null;

            /** @type {number | null} 渲染帧请求 ID（rAF）。 */
            this._renderRAF = null;
            /** @type {number | null} 重测帧请求 ID（rAF）。 */
            this._remeasureRAF = null;
            /** @type {number | null} 平滑滚动帧请求 ID（rAF）。 */
            this._smoothRAF = null;

            /** @type {boolean} 行高是否已完成初次测量。 */
            this._measured = false;
            /** @type {boolean} 是否已有一次 remeasure 请求在等待执行。 */
            this._remeasurePending = false;
            /** @type {boolean} 是否正处于自定义平滑滚动动画过程中。 */
            this._isSmoothScrolling = false;

            /**
             * @type {Array<{index: number, behavior: string}>}
             * PAUSED 状态下排队等待的 scrollToIndex 调用记录。
             */
            this._pendingScrollQueue = [];
        }

        /* ── 状态代理 ── */

        /**
         * @description 当前实例状态名称，与 {@link VirtualScroll.State} 中的值对应（只读）。
         * @type {string}
         * @readonly
         */
        get state() {
            return this._sm.state;
        }

        /* ══════════════════════════════════════════════════════════════════════
           公共 API
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @method load
         * @description 加载数据并（重新）启动虚拟滚动。
         * * 可在 `IDLE`、`RUNNING`、`PAUSED` 三种状态下调用。
         * * 内部流程：解析容器 → 测量行高（按需）→ 构建 DOM → 绑定事件 → 首次渲染。
         * * 若 `remeasure` 为 `false` 且已测量过，则仅对行高做一致性校验（偏差 > 20% 时警告）。
         * * `resetScroll` 为 `false` 时，将尽量保持当前滚动位置，但不超过新的最大滚动值。
         *
         * @param {any[]|{}}   data                   - 数据源数组（任意结构，由 `renderItem` 自行解析）。
         * @param {number}  length                    - 要渲染的条数（取整；非法值退化为 0）。
         * @param {Object}  [options={}]              - 可选参数。
         * @param {boolean} [options.remeasure=false] - 是否强制重新测量行高。
         * @param {boolean} [options.resetScroll=true] - 是否将滚动位置重置到顶部。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @throws {Error} 容器元素不存在或已从 DOM 中移除时抛出。
         *
         * @example
         * // 首次加载
         * vs.load(items, items.length);
         *
         * // 替换数据，保留滚动位置，强制重测行高
         * vs.load(newItems, newItems.length, { remeasure: true, resetScroll: false });
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

            this._unbindScroll();
            this._unbindResize();
            this._cancelAllRAF();
            this._cancelSmoothScrollSilent();
            this._pendingScrollQueue = [];

            this._resolveContainer();

            const oldVirtScroll = this._heightMapper.physicalToVirtual(this.container.scrollTop);
            const oldRowIndex = this.itemHeight > 0
                                ? Math.floor(oldVirtScroll / this.itemHeight)
                                : 0;

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

            // ── 滚动位置处理 ────────────────────────────────────────────────────
            if (resetScroll) {
                this.container.scrollTop = 0;
            } else {
                // 记录目标值，延迟到 _forceRender 之后赋值
                const clientHeight = this.container.clientHeight;
                const hm = this._heightMapper;
                const newVirtScroll = Math.min(
                    oldRowIndex * this.itemHeight,
                    Math.max(0, hm.virtualHeight - clientHeight)
                );
                // 在 scroll 监听器绑定之前赋值，避免触发多余的 scroll 事件
                // _forceRender 会在 _bindEvents 之后统一执行，此处 scrollTop 改变不会产生副作用
                this.container.scrollTop = hm.virtualToPhysical(newVirtScroll);
            }

            // scroll 监听器在 scrollTop 设置完毕后再绑定，彻底消除路径
            this._bindEvents();

            // 唯一一次强制渲染，基于最终 scrollTop 计算正确窗口
            this._forceRender();

            if (!this._sm.is(VirtualScroll.State.RUNNING)) {
                this._sm.transition(VirtualScroll.State.RUNNING);
            }
        }

        /**
         * @method pause
         * @description 暂停虚拟滚动，解绑 scroll 事件监听器。
         * * 仅在 `RUNNING` 状态下有效，其他状态下只打印警告。
         * * 暂停期间调用 {@link VirtualScroll#scrollToIndex} 会将请求排队，
         *   待 {@link VirtualScroll#resume} 后按序执行（仅最后一条生效）。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         * @example
         * vs.pause();
         * console.log(vs.state); // 'paused'
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
         * @method resume
         * @description 从暂停状态恢复虚拟滚动。
         * * 仅在 `PAUSED` 状态下有效，其他状态下只打印警告。
         * * 若暂停期间有排队的 `scrollToIndex()` 请求，恢复后将执行最后一条，
         *   其余请求被丢弃（打印警告）。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         * @example
         * vs.resume();
         * console.log(vs.state); // 'running'
         */
        resume() {
            this._assertNotDestroyed('resume');
            if (!this._sm.is(VirtualScroll.State.PAUSED)) {
                console.warn(`[VirtualScroll] resume() requires PAUSED state, current: ${this.state}`);
                return;
            }
            this._sm.transition(VirtualScroll.State.RUNNING);
            this._bindScroll();

            if (this._pendingScrollQueue.length > 0) {
                if (this._pendingScrollQueue.length > 1) {
                    console.warn(
                        `[VirtualScroll] ${this._pendingScrollQueue.length - 1} scrollToIndex() ` +
                        'call(s) were dropped while PAUSED (only the last one is applied).'
                    );
                }
                const {index, behavior} = this._pendingScrollQueue.at(-1);
                this._pendingScrollQueue = [];
                this.scrollToIndex(index, {behavior});
                this._forceRender();
                return;
            }

            this._forceRender();
        }

        /**
         * @method clear
         * @description 清空列表并将实例重置为 `IDLE` 状态。
         * * 解绑所有事件、取消所有 rAF、清空 DOM 和节点池。
         * * 清空后可再次调用 {@link VirtualScroll#load} 重新启动。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         * @example
         * vs.clear();
         * console.log(vs.state); // 'idle'
         */
        clear() {
            this._assertNotDestroyed('clear');

            if (!this._sm.is(VirtualScroll.State.IDLE)) {
                this._sm.transition(VirtualScroll.State.IDLE);
            }
            this._teardown(false);
        }

        /**
         * @method destroy
         * @description 永久销毁实例，释放所有资源。
         * * 销毁后不可再调用任何方法（会抛出异常），也无法通过 `load()` 重启。
         * * 若已处于 `DESTROYED` 状态则直接返回，不重复执行。
         *
         * @returns {void}
         * @example
         * vs.destroy();
         * console.log(vs.state); // 'destroyed'
         */
        destroy() {
            if (this._sm.is(VirtualScroll.State.DESTROYED)) {
                return;
            }

            // IDLE / RUNNING / PAUSED 都可以合法跳到 DESTROYED
            this._sm.transition(VirtualScroll.State.DESTROYED);
            this._teardown(false);
        }

        /**
         * @method scrollToIndex
         * @description 将滚动位置跳转到指定索引对应的条目。
         * * `IDLE` 状态或容器不存在时静默返回。
         * * `PAUSED` 状态时请求入队，`resume()` 后执行最后一条。
         * * 压缩模式下 `'smooth'` 行为由内部 rAF 动画实现，而非浏览器原生滚动。
         * * 索引会被夹紧到 `[0, totalCount - 1]`。
         *
         * @param {number} index                   - 目标条目索引（自动取整并夹紧）。
         * @param {Object} [options={}]            - 可选参数。
         * @param {'auto'|'smooth'} [options.behavior='auto'] - 滚动行为；`'smooth'` 为平滑滚动。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         * @example
         * vs.scrollToIndex(999);                        // 即时跳转到第 999 条
         * vs.scrollToIndex(999, { behavior: 'smooth' }); // 平滑滚动到第 999 条
         */
        scrollToIndex(index, {behavior = 'auto'} = {}) {
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

            if (this._sm.is(VirtualScroll.State.PAUSED)) {
                this._pendingScrollQueue.push({index: i, behavior});
                console.info(
                    `[VirtualScroll] scrollToIndex(${i}) queued while PAUSED ` +
                    `(queue length: ${this._pendingScrollQueue.length}). ` +
                    'Only the last entry will be applied on resume().'
                );
                return;
            }

            const virtualTop = i * this.itemHeight;
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
         * @method scrollToTop
         * @description 滚动到列表顶部（等同于 `scrollToIndex(0, options)`）。
         *
         * @param {Object}          [options]           - 可选参数，透传给 {@link VirtualScroll#scrollToIndex}。
         * @param {'auto'|'smooth'} [options.behavior]  - 滚动行为。
         * @returns {void}
         * @example
         * vs.scrollToTop({ behavior: 'smooth' });
         */
        scrollToTop(options) {
            this.scrollToIndex(0, options);
        }

        /**
         * @method scrollToBottom
         * @description 滚动到列表底部。
         * * 内部计算虚拟底部偏移量后转换为物理坐标进行滚动。
         * * 压缩模式下 `'smooth'` 使用内部动画实现。
         *
         * @param {Object}          [options={}]               - 可选参数。
         * @param {'auto'|'smooth'} [options.behavior='auto']  - 滚动行为。
         *
         * @throws {Error} 实例已销毁时抛出。
         * @returns {void}
         * @example
         * vs.scrollToBottom({ behavior: 'smooth' });
         */
        scrollToBottom({behavior = 'auto'} = {}) {
            this._assertNotDestroyed('scrollToBottom');
            if (this._sm.is(VirtualScroll.State.IDLE) || !this.container || this.totalCount === 0) {
                return;
            }
            if (this.itemHeight <= 0) {
                console.warn('[VirtualScroll] scrollToBottom() called before item height was measured');
                return;
            }

            const clientHeight = this.container.clientHeight;
            const hm = this._heightMapper;
            const virtualBottom = Math.max(0, hm.virtualHeight - clientHeight);
            const physicalBottom = hm.virtualToPhysical(virtualBottom);

            if (behavior === 'smooth') {
                if (hm.compressed) {
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
         * @method getMetrics
         * @description 返回当前实例的性能与状态快照（深度冻结，只读）。
         * * 包含渲染窗口、节点池、高度映射、滚动状态等全部关键指标。
         * * 用于调试、监控或单元测试断言。
         *
         * @returns {Readonly<{
         *   state: string,
         *   ready: boolean,
         *   itemHeight: number,
         *   bufferSize: number,
         *   visibleCount: number,
         *   renderedCount: number,
         *   totalCount: number,
         *   startIndex: number,
         *   endIndex: number,
         *   scrollTop: number,
         *   poolSize: number,
         *   wrapperCount: number,
         *   userElemCount: number,
         *   compressed: boolean,
         *   virtualHeight: number,
         *   physicalHeight: number,
         *   scrollRatio: number,
         *   pendingScrollQueue: ReadonlyArray<Readonly<{index: number, behavior: string}>>
         * }>} 当前指标快照。
         *
         * @example
         * const m = vs.getMetrics();
         * console.log(m.renderedCount, m.totalCount, m.compressed);
         */
        getMetrics() {
            const visibleCount = (this.itemHeight && this.container)
                                 ? Math.ceil(this.container.clientHeight / this.itemHeight)
                                 : 0;
            const hm = this._heightMapper;

            return Object.freeze({
                state: this.state,
                ready: this._sm.is(VirtualScroll.State.RUNNING, VirtualScroll.State.PAUSED),
                itemHeight: this.itemHeight,
                bufferSize: this.bufferSize,
                visibleCount,
                renderedCount: this._renderedNodes.size,
                totalCount: this.totalCount,
                startIndex: this._startIndex,
                endIndex: this._endIndex,
                scrollTop: this.container?.scrollTop ?? 0,
                poolSize: this._nodePool.poolSize,
                wrapperCount: this._nodePool.wrapperCount,
                userElemCount: this._nodePool.userElemCount,
                compressed: hm.compressed,
                virtualHeight: hm.virtualHeight,
                physicalHeight: hm.physicalHeight,
                scrollRatio: hm.scrollRatio,
                pendingScrollQueue: Object.freeze(
                    this._pendingScrollQueue.map(e => Object.freeze({...e}))
                )
            });
        }

        /**
         * @method isPaused
         * @description 判断实例是否处于 `PAUSED` 状态。
         * @returns {boolean}
         * @example
         * if (vs.isPaused()){
         *   vs.resume();
         * }
         */
        isPaused() {
            return this._sm.is(VirtualScroll.State.PAUSED);
        }

        /**
         * @method isRunning
         * @description 判断实例是否处于 `RUNNING` 状态。
         * @returns {boolean}
         * @example
         * if (!vs.isRunning()) vs.load(data, data.length);
         */
        isRunning() {
            return this._sm.is(VirtualScroll.State.RUNNING);
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 参数校验
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _validateConfig
         * @description 校验构造函数传入的配置对象，任何不合法项均抛出 `Error`。
         * * `config.container` 须为非空字符串。
         * * `config.renderItem` 须为函数。
         * * `config.remeasureOnResize` 若存在须为布尔值。
         *
         * @param {Object} config - 待校验的配置对象。
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
         * @private
         * @method _normalizeLength
         * @description 将外部传入的 `length` 参数规范化为非负整数。
         * * `null` / `undefined` → 0（警告）。
         * * 非有限数字 → 0（警告）。
         * * 非整数 → 截断为整数（警告）。
         * * 负数 → 0。
         *
         * @param {*}      length - 原始长度参数。
         * @param {string} caller - 调用方法名，用于警告信息。
         * @returns {number} 规范化后的非负整数。
         */
        _normalizeLength(length, caller) {
            // 1. 处理空值
            if (length == null) {
                console.warn(`[VirtualScroll] ${caller}(): length is ${length}, treating as 0.`);
                return 0;
            }

            // 2. 转换为数字并校验有限性
            const num = Number(length);
            if (!Number.isFinite(num)) {
                console.warn(`[VirtualScroll] ${caller}(): length "${length}" is not a finite number, treating as 0.`);
                return 0;
            }

            // 3. 截断小数并处理负数
            const int = Math.trunc(num);

            if (int !== num) {
                console.warn(`[VirtualScroll] ${caller}(): length ${length} is not an integer, truncated to ${int}.`);
            }

            return Math.max(0, int);
        }

        /**
         * @private
         * @method _assertNotDestroyed
         * @description 若实例已处于 `DESTROYED` 状态则抛出错误，阻止后续操作。
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

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 容器初始化
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _resolveContainer
         * @description 解析并缓存容器 DOM 元素。
         * * 若已缓存且仍在文档中，直接返回。
         * * 若选择器非法，抛出包含原始异常信息的 `Error`。
         * * 若元素不存在或已被移出 DOM，抛出带有操作建议的 `Error`。
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
         * @private
         * @method _setupContainer
         * @description 为容器元素补全必要的 CSS 样式（仅在初次测量前调用一次）。
         * * `position: static` → 改为 `relative`（子元素绝对定位的基准）。
         * * `overflow: visible / ''` → 改为 `auto`（启用滚动条）。
         *
         * @returns {void}
         */
        _setupContainer() {
            const cs = getComputedStyle(this.container);
            if (cs.position === 'static') {
                this.container.style.position = 'relative';
            }

            // 将 auto 强制转换为 scroll，使滚动条轨道常驻。
            // 这样在 _doMeasure 清空 DOM 时，clientWidth 不会因为滚动条的消失而突变，
            // 从而彻底斩断 ResizeObserver 的死循环，也能保证测量时文本折行计算的准确性。
            if (
                cs.overflow === 'visible' ||
                cs.overflow === '' ||
                cs.overflow === 'auto' ||
                cs.overflowY === 'auto'
            ) {
                // 水平方向保持原样，仅垂直方向设为 scroll
                this.container.style.overflowY = 'scroll';
                this.container.style.overflowX = cs.overflowX !== 'visible' ? cs.overflowX : 'hidden';
            }
        }

        /**
         * @private
         * @method _syncContainerSize
         * @description 将容器当前的 `clientWidth` / `clientHeight` 同步到内部缓存字段。
         * 用于后续 resize 检测的基准比对。
         *
         * @returns {void}
         */
        _syncContainerSize() {
            this._lastContainerHeight = this.container.clientHeight;
            this._lastContainerWidth = this.container.clientWidth;
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 行高校验
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _verifyItemHeight
         * @description 在不重新测量（`remeasure: false`）时，通过采样少量条目来
         *   校验缓存行高与新数据实际行高是否吻合。
         * * 偏差超过 20% 时打印 `console.warn`，提示调用方传入 `{ remeasure: true }`。
         * * 若 `totalCount === 0` 或 `itemHeight <= 0`，跳过检验。
         * * 采样元素仅用于测量（`measureOnly = true`），不进入节点池。
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
            void this.container.offsetHeight; // 强制同步布局，确保 offsetHeight 有效

            const heights = els.map(el => el.offsetHeight);
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

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 行高测量
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _doMeasure
         * @description 执行完整的行高测量流程。
         * * 将采样条目（最多 {@link VirtualScroll._MEASURE_SAMPLES} 条）临时插入容器，
         *   强制同步布局后读取 `offsetHeight`，取平均值作为 `itemHeight`。
         * * 测量完成后清空容器并更新 {@link VirtualScroll._HeightMapper}。
         * * 边界处理：
         *   - `totalCount === 0` → 回退到 `_FALLBACK_HEIGHT`（50px）并警告。
         *   - 测量结果 `≤ 0` → 回退到 50px 并警告。
         *   - 测量结果 `> 0` 但 `< _MIN_ITEM_HEIGHT` → 修正并警告。
         * * 测量后会尝试恢复原来的滚动位置（将旧虚拟滚动量映射到新物理坐标）。
         *
         * @returns {void}
         */
        _doMeasure() {
            this._unbindScroll();
            this._recycleRenderedNodes();
            this.container.innerHTML = '';
            this._spacerTop = null;
            this._spacerBottom = null;
            this._nodePool.clear();

            if (this.totalCount === 0) {
                this.itemHeight = VirtualScroll._FALLBACK_HEIGHT;
                this._heightMapper.update(0, this.itemHeight, this.container.clientHeight);
                console.warn('[VirtualScroll] Data is empty; item height falls back to 50px.');
                return;
            }

            const sampleCount = Math.min(VirtualScroll._MEASURE_SAMPLES, this.totalCount);
            const tempEls = [];

            for (let i = 0; i < sampleCount; i++) {
                const result = this.renderItem(i, this.data);
                const el = this._nodePool.toElement(result, true);
                this.container.appendChild(el);
                tempEls.push(el);
            }

            // 强制同步布局
            void this.container.offsetHeight;

            const heights = tempEls.map(el => el.offsetHeight);
            const sum = heights.reduce((s, h) => s + h, 0);
            let measured = sum / sampleCount;

            this.container.innerHTML = '';
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

            const clientHeight = this.container.clientHeight;
            this._heightMapper.update(this.totalCount, this.itemHeight, clientHeight);
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 缓冲区大小
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _calcBufferSize
         * @description 根据容器高度和行高动态计算缓冲区行数。
         * * 计算公式：`bufferSize = clamp(ceil(visibleRows × _BUFFER_RATIO), _BUFFER_MIN, _BUFFER_MAX)`。
         * * 使用迟滞（`_BUFFER_HYSTERESIS`）机制：只有新值与旧值之差 ≥ 2 时才更新，
         *   避免频繁小幅抖动。
         * * `force = true` 时跳过迟滞检查，直接写入。
         * * 容器高度或行高无效时，退化为 `_BUFFER_MIN`。
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
            if (force || Math.abs(next - this.bufferSize) >= VirtualScroll._BUFFER_HYSTERESIS) {
                this.bufferSize = next;
            }
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— DOM 结构
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _buildDOM
         * @description 重建容器内的基础 DOM 骨架（清空 + 创建上下 spacer）。
         * * 回收所有已渲染节点并清空容器 `innerHTML`。
         * * 创建两个自定义标签 `<vs-spacer>` 作为上下占位符，初始高度均为 0。
         * * spacer 样式设置为不可见、不占位但仍参与文档流高度计算。
         * * 调用后 `_startIndex` / `_endIndex` 被重置为 -1。
         *
         * @returns {void}
         */
        _buildDOM() {
            this._recycleRenderedNodes();

            if (this._spacerTop?.parentNode === this.container) {
                this.container.removeChild(this._spacerTop);
            }
            if (this._spacerBottom?.parentNode === this.container) {
                this.container.removeChild(this._spacerBottom);
            }

            this.container.innerHTML = '';

            const applySpacerStyle = el => Object.assign(el.style, {
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

            this._spacerTop = document.createElement('vs-spacer');
            this._spacerBottom = document.createElement('vs-spacer');
            applySpacerStyle(this._spacerTop);
            applySpacerStyle(this._spacerBottom);

            this.container.appendChild(this._spacerTop);
            this.container.appendChild(this._spacerBottom);

            this._startIndex = -1;
            this._endIndex = -1;

            // 立即用当前 heightMapper 状态撑开总高度
            // 此时 start=0, end=0，所有高度都在 bottom spacer
            const clientHeight = this.container.clientHeight;
            const hm = this._heightMapper;
            const {top, bottom} = hm.calcSpacerHeights(
                0, 0, this.totalCount, this.itemHeight, clientHeight
            );
            this._spacerTop.style.height = `${top}px`;
            this._spacerBottom.style.height = `${bottom}px`;
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 事件绑定
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _bindEvents
         * @description 同时绑定滚动事件和 resize 监听器。
         * @returns {void}
         */
        _bindEvents() {
            this._bindScroll();
            this._bindResize();
            this._bindUserInterrupt();
        }

        /**
         * @private
         * @method _bindUserInterrupt
         * @description 绑定用户交互事件。当处于平滑滚动状态时，若用户强行交互，则立即打断动画。
         */
        _bindUserInterrupt() {
            if (this._handleUserInterrupt) {
                return;
            }

            this._handleUserInterrupt = () => {
                // 如果动画正在进行，立即中止并交出控制权
                if (this._isSmoothScrolling) {
                    this._cancelSmoothScroll();
                }
            };

            // 使用 passive: true 保证不会阻塞浏览器主线程的默认滚动行为，提升性能
            this.container.addEventListener('wheel', this._handleUserInterrupt, {passive: true});
            this.container.addEventListener('touchstart', this._handleUserInterrupt, {passive: true});
            this.container.addEventListener('mousedown', this._handleUserInterrupt, {passive: true});
        }

        /**
         * @private
         * @method _bindScroll
         * @description 向容器绑定 `scroll` 事件监听器（被动模式）。
         * * 若已绑定（`_handleScroll` 不为 `null`），直接返回，防止重复注册。
         * * 平滑滚动动画期间（`_isSmoothScrolling = true`）忽略 scroll 事件，
         *   由动画循环自行调用 `_render()`。
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
         * @private
         * @method _unbindScroll
         * @description 从容器移除 `scroll` 事件监听器并置空引用。
         * @returns {void}
         */
        _unbindScroll() {
            if (this._handleScroll && this.container) {
                this.container.removeEventListener('scroll', this._handleScroll);
                this._handleScroll = null;
            }
        }

        /**
         * @private
         * @method _bindResize
         * @description 绑定容器尺寸变化监听器。
         * * 优先使用 `ResizeObserver`（现代浏览器）：精确监听容器自身的尺寸变化。
         * * 降级方案：监听 `window.resize`，通过比对 `clientWidth / clientHeight` 判断变化。
         * * 宽度变化且 `remeasureOnResize = true` 时触发重新测量。
         * * 仅高度变化时重新计算缓冲区大小并调度渲染。
         *
         * @returns {void}
         */
        _bindResize() {
            if (typeof ResizeObserver !== 'undefined') {
                if (this._ro) {
                    return;
                }

                this._ro = new ResizeObserver(entries => {
                    if (!this._sm.is(VirtualScroll.State.RUNNING)) {
                        return;
                    }

                    const entry = entries[0];
                    if (!entry) {
                        return;
                    }

                    // 直接从 target 获取 clientWidth/Height，保持与系统其他地方统一（包含 padding）
                    const newW = entry.target.clientWidth;
                    const newH = entry.target.clientHeight;

                    const widthChanged = Math.round(newW) !== Math.round(this._lastContainerWidth);
                    const heightChanged = Math.round(newH) !== Math.round(this._lastContainerHeight);

                    if (widthChanged) {
                        this._lastContainerWidth = newW;
                        if (this._remeasureOnResize) {
                            if (heightChanged) {
                                this._lastContainerHeight = newH;
                            }
                            this._scheduleRemeasure();
                            return;
                        }
                    }

                    if (heightChanged) {
                        this._lastContainerHeight = newH;
                        this._calcBufferSize();
                    }

                    this._scheduleRender();
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

                    const newW = this.container.clientWidth;
                    const newH = this.container.clientHeight;
                    const widthChanged = Math.round(newW) !== Math.round(this._lastContainerWidth);
                    const heightChanged = Math.round(newH) !== Math.round(this._lastContainerHeight);

                    if (widthChanged) {
                        this._lastContainerWidth = newW;
                        if (this._remeasureOnResize) {
                            if (heightChanged) {
                                this._lastContainerHeight = newH;
                            }
                            this._scheduleRemeasure();
                            return;
                        }
                    }

                    if (heightChanged) {
                        this._lastContainerHeight = newH;
                        this._calcBufferSize();
                    }

                    this._scheduleRender();
                };
                window.addEventListener('resize', this._handleWindowResize, {passive: true});
            }
        }

        /**
         * @private
         * @method _unbindResize
         * @description 断开 `ResizeObserver` 或移除 `window.resize` 监听器。
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

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 重测调度
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _scheduleRemeasure
         * @description 使用 `requestAnimationFrame` 异步调度一次行高重测。
         * * 通过 `_remeasurePending` 标志去重，同一帧内多次调用只生效一次。
         * * 优先取消已挂起的渲染帧（`_cancelRenderRAF`），防止新旧渲染交叉。
         * * 重测完成后重建 DOM 骨架并触发强制渲染。
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
                    // 1. 在 DOM 被清空前，抓取旧的虚拟滚动位置
                    const oldVirtScroll = this._heightMapper.physicalToVirtual(this.container.scrollTop);
                    // 算出当前停留在第几行
                    const oldRowIndex = this.itemHeight > 0
                                        ? Math.floor(oldVirtScroll / this.itemHeight)
                                        : 0;

                    this._heightMapper.reset();
                    this._doMeasure(); // 内部会清空 DOM，但此时不再操作 scrollTop
                    this._syncContainerSize();
                    this._calcBufferSize(true);

                    // 2. 重新挂载 Spacer，这一步至关重要！此时 scrollHeight 终于被撑开了
                    this._buildDOM();
                    this._syncContainerSize();

                    // 3. 既然 DOM 已经撑开，现在赋值 scrollTop 浏览器才会认账
                    const clientHeight = this.container.clientHeight;
                    const newVirtScroll = Math.min(
                        oldRowIndex * this.itemHeight,
                        Math.max(0, this._heightMapper.virtualHeight - clientHeight)
                    );
                    this.container.scrollTop = this._heightMapper.virtualToPhysical(newVirtScroll);

                    this._bindScroll();
                    this._forceRender();
                } finally {
                    this._remeasurePending = false;
                }
            });
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 渲染调度
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _scheduleRender
         * @description 通过 `requestAnimationFrame` 异步调度一次渲染。
         * * 若已有渲染帧在等待，或重测帧正在挂起，则跳过本次请求。
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
         * @private
         * @method _cancelRenderRAF
         * @description 取消已挂起的渲染帧（`_renderRAF`）。
         * @returns {void}
         */
        _cancelRenderRAF() {
            if (this._renderRAF) {
                cancelAnimationFrame(this._renderRAF);
                this._renderRAF = null;
            }
        }

        /**
         * @private
         * @method _cancelRemeasureRAF
         * @description 取消已挂起的重测帧（`_remeasureRAF`）并清除挂起标志。
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
         * @private
         * @method _cancelAllRAF
         * @description 同时取消渲染帧和重测帧。
         * @returns {void}
         */
        _cancelAllRAF() {
            this._cancelRenderRAF();
            this._cancelRemeasureRAF();
            this._cancelSmoothScrollSilent();
        }

        /**
         * @private
         * @method _forceRender
         * @description 取消挂起的渲染帧后，同步（本帧内）执行一次强制渲染。
         * * 与 {@link VirtualScroll#_scheduleRender} 的区别：本方法是同步调用，
         *   不受"已有帧挂起"的跳过逻辑限制，且 `force = true` 会绕过范围未变的
         *   提前返回检查。
         *
         * @returns {void}
         */
        _forceRender() {
            this._cancelRenderRAF();
            this._render(true);
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 核心渲染
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _render
         * @description 虚拟滚动核心渲染逻辑，计算当前视口对应的渲染窗口并更新 DOM。
         * * **快速返回条件**：容器不存在、spacer 未挂载、无数据、容器高度为 0。
         * * **高度变化处理**：若容器高度自上次渲染以来发生变化，重新计算缓冲区与
         *   高度映射，并修正超出范围的 `scrollTop`。
         * * **范围计算**：
         *   - `physScrollTop` → `virtScrollTop`（高度映射）→ `visibleStart / visibleEnd`
         *   - 加上缓冲区后得到 `[start, end)`。
         * * **渲染决策**：
         *   - `force = false` 且范围与高度均未变化 → 跳过。
         *   - 新旧范围无重叠 → 全量回收 + 重渲染（{@link VirtualScroll#_recycleAllAndRender}）。
         *   - 有重叠 → 增量更新（{@link VirtualScroll#_incrementalUpdate}）。
         * * 每次渲染后更新 spacer 高度、`_startIndex`、`_endIndex`。
         *
         * @param {boolean} [force=false]
         *   为 `true` 时即使渲染范围未变也强制执行 DOM 更新。
         * @returns {void}
         */
        _render(force = false) {
            if (!this.container) {
                return;
            }
            if (!this._spacerTop?.isConnected || !this._spacerBottom?.isConnected) {
                return;
            }
            if (this.totalCount <= 0 || this.itemHeight <= 0) {
                return;
            }

            const clientHeight = this.container.clientHeight;
            if (clientHeight <= 0) {
                return;
            }

            const heightChanged = clientHeight !== this._lastContainerHeight;
            if (heightChanged) {
                this._lastContainerHeight = clientHeight;
                this._calcBufferSize();
                this._heightMapper.update(this.totalCount, this.itemHeight, clientHeight);

                const hm = this._heightMapper;
                const maxPhysical = Math.max(0, hm.physicalHeight - clientHeight);
                const currentST = this.container.scrollTop;

                if (currentST > maxPhysical) {
                    this._unbindScroll();
                    this.container.scrollTop = maxPhysical;
                    if (this._sm.is(VirtualScroll.State.RUNNING)) {
                        this._bindScroll();
                        this._cancelRenderRAF();
                    }
                }
            }

            const hm = this._heightMapper;
            const physScrollTop = this.container.scrollTop;
            const virtScrollTop = hm.physicalToVirtual(physScrollTop);

            const visibleStart = Math.floor(virtScrollTop / this.itemHeight);
            const visibleEnd = Math.ceil((virtScrollTop + clientHeight) / this.itemHeight);
            const start = Math.max(0, visibleStart - this.bufferSize);
            const end = Math.min(this.totalCount, visibleEnd + this.bufferSize);

            const rangeUnchanged = start === this._startIndex && end === this._endIndex;
            if (!force && rangeUnchanged && !heightChanged) {
                return;
            }

            const {top: spacerTopPx, bottom: spacerBottomPx} =
                hm.calcSpacerHeights(start, end, this.totalCount, this.itemHeight, clientHeight);
            this._spacerTop.style.height = `${spacerTopPx}px`;
            this._spacerBottom.style.height = `${spacerBottomPx}px`;

            const prevStart = this._startIndex;
            const prevEnd = this._endIndex;
            const noOverlap = prevStart < 0 || end <= prevStart || start >= prevEnd;

            if (noOverlap) {
                this._recycleAllAndRender(start, end);
            } else {
                this._incrementalUpdate(prevStart, prevEnd, start, end);
            }

            this._startIndex = start;
            this._endIndex = end;
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 增量更新
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _incrementalUpdate
         * @description 在旧渲染窗口与新渲染窗口有重叠时，执行最小化 DOM 操作的增量更新。
         * * **回收**：不再需要的旧索引节点归还给节点池。
         * * **前插**：新窗口左侧扩展的索引，渲染后插入到现有节点前面。
         * * **后追**：新窗口右侧扩展的索引，渲染后追加到 spacer 前面。
         * * 最终重建 `_renderedNodes` Map，保持索引→节点的准确映射。
         *
         * @param {number} prevStart - 旧渲染窗口起始索引（含）。
         * @param {number} prevEnd   - 旧渲染窗口结束索引（不含）。
         * @param {number} newStart  - 新渲染窗口起始索引（含）。
         * @param {number} newEnd    - 新渲染窗口结束索引（不含）。
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
        }

        /**
         * @private
         * @method _getFirstRenderedNode
         * @description 获取当前 `_renderedNodes` Map 中第一个（最小索引）已渲染节点。
         * * Map 的迭代顺序即插入顺序，与索引递增顺序一致。
         *
         * @returns {HTMLElement | null} 第一个节点，若 Map 为空则返回 `null`。
         */
        _getFirstRenderedNode() {
            const first = this._renderedNodes.values().next();
            return first.done ? null : first.value;
        }

        /**
         * @private
         * @method _recycleAllAndRender
         * @description 全量回收当前所有已渲染节点，然后从零渲染新窗口 `[start, end)` 内的条目。
         * * 适用于新旧渲染窗口无重叠时的场景（例如大幅度跳转）。
         * * 使用 `DocumentFragment` 批量插入，减少重排次数。
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

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 节点回收
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _removeRenderedNode
         * @description 从 `_renderedNodes` 中移除单个索引对应的节点，并将其归还节点池。
         * * 若指定索引不存在于 Map 中，静默返回。
         *
         * @param {number} index - 要移除的条目索引。
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
         * @private
         * @method _recycleRenderedNodes
         * @description 将 `_renderedNodes` 中的所有节点批量归还节点池，并清空 Map。
         * * 同时将 `_startIndex` / `_endIndex` 重置为 -1（表示当前无渲染窗口）。
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

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— teardown
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _unbindUserInterrupt
         * @description 移除用户交互打断监听器。
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
         * @private
         * @method _teardown
         * @description 执行完整的资源清理流程，被 `clear()` 和 `destroy()` 共同调用。
         * * 解绑事件、取消所有 rAF、清空节点池、清空 DOM、重置所有内部状态字段。
         * * 执行后 `container` 置为 `null`，`_measured` 置为 `false`。
         *
         * @param {boolean} _keepContainer
         *   保留参数（当前未使用，为未来扩展预留；传 `false` 即可）。
         * @returns {void}
         */
        _teardown(_keepContainer) {
            this._unbindScroll();
            this._unbindResize();
            this._unbindUserInterrupt();
            this._cancelAllRAF();
            this._cancelSmoothScrollSilent();

            this._nodePool.clear();
            this._renderedNodes.clear();
            this._pendingScrollQueue = [];
            this._remeasurePending = false;

            if (this.container) {
                this.container.innerHTML = '';
            }

            this._spacerTop = null;
            this._spacerBottom = null;
            this._startIndex = -1;
            this._endIndex = -1;
            this._lastContainerHeight = 0;
            this._lastContainerWidth = 0;
            this._measured = false;
            this.data = [];
            this.totalCount = 0;
            this.container = null;
            this._heightMapper.reset();
        }

        /* ══════════════════════════════════════════════════════════════════════
           私有 —— 平滑滚动（压缩模式专用）
        ══════════════════════════════════════════════════════════════════════ */

        /**
         * @private
         * @method _smoothScrollTo
         * @description 在压缩模式下使用 rAF 动画实现平滑滚动到指定物理偏移量。
         * * 浏览器原生 `scrollTo({ behavior: 'smooth' })` 在压缩模式下因高度不真实而
         *   表现异常，此方法作为替代，在每一帧手动计算 easeInOut 插值并调用 `_render()`。
         * * 动画时长固定 300 ms，缓动函数为二次 easeInOut。
         * * 开始前取消上一次尚未完成的平滑滚动动画。
         * * 动画期间 scroll 事件被 `_isSmoothScrolling` 标志屏蔽。
         *
         * @param {number} targetPhysical - 目标物理 `scrollTop`（px）。
         * @returns {void}
         */
        _smoothScrollTo(targetPhysical) {
            this._cancelSmoothScrollSilent();

            const start = this.container.scrollTop;
            const delta = targetPhysical - start;

            if (delta === 0) {
                return;
            }

            // 根据滚动距离动态计算动画时长（下限 300ms，上限 800ms）
            const distance = Math.abs(delta);
            const clientHeight = this.container.clientHeight;
            // 跨越的屏幕屏数
            const screens = distance / (clientHeight || 1);
            const dur = Math.min(800, Math.max(300, screens * 100));

            let t0 = null;
            const easeInOut = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            this._isSmoothScrolling = true;

            const step = ts => {
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

                // 1. 修改物理滚动值
                this.container.scrollTop = start + delta * progress;

                // 2. 同步强制渲染当前帧的 DOM，彻底避免白屏
                this._render();

                if (elapsed < dur) {
                    this._smoothRAF = requestAnimationFrame(step);
                } else {
                    this._smoothRAF = null;
                    this._isSmoothScrolling = false;
                    // 确保最后一帧对齐
                    this._render();
                }
            };

            this._smoothRAF = requestAnimationFrame(step);
        }

        /**
         * @private
         * @method _cancelSmoothScroll
         * @description 取消正在进行的平滑滚动动画，并在之前处于动画状态时调度一次补充渲染。
         * * 用于 `scrollToIndex({ behavior: 'auto' })` 打断 smooth 动画的场景。
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
         * @private
         * @method _cancelSmoothScrollSilent
         * @description 静默取消平滑滚动动画，不触发后续渲染。
         * * 用于 `load()` / `_teardown()` 等需要立即停止动画但不额外渲染的场合。
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
    }

    /**
     * @class InputManager
     * @description 一个静态工具类，提供控制 UI 输入的函数。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class InputManager {
        /**
         * @private
         * @static
         * @readonly
         * @type {number}
         * @description 输入框最多能输入的字符数。
         */
        static _MAX_INPUT_LEN = 1234;

        /**
         * @static
         * @type {number}
         * @description 统计模式最大统计数据行数。
         */
        static MAX_STATISTICS_ROW = 985;

        /**
         * @static
         * @type {AsyncListRenderer}
         * @description statisticsRenderer 实例。
         * 用于管理统计模式的列表显示。
         */
        static statisticsRenderer = new AsyncListRenderer({
            scrollSelector: '#grid_data',   // 滚动区域的选择器
            containerSelector: '#grid_data',// 真实 DOM 的挂载点选择器

            /**
             * @function rowRenderer
             * @param {Object} dataSource - 外部传入的完整数据包装对象
             * @param {number} index - 当前渲染的行索引
             * @returns {HTMLElement} 返回拼装好的一行 DOM
             * @description 负责单行 DOM 的组装
             */
            rowRenderer: (dataSource, index) => {
                /**
                 * @function toClassList
                 * @param {string|Array} input - 待转换的输入值，可以是原始类名字符串或其他格式
                 * @returns {Array} 如果输入是字符串，则返回处理后的标准类名格式；否则原样返回
                 * @description 将输入的字符串转换为标准的 HTML 类名列表，非字符串类型则直接返回原数据
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
         * @constructor
         * @description InputManager 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 InputManager 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[InputManager] InputManager is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _getTokenLen
         * @description (内部辅助方法) 计算一个词法单元（token）在 HTML 中渲染时所占用的 DOM 元素数量。
         * 大多数符号和单字符 token 占用 1 个元素。
         * 多字符的函数名（如 "sin"）会根据其字符串长度占用多个元素，每个字符一个。
         * 但有一些特殊的多字符函数名（如 "gamma"）被设计为使用单个 CSS 类和图标来渲染，因此它们只占用 1 个元素。
         * 此方法通过检查 `tokenInfo.isHtmlClassLenOne` 标志来区分这两种情况。
         *
         * @param {string|null|undefined} token - 需要计算显示长度的词法单元字符串。
         * @returns {number} 该 token 在渲染时占用的 DOM 元素数量（通常是 `<p>` 元素的数量）。
         */
        static _getTokenLen(token) {
            if (!token) {
                return 0;
            }

            // 获取词法单元的详细信息，包括其类型和特殊标志。
            const tokenInfo = Public.getTokenInfo(token);
            // 检查该 token 是否是一个函数，并且不是那种被特殊标记为“使用单个HTML类”的函数。
            if (tokenInfo.class === 'func' && !tokenInfo.isHtmlClassLenOne) {
                // 如果是，则其占用的元素数量等于其名称的字符数（例如 "sin" -> 3）。
                return token.length;
            }
            // 对于所有其他情况（数字、单字符运算符、特殊图标函数、常量等），都只占用 1 个 DOM 元素。
            return 1;
        }

        /**
         * @static
         * @method inputAreaMoveNum
         * @description (内部辅助方法) 计算光标移动步长。
         * * 优化亮点：
         * 1. 【极致性能】无论光标位置在哪，整个生命周期严格只调用一次 `tokenizer`。
         * 2. 【窗口机制】只提取光标附近局部范围的文本进行拼接分析，避免处理超长输入时的性能损耗。
         * 3. 【精准定位】通过文本长度偏移量，精确计算光标是否卡在函数名（如 "sin"）的边缘。
         *
         * @param {'left'|'right'|'both'} direction - 移动方向
         * @param {HTMLElement} [asCursor=null] - (可选) 将此元素视为光标位置(用于点击定位)
         * @returns {number|number[]}
         */
        static inputAreaMoveNum(direction, asCursor = null) {
            // --- 1. 数据获取与边界防御 ---
            const input = HtmlTools.getHtml('#input');
            const children = input.children;
            const len = children.length;
            // 窗口宽度
            const range = Public.MAX_TOKEN_LENGTH + 2; // +1 for space, +1 for redundancy

            // --- 2. 高效定位光标索引 ---
            let cursorIndex = -1;

            if (!asCursor) {
                // [普通模式] 仅需查找 id 为 cursor 的元素
                // 优化：直接利用 Array 方法（如果环境支持）或保持循环，这里使用循环以兼容 HTMLCollection
                for (let i = 0; i < len; i++) {
                    if (children[i].id === 'cursor') {
                        cursorIndex = i;
                        break;
                    }
                }
            } else {
                // [点击模式] 单次遍历查找目标和真实光标
                let targetIndex = -1;
                let realCursorIndex = -1;

                for (let i = 0; i < len; i++) {
                    const child = children[i];
                    // 只要没找全，就继续找
                    if (targetIndex === -1 && child === asCursor) {
                        targetIndex = i;
                    }
                    if (realCursorIndex === -1 && child.id === 'cursor') {
                        realCursorIndex = i;
                    }

                    // 均已找到，提前跳出
                    if (targetIndex !== -1 && realCursorIndex !== -1) {
                        break;
                    }
                }

                // 修正逻辑：如果点击的目标在真实光标之后，索引需 -1 (因为真实光标占据了 children 一个位置但不在 classList 中)
                if (targetIndex !== -1) {
                    const gap = targetIndex - realCursorIndex;
                    cursorIndex = (realCursorIndex !== -1 && gap > 0 && gap <= range)
                                  ? targetIndex - 1
                                  : targetIndex;
                }
            }

            // 未找到光标或目标，返回 0
            if (cursorIndex === -1) {
                return direction === 'both' ? [0, 0] : 0;
            }

            // --- 3. 窗口化文本提取 (关键性能优化) ---
            // 边界钳制：防止索引越界
            const startIndex = Math.max(0, cursorIndex - range);
            const endIndex = Math.min(len - 1, cursorIndex + range);
            const classList = HtmlTools.getClassList(input, {
                startIndex: startIndex,
                endIndex: endIndex + 1 // 左闭右开
            });

            // 提取文本：只处理光标附近的 Token
            const offset = cursorIndex - startIndex;
            const leftText = HtmlTools.htmlClassToText(classList.slice(0, offset));
            const rightText = HtmlTools.htmlClassToText(classList.slice(offset));
            const fullText = leftText + rightText;

            if (!fullText) {
                return direction === 'both' ? [0, 0] : 0;
            }

            // --- 4. Token 分析 ---
            // splitPoint 是光标在 fullText 字符串中的逻辑分割点
            const splitPoint = leftText.replace(/\[[a-zA-Z0-9_]+]/g, '1').length; // 将中括号中的内容长度视为1
            const tokens = Public.tokenizer(fullText, {strictMode: false});

            let leftToken = null;
            let rightToken = null;
            let currentPos = 0;

            for (const token of tokens) {
                const tokenLen = this._getTokenLen(token);
                const tokenEnd = currentPos + tokenLen;

                // 判断光标是否落在一个 Token 的内部 (例如点击了 "sin" 中的 "i")
                // 条件：Token 开始于光标前，结束于光标后
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

                // 【边界匹配】
                // 情况A: Token 刚好在光标左侧结束
                if (tokenEnd === splitPoint) {
                    leftToken = token;
                }
                // 情况B: Token 刚好在光标右侧开始
                else if (currentPos === splitPoint) {
                    rightToken = token;
                    break; // 找到右侧邻居，分析结束
                }

                currentPos += tokenLen;
            }

            // --- 5. 计算常规步长 ---
            // 如果是点击模式(asCursor)，leftStep 为 0 (表示无偏移，直接定位到目标前)，
            // rightStep 根据左侧 Token 属性计算回退量
            const leftLen = this._getTokenLen(leftToken);
            const rightLen = this._getTokenLen(rightToken);
            const leftStep = asCursor ? 0 : leftLen;
            const rightStep = asCursor ? (leftLen - 1) : rightLen;

            // --- 6. 方向与边界处理 ---
            if (direction === 'both') {
                return [leftStep, rightStep];
            }

            // 物理边界检测 (点击模式不触发边界反弹)
            const isAtLeftEdge = (cursorIndex === 0) && !asCursor;
            const isAtRightEdge = (cursorIndex === len - 1) && !asCursor;

            if (direction === 'left') {
                // 左边界反弹：返回负的右侧步长
                return isAtLeftEdge ? -rightStep : leftStep;
            } else { // right
                // 右边界反弹：返回负的左侧步长
                return isAtRightEdge ? -leftStep : rightStep;
            }
        }

        /**
         * @static
         * @method addSpace
         * @description 自动在数学表达式的 DOM 表示中添加或移除空格，以提高可读性。
         * 核心逻辑：当字母函数名（如 "sin"）紧接另一个字母 token 时，插入空格（如 `sincos` -> `sin cos`）。
         *
         * @param {object} [options={}] - 配置选项。
         * @param {HTMLElement|null} [options.area=null] - (可选) 容器。默认为 #input。
         * @param {boolean} [options.rangeLimit=false] - (可选) 优化标志，限制处理范围在光标周围。
         * @returns {void}
         */
        static addSpace({area = null, rangeLimit = false} = {}) {
            // 1. 初始化与卫语句
            const REGEX_ALPHA = /[a-zA-Z]/;
            // 特殊字符类
            const specialCharacters = '_syntax_error_';

            // 如果是默认区域且当前仅显示 InputTip，直接返回
            if (!area && HtmlTools.getHtml('.InputTip')) {
                return;
            }

            const target = area || HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');
            const children = target.children;

            /**
             * @private
             * @function shouldAddSpace
             * @param {string} prevToken - 前一个 token。
             * @param {string} currToken - 后一个 token。
             * @description 内部辅助函数：判断两个 Token 之间是否需要插入空格
             * @returns {boolean}
             */
            const shouldAddSpace = (prevToken, currToken) => {
                if (!prevToken || !currToken) {
                    return false;
                }

                const prevInfo = Public.getTokenInfo(prevToken);
                const currInfo = Public.getTokenInfo(currToken);

                // 情况 A: 两个 Token 都是字母且合法，至少有一个是函数名 (func)，且不都是单字母特殊符号
                const isAlphaSeq = REGEX_ALPHA.test(prevToken) && REGEX_ALPHA.test(currToken);
                const hasFunc = prevInfo.class === 'func' || currInfo.class === 'func';
                const notSpecialSymbol = !(prevInfo.isHtmlClassLenOne || currInfo.isHtmlClassLenOne);
                const illegal = prevInfo.class !== 'illegal' && currInfo.class !== 'illegal';

                if (isAlphaSeq && hasFunc && notSpecialSymbol && illegal) {
                    return true;
                }

                // 情况 B: 非法字符边界处理 (Illegal Token 边界需要空格，除非是空格本身或特殊字符)
                const isBoundaryIllegal = (prevInfo.class === 'illegal') !== (currInfo.class === 'illegal');
                const isIgnoredChar = [prevToken, currToken].includes(' ') || prevInfo.isHtmlClassLenOne || currInfo.isHtmlClassLenOne;

                return isBoundaryIllegal && !isIgnoredChar;
            };

            // 删除空格范围
            let totalRangeStart = 0;
            let totalRangeEnd = children.length - 1;

            // 计算需要插入空格的索引位置 (addIndex)
            const addIndex = [];
            if (rangeLimit) {
                // --- 分支 A: 局部范围优化模式 ---
                const childrenArray = Array.from(children);
                const centerIndex = childrenArray.indexOf(cursor);

                // 找不到光标则直接退出
                if (centerIndex === -1) {
                    return;
                }

                // 计算扫描范围
                const range = Public.MAX_TOKEN_LENGTH * 2 + 3; // +2 for space, +1 for redundancy
                const startIndex = Math.max(0, centerIndex - range);
                const endIndex = Math.min(childrenArray.length - 1, centerIndex + range);

                // 获取光标左侧上下文
                const leftClassList = HtmlTools.getClassList(target, {
                    onlyP: false,
                    startIndex: startIndex,
                    endIndex: centerIndex // 左闭右开
                });

                // 获取光标右侧上下文
                const rightClassList = HtmlTools.getClassList(target, {
                    onlyP: false,
                    startIndex: centerIndex + 1,
                    endIndex: endIndex + 1 // 左闭右开
                });

                // Tokenize 并截取关注区间的 Token
                const leftTokens = Public.tokenizer(HtmlTools.htmlClassToText(leftClassList), {strictMode: false}).slice(-4);
                const rightTokens = Public.tokenizer(HtmlTools.htmlClassToText(rightClassList), {strictMode: false}).slice(0, 4);

                // 检查左侧边界
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

                // 检查右侧边界
                tokenStack.length = 0;
                let rightSpaceCount = 0;
                for (let i = 0; i < rightTokens.length; i++) {
                    if (rightTokens[i] === ' ') {
                        rightSpaceCount += 1;
                    } else {
                        if (tokenStack.length > 0) {
                            addPos = centerIndex - leftSpaceCount + this._getTokenLen(tokenStack[0]) + 1; // 1 for cursor itself
                        }
                        tokenStack.push(rightTokens[i]);
                    }

                    if (tokenStack.length === 2) {
                        break;
                    }
                }
                if (tokenStack.length !== 2) {
                    const len0 = this._getTokenLen(tokenStack[0]);
                    totalRangeEnd = centerIndex + len0 + rightSpaceCount + 1; // 1 for cursor itself
                } else {
                    if (shouldAddSpace(tokenStack[0], tokenStack[1])) {
                        addIndex.push(addPos);
                    }
                    const len0 = this._getTokenLen(tokenStack[0]);
                    const len1 = this._getTokenLen(tokenStack[1]);
                    totalRangeEnd = centerIndex + len0 + len1 + rightSpaceCount + 1; // 1 for cursor itself
                }
            } else {
                // --- 分支 B: 全局扫描模式 ---
                const classList = HtmlTools.getClassList(target, {
                    ignoreSpace: true,
                    onlyP: false
                });
                if (classList.length === 0) {
                    return;
                }

                let haveSpecialCharacters = false;
                if (classList[0] === specialCharacters) {
                    haveSpecialCharacters = true;
                    classList.shift();
                }

                const textList = HtmlTools.htmlClassToText(classList);
                const tokens = Public.tokenizer(textList, {strictMode: false});

                if (tokens && tokens.length > 0) {
                    let domPointer = 0; // 起始位置 (startIndex 默认为 0)

                    // 增加第一个 token 的长度作为初始偏移
                    domPointer += this._getTokenLen(tokens[0]);

                    for (let i = 1; i < tokens.length; i++) {
                        const currToken = tokens[i];
                        const prevToken = tokens[i - 1];

                        if (shouldAddSpace(prevToken, currToken)) {
                            addIndex.push(domPointer);
                        }

                        domPointer += this._getTokenLen(currToken);
                    }
                }

                if (haveSpecialCharacters) {
                    for (let i = 0; i < addIndex.length; i++) {
                        addIndex[i] = addIndex[i] + 1;
                    }
                    addIndex.unshift(1);
                }
            }

            // 保存原始显示状态
            const originalDisplay = target.style.display;
            // 先隐藏以避免重排多次
            target.style.display = 'none';

            // 删除空格
            let isLazyBg = false;
            for (let i = totalRangeStart; i < totalRangeEnd; i++) {
                const curr = children[i];
                if (curr.className === '_space_' || curr.dataset.lazyBgClass === '_space_') {
                    curr.remove();
                    totalRangeEnd -= 1;
                }
                if (!isLazyBg && curr.classList.contains('lazy-bg')) {
                    isLazyBg = true;
                }
            }
            // 批量插入空格
            for (let i = addIndex.length - 1; i >= 0; i--) {
                HtmlTools.appendDOMs(
                    target,
                    isLazyBg ? [['lazy-bg', '_space_']] : ['_space_'],
                    {
                        index: addIndex[i],
                        nameType: isLazyBg ? ['class', 'data-lazy-bg-class'] : ['class']
                    }
                );
            }

            // 恢复显示
            target.style.display = originalDisplay;
            // 确保视图跟随
            HtmlTools.scrollToView();
        }

        /**
         * @static
         * @method ac
         * @description 清除指定 DOM 区域的内容，或在未指定区域时重置主输入区域。
         * @param {HTMLElement | string} [acArea] - (可选) 目标 DOM 元素或其 ID 选择器。
         * @param {boolean} [forcedMode=false] - (可选) 是否强制设置为清空屏幕输入区域。
         */
        static ac(acArea, forcedMode = false) {
            // 1. 模式一：指定区域清除
            // 只要传入了参数（且不为 null/undefined），就视为清除特定区域
            if (acArea) {
                // 增强逻辑：允许传入字符串选择器（与 appendDOMs 保持一致）
                const target = typeof acArea === 'string' ? HtmlTools.getHtml(acArea) : acArea;

                // 健壮性检查：确保目标存在且是合法的 DOM 元素
                if (target && typeof target.replaceChildren === 'function') {
                    target.replaceChildren();
                }
                return; // 执行完毕直接返回
            }

            // 2. 模式二：重置主输入区域 (默认行为)
            const inputBox = HtmlTools.getHtml('#input');

            // 防御性编程：防止找不到 #input 导致报错
            if (!inputBox) {
                return;
            }

            if (HtmlTools.getHtml('.InputTip') || forcedMode) {
                const currentMode = PageConfig.currentMode;
                if (currentMode === '1') {
                    PageConfig.subModes = {'1': [0, 0]};
                    HtmlTools.getHtml('#grid_data').replaceChildren();
                    InputManager.statisticsAddLine();
                    PageConfig.setScreenData('1');
                } else if (currentMode !== '0') {
                    const len = HtmlTools.getHtml(`#screen_${currentMode}`).children.length;
                    for (let i = 0; i < len; i++) {
                        const area = `${currentMode}${i}`;
                        this.ac(HtmlTools.getHtml(`#screen_input_inner_${area}`));
                        PageConfig.setScreenData(area);
                    }
                    PageConfig.subModes = {'default': '0'};
                }
                return;
            }

            const cursor = document.createElement('div');
            cursor.id = 'cursor'; // 最佳实践：在元素插入 DOM 树之前设置好属性

            // 原子操作：一次性清空旧内容并插入新光标，浏览器只需重绘一次
            inputBox.replaceChildren(cursor);

            // 重启 worker
            if (PageConfig.currentMode === '0') {
                HtmlTools.getHtml('#screen_0_display').classList.add('NoDisplay');
                PrintManager.mode0ShowOnScreen.cancel();
                if (PrintManager.mode0ScreenInCalc) {
                    WorkerTools.restart();
                    PrintManager.mode0ScreenInCalc = false;
                }
            }

            // 更新 UI 状态
            PageControlTools.changeInputTip();
            HtmlTools.getHtml('#screen_0_display').classList.add('NoDisplay');
            HtmlTools.scrollToView();
        }

        /**
         * @static
         * @method input
         * @description 向主输入区域的光标前插入一个或多个代表数学符号或字符的 DOM 元素。
         * 此方法负责处理用户通过虚拟键盘或物理键盘输入时的 DOM 更新。
         * 它会移除初始的输入提示，将新元素插入到光标位置，并确保光标保持在视图中。
         *
         * @param {string[]} classArray - 一个包含 CSS 类名的字符串数组。数组中的每个类名都将被用于创建一个新的子元素（通常是 `<p>` 标签），
         *   该子元素的样式由其类名决定，从而在视觉上代表一个字符或符号。
         * @returns {void} 此函数没有返回值，其作用是直接修改 DOM。
         *
         * @example
         * // 模拟用户输入 "sin("
         * InputManager.input(['_s_', '_i_', '_n_', '_parentheses_left_']);
         */
        static input(classArray) {
            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay') || !HtmlTools.getHtml('#main').classList.contains('Input')) {
                return;
            }

            // 获取主输入区域和光标元素。
            const inputArea = HtmlTools.getHtml('#input');
            if (inputArea.children.length > this._MAX_INPUT_LEN) { // 防止输入过多数据
                return;
            }
            const cursor = HtmlTools.getHtml('#cursor');
            // 如果输入区域是空的（只包含输入提示），则在插入新内容前移除提示。
            if (inputArea.lastElementChild.classList.contains('InputTip')) {
                inputArea.lastElementChild.remove();
            }
            // 调用 appendDOMs 方法，将新元素批量插入到光标之前。
            HtmlTools.appendDOMs(inputArea, classArray, {referenceNode: cursor});
            // 空格管理
            this.addSpace({rangeLimit: true});
            // 插入新内容后，调用滚动方法以确保光标和新输入的内容在视图中可见。
            HtmlTools.scrollToView();
        }

        /**
         * @static
         * @method del
         * @param {'left'|'right'} direction - 删除方向
         * @description 从主输入区域中删除一个或多个元素，模拟退格键 (Backspace) 或删除键 (Delete) 的行为。
         * 此方法实现了“按词删除”的逻辑：
         * - 如果光标左侧是一个多字符的函数名（如 "sin"），它会一次性删除整个函数名。
         * - 如果光标位于输入区域的起始位置，它会执行“向前删除”（类似于 Delete 键），删除光标右侧的“单词”。
         * - 在删除操作后，它会检查输入区域是否变空，并在必要时恢复输入提示。
         * - 最后，它会调用滚动方法以确保光标在视图中可见。
         * @param {boolean} [forcedMode=false] - (可选) 是否强制设置为删除屏幕输入区域。
         * @returns {void} 此函数没有返回值，其作用是直接修改 DOM。
         */
        static del(direction = 'left', forcedMode = false) {
            const currentMode = PageConfig.currentMode;
            if (HtmlTools.getHtml('.InputTip') || forcedMode) {
                if (currentMode === '0') {
                    return;
                }
                if (currentMode === '1') {
                    const target = HtmlTools.getHtml('.GridOn');
                    let brotherTarget = target.nextElementSibling;
                    if (!brotherTarget) {
                        brotherTarget = target.previousElementSibling;
                    }
                    if (brotherTarget.children.length === 0) {
                        InputManager.statisticsDelLine();
                    } else {
                        this.ac(target);
                    }
                } else {
                    this.ac(HtmlTools.getCurrentSubscreenArea());
                }
                PageConfig.setScreenData();
                return;
            }

            // 获取主输入区域、光标元素及其当前位置。
            const input = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');
            const cursorPlace = [...input.children].indexOf(cursor);

            // 调用 inputAreaMoveNum(direction) 来确定要删除的“单词”的长度。
            // 如果光标在最左边，它会返回一个负数，表示需要执行向前删除。
            let delNum = this.inputAreaMoveNum(direction);
            const range = document.createRange();
            if (delNum < 0) {
                direction = direction === 'left' ? 'right' : 'left';
                delNum = -delNum;
            }
            if (direction === 'right') {
                // === Forward Delete (Delete 键) ===
                // delNum 为负数，例如 -1
                // 光标位置为 cursorPlace，我们要删除光标 *后面* 的元素。
                // 范围起始：光标位置 + 1
                // 范围结束：光标位置 + 1 + 删除数量的绝对值
                // 例如：[Cursor, A, B]，cursorPlace=0。删1个。Range(1, 2) -> 选中 A

                const endPlace = Math.min(cursorPlace + delNum, input.children.length - 1);
                range.setStartAfter(cursor);
                range.setEndAfter(input.children[endPlace]);
            } else if (direction === 'left') {
                // === Backspace (退格键) ===
                // delNum 为正数，例如 1
                // 光标位置为 cursorPlace，我们要删除光标 *前面* 的元素。
                // 范围起始：光标位置 - 删除数量
                // 范围结束：光标位置
                // 例如：[A, B, Cursor]，cursorPlace=2。删1个。Range(1, 2) -> 选中 B

                const startPlace = Math.max(cursorPlace - delNum, 0);
                range.setStartBefore(input.children[startPlace]);
                range.setEndBefore(cursor);
            }
            range.deleteContents();

            // 如果删除后输入区域只剩下光标，则恢复输入提示。
            if (input.children.length === 1) {
                PageControlTools.changeInputTip();
            }
            // 空格管理
            this.addSpace({rangeLimit: true});
            // 确保光标在操作后仍然可见。
            HtmlTools.scrollToView();
        }

        /**
         * @static
         * @method moveCursor
         * @description 在指定的 DOM 区域内移动光标元素。
         * 优化点：
         * 1. 移除高耗时的 indexOf 查找，改为 DOM 相对遍历。
         * 2. 修复向左环绕时销毁 DOM 节点的行为，改为直接移动现有节点。
         * 3. 增强代码的可读性和健壮性。
         * @param {'left'|'right'|'up'|'down'|'end'} direction - 指定光标移动的方向。
         * @param {boolean} [forcedMode=false] - (可选) 是否强制设置为移动屏幕输入区域。
         * @returns {void}
         */
        static moveCursor(direction, forcedMode = false) {
            const currentMode = PageConfig.currentMode;
            // 1. 检查是否有输入提示（如有提示则不允许移动光标）
            // 使用可选链更加安全，防止 getHtml 返回 null 时报错
            if (HtmlTools.getHtml('.InputTip') || forcedMode) {
                let len, nextNum;
                let makeValue;
                switch (currentMode) {
                    case '0':
                        return;

                    case '1': {
                        const currentSubModes = PageConfig.subModes['1'];
                        len = HtmlTools.getHtml('#grid_data').children.length - 1;
                        switch (direction) {
                            case 'left':
                            case 'right':
                                PageConfig.subModes = {'1': [currentSubModes[0], 1 - currentSubModes[1]]};
                                PageControlTools.syncScreenToInput();
                                // 确保视图跟随
                                HtmlTools.scrollToView();
                                return;
                            case 'up':
                            case 'down':
                                nextNum = currentSubModes[0] + (direction === 'up' ? -1 : 1);
                                makeValue = nextNum => [nextNum, currentSubModes[1]];
                                break;
                        }
                        break;
                    }

                    case '3':
                        len = 4;
                        if (['left', 'right'].includes(direction)) {
                            nextNum = Number(PageConfig.subModes[currentMode]) + (direction === 'left' ? -1 : 1);
                            makeValue = nextNum => nextNum.toString();
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
                        // 确保视图跟随
                        HtmlTools.scrollToView();
                        return;

                    default: {
                        len = HtmlTools.getHtml(`#screen_${currentMode}`).children.length - 1;
                        let addNum = 1;
                        if (['up', 'left'].includes(direction)) {
                            addNum = -1;
                        }
                        nextNum = Number(PageConfig.subModes[currentMode]) + addNum;
                        makeValue = nextNum => nextNum.toString();
                        // 确保视图跟随
                        HtmlTools.scrollToView();
                        break;
                    }
                }
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
                // 确保视图跟随
                HtmlTools.scrollToView();
                return;
            }

            // 2. 确定操作区域，默认为主输入区
            const targetArea = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');

            // 安全检查：确保区域和光标都存在
            if (!targetArea || !cursor) {
                return;
            }

            // 光标移动至末尾
            if (direction === 'end') {
                targetArea.appendChild(cursor);
                // 空格管理
                this.addSpace();
            } else {
                // 获取移动步长
                const moveNum = this.inputAreaMoveNum(direction);

                // --- 处理环绕（Wrap-around）行为 ---
                // 假设 inputAreaMoveNum 返回负数表示到达边界
                if (moveNum < 0) {
                    if (direction === 'left') {
                        // 向左环绕：移动到末尾
                        // 直接移动现有节点，不要销毁重建，保留节点引用和属性
                        targetArea.appendChild(cursor);
                    } else {
                        // 向右环绕：移动到开头
                        targetArea.insertBefore(cursor, targetArea.children[0]);
                    }
                }
                // --- 处理正常移动 ---
                else {
                    let targetNode = cursor;

                    if (direction === 'left') {
                        // 向左：向前查找 moveNum 个兄弟节点
                        for (let i = 0; i < moveNum && targetNode.previousElementSibling; i++) {
                            targetNode = targetNode.previousElementSibling;
                        }
                        // 将光标插入到目标节点之前
                        // 如果 targetNode 没变（比如已经是第一个），insertBefore 自己没有任何副作用
                        targetArea.insertBefore(cursor, targetNode);
                    } else {
                        // 向右：向后查找 moveNum 个兄弟节点
                        for (let i = 0; i < moveNum && targetNode.nextElementSibling; i++) {
                            targetNode = targetNode.nextElementSibling;
                        }
                        // 将光标插入到目标节点的下一个兄弟节点之前（即插到目标节点后面）
                        // 如果 targetNode.nextElementSibling 为 null，则相当于 appendChild
                        targetArea.insertBefore(cursor, targetNode.nextElementSibling);
                    }
                    // 空格管理
                    this.addSpace({rangeLimit: true});
                }
            }

            // 确保视图跟随
            HtmlTools.scrollToView();
        }

        /**
         * @static
         * @method clickMoveCursor
         * @description 将光标移动到输入区域内用户点击的位置。
         * 此方法实现了“按词移动”的智能定位：如果用户点击了一个多字符 token（如函数名 "sin"）的中间，
         * 它会将光标定位到该 token 的起始位置，而不是点击的精确字符位置。
         * @param {HTMLElement} target - 用户点击的 DOM 元素。
         * @returns {void}
         */
        static clickMoveCursor(target) {
            if (target.classList.contains('InputTip')) {
                return;
            }

            const input = HtmlTools.getHtml('#input');
            const cursor = HtmlTools.getHtml('#cursor');

            // 1. 获取目标在无光标状态下的纯净索引
            const contentChildren = [...input.children].filter(el => el.id !== 'cursor');
            const targetIndex = contentChildren.indexOf(target);

            if (targetIndex === -1) {
                return;
            }

            // 2. 计算偏移量 (如果点击了 'sin' 中的 'i'，我们需要知道 'i' 距离 's' 有多远)
            const offsetToStart = this.inputAreaMoveNum('left', target);

            // 3. 计算最终插入位置
            // 这里的逻辑是：如果点击的是普通字符，offset为0，光标插在 target 之前 (targetIndex)。
            // 如果点击 'i' (offset 1), 我们要插在 's' (targetIndex - 1) 之前。
            const finalIndex = targetIndex - offsetToStart;

            // 4. 执行移动
            // input.children 包含了 cursor，但 insertBefore 是基于实时 DOM 的。
            // 此时 cursor 还在旧位置。为了安全，可以先 remove 再 insert，或者利用 insertBefore 的特性。
            // 为了定位准确，我们应该找到第 finalIndex 个 *非cursor* 元素，插在它前面。

            const refNode = contentChildren[finalIndex] || null; // null 会插到末尾
            input.insertBefore(cursor, refNode);
            // 空格管理
            this.addSpace();
            // 确保视图跟随
            HtmlTools.scrollToView();
        }

        /**
         * @private
         * @static
         * @method _statisticsCreateLine
         * @description (内部辅助方法) 创建并返回统计模式数据网格中的单行 DOM 结构。
         * 此方法负责组装包含序号、X 值和 Y 值的三列，并为懒加载背景图设置必要的类和数据属性。
         *
         * @param {object} options - 包含行数据的配置对象。
         * @param {number} [options.index=0] - 当前行的索引（从 0 开始），用于生成行号。
         * @param {string[]} [options.inputListX=[]] - 代表 X 单元格内容的 CSS 类名数组。
         * @param {string[]} [options.inputListY=[]] - 代表 Y 单元格内容的 CSS 类名数组。
         * @returns {HTMLElement} 一个 `<div>` 元素，代表完整的数据网格行。
         */
        static _statisticsCreateLine(
            {
                index = 0,
                inputListX = [],
                inputListY = []
            }
        ) {
            // 创建新行的 DOM 元素
            const insert = document.createElement('div');

            // 创建序号列的 DOM 结构
            const serialNumberGrandfather = document.createElement('div');
            const serialNumberFather = document.createElement('div');
            const addNum = HtmlTools.textToHtmlClass((index + 1).toString());
            HtmlTools.appendDOMs(
                serialNumberFather,
                addNum.map(item => ['lazy-bg', item]),
                {nameType: ['class', 'data-lazy-bg-class']}
            );
            serialNumberGrandfather.appendChild(serialNumberFather);

            // 创建 X 数据列的 DOM 结构
            const gridX = document.createElement('div');
            gridX.classList.add('DataX');
            // HtmlTools.appendDOMs: 将处理后的节点批量追加到 subContent 容器中，
            // 并通过配置参数将 'lazy-bg' 映射为标签的 class/data 属性
            HtmlTools.appendDOMs(
                gridX,
                inputListX.map(item => ['lazy-bg', item]),
                {nameType: ['class', 'data-lazy-bg-class']}
            );

            // 创建 Y 数据列的 DOM 结构
            const gridY = document.createElement('div');
            gridY.classList.add('DataY');
            // HtmlTools.appendDOMs: 将处理后的节点批量追加到 subContent 容器中，
            // 并通过配置参数将 'lazy-bg' 映射为标签的 class/data 属性
            HtmlTools.appendDOMs(
                gridY,
                inputListY.map(item => ['lazy-bg', item]),
                {nameType: ['class', 'data-lazy-bg-class']}
            );

            // 将所有列添加到新行中
            insert.appendChild(serialNumberGrandfather);
            insert.appendChild(gridX);
            insert.appendChild(gridY);

            return insert;
        }

        /**
         * @static
         * @method statisticsAddLine
         * @description 在统计模式的数据网格中添加一行新的数据。
         * 此方法可以根据指定的位置插入新行，并填充初始的 x 和 y 值。
         * 如果未指定位置，则默认在网格末尾添加。
         * @param {object} [options={}] - 配置选项。
         * @param {Array<number|string>|null} [options.location=null] - (可选) 插入新行的位置。
         *   - 如果为 `null`，则在网格末尾添加。
         *   - 如果为数组 `[rowIndex, colIndex]`，则在指定行之前插入。
         * @param {string[]} [options.inputListX=[]] - (可选) 新行中 x 值的初始类名数组。
         * @param {string[]} [options.inputListY=[]] - (可选) 新行中 y 值的初始类名数组。
         * @returns {Promise<boolean>} 如果成功添加行，则返回 `true`；如果因达到最大行数限制而失败，则返回 `false`。
         */
        static async statisticsAddLine(
            {
                location = null,
                inputListX = [],
                inputListY = []
            } = {}
        ) {
            // 获取数据网格的父元素和其所有子行
            const gridData = HtmlTools.getHtml('#grid_data');
            const display = gridData.style.display;
            const gridDataChildren = gridData.children;
            const len = gridDataChildren.length;
            let target, position;
            // 确定新行的插入位置和参照目标
            if (location === null) {
                const pos = len - 1;
                position = pos < 0 ? 0 : pos;
                target = null;
            } else if (Array.isArray(location)) {
                position = location[0];
                target = gridDataChildren[position];
            } else {
                target = location;
                position = -1;
                for (let i = 0; i < len; i++) {
                    if (gridDataChildren[i] === target) {
                        position = i;
                        break;
                    }
                }
                if (position === -1) {
                    position = len;
                }
            }

            // 检查是否达到最大行数限制
            if (position + 2 > InputManager.MAX_STATISTICS_ROW) {
                return false;
            }

            // 提升性能
            gridData.style.display = 'none';
            // 创建数据行
            await this.statisticsRenderer.appendRender([[inputListX, inputListY]], {insertTarget: target});
            // 更新后续行的序号
            for (let i = position; i < gridDataChildren.length; i++) {
                const positionContainer = gridDataChildren[i].firstElementChild.firstElementChild;
                const newNum = HtmlTools.textToHtmlClass((i + 1).toString());
                // HtmlTools.appendDOMs: 将处理后的节点批量追加到 subContent 容器中，
                // 并通过配置参数将 'lazy-bg' 映射为标签的 class/data 属性
                HtmlTools.appendDOMs(
                    positionContainer,
                    newNum.map(item => ['lazy-bg', item]),
                    {
                        nameType: ['class', 'data-lazy-bg-class'],
                        mode: 'replace'
                    }
                );
            }

            PageConfig.setScreenData();
            const currentSubMode = PageConfig.subModes['1'];
            HtmlTools.getHtml('.GridOn')?.classList?.remove('GridOn');
            gridDataChildren[currentSubMode[0]].children[currentSubMode[1] + 1].classList.add('GridOn');
            gridData.style.display = display;
            HtmlTools.scrollToView();
            return true;
        }

        /**
         * @static
         * @method statisticsDelLine
         * @description 在统计模式的数据网格中删除一行数据。
         * 此方法根据指定的位置删除行。如果未指定位置，则默认删除当前高亮行。
         * 删除行后，会更新后续行的序号，并确保如果删除的是高亮行，则重新设置高亮。
         * @param {Array<number|string>|null} [location=null] - (可选) 要删除的行的位置。
         *   - 如果为 `null`，则删除当前高亮行。
         *   - 如果为数组 `[rowIndex, colIndex]`，则删除指定行。
         * @returns {void}
         */
        static statisticsDelLine(location = null) {
            // 获取数据网格的所有子行
            let target, position;
            const gridData = HtmlTools.getHtml('#grid_data');
            const display = gridData.style.display;
            const gridDataChildren = gridData.children;
            const len = gridDataChildren.length;
            if (location === null) {
                target = HtmlTools.getHtml('.GridOn').parentNode;
                position = -1;
                for (let i = 0; i < len; i++) {
                    if (gridDataChildren[i] === target) {
                        position = i;
                        break;
                    }
                }
                if (position === -1) {
                    position = len;
                }
            } else {
                const typeNum = typeof location === 'number';
                position = typeNum ? location : location[0];
                target = typeNum ? gridDataChildren[location] : gridDataChildren[location[0]];
            }
            // 如果目标行没有内容，则不执行删除操作
            const noInner = target.children[1].children.length === 0 && target.children[2].children.length === 0;
            const num = Number(HtmlTools.htmlClassToText(HtmlTools.getClassList(target.children[0].children[0])));
            if (noInner && num === len) {
                return;
            }
            // 从 DOM 中移除目标行
            target.remove();
            // 如果删除的是高亮行，则重新设置高亮
            if (!HtmlTools.getHtml('.GridOn')) {
                const currentSubMode = PageConfig.subModes['1'];
                PageConfig.subModes = {'1': currentSubMode};
                // 同步输入区域的内容，确保 UI 状态一致
                PageControlTools.syncScreenToInput(false);
            }
            // 提升性能
            gridData.offsetHeight;
            gridData.style.display = 'none';
            // 更新后续行的序号
            for (let i = position; i < gridDataChildren.length; i++) {
                const positionContainer = gridDataChildren[i].firstElementChild.firstElementChild;
                const newNum = HtmlTools.textToHtmlClass((i + 1).toString());
                HtmlTools.appendDOMs(
                    positionContainer,
                    newNum.map(item => ['lazy-bg', item]),
                    {
                        nameType: ['class', 'data-lazy-bg-class'],
                        mode: 'replace'
                    }
                );
            }
            gridData.style.display = display;
            HtmlTools.scrollToView();
            PageConfig.setScreenData();
        }
    }

    /**
     * @class PrintManager
     * @description 一个静态工具类，提供控制 UI 输入的函数。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class PrintManager {
        /**
         * @private
         * @static
         * @readonly
         * @type {number}
         * @description 定义了在用户输入时，用于防抖（debounce）UI更新（如模式0下的实时计算结果显示）的延迟时间（以毫秒为单位）。
         * 这可以防止在用户快速连续输入时过于频繁地触发计算和DOM更新，从而提高性能和用户体验。
         */
        static _DELAY_TIME = 170;

        /**
         * @private
         * @static
         * @readonly
         * @type {number}
         * @description 定义了在用户输入时，用于防抖（debounce）UI更新（如模式0下的实时计算结果显示）的最长延迟时间（以毫秒为单位）。
         */
        static _MAX_DELAY_TIME = 1700;

        /**
         * @static
         * @type {VirtualScroll}
         * @description VirtualScroll 实例。
         * 用于管理函数列表输出的显示。
         */
        static printListRenderer = new VirtualScroll({
            container: '#print_content_2_inner',   // 滚动区域的选择器

            /**
             * @function rowRenderer
             * @param {Object} dataSource - 外部传入的完整数据包装对象
             * @param {number} index - 当前渲染的行索引
             * @returns {HTMLElement} 返回拼装好的一行 DOM
             * @description 负责单行 DOM 的组装
             */
            renderItem(index, dataSource) {
                // 从外部传入的数据源中解构出当前需要的所有状态，不依赖外部闭包变量
                const {result, onlyFuncG} = dataSource;

                // 1. 根据模式标识，组装当前行的列数据来源顺序
                const sources = onlyFuncG ?
                    [result.varList[index], result.g[index], result.f[index]] :
                    [result.varList[index], result.f[index], result.g[index]];

                // 2. 创建该行的外层包裹容器
                const currentDiv = document.createElement('div');

                // 3. 遍历组装好的数据列
                sources.forEach(dataItem => {
                    const subWrapper = document.createElement('div');
                    const subContent = document.createElement('div');

                    // 处理原生数据并映射为带有 'lazy-bg' 标识的数组
                    const formattedNodes = PrintManager._printHandleError(dataItem);

                    // 将处理后的节点追加到内容容器中
                    HtmlTools.appendDOMs(subContent, formattedNodes);

                    // 建立层级关系
                    subWrapper.appendChild(subContent);
                    currentDiv.appendChild(subWrapper);
                });

                // 4.加入奇偶顺序
                if (result.varList.length > 4) {
                    currentDiv.classList.add(index % 2 === 0 ? 'Even' : 'Odd');
                }

                // 返回完整的一行 DOM 树交给底层批量挂载
                return currentDiv;
            }
        });

        /**
         * @static
         * @type {boolean}
         * @description Worker 是否正在计算 mode0ShowOnScreen 发送的任务。
         */
        static mode0ScreenInCalc = false;

        /**
         * @static
         * @type {object|string}
         * @description 存储模式 1 (统计回归) 的计算结果。
         * - 如果计算成功，它是一个包含各种回归模型结果的对象 (例如 linear, square, ln 等)。
         * - 如果计算出错，它将被设置为字符串 'error'。
         * 此属性用于在用户点击导出按钮时，获取当前选定回归模型的方程字符串。
         */
        static mode1Results;

        /**
         * @static
         * @method mode0ShowOnScreen
         * @description 一个防抖（debounced）函数，用于在标准计算模式（模式 '0'）下，在屏幕上异步显示当前输入表达式的实时计算结果。
         *
         * 该方法通过以下步骤工作：
         * 1. **防抖**: 使用 `debounce` 包装器，确保只有在用户停止输入一段预设的时间（`this.DELAY_TIME`）后，计算和UI更新才会被触发。这可以防止在用户快速打字时进行不必要的、耗费资源的计算。
         * 2. **获取输入**: 从主输入区域获取当前的表达式字符串。
         * 3. **异步计算**: 调用 `WorkerTools.exec` 将表达式发送到 Web Worker 进行异步计算。这可以防止复杂的计算阻塞主线程，保持界面的响应性。计算使用较低的“普通精度”以获得更快的响应。
         * 4. **显示结果**:
         *    - 如果计算成功，它会将结果格式化为一系列 DOM 元素，并更新到屏幕上专门用于显示结果的区域 (`#screen_0_display_inner`)，然后使该区域可见。
         *    - 如果计算失败（例如，表达式有语法错误），它会隐藏结果显示区域，不显示任何内容。
         * @returns {Promise<void>} 此方法本身不直接返回任何内容，但它触发的异步计算会返回一个 Promise。
         */
        static mode0ShowOnScreen = HtmlTools.debounce(this._mode0ShowOnScreenFunc, this._DELAY_TIME, {
            leading: true,
            trailing: true,
            maxWait: this._MAX_DELAY_TIME
        });

        /**
         * @constructor
         * @description PrintManager 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 PrintManager 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[PrintManager] PrintManager is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _printHandleError
         * @description 处理输出字符串，将其转换为用于显示的 HTML 类名数组。
         * 如果输入是错误标识 'error'，则返回特定的错误类名 ['_error_']；
         * 否则，调用 HtmlTools.textToHtmlClass 将字符串转换为对应的类名数组。
         * @param {string} str - 需要处理的字符串，通常是计算结果或 'error'。
         * @returns {string[]} 一个包含 CSS 类名的字符串数组。
         */
        static _printHandleError(str) {
            // 如果输入字符串不是 'error'，则进行正常的文本到类名的转换
            if (str !== 'error') {
                return HtmlTools.textToHtmlClass(str);
            }
            return ['_error_'];
        }

        /**
         * @private
         * @static
         * @description (内部辅助) 批量渲染列表数据到目标容器，利用 DocumentFragment 优化性能。
         *
         * @param {HTMLElement} outputTarget - 目标容器
         * @param {Array<any>} list - 数据源列表
         * @param {(container: HTMLElement, item: any, index?: number) => void} toDomFunc - 渲染回调函数
         * @param {boolean} [needIndex=false] - 是否改变回调参数签名
         * @returns {void}
         */
        static _multipleLinesPrint(outputTarget, list, toDomFunc, needIndex = false) {
            // 创建一个文档片段，用于暂存所有新创建的行，避免频繁触发重排/重绘
            const fragment = document.createDocumentFragment();
            // 遍历数据列表
            for (let i = 0; i < list.length; i++) {
                // 为每一项数据创建一个新的 div 容器
                const div = document.createElement('div');
                if (list[i].includes('error') || list[i].includes('_error_')) {
                    HtmlTools.appendDOMs(div, ['_error_']);
                } else {
                    // 调用传入的回调函数，将数据转换为 DOM 元素并添加到 div 中
                    needIndex ? toDomFunc(div, list[i], i) : toDomFunc(div, list[i]);
                }
                // 将填充好的 div 添加到文档片段中
                fragment.appendChild(div);
            }
            // 一次性清空目标容器并插入所有新行
            outputTarget.replaceChildren(fragment);
        }

        /**
         * @private
         * @static
         * @method _setMode1Results
         * @description 将统计模式（模式 1）的计算结果批量渲染到页面上。
         * 此方法负责协调回归分析结果的显示和基础统计数据的填充。
         * 它会根据计算出的“最佳模型”自动更新回归分析部分的 UI，并将所有统计指标（如平均值、方差等）填入对应的表格单元格中。
         *
         * @param {object|string} resultList - 包含统计结果的对象或错误标识字符串。
         *   - 如果是对象，应包含：
         *     - `bestModel` {string}: 最佳回归模型的名称（如 'linear'）。
         *     - `[modelName]` {object}: 各个回归模型的详细数据。
         *     - `r`, `averageA`, `sumA` 等: 基础统计数据。
         *   - 如果是 'error'，表示计算过程中发生错误。
         * @param {string} [resultList.bestModel] - (当为对象时) 最佳回归模型的名称（例如 'linear'）。
         * @returns {void}
         */
        static _setMode1Results(resultList) {
            /**
             * @function modelToId
             * @description (内部辅助函数) 将回归模型名称映射到对应的 UI 选择器 ID。
             * @param {string} modelName - 模型名称 (e.g., 'linear', 'square').
             * @returns {string} 对应的 DOM ID (e.g., 'choose_ra_0').
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

            // --- 错误处理 ---
            // 如果计算结果为 'error'，则清空或显示错误状态
            if (resultList === 'error') {
                // 设置回归分析区域为错误状态
                PrintManager.setMode1RaResults('error');
                // 遍历所有统计数据单元格（ID 从 2 到 21），填充错误图标
                for (let i = 2; i < 22; i++) {
                    HtmlTools.appendDOMs(HtmlTools.getHtml(`#print_content_1_content_${i}`), ['_error_'], {mode: 'replace'});
                }
                // 重置回归模型选择为默认（线性回归）
                PageControlTools.changePrint1Ra('choose_ra_0', 'init');
                return;
            }

            // --- 结果映射配置 ---
            // 定义统计数据属性名与页面 DOM 元素 ID 的对应关系
            const resultsToOutputArea = {
                'n': '#print_content_1_content_2', // 基数
                'averageA': '#print_content_1_content_3', // x 平均值
                'sumA': '#print_content_1_content_4', // x 总和
                'sum2A': '#print_content_1_content_5', // x 平方和
                'totalVarianceA': '#print_content_1_content_6', // x 总体标准差
                'sampleVarianceA': '#print_content_1_content_7', // x 样本标准差
                'maxA': '#print_content_1_content_8', // x 最大值
                'minA': '#print_content_1_content_9', // x 最小值
                'averageB': '#print_content_1_content_10', // y 平均值
                'sumB': '#print_content_1_content_11', // y 总和
                'sum2B': '#print_content_1_content_12', // y 平方和
                'totalVarianceB': '#print_content_1_content_13', // y 总体标准差
                'sampleVarianceB': '#print_content_1_content_14', // y 样本标准差
                'maxB': '#print_content_1_content_15', // y 最大值
                'minB': '#print_content_1_content_16', // y 最小值
                'dotAB': '#print_content_1_content_17', // Σxy
                'dotA2B': '#print_content_1_content_18', // Σx²y
                'totalCovariance': '#print_content_1_content_19', // 总体协方差
                'sampleCovariance': '#print_content_1_content_20', // 样本协方差
                'r': '#print_content_1_content_21' // 相关系数
            };

            // --- 更新 UI ---
            // 1. 显示最佳回归模型的结果（方程和 R²）
            this.setMode1RaResults(resultList[resultList.bestModel]);
            // 2. 在 UI 上选中最佳回归模型对应的选项卡
            PageControlTools.changePrint1Ra(modelToId(resultList.bestModel), 'init');
            // 3. 遍历映射表，将所有基础统计数据渲染到对应的 DOM 元素中
            Object.entries(resultsToOutputArea).forEach(([key, value]) => {
                HtmlTools.appendDOMs(HtmlTools.getHtml(value), this._printHandleError(resultList[key]), {mode: 'replace'});
            });
        }

        /**
         * @static
         * @method setMode1RaResults
         * @description 更新统计回归模式（模式 1）下特定回归模型的结果显示。
         * 此方法负责将计算出的回归系数（参数）和决定系数 (R²) 渲染到页面的相应区域。
         * 如果计算结果为错误，则显示错误图标。
         *
         * @param {object|string} RaList - 回归分析结果对象或错误标识字符串。
         *   - 如果是对象，应包含以下属性：
         *     - `R2` {string}: 决定系数的字符串表示。
         *     - `parameter` {Array<string>}: 回归系数的字符串数组。
         *     - `regressionEquation` {string}: 回归方程字符串（用于检查是否出错）。
         *     - `model` {string}: 模型名称（如 'linear', 'square'），用于特定格式调整。
         *   - 如果是字符串 'error'，表示计算出错。
         * @param {string} [RaList.model] - (当为对象时) 回归模型名称。
         * @param {string} [RaList.R2] - (当为对象时) 可决系数 R²。
         * @param {Array<string>} [RaList.parameter] - (当为对象时) 回归模型参数列表。
         * @param {string} [RaList.regressionEquation] - (当为对象时) 回归模型计算结果。
         * @returns {void}
         */
        static setMode1RaResults(RaList) {
            // 获取用于显示回归系数的容器元素
            const content0 = HtmlTools.getHtml('#print_content_1_content_0');

            // --- 错误处理 ---
            // 如果输入是 'error'，则在系数显示区和 R² 显示区都显示错误图标
            if ([RaList, RaList.regressionEquation].includes('error')) {
                const element = document.createElement('div');
                HtmlTools.appendDOMs(element, ['_error_']);
                content0.replaceChildren(element);
                HtmlTools.appendDOMs(HtmlTools.getHtml('#print_content_1_content_1'), ['_error_'], {mode: 'replace'});
                return;
            }

            // --- 更新 R² 显示 ---
            // 将 R² 的值转换为 HTML 类名并显示在对应区域
            HtmlTools.appendDOMs(HtmlTools.getHtml('#print_content_1_content_1'), this._printHandleError(RaList.R2), {mode: 'replace'});

            // --- 构建系数显示列表 ---
            const parameter = structuredClone(RaList.parameter);
            // 对于线性 (y=ax+b) 和二次 (y=ax^2+bx+c) 回归，内部计算的系数顺序与显示习惯相反
            // 这里进行反转以匹配习惯（例如内部可能是 [b, a]，显示需要 a, b）
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
         * @private
         * @static
         * @async
         * @function _mode0ShowOnScreenFunc
         * @description 这是 `mode0ShowOnScreen` 防抖函数的实际执行体。
         * 它负责获取当前输入，调用 Web Worker 进行计算，并将结果或错误状态反映到 UI 上。
         * 这是一个异步函数，因为它需要等待 `WorkerTools.exec` 的 Promise 解析。
         * @returns {Promise<void>} 一个在 UI 更新完成后解析的 Promise。
         */
        static async _mode0ShowOnScreenFunc() {
            // 标记当前请求 ID，防止竞态
            const requestId = Date.now();
            if (this.mode0ScreenInCalc) {
                // 取消之前积压的计算任务，优先响应当前输入
                WorkerTools.restart();

                // 也可以使用软取消（性能更好）
                // WorkerTools.cancelWorker();
            }
            this.mode0ScreenInCalc = true;
            this._currentRequestId = requestId;

            // 获取用于显示结果的 DOM 元素。
            const screen0Display = HtmlTools.getHtml('#screen_0_display');
            const screen0DisplayInner = HtmlTools.getHtml('#screen_0_display_inner');
            // 从输入区域的 DOM 元素中重建表达式字符串。
            let currentInput = HtmlTools.htmlClassToText(HtmlTools.getClassList(HtmlTools.getHtml('#input'), {ignoreSpace: true}));
            // 如果最后一个 token 是二元函数，则删除以符合习惯
            let isMiddleFunc = true;
            while (isMiddleFunc) {
                const lastFragment = currentInput.slice(-Public.MAX_TOKEN_LENGTH - 2);
                const lastToken = Public.tokenizer(lastFragment, {strictMode: false}).slice(-1)[0];
                isMiddleFunc = Public.getTokenInfo(lastToken)?.funcPlace === 'middle';
                if (isMiddleFunc) {
                    currentInput = currentInput.slice(0, -lastToken.length);
                }
            }

            try {
                // 异步调用 Web Worker 执行计算。
                // 使用“普通精度”模式以获得更快的响应。
                const result = await WorkerTools.exec(currentInput, {
                    calcAcc: PageConfig.ACC_MODE_0.globalCalcAccuracy,
                    outputAcc: PageConfig.ACC_MODE_0.outputAccuracy,
                    f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                    g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                });
                // 如果当前 ID 不等于发起时的 ID，说明已有新请求，丢弃旧结果
                if (this._currentRequestId !== requestId) {
                    return;
                }
                // 如果计算成功，移除结果区域的隐藏类，使其可见。
                screen0Display.classList.remove('NoDisplay');
                // 将计算结果字符串转换为一系列 DOM 元素并附加到结果区域。
                HtmlTools.appendDOMs(screen0DisplayInner, HtmlTools.textToHtmlClass(result.result), {mode: 'replace'});
            } catch (e) {
                // 仅在非取消错误时隐藏（被取消的任务不应影响 UI）
                if (e.name !== 'CancellationError' && this._currentRequestId === requestId) {
                    screen0Display.classList.add('NoDisplay');
                }
            } finally {
                // 只有当“全局当前ID”等于“我的ID”时，我才有资格释放锁。
                // 如果 ID 不相等，说明有新任务(如 B)已经进来了，锁应该由 B 来管理，我(A)不能碰。
                if (this._currentRequestId === requestId) {
                    this.mode0ScreenInCalc = false;
                }
            }
        }

        /**
         * @private
         * @static
         * @async
         * @method _exeMode0
         * @description 执行模式0（Mode 0）的核心计算逻辑与 UI 渲染。
         * 该方法负责从 DOM 获取用户输入，清洗数据后调用 Worker 进行异步计算。
         * 它包含完整的错误处理流程：若计算失败，会自动判断是否为语法错误，并尝试通过 syntaxCheck 模式获取修正后的表达式，最终将格式化后的结果或错误信息渲染回界面。
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode0() {
            // 1. 准备 DOM 元素
            const inputEl = HtmlTools.getHtml('#input');
            const textDisplay = HtmlTools.getHtml('#print_content_0_content_0');
            const resultDisplay = HtmlTools.getHtml('#print_content_0_content_1');
            const screenDisplay = HtmlTools.getHtml('#screen_0_display');

            // 2. 处理输入
            const currentInputArray = HtmlTools.getClassList(inputEl, {ignoreSpace: true});
            if (currentInputArray[0].includes('InputTip')) {
                currentInputArray.length = 0;
            }
            const currentInput = HtmlTools.htmlClassToText(currentInputArray);

            // 3. 重置显示
            InputManager.ac(textDisplay);
            InputManager.ac(resultDisplay);
            const needReshow = this.mode0ScreenInCalc || this.mode0ShowOnScreen.pending();
            if (needReshow) {
                this.mode0ShowOnScreen.cancel();
                screenDisplay.classList.add('NoDisplay');
                if (this.mode0ScreenInCalc) {
                    WorkerTools.restart();
                }
                // 确保标志复位
                this.mode0ScreenInCalc = false;
            }

            let expr, result;

            try {
                // 尝试执行
                const realResult = await WorkerTools.exec(currentInput, {
                    f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                    g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                });
                ({expr, result} = realResult);
                // 格式化结果
                expr = HtmlTools.textToHtmlClass(expr);
                result = HtmlTools.textToHtmlClass(result);
            } catch (error) {
                if (error.name === 'TerminationError' || error.name === 'CancellationError') {
                    // 如果是用户取消或 Worker 重启导致的中断，直接退出，不要进行后续的语法检查或 UI 更新
                    return;
                }

                // 错误处理逻辑保持一致，仅优化写法
                result = ['_error_'];
                const syntaxErrorOutput = ['_syntax_error_', ...currentInputArray];

                // 尝试 syntaxCheck 模式
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

            // 5. 渲染结果
            HtmlTools.appendDOMs(textDisplay, expr);
            HtmlTools.appendDOMs(resultDisplay, result);
            InputManager.addSpace({area: textDisplay});

            // 状态重置逻辑优化
            if (result[0] !== '_error_' && screenDisplay.classList.contains('NoDisplay')) {
                if (PageConfig.calcAccMode === 0) {
                    // 普通模式：直接上屏，任务结束，手动重置标志
                    const screenDisplayInner = HtmlTools.getHtml('#screen_0_display_inner');
                    screenDisplay.classList.remove('NoDisplay');
                    HtmlTools.appendDOMs(screenDisplayInner, result, {mode: 'replace'});
                } else {
                    // 高精度模式：重新触发计算
                    PrintManager.mode0ShowOnScreen();
                    // 确保 _exeMode0 在预览更新完成后才算真正结束
                    PrintManager.mode0ShowOnScreen.flush();
                    // 注意：不需要在这里 set false，因为 _mode0ShowOnScreenFunc 内部的 finally 会处理
                }
            }
        }

        /**
         * @private
         * @static
         * @async
         * @method _exeMode1
         * @description 执行模式 1（统计回归模式）的核心计算逻辑。
         * 该方法负责：
         * 1. 从数据网格 DOM 中提取 X 和 Y 列的数据。
         * 2. 验证数据的有效性（检查是否有语法错误标记）。
         * 3. 处理空单元格（默认填充为 0）。
         * 4. 将提取的数据转换为文本格式。
         * 5. 调用 Web Worker 执行统计和回归计算。
         * 6. 将计算结果渲染到界面，并缓存结果以便导出。
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode1() {
            // 获取数据网格的所有行元素
            const data = HtmlTools.getHtml('#grid_data').children;
            const screenData = PageConfig.screenData['1'];
            const listA = [], listB = [];

            // 初始化选择统计计算输出区域
            PageControlTools.triggerSelection(HtmlTools.getHtml('#statistics_results_top_x'));
            PageControlTools.switchStatisticsResults('x');

            // 遍历每一行数据（排除最后一行，通常最后一行是空的或用于添加新行）
            for (let i = 0; i < screenData.length; i++) {
                // 获取当前行的 X 和 Y 数据单元格
                const currentA = data[i].children[1];
                const currentB = data[i].children[2];

                // 获取单元格内容的类名列表（即输入的 Token）
                let currentPushA = screenData[i][0];
                let currentPushB = screenData[i][1];

                // 检查是否存在语法错误标记
                if (currentPushA.startsWith('[syntax_error]') || currentPushB.startsWith('[syntax_error]')) {
                    this._setMode1Results('error');
                    this.mode1Results = 'error';
                    PageConfig.setScreenData();
                    return;
                }

                // 如果单元格为空，自动填充为 0，并更新 DOM 显示
                if (currentPushA.length === 0) {
                    HtmlTools.appendDOMs(
                        currentA,
                        [['lazy-bg', '_0_']],
                        {nameType: ['class', 'data-lazy-bg-class']}
                    );
                    currentPushA = '0';
                }
                if (currentPushB.length === 0) {
                    HtmlTools.appendDOMs(
                        currentB,
                        [['lazy-bg', '_0_']],
                        {nameType: ['class', 'data-lazy-bg-class']}
                    );
                    currentPushB = '0';
                }

                // 将为文本表达式添加到列表中
                listA.push(currentPushA);
                listB.push(currentPushB);
            }

            // 保存当前屏幕数据到 LocalStorage
            PageConfig.setScreenData();

            try {
                // 调用 Worker 进行异步统计计算
                const resultList = await WorkerTools.statisticsCalc(listA, listB);

                // 将计算结果渲染到界面
                this._setMode1Results(resultList);

                // 缓存各回归模型的结果，用于后续可能的导出操作
                // 键名对应 UI 上的选择器 ID
                this.mode1Results = {
                    'choose_ra_0': resultList.linear,     // 线性回归
                    'choose_ra_1': resultList.square,     // 二次回归
                    'choose_ra_2': resultList.ln,         // 对数回归
                    'choose_ra_3': resultList.exp,        // 指数回归 (e底)
                    'choose_ra_4': resultList.abx,        // 指数回归 (通用底)
                    'choose_ra_5': resultList.axb,        // 幂回归
                    'choose_ra_6': resultList.reciprocal  // 倒数回归
                };
            } catch {
                // 捕获计算过程中的错误（如数据点不足、计算溢出等）
                this._setMode1Results('error');
                this.mode1Results = 'error';
            }
        }

        /**
         * @private
         * @static
         * @async
         * @method _exeMode2
         * @description 执行模式2（“函数列表”模式）的核心计算与UI渲染逻辑。
         * 该方法负责从UI获取一个或两个函数表达式（f(x), g(x)）以及一个数值范围（起始、终止、步长），
         * 然后调用Web Worker异步计算在指定范围内的函数值。
         * 计算完成后，它会动态生成一个HTML表格来展示自变量（x）、f(x)和g(x)的对应值。
         *
         * 此方法还处理了多种情况：
         * - **单函数/双函数显示**：根据用户是否只提供了一个函数，动态调整表格的表头和内容。
         * - **错误处理**：如果函数表达式无效或计算过程中发生错误，它会捕获异常并显示一个错误提示，而不是渲染表格。
         * - **DOM性能优化**：使用 `DocumentFragment` 来批量构建表格行，最后一次性插入DOM，以减少页面重绘，提高渲染性能。
         *
         * @returns {Promise<void>} 此方法没有返回值，其主要作用是通过DOM操作来更新页面内容。
         */
        static async _exeMode2() {
            // 获取表头中用于显示函数名的元素，以便后续根据单/双函数模式进行更新。
            const headInit = HtmlTools.getHtml('#print_content_2_head').children[1].children[0];
            // 默认设置为双函数显示模式。
            HtmlTools.getHtml('#print_content_2').classList.add('TwoFunc');
            // 默认表头显示 f(x)。
            headInit.classList.add('_f_');
            headInit.classList.remove('_g_');
            // 从 UI 获取 f(x) 和 g(x) 的表达式字符串。
            const fx = PageConfig.screenData['2_00'];
            const gx = PageConfig.screenData['2_01'];
            // 从 UI 获取数值列表的范围参数：起始值、步长和终止值。
            const start = PageConfig.screenData['2_10'];
            const step = PageConfig.screenData['2_12'];
            const end = PageConfig.screenData['2_11'];

            try {
                let onlyFuncG = false;
                // 检查是否只有一个函数被定义。
                if (fx === '' !== (gx === '')) { // (fx === '' || gx === '') && !(fx === '' && gx === '')
                    if (fx === '') {
                        // 如果只有 g(x) 被定义，则更新表头并设置标志。
                        headInit.classList.add('_g_');
                        headInit.classList.remove('_f_');
                        onlyFuncG = true;
                    }
                    // 切换到单函数显示模式。
                    HtmlTools.getHtml('#print_content_2').classList.remove('TwoFunc');
                } else if (fx === '') { // fx === '' && gx === ''
                    // 如果两个函数都未定义，则显示错误并终止。
                    HtmlTools.getHtml('#print_content_2_error').classList.remove('NoDisplay');
                    return;
                }
                // 调用 Web Worker 异步计算函数值列表。
                const result = await WorkerTools.valueList(fx, gx, start, step, end);
                // 创建页面加载器
                void this.printListRenderer.load(
                    {result, onlyFuncG},
                    result.varList.length,
                    {remeasure: true}
                );
                // 成功生成表格，隐藏错误提示。
                HtmlTools.getHtml('#print_content_2_error').classList.add('NoDisplay');
            } catch {
                // 如果在获取输入或调用 Worker 时发生错误，则显示错误提示。
                HtmlTools.getHtml('#print_content_2_error').classList.remove('NoDisplay');
                HtmlTools.getHtml('#print_content_2_inner').replaceChildren();
            }
        }

        /**
         * @private
         * @static
         * @async
         * @method _exeMode3
         * @description 执行模式 3（多项式函数分析）的核心计算与 UI 渲染逻辑。
         * 该方法负责：
         * 1. 从屏幕输入数据中收集多项式的系数（a, b, c, d, e）。
         * 2. 调用 Web Worker 进行多项式函数的全面分析（求导、求根、极值、拐点等）。
         * 3. 将分析结果格式化并渲染到页面的相应输出区域。
         * 4. 处理计算过程中的错误，并在界面上显示错误状态。
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode3() {
            /**
             * @function powerFunctionTextToHtml
             * @description (内部辅助函数) 将分析结果的文本项转换为 HTML DOM 元素并插入目标容器。
             * 专门处理区间（如 `(-inf, 2)`）和点坐标（如 `(1, 5)`）的格式化显示。
             * @param {HTMLElement} target - 目标 DOM 容器。
             * @param {Array<string>} textList - 包含两个元素的数组，代表区间边界或点的坐标 `[left, right]`。
             * @param {boolean} [useBracket=false] - 是否强制使用方括号 `[]` (通常用于闭区间，但在当前逻辑中似乎主要用于区分)。
             *   注意：代码逻辑中 `useBracket` 为 true 时使用 `_bracket_` (方括号)，否则使用 `_parentheses_` (圆括号)。
             *   对于无穷大 `inf`，通常保持开区间（圆括号）。
             */
            const powerFunctionTextToHtml = (target, textList, useBracket = false) => {
                if (textList.includes('error')) {
                    HtmlTools.appendDOMs(target, ['error']);
                    return;
                }
                // 处理空结果
                if (textList[0] === 'null') {
                    HtmlTools.appendDOMs(target, ['_null_'], {mode: 'replace'});
                    return;
                }
                // 处理实数集 R (-inf, +inf)
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
                // 处理左边界
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
                // 处理右边界
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
             * @function powerFunctionRootToHtml
             * @description (内部辅助函数) 将多项式函数的根（零点）列表转换为 HTML DOM 元素并插入目标容器。
             * 它处理特殊情况，如无实根 ('null') 或恒等式 ('anyRealNumber')，以及常规的数值根。
             * @param {HTMLElement} target - 目标 DOM 容器。
             * @param {string} text - 包含根信息的字符串。包含数值字符串或特殊标识符。
             */
            const powerFunctionRootToHtml = (target, text) => {
                // 处理无解的情况
                if (text === 'null') {
                    HtmlTools.appendDOMs(target, ['_null_'], {mode: 'replace'});
                    return;
                }
                // 处理恒成立的情况（例如 0x + 0 = 0）
                if (text === 'anyRealNumber') {
                    HtmlTools.appendDOMs(target, ['_any_real_num_'], {mode: 'replace'});
                    return;
                }
                // 处理常规数值根，使用通用的 DOM 转换函数
                HtmlTools.appendDOMs(target, HtmlTools.textToHtmlClass(text));
            };

            // 定义输出区域索引与结果属性名的映射关系
            const outputList = {
                '2': 'increasingInterval', // 单调递增区间
                '3': 'decreasingInterval', // 单调递减区间
                '4': 'maximumPoint',       // 极大值点
                '5': 'minimumPoint',       // 极小值点
                '6': 'concaveInterval',    // 凹区间
                '7': 'convexInterval',     // 凸区间
                '8': 'inflectionPoint',    // 拐点
                '9': 'roots'               // 零点（根）
            };

            // 收集系数输入 [a, b, c, d, e]
            const list = [];
            for (let i = 0; i < 5; i++) {
                const screenData = PageConfig.screenData[`3${i}`];
                // 如果输入为空，默认为 0
                list[i] = screenData === '' ? '0' : screenData;
            }

            try {
                // 调用 Worker 进行分析
                const result = await WorkerTools.powerFunctionAnalysis(list);

                // 遍历并渲染所有结果区域 (0 到 9)
                for (let i = 0; i < 10; i++) {
                    switch (i) {
                        case 0:
                            // 渲染函数方程: y = f(x) = ...
                            HtmlTools.appendDOMs(
                                HtmlTools.getHtml('#print_content_3_content_0'),
                                result.equation === 'error' ?
                                    ['_error_'] :
                                    ['_y_mathit_', '_equal_', '_f_', '_parentheses_left_', '_x_mathit_', '_parentheses_right_', '_equal_', ...HtmlTools.textToHtmlClass(result.equation)],
                                {mode: 'replace'}
                            );
                            break;
                        case 1:
                            // 渲染值域 (Range)
                            // useBracket=true 表示值域通常是闭区间（除了无穷大）
                            powerFunctionTextToHtml(HtmlTools.getHtml('#print_content_3_content_1'), result.range, true);
                            break;
                        case 9:
                            // 渲染根 (Roots)
                            // 根是单个数列表，不是区间，使用特殊渲染方法
                            this._multipleLinesPrint(
                                HtmlTools.getHtml(`#print_content_3_content_${i}`),
                                result[outputList[i]],
                                powerFunctionRootToHtml
                            );
                            break;
                        default:
                            // 渲染区间或点 (单调性、极值、凹凸性、拐点)
                            this._multipleLinesPrint(
                                HtmlTools.getHtml(`#print_content_3_content_${i}`),
                                result[outputList[i]],
                                powerFunctionTextToHtml
                            );
                            break;
                    }
                }
            } catch {
                // 错误处理：如果分析失败，将所有相关区域显示为错误状态
                for (let i = 0; i < 10; i++) {
                    switch (i) {
                        case 0:
                        case 1:
                            // 单行显示区域直接替换为错误图标
                            HtmlTools.appendDOMs(HtmlTools.getHtml(`#print_content_3_content_${i}`), ['_error_'], {mode: 'replace'});
                            break;
                        default:
                            // 多行显示区域渲染一个包含错误图标的行
                            this._multipleLinesPrint(
                                HtmlTools.getHtml(`#print_content_3_content_${i}`),
                                [['error']],
                                HtmlTools.appendDOMs
                            );
                            break;
                    }
                }
            }
        }

        /**
         * @private
         * @static
         * @async
         * @method _exeMode4
         * @description 执行模式 4（复数 N 次方根）的核心计算与 UI 渲染逻辑。
         * 该方法负责：
         * 1. 从屏幕输入数据中收集复数 z 和根指数 n。
         * 2. 调用 Web Worker 计算复数 z 的 n 个根。
         * 3. 将计算结果（包括原表达式、通项公式、数值解列表）格式化并渲染到页面的相应输出区域。
         * 4. 处理计算过程中的错误，并在界面上显示错误状态。
         * @returns {Promise<void>} 无返回值，通过操作 DOM 副作用更新页面。
         */
        static async _exeMode4() {
            /**
             * @function indexingNumericalResults
             * @description (内部辅助函数) 将单个数值解格式化为 HTML DOM 元素并插入目标容器。
             * 格式为：z_k = value
             * @param {HTMLElement} target - 目标 DOM 容器。
             * @param {string} text - 数值解的字符串表示。
             * @param {number} i - 当前解的索引 k。
             */
            const indexingNumericalResults = (target, text, i) => {
                // 渲染索引部分: z_i =
                HtmlTools.appendDOMs(
                    target,
                    ['_z_mathit_', '_underline_', ...HtmlTools.textToHtmlClass(i.toString()), '_space_', '_equal_', '_space_'],
                    {mode: 'replace'}
                );
                // 渲染数值部分
                HtmlTools.appendDOMs(target, HtmlTools.textToHtmlClass(text));
            };

            // 获取输入数据：复数 z 和指数 n
            const z = PageConfig.screenData['40'];
            const n = PageConfig.screenData['41'];
            // 获取输出区域的 DOM 元素
            const content40 = HtmlTools.getHtml('#print_content_4_content_0');
            const content41 = HtmlTools.getHtml('#print_content_4_content_1');
            const content42 = HtmlTools.getHtml('#print_content_4_content_2');
            try {
                // 调用 Worker 进行分析
                const result = await WorkerTools.radicalFunctionAnalysis(z, n);

                if ([result.z, result.n].includes('error')) {
                    HtmlTools.appendDOMs(content40, ['_error_'], {mode: 'replace'});
                } else {
                    // --- 渲染原表达式 ---
                    // 格式: z 的 [n次] 方根
                    HtmlTools.appendDOMs(
                        content40,
                        [...HtmlTools.textToHtmlClass(result.z), '_space_', '_de_'],
                        {mode: 'replace'}
                    );
                    // 根据 n 的值选择不同的根号显示方式
                    switch (result.n) {
                        case '2':
                            HtmlTools.appendDOMs(content40, ['_print_4_sqrt_']); // 平方根图标
                            break;
                        case '3':
                            HtmlTools.appendDOMs(content40, ['_cbrt_ch_']); // 立方根图标
                            break;
                        default:
                            // n 次方根图标
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
                    // --- 渲染通项公式 ---
                    // 格式: z_k = formula, k in [0, n-1] ∩ Z
                    HtmlTools.appendDOMs(
                        content41,
                        ['_z_mathit_', '_underline_', '_k_mathit_', '_space_', '_equal_', '_space_'],
                        {mode: 'replace'}
                    );
                    HtmlTools.appendDOMs(content41, HtmlTools.textToHtmlClass(result.formula));
                    // 添加 k 的取值范围说明
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

                // --- 渲染数值解列表 ---
                this._multipleLinesPrint(
                    content42,
                    result.numericalResults,
                    indexingNumericalResults,
                    true // 需要传递索引 i
                );
                // 处理结果溢出提示（如果解的数量过多，显示省略号）
                HtmlTools.getHtml('#print_omit').classList[result.overflow ? 'remove' : 'add']('NoDisplay');
            } catch {
                // 错误处理：如果计算失败，将所有相关区域显示为错误状态
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
         * @static
         * @method exe
         * @async
         * @description 处理“执行”按钮的点击事件，根据当前计算器模式执行不同的操作。
         * - 在函数列表定义模式 ('2_0') 下，此方法会切换到函数求值范围的设置界面 ('2_1')。
         * - 在其他模式下，它会触发主界面的切换，并执行计算。
         * @returns {void} 此方法不返回值。
         */
        static async exe() {
            const currentMode = PageConfig.currentMode;
            if (HtmlTools.getHtml('.InputTip') === undefined && currentMode !== '0') {
                await PageControlTools.syncInputToScreen();
                return;
            }
            // 检查当前是否处于“函数列表-函数定义”模式。
            if (currentMode === '2_0') {
                // 如果是，则切换到“函数列表-求值范围”设置界面。
                PageConfig.currentMode = '2_1';
                // 完成切换后，提前返回，不执行后续的计算。
                return;
            }
            // 显示加载条
            HtmlTools.getHtml('#load_cover').classList.remove('NoDisplay');
            // 对于所有其他模式，移除主容器的 'Input' 类。
            // 这会触发 CSS 过渡，将界面从输入视图滑动到结果视图。
            HtmlTools.getHtml('#main').classList.remove('Input');
            switch (currentMode) {
                case '0':
                    await this._exeMode0();
                    break;
                case '1':
                    // 暂停渲染屏幕
                    InputManager.statisticsRenderer.pauseRender();
                    await this._exeMode1();
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

            // 隐藏加载条
            HtmlTools.getHtml('#load_cover').classList.add('NoDisplay');
        }
    }

    /**
     * @class PageControlTools
     * @description 一个静态工具类，提供用于控制页面 UI 状态和交互的函数。
     * 它负责管理模式切换、键盘显示、输入提示以及其他与用户界面相关的动态行为。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class PageControlTools {
        /**
         * @private
         * @static
         * @type {string}
         * @description 存储当前选中的回归分析模型的 DOM ID。
         * 用于在统计模式（模式 1）下，记录用户当前查看的是哪种回归模型（例如线性回归、二次回归等）。
         * 默认值为 'choose_ra_0'（线性回归）。
         * 此属性主要用于在导出回归方程时确定要导出的内容。
         */
        static _currentRaModel = 'choose_ra_0';

        /**
         * @constructor
         * @description PageControlTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 PageControlTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[PageControlTools] PageControlTools is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _changePrintContent1Choose
         * @description 切换或设置回归模型选择菜单的显示状态。
         * 此方法通过控制 `#print_content_1_choose` 元素的 `PrintContent1ChooseOff` 类来实现菜单的显示与隐藏。
         * @param {string|undefined} [mode] - (可选) 控制类切换的行为。
         *   - 如果为 `undefined`，则切换 'PrintContent1ChooseOff' 类（如果存在则移除，不存在则添加）。
         *   - 如果是字符串（例如 'add' 或 'remove'），则直接调用 classList 上的相应方法。
         *     - 'add': 添加类，即隐藏菜单。
         *     - 'remove': 移除类，即显示菜单。
         * @returns {void}
         */
        static _changePrintContent1Choose(mode) {
            // 获取回归模型选择菜单的 DOM 元素，并根据 mode 参数切换或设置其隐藏类。
            HtmlTools.getHtml('#print_content_1_choose').classList[mode === undefined ? 'toggle' : mode]('PrintContent1ChooseOff');
        }

        /**
         * @private
         * @static
         * @method _exportRaRecover
         * @description 重置回归分析导出按钮的视觉状态。
         * 此方法将“导出到 f(x)”和“导出到 g(x)”按钮恢复为默认图标（_export_fx_ 和 _export_gx_）。
         * 通常在切换回归模型或退出结果页面时调用，以清除之前的“成功”或“失败”状态反馈。
         * @returns {void}
         */
        static _exportRaRecover() {
            const
                export0 = HtmlTools.getHtml('#export_0'),
                export1 = HtmlTools.getHtml('#export_1');
            // 重置 #export_0 按钮的内容为默认的 f(x) 导出图标
            HtmlTools.appendDOMs(HtmlTools.getHtml('#export_0'), ['_export_fx_'], {mode: 'replace'});
            // 重置 #export_1 按钮的内容为默认的 g(x) 导出图标
            HtmlTools.appendDOMs(HtmlTools.getHtml('#export_1'), ['_export_gx_'], {mode: 'replace'});

            // 清除导出失败背景色
            export0.classList.remove('Failed');
            export1.classList.remove('Failed');
        }

        /**
         * @private
         * @static
         * @method _resetButton
         * @description 重置按钮状态，与 triggerSelection 相配合
         * @param {HTMLElement} btn - 需要重置的按钮元素
         */
        static _resetButton(btn) {
            if (!btn) {
                return;
            }

            const ripples = btn.querySelectorAll('.Ripple');

            // 执行褪色动画并清理
            ripples.forEach(r => {
                r.classList.add('IsFadingOut');
                setTimeout(() => r.remove(), 600);
            });

            btn.classList.remove('IsSelected');
        }

        /**
         * @static
         * @method triggerSelection
         * @description 处理列表项的单选逻辑。
         * 用于在设置菜单或其他选项列表中，当用户点击某一项时，更新 UI 样式（添加选中态类名）并触发相应的后续操作。
         *
         * @param {HTMLElement} target - 接收操作的目标按钮元素
         * @param {MouseEvent} [e] - (可选) 点击事件对象，用于计算波纹起始坐标
         *
         */
        static triggerSelection(target, e) {
            // 参数校验
            if (!target || target.classList.contains('IsSelected')) {
                return;
            }

            target.classList.add('IsSelected');

            // 创建并添加波纹
            const circle = document.createElement('span');
            circle.classList.add('Ripple');

            const diameter = Math.max(target.clientWidth, target.clientHeight);
            const radius = diameter / 2;
            const rect = target.getBoundingClientRect();

            // 计算扩散中心（优先使用鼠标点击位置，如果没有则默认居中）
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
         * @static
         * @method switchStatisticsResults
         * @description 切换统计结果窗口的显示模式（X、Y 或 XY）。
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

            // 定义所有可能的模式类名
            const modeClasses = ['ResultX', 'ResultY', 'ResultXY'];
            const targetUpper = target.toUpperCase();

            // 1. 批量更新 DOM 类名
            [topBar, resultWindow].forEach(el => {
                if (!el) {
                    return;
                } // 安全检查
                el.classList.remove(...modeClasses); // 使用扩展运算符一次移除
                el.classList.add(`Result${targetUpper}`);
            });

            // 2. 处理按钮重置逻辑
            // 建立 target 到 索引 的映射关系，代替复杂的 if/else
            const indexMap = {'x': 0, 'y': 1, 'xy': 2};
            const skipIndex = indexMap[target.toLowerCase()] ?? 3; // 默认为 3

            // 将 HTMLCollection 转换为数组以使用 forEach
            Array.from(topBar.children).forEach((child, index) => {
                if (index !== skipIndex) {
                    this._resetButton(child);
                }
            });
        }

        /**
         * @static
         * @method moveShip
         * @description 控制彩蛋动画的函数。
         * @returns {void}
         */
        static moveShip() {
            // 获取具有 '_ship_' 类名的 HTML 元素
            HtmlTools.getHtml('._ship_').classList.toggle('ShipLeft');
        }

        /**
         * @static
         * @method clickMainCover
         * @description 处理主遮罩层（main_cover）上的点击事件。
         * 当用户点击设置菜单外部的遮罩区域时，此函数被调用，以关闭设置面板并隐藏遮罩本身。
         * @returns {void}
         */
        static clickMainCover() {
            // 调用 headChangeModes 并传入 'add' 参数，以确保设置面板被隐藏。
            // 这会为设置图标添加 'Horizontal' 类，并为设置面板添加 'SettingNotShow' 类。
            PageControlTools.headChangeModes('add');
            // 调用 headChangeExplain 并传入 'add' 参数，以确保说明面板被隐藏。
            PageControlTools.headChangeExplain('add');
            // 隐藏主遮罩层，因为它已经完成了其（关闭菜单）任务。
            HtmlTools.getHtml('#main_cover').classList.add('NoDisplay');
        }

        /**
         * @static
         * @method headChangeModes
         * @description 切换或设置头部设置图标的显示方向（水平或垂直）。
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

            // 更新屏幕显示
            if (PageConfig.currentMode === '0' && setting.classList.contains('SettingNotShow')) {
                PrintManager.mode0ShowOnScreen();
            }
        }

        /**
         * @static
         * @method headChangeExplain
         * @description 切换或设置说明面板和主遮罩层的可见性。
         * 此方法通过切换或强制添加/移除 CSS 类来控制 `#explain` 面板和 `#main_cover` 遮罩的显示状态。
         * @param {string|undefined} [mode] - (可选) 控制类切换的行为。
         *   - 如果为 `undefined`，则切换 'ExplainNotShow' 和 'NoDisplay' 类。
         *   - 如果是字符串（例如 'add' 或 'remove'），则直接调用 classList 上的相应方法，强制显示或隐藏。
         * @returns {void}
         */
        static headChangeExplain(mode) {
            const showOrNot = mode === undefined ? 'toggle' : mode;
            // 根据 mode 参数，切换或设置 #explain 元素的 'ExplainNotShow' 类，从而控制说明面板的显示/隐藏。
            HtmlTools.getHtml('#explain').classList[showOrNot]('ExplainNotShow');
            // 根据 mode 参数，切换或设置 #head_explain 元素的 'ExplainNotShow' 类，从而控制说明面板的显示/隐藏。
            HtmlTools.getHtml('#head_explain').classList[showOrNot]('ExplainNotShow');
            // 同样地，切换或设置 #main_cover 元素的 'NoDisplay' 类，以同步显示/隐藏主遮罩层。
            HtmlTools.getHtml('#main_cover').classList[showOrNot]('NoDisplay');
        }

        /**
         * @static
         * @method changeTitle
         * @description 切换显示在屏幕顶部的标题，以匹配当前的计算模式。
         * 它通过隐藏当前的标题元素并显示与新模式对应的标题元素来工作。
         * @param {string} mode - 要激活的新模式的标识符。
         * @returns {void}
         */
        static changeTitle(mode) {
            // 隐藏当前显示的标题
            HtmlTools.getHtml('#title_mode_' + PageConfig.currentMode).classList.add('NoDisplay');
            // 显示与新模式对应的标题
            HtmlTools.getHtml('#title_mode_' + mode).classList.remove('NoDisplay');
        }

        /**
         * @static
         * @method clickPrint1Cover
         * @description 处理打印内容1（统计回归结果）遮罩层的点击事件。
         * 当用户点击遮罩层时，此方法被调用，用于关闭回归模型选择菜单并隐藏遮罩层本身。
         * @returns {void}
         */
        static clickPrint1Cover() {
            // 隐藏回归模型选择菜单
            PageControlTools._changePrintContent1Choose('add');
            // 隐藏遮罩层
            HtmlTools.getHtml('#print_content_1_cover').classList.add('NoDisplay');
        }

        /**
         * @static
         * @method clickPrint1Choose
         * @description 处理点击回归模型选择区域的事件。
         * 当用户点击显示当前回归模型的区域时调用此方法，用于打开模型选择菜单并显示遮罩层。
         * @returns {void}
         */
        static clickPrint1Choose() {
            // 打开回归模型选择菜单（通过移除隐藏类）
            PageControlTools._changePrintContent1Choose('remove');
            // 显示遮罩层，以便用户点击外部时可以关闭菜单
            HtmlTools.getHtml('#print_content_1_cover').classList.remove('NoDisplay');
        }

        /**
         * @static
         * @method changePrint1Ra
         * @description 切换统计模式（模式 1）下的回归分析模型。
         * 此方法负责：
         * 1. 更新 UI 以显示当前选中的回归模型。
         * 2. 处理模型切换时的视觉状态（高亮选中项，取消旧选中项）。
         * 3. 如果模型发生变化，重置导出按钮的状态。
         * 4. 根据选择的模型显示或隐藏特定的结果控件（如线性回归的额外信息）。
         * 5. 触发结果数据的重新渲染。
         * 6. 关闭模型选择菜单。
         * @param {string} id - 被选中的回归模型元素的 DOM ID (例如 'choose_ra_0')。
         * @param {string} [mode='change'] - 操作模式。
         *   - 'change': (默认) 这是一个用户交互触发的更改，需要更新显示的结果数据。
         *   - 'init': 这是一个初始化操作（例如计算完成后自动选择最佳模型），不需要重新触发结果渲染逻辑（或者由调用者处理）。
         * @returns {void}
         */
        static changePrint1Ra(id, mode = 'change') {
            // 获取被选中模型元素的类名列表（用于提取图标/文本样式）
            const model = HtmlTools.getClassList(HtmlTools.getHtml(`#${id}`));
            // 获取显示当前选中模型的容器元素
            const modelShow = HtmlTools.getHtml('#print_1_0_choose');
            let lastModel;

            // 更新选择框的显示内容：添加前缀图标、空格和选中模型的图标
            HtmlTools.appendDOMs(modelShow, ['_print_1_0_choose_', '_space_', ...model, '_print_content_1_arrow_'], {mode: 'replace'});

            // 遍历所有模型选项，找到之前被选中的项并移除高亮状态
            // 假设选项 ID 格式为 choose_ra_0 到 choose_ra_N
            for (let i = HtmlTools.getHtml('#print_content_1_choose').children.length - 2; i >= 0; i--) {
                const dealArea = HtmlTools.getHtml(`#choose_ra_${i}`);
                if (dealArea.classList.contains('Print1ChooseOn')) {
                    dealArea.classList.remove('Print1ChooseOn');
                    lastModel = `choose_ra_${i}`;
                    break;
                }
            }

            // 如果切换了不同的模型，恢复导出按钮的初始状态（例如从“成功”变回“导出”）
            if (lastModel !== id) {
                PageControlTools._exportRaRecover();
            }

            // 高亮当前选中的模型
            HtmlTools.getHtml(`#${id}`).classList.add('Print1ChooseOn');
            // 更新内部状态记录当前模型 ID
            this._currentRaModel = id;

            // 如果是主动切换模式，更新结果显示区域的内容
            if (mode === 'change') {
                PrintManager.setMode1RaResults(PrintManager.mode1Results === 'error' ? 'error' : PrintManager.mode1Results[id]);
            }

            // 关闭选择菜单遮罩
            PageControlTools.clickPrint1Cover();
        }

        /**
         * @static
         * @method exportRa
         * @description 将当前选中的回归分析模型的方程导出到函数定义区域（f(x) 或 g(x)）。
         * 此方法响应导出按钮的点击事件，将计算出的回归方程填充到对应的函数输入框中，
         * 以便用户可以在函数列表模式下进一步使用该方程（例如求值或绘图）。
         *
         * @param {string} func - 触发导出的按钮 ID。
         *   - `'export_0'`: 导出到 f(x) (对应 DOM ID `#screen_input_inner_2_00`)。
         *   - `'export_1'`: 导出到 g(x) (对应 DOM ID `#screen_input_inner_2_01`)。
         * @returns {void}
         */
        static exportRa(func) {
            // 获取被点击的导出按钮元素
            const clickArea = HtmlTools.getHtml(`#${func}`);

            // 检查按钮状态：如果尚未显示“成功”图标，则执行导出逻辑
            // 防止用户重复点击已成功的导出
            if (!clickArea.children[0].classList.contains('_success_')) {
                // 根据按钮 ID 确定导出的目标输入区域
                // export_0 -> f(x) (2_00), export_1 -> g(x) (2_01)
                const exportTarget = func === 'export_0' ? '2_00' : '2_01';
                // 获取存储在 PrintManager 中的回归分析结果
                const exportContent = PrintManager.mode1Results;
                // 检查结果是否有效
                if (exportContent === 'error' || exportContent[this._currentRaModel].regressionEquation === 'error') {
                    // 如果结果为错误，将按钮图标更改为“失败”状态
                    HtmlTools.appendDOMs(clickArea, ['_failed_'], {mode: 'replace'});
                    clickArea.classList.add('Failed');
                    return;
                }
                const equation = MathPlus.calc(exportContent[this._currentRaModel].regressionEquation, {mode: 'syntaxCheck'})[1];
                PageConfig.screenData = {[exportTarget]: equation};
                // 获取当前选中的回归模型 (this._currentRaModel) 的方程字符串
                // 将其转换为 HTML 类名数组，并替换目标输入区域的内容
                HtmlTools.appendDOMs(HtmlTools.getHtml(`#screen_input_inner_${exportTarget}`), HtmlTools.textToHtmlClass(equation), {mode: 'replace'});
                // 导出成功，将按钮图标更改为“成功”状态
                HtmlTools.appendDOMs(clickArea, ['_success_'], {mode: 'replace'});
            }
        }

        /**
         * @static
         * @method changeScreen
         * @description 切换当前显示的屏幕内容，以匹配新的计算模式。
         * 此方法通过为当前屏幕添加隐藏类并为新屏幕移除隐藏类来工作。
         * 它会根据模式的不同使用不同的 CSS 类，以支持不同的过渡动画效果。
         * @param {string} mode - 要激活的新模式的标识符。例如 '0', '1', '2_0' 等。
         * @returns {void}
         */
        static changeScreen(mode) {
            // 根据目标模式确定使用哪个 CSS 类来隐藏屏幕。
            // 模式 '0' 和 '1' 使用 'NoDisplay'，其他模式使用 'ScreenNoDisplay'，
            // 这允许为不同的屏幕切换应用不同的 CSS 过渡效果。
            const currentMode = PageConfig.currentMode;
            const currentNoDisplayStr = ['0', '1'].includes(currentMode) ? 'NoDisplay' : 'ScreenNoDisplay';
            const nextNoDisplayStr = ['0', '1'].includes(mode) ? 'NoDisplay' : 'ScreenNoDisplay';
            // 获取当前活动的屏幕元素，并添加隐藏类以将其隐藏。
            HtmlTools.getHtml('#screen_' + currentMode).classList.add(currentNoDisplayStr);
            // 获取与新模式对应的屏幕元素，并移除隐藏类以使其显示。
            HtmlTools.getHtml('#screen_' + mode).classList.remove(nextNoDisplayStr);
        }

        /**
         * @static
         * @method changeInputTip
         * @description 更新主输入区域的视觉提示，以反映当前的计算器模式和子模式。
         * 此函数通过更改提示元素的CSS类来动态显示不同的背景图片，从而向用户指示当前上下文所期望的输入类型（例如，表达式、实数、复数等）。
         * 它会检查当前模式，并根据预定义的 `modeTips` 映射来决定显示哪个提示。
         *
         * @returns {void} 此方法不返回任何值，其作用是直接修改DOM。
         *
         * @example
         * // 当切换到统计模式时，调用此函数会将输入提示更新为“请输入实数”。
         * PageControlTools.changeInputTip();
         */
        static changeInputTip() {
            const input = HtmlTools.getHtml('#input');
            // 获取当前的提示元素。
            let currentTip = HtmlTools.getHtml('.InputTip');
            // 确保提示元素存在，以避免在元素不存在时发生错误。
            if (currentTip === undefined) {
                if (input.children.length !== 1) {
                    return;
                }
                HtmlTools.appendDOMs('#input', ['InputTip']);
                currentTip = HtmlTools.getHtml('.InputTip');
            } else if (input.children.length !== 2) {
                return;
            }
            // 定义一个映射，将主模式ID映射到其对应的提示信息。
            // 数组的第一个元素作为标志位：
            // - 0: 表示该主模式下的所有子模式共享同一个提示。
            // - 1: 表示该主模式下的不同子模式有不同的提示。
            const modeTips = {
                '0': [0, 'expr'], // 标准计算模式提示输入表达式
                '1': [0, 'R'], // 统计回归模式提示输入实数
                '2_0': [0, 'expr'], // 函数列表模式（函数定义）提示输入表达式
                '2_1': [1, 'R', 'R', 'positive'], // 函数列表模式（求值范围）根据子模式提示
                '3': [0, 'R'], // 多项式分析模式提示输入实数
                '4': [1, 'C', 'N'] // 复数方根模式根据子模式提示
            };
            // 获取当前的主模式。
            const currentMode = PageConfig.currentMode;
            // 获取当前模式对应的提示配置数组。
            const currentTipList = modeTips[currentMode];
            // 声明一个变量来存储最终的提示字符串（用于构成CSS类名）。
            let currentTipStr;
            // 根据配置决定如何选择提示字符串。
            if (currentTipList[0] === 0) {
                // 如果标志位为0，直接使用数组的第二个元素作为提示。
                currentTipStr = currentTipList[1];
            } else {
                // 如果标志位为1，则根据当前激活的子模式索引来选择提示。
                currentTipStr = currentTipList[1 + Number(PageConfig.subModes[currentMode])];
            }
            // 清空提示元素上所有现有的CSS类，以便重新设置。
            currentTip.classList.value = '';
            // 添加新的CSS类来更新提示的视觉样式和内容。
            // `_input_tip_${currentTipStr}_` 类通过背景图片显示具体的提示文本。
            currentTip.classList.add(`_input_tip_${currentTipStr}_`);
            // `InputTip` 是一个通用类，用于标识该元素是一个输入提示。
            currentTip.classList.add('InputTip');
        }

        /**
         * @static
         * @method changeSubKeyboard
         * @description 管理和切换子键盘的显示状态。
         * 此方法根据被点击的键盘切换按钮，控制哪个子键盘面板（如三角函数、高级函数等）是可见的。
         * 它会处理：
         * 1. 高亮/取消高亮顶部工具栏中的触发按钮。
         * 2. 显示或隐藏对应的子键盘面板。
         * 3. 确保同一时间只有一个子键盘面板是打开的。
         * 4. 管理一个背景遮罩，当点击遮罩时可以关闭所有打开的子键盘。
         * @param {string} className - 触发此操作的按钮内部图标的 CSS 类名，或一个特殊指令。
         *   - '_trigonometry_', '_functions_', '_more_': 切换对应的子键盘。
         *   - '_2nd_': 切换“第二功能”键的状态，不打开子键盘。
         *   - 'allNotShow': 一个特殊指令，用于关闭所有打开的子键盘和遮罩。
         * @returns {void}
         */
        static changeSubKeyboard(className) {
            // 获取顶部键盘栏的所有子元素（即切换按钮）。
            const children = HtmlTools.getHtml('#keyboard_top').children;
            // 特殊指令：隐藏所有子键盘和遮罩。
            if (className === 'allNotShow') {
                // 移除遮罩的激活类。
                HtmlTools.getHtml('#keyboard_cover_ForMode1').classList.remove('KeyboardCover');
                HtmlTools.getHtml('#keyboard_cover').classList.remove('KeyboardCover');
                // 遍历所有可能的子键盘切换按钮。
                for (let i = 1; i < 4; i++) {
                    // 构造每个子键盘的 ID。
                    const dealSubKeyboard = `#sub_keyboard_${i < 3 ? i - 1 : 'ForMode1'}`;
                    // 为子键盘添加 'NotShow' 类以隐藏它。
                    HtmlTools.getHtml(dealSubKeyboard).classList.add('NotShow');
                    // 将对应的按钮恢复为普通状态。
                    children[i].classList.add('Ordinary');
                }
                return;
            }
            // 查找被点击按钮在父容器中的索引位置。
            const parent = HtmlTools.getHtml(`.${className}`).parentNode;
            const place = [...children].indexOf(parent);
            // 切换被点击按钮的 'Ordinary' 类，以高亮或取消高亮它。
            parent.classList.toggle('Ordinary');
            // 特殊情况：'_2nd_' 按钮只切换自身状态，不打开子键盘。
            if (className === '_2nd_') {
                return;
            }
            // 遍历所有子键盘切换按钮，以确保只有一个子键盘是激活的。
            for (let i = 1; i < 4; i++) {
                // 如果当前遍历的按钮不是被点击的那个...
                if (i !== place) {
                    // ...则隐藏其对应的子键盘...
                    const dealSubKeyboard = `#sub_keyboard_${i < 3 ? i - 1 : 'ForMode1'}`;
                    HtmlTools.getHtml(dealSubKeyboard).classList.add('NotShow');
                    // ...并将其按钮状态恢复为普通。
                    children[i].classList.add('Ordinary');
                }
            }
            // 获取与被点击按钮对应的子键盘元素。
            const dealSubKeyboard = HtmlTools.getHtml(`#sub_keyboard_${place < 3 ? place - 1 : 'ForMode1'}`);
            // 切换该子键盘的显示/隐藏状态。
            dealSubKeyboard.classList.toggle('NotShow');
            // 先隐藏所有遮罩。
            HtmlTools.getHtml('#keyboard_cover_ForMode1').classList.remove('KeyboardCover');
            HtmlTools.getHtml('#keyboard_cover').classList.remove('KeyboardCover');
            // 根据当前打开的子键盘类型，显示对应的背景遮罩。
            if (dealSubKeyboard.id === 'sub_keyboard_ForMode1' && !dealSubKeyboard.classList.contains('NotShow')) {
                HtmlTools.getHtml('#keyboard_cover_ForMode1').classList.add('KeyboardCover');
            } else if (/sub_keyboard_[01]/.test(dealSubKeyboard.id) && !dealSubKeyboard.classList.contains('NotShow')) {
                HtmlTools.getHtml('#keyboard_cover').classList.add('KeyboardCover');
            }
        }

        /**
         * @static
         * @method keyboardFuncBecomeX
         * @description 动态更新特定键盘按钮（在f(x), g(x), x之间切换的那个）的显示和功能。
         * 此更新取决于当前的计算器模式 ({@link PageConfig.currentMode})、
         * 第二功能键的状态 ({@link PageConfig.keyboardType})，以及在函数列表模式下选择的子模式。
         * @returns {void}
         */
        static keyboardFuncBecomeX() {
            // 获取需要动态改变的按钮的图标元素
            const dealArea = HtmlTools.getHtml('.BecomeX').firstElementChild;
            // 如果当前模式不是函数列表定义模式 ('2_0')
            if (PageConfig.currentMode !== '2_0') {
                // 根据第二功能键的状态，将按钮设置为 'f' 或 'g'
                dealArea.className = PageConfig.keyboardType === 0 ? '_f_' : '_g_';
                return;
            }
            // 特殊逻辑：当处于函数列表定义模式 ('2_0') 时
            if (PageConfig.keyboardType === 0) {
                // 在普通键盘模式下，按钮显示为 'x'
                dealArea.className = '_x_mathit_';
            } else if (PageConfig.keyboardType === 1) {
                // 在第二功能键盘模式下
                // 如果正在定义 g(x) (子模式 '1')，按钮显示为 'f(x)'
                // 否则，按钮显示为 'g'，用于在 f(x) 的定义中调用 g(x)
                dealArea.className = PageConfig.subModes['2_0'] === '1' ? '_f_' : '_g_';
            }
        }

        /**
         * @static
         * @method closePrint
         * @description 关闭打印/结果视图，并返回到主输入视图。
         * 此方法通过为 `#main` 容器元素添加 'Input' CSS 类来工作。
         * 根据 CSS 规则，这个类的存在会调整 `#main` 容器的 `left` 属性，
         * 从而触发一个平滑的过渡效果，将主输入界面滑动回视图中。
         * @returns {void} 此方法不返回任何值，其作用是直接修改 DOM。
         */
        static closePrint() {
            // 为 #main 元素添加 'Input' 类，以触发 CSS 过渡，
            // 将视图从打印/结果界面切换回主输入界面。
            HtmlTools.getHtml('#main').classList.add('Input');
            switch (PageConfig.currentMode) {
                case '0':
                    PrintManager.mode0ShowOnScreen.cancel();
                    if (PrintManager.mode0ScreenInCalc) {
                        WorkerTools.restart();
                    }
                    InputManager.ac(HtmlTools.getHtml('#print_content_0_content_0'));
                    InputManager.ac(HtmlTools.getHtml('#print_content_0_content_1'));
                    return;
                case '1':
                    InputManager.statisticsRenderer.resumeRender();
                    return PageControlTools._exportRaRecover();
                case '2_1':
                    PrintManager.printListRenderer.clear();
                    return HtmlTools.getHtml('#print_content_2_inner').replaceChildren();
            }
        }

        /**
         * @static
         * @method cancelPrint
         * @description 取消当前正在进行的计算任务或操作。
         * 此方法作为一个“紧急停止”机制，不仅关闭结果展示界面，还会强制重启后台 Worker 线程以立即终止任何卡住或耗时的计算任务，同时移除 UI 上的加载锁定状态。
         * @returns {void}
         */
        static cancelPrint() {
            // 1. 关闭结果显示或打印界面
            PageControlTools.closePrint();
            // 2. 强制重启 Worker 线程 (这是停止死循环或长耗时任务的关键步骤)
            WorkerTools.restart();
            // 3. 隐藏全屏加载遮罩层，恢复用户界面交互
            HtmlTools.getHtml('#load_cover').classList.add('NoDisplay');
        }

        /**
         * @static
         * @method hideExplain
         * @description 隐藏当前的详细解释面板，并将界面恢复至默认状态。
         * 此方法通常在鼠标移出特定符号或检测到非法输入时调用，用于重置顶部标题栏的显示状态，并将解释区域的内容恢复为基础说明信息。
         * @returns {void}
         */
        static hideExplain() {
            if (!HtmlTools.getHtml('#explain').classList.contains('ExplainNotShow')) {
                return;
            }
            // 1. 切换顶部显示状态：隐藏详情输入栏，恢复显示主标题
            HtmlTools.getHtml('#head_inputs').classList.add('NoDisplay');
            HtmlTools.getHtml('#head_title').classList.remove('NoDisplay');

            // 2. 重置解释区域的标题为默认的基础说明标题
            HtmlTools.appendDOMs(HtmlTools.getHtml('#explain_title_inner'), ['_basic_explain_title_'], {mode: 'replace'});

            // 3. 重置解释区域的主体内容为默认的基础说明内容
            HtmlTools.appendDOMs(HtmlTools.getHtml('#explain_content'), ['_basic_explain_content_'], {mode: 'replace'});
        }

        /**
         * @static
         * @method showExplain
         * @description 根据输入的符号信息，动态生成并显示其详细解释、优先级和结合性。
         * 此方法负责解析输入的符号（如运算符、函数），构建包含中文含义、优先级（Priority）和结合性（Associativity）的 DOM 结构。
         * @param {Array<string>} input - 包含符号样式类名的数组，用于识别和渲染当前选中的符号。
         * @returns {void}
         */
        static showExplain(input) {
            /**
             * @function funcInfoShow
             * @description 内部辅助函数：构建并追加优先级和结合性的详细信息块。
             * 根据传入的优先级数值和结合性方向，生成对应的 DOM 结构并插入到目标容器中。
             * @param {HTMLElement|DocumentFragment} target - 目标 DOM 容器（通常是 DocumentFragment）。
             * @param {number} priority - 运算符的优先级数值。
             * @param {string|null} associativity - 运算符的结合性 ('left', 'right' 或 null)。
             */
            function funcInfoShow(target, priority, associativity) {
                // 1. 创建优先级显示容器并填充内容 ("Priority Level X")
                const priorityShow = document.createElement('div');
                HtmlTools.appendDOMs(
                    priorityShow,
                    ['_priority_level_', '_space_', '_L_', '_e_', '_v_', '_e_', '_l_', '_space_', ...HtmlTools.textToHtmlClass(priority.toString())]
                );

                // 2. 将优先级信息挂载到目标容器
                target.appendChild(priorityShow);

                // 3. 检查结合性：如果为空（例如部分单目运算符），则不显示结合性信息
                if (associativity === null) {
                    return;
                }

                // 4. 创建结合性显示容器并填充内容 ("Operator Associativity X")
                const associativityShow = document.createElement('div');
                HtmlTools.appendDOMs(
                    associativityShow,
                    ['_operator_associativity_', '_space_', `_${associativity}_associative_`]
                );

                // 5. 将结合性信息挂载到目标容器
                target.appendChild(associativityShow);
            }

            /**
             * @function addLine
             * @description 内部辅助函数：向目标容器添加一条视觉分割线。
             * 用于在 UI 上区分同一符号的不同含义（例如区分 "+" 作为加法运算符和正号）。
             * @param {HTMLElement|DocumentFragment} target - 要追加分割线的目标容器。
             */
            function addLine(target) {
                // 1. 创建分割线元素
                const line = document.createElement('div');
                // 2. 添加标准的分割线样式类
                line.classList.add('Lines');
                // 3. 将分割线追加到目标容器
                target.appendChild(line);
            }

            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay') || !HtmlTools.getHtml('#main').classList.contains('Input')) {
                return;
            }

            // --- 主逻辑开始 ---
            // 1. 获取符号的文本形式及元数据信息
            const inputStr = HtmlTools.htmlClassToText(input);
            const info = Public.getTokenInfo(inputStr);
            const converterConfig = PageConfig.classNameConverterConfig;

            // 2. 合法性检查：如果是非法符号，则隐藏解释面板并直接返回
            if (info.class === 'illegal') {
                this.hideExplain();
                return;
            }

            // 3. 准备 UI 类名并切换顶部显示状态
            const inputClassStr = (inputStr in converterConfig ? converterConfig[inputStr] : inputStr).replace(/[\[\]]/g, '');

            HtmlTools.getHtml('#head_inputs').classList.remove('NoDisplay');
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
                        HtmlTools.getHtml('#head_inputs'),
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
                        HtmlTools.getHtml('#head_inputs'),
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

            // 4. 开始构建解释内容
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

            // 5. 针对函数/运算符类型的特殊逻辑处理
            if (info.class === 'func') {
                addLine(fragment); // 添加第一条分割线
                const plusAndMinusPriority = info.priority + 2;
                const plusAndMinusAssociativity = info.associativity;

                switch (inputStr) {
                    // 特殊处理 "+" "*" 和 "-" 的多重含义
                    case '-':
                    case '+':
                        const positiveAndNegative = Public.getTokenInfo('N');
                        const positiveAndNegativePriority = positiveAndNegative.priority + 2;
                        const positiveAndNegativeAssociativity = positiveAndNegative.associativity;

                        // 展示作为加/减号的属性
                        HtmlTools.appendDOMs(fragment, [`_as_${inputStr === '+' ? 'plus' : 'minus'}_sign_ ExplainLeft`]);
                        funcInfoShow(fragment, plusAndMinusPriority, plusAndMinusAssociativity);

                        addLine(fragment); // 添加第二条分割线

                        // 展示作为正/负号的属性
                        HtmlTools.appendDOMs(fragment, [`_as_${inputStr === '+' ? 'positive' : 'negative'}_sign_ ExplainLeft`]);
                        funcInfoShow(fragment, positiveAndNegativePriority, positiveAndNegativeAssociativity);
                        break;

                    case '*':
                        const explicit = Public.getTokenInfo('*');
                        const implicit = Public.getTokenInfo('&');
                        // 展示显式乘法
                        HtmlTools.appendDOMs(fragment, ['_as_explicit_multiplication_ ExplainLeft']);
                        funcInfoShow(fragment, explicit.priority + 2, explicit.associativity);

                        addLine(fragment); // 添加第二条分割线

                        // 展示隐式乘法
                        HtmlTools.appendDOMs(fragment, ['_as_implicit_multiplication_ ExplainLeft']);
                        funcInfoShow(fragment, implicit.priority + 2, implicit.associativity);
                        break;

                    default:
                        // 普通运算符处理
                        funcInfoShow(fragment, plusAndMinusPriority, plusAndMinusAssociativity);
                }
            } else if (inputStr === '|') {
                // 6. 特殊处理绝对值符号
                addLine(fragment);
                funcInfoShow(fragment, 1, null);
            }

            // 7. 将构建好的文档片段渲染到页面
            HtmlTools.getHtml('#explain_content').replaceChildren(fragment);
        }

        /**
         * @static
         * @method syncScreenToInput
         * @description 将当前活动子屏幕区域的内容同步到主输入区域。
         * 此函数用于在用户切换子模式或点击特定区域时，确保主输入区域显示的是当前子模式的正确内容。
         * 它会清除主输入区域（如果需要），从当前子屏幕区域读取内容，并将其插入到主输入区域。
         * 对于统计模式（模式 '1'），它还处理添加新行或移动光标的逻辑。
         * @param {boolean} [skipEmpty=true] - 是否跳过屏幕为空的情况。
         * @returns {void}
         */
        static syncScreenToInput(skipEmpty = true) {
            // 获取当前活动子屏幕区域的 DOM 元素。
            const target = HtmlTools.getCurrentSubscreenArea();
            if (skipEmpty && target.children.length === 0) {
                return;
            }
            // 如果主输入区域没有输入提示，则清除主输入区域。
            // 这通常发生在用户从一个子屏幕切换到另一个子屏幕时，需要清空旧内容。
            if (!HtmlTools.getHtml('.InputTip')) {
                InputManager.ac();
            }
            // 从子屏幕区域的 DOM 元素中获取其内容的 CSS 类名列表，并过滤掉空格。
            let classList = HtmlTools.getClassList(target, {ignoreSpace: true});
            // 如果获取到的内容不为空，则将其插入到主输入区域。
            if (classList.length > 0) {
                InputManager.input(HtmlTools.deleteIllegal(classList));
            }
            InputManager.addSpace();
            // 确保光标在操作后仍然可见。
            HtmlTools.scrollToView();
        }

        /**
         * @static
         * @async
         * @method syncInputToScreen
         * @description 将主输入区域的内容同步到当前活动的子屏幕输入区域。
         * 此函数负责获取主输入框的表达式，通过 Web Worker 进行语法检查和美化，
         * 然后将格式化后的内容更新到对应的子屏幕区域。
         * 它还处理了特定模式下的后续 UI 交互，例如在统计模式下自动添加新行或在其他模式下移动到下一个输入字段。
         * @param {boolean} [moveCursor=true] - 同步后是否移动光标。
         * @returns {Promise<void>} 此方法不返回任何值，其作用是直接修改 DOM。
         */
        static async syncInputToScreen(moveCursor = true) {
            // 获取当前计算器模式和主输入区域的 DOM 元素。
            const currentMode = PageConfig.currentMode;

            // 提前返回
            if (currentMode === '0') {
                return;
            }

            const inputEl = HtmlTools.getHtml('#input');
            // 从主输入区域的 DOM 元素中重建表达式字符串。
            const currentInputArray = HtmlTools.getClassList(inputEl, {ignoreSpace: true});
            const currentInput = HtmlTools.htmlClassToText(currentInputArray);
            let expr;

            try {
                // 异步调用 Web Worker 对表达式进行语法检查和格式化。
                // 这可以处理隐式乘法、括号补全等，并返回一个“美化”过的表达式。
                const syntaxResult = await WorkerTools.exec(currentInput, {
                    calcMode: 'syntaxCheck',
                    f: HtmlTools.deleteIllegal(PageConfig.screenData['2_00']),
                    g: HtmlTools.deleteIllegal(PageConfig.screenData['2_01'])
                });
                // 将返回的表达式字符串转换回用于 DOM 渲染的 CSS 类名数组。
                expr = HtmlTools.textToHtmlClass(syntaxResult.expr);
            } catch (e) {
                // 如果语法检查失败，则在表达式前添加一个错误标记。
                expr = ['_syntax_error_', ...currentInputArray];
            }

            // 获取当前活动的子屏幕输入区域。
            const target = HtmlTools.getCurrentSubscreenArea();
            // 使用格式化后的表达式内容替换目标区域的现有内容。
            const exprList = currentMode === '1' ? expr.map(item => ['lazy-bg', item]) : expr;
            const nameType = currentMode === '1' ? ['class', 'data-lazy-bg-class'] : ['class'];
            HtmlTools.appendDOMs(target, exprList,
                {nameType, mode: 'replace'}
            );
            // 为新渲染的表达式添加适当的空格以提高可读性。
            InputManager.addSpace({area: target});
            // 清空主输入区域，并恢复其输入提示。
            InputManager.ac();

            // --- 根据当前模式执行后续操作 ---
            if (currentMode === '1') {
                // 如果是统计模式...
                const gridData = HtmlTools.getHtml('#grid_data');
                const gridDataLast = gridData.lastElementChild.children;
                let addSucceed = true;
                // 检查最后一行是否已有数据。如果是，则自动添加一个新行。
                if (gridDataLast[1].children.length !== 0 || gridDataLast[2].children.length !== 0) {
                    addSucceed = await InputManager.statisticsAddLine();
                }
                // 更新并持久化屏幕数据。
                PageConfig.setScreenData();
                // 如果成功添加了新行，则将高亮光标移动到新行。
                if (moveCursor && addSucceed) {
                    InputManager.moveCursor('down');
                    if (HtmlTools.getHtml('.InputTip') === undefined) {
                        InputManager.ac();
                    }
                }
            } else {
                // 对于其他模式...
                // 更新并持久化屏幕数据。
                PageConfig.setScreenData();
                // 如果当前子屏幕不是该模式下的最后一个，则自动将焦点移动到下一个子屏幕。
                if (moveCursor && HtmlTools.getHtml(`#screen_${currentMode}`).children.length !== Number(PageConfig.subModes[currentMode]) + 1) {
                    InputManager.moveCursor('right');
                    if (HtmlTools.getHtml('.InputTip') === undefined) {
                        InputManager.ac();
                    }
                }
            }
            // 确保新激活的区域在视图中可见。
            HtmlTools.scrollToView();
        }
    }

    // 导出对象
    window.PageConfig = PageConfig;
    window.HtmlTools = HtmlTools;
    window.AsyncListRenderer = AsyncListRenderer;
    window.VirtualScroll = VirtualScroll;
    window.InputManager = InputManager;
    window.PrintManager = PrintManager;
    window.PageControlTools = PageControlTools;
})();