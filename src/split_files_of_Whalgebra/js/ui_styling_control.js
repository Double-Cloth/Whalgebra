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
                    throw new Error('[PageConfig] Unsupported sub-mode');
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
     * @description 设置指定屏幕区域的数据，并将其持久化到 `localStorage`。
     * 此方法根据 `area` 参数更新 `_screenData` 中的相应条目。
     * - 如果 `area` 是 '1'（统计模式），它会从 DOM 中读取整个网格数据。
     * - 对于其他模式，它会从指定的输入区域读取文本内容。
     * @param {string|null} [area=null] - 要更新的屏幕区域的标识符（例如 '1', '2_00'）。
     *   如果为 `null`，则根据当前模式和子模式自动确定区域。
     * @returns {void}
     */
    static setScreenData(area) {
        // 获取当前的主模式。
        const currentMode = PageConfig.currentMode;
        // 确定要操作的屏幕区域的名称。
        let name;
        if (area) {
            name = area;
        } else {
            name = currentMode === '1' ? '1' : currentMode + PageConfig.subModes[currentMode];
        }
        if (name !== '1') {
            // 对于非统计模式，从 DOM 中读取文本内容并存储。
            const target = HtmlTools.getHtml(`#screen_input_inner_${name}`);
            PageConfig._screenData[name] = HtmlTools.htmlClassToText(HtmlTools.getClassList(target));
        } else {
            // 对于统计模式，遍历网格数据并存储。
            PageConfig._screenData[name].length = 0;
            // 获取网格中所有行。
            const gridData = HtmlTools.getHtml('#grid_data').children;
            const len = gridData.length;
            for (let i = 0; i < len; i++) {
                const targetFather = gridData[i];
                const targetX = targetFather.children[1];
                const targetY = targetFather.children[2];
                if (!(targetX.children.length === 0 && targetY.children.length === 0)) {
                    const dataX = HtmlTools.htmlClassToText(HtmlTools.getClassList(targetX));
                    const dataY = HtmlTools.htmlClassToText(HtmlTools.getClassList(targetY));
                    PageConfig._screenData[name][i] = [dataX, dataY];
                }
            }
        }
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
     * @description 一个静态映射表，将特殊的数学或结构字符转换为其对应的“安全”字符串，用作 CSS 类名的一部分。
     * 此配置由 `HtmlTools.textToHtmlClass` 方法使用，目的是将数学表达式字符串（例如 "2+3") 转换为一系列 CSS 类（例如, ['_2_', '_plus_', '_3_']）。
     * 这些类随后用于渲染表达式的视觉表示，通常是通过为每个字符/符号应用带有特定背景图像的样式。
     * @example
     * // '+' 字符被映射到 'plus'，最终生成的 CSS 类将是 '_plus_'。
     * '+': 'plus',
     */
    static _classNameConverterConfig = {
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
     * @private
     * @static
     * @type {Object<string, string>}
     * @description `_classNameConverterConfig` 的逆向映射。
     * 此对象是动态生成的，用于将 CSS 类名的一部分（例如 "plus"）转换回其原始的特殊字符（例如 "+"）。
     * 它主要由 `HtmlTools.htmlClassToText` 方法使用，以便从 DOM 元素的类名中重建原始的数学表达式字符串。
     */
    static _classNameConverterReverseConfig = Object.fromEntries(
        Object.entries(HtmlTools._classNameConverterConfig).map(([k, v]) => [v, k])
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
        const symbolPattern = Object.keys(HtmlTools._classNameConverterConfig)
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
            const className = child.className;

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
        const config = HtmlTools._classNameConverterConfig;

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
                if (cls === '[id]cursor') {
                    return '[cursor]';
                }
                return cls;
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
     * @param {HTMLElement | string} parentElement - 目标父元素或其 ID 选择器。
     * @param {string[]} nameList - 类名数组。
     * @param {object} [options={}] - 配置选项。
     * @param {HTMLElement} [options.referenceNode=null] - 明确的参照节点。
     * @param {number} [options.index=-1] - 插入位置索引。
     * @param {string} [options.mode='add'] - (可选) 插入的模式。
     *   - `'add'`: (默认) 直接添加元素。
     *   - `'replace'`: 先清空父元素，再添加元素。
     * @param {'className' | 'id'} [options.nameType='className'] - 指定 nameList 中的字符串默认是作为类名还是 ID。
     *  - `'className'`: (默认) 将字符串赋值给 className。
     *  - `'id'`: 将字符串赋值给 id。
     * @param {string} [options.appendType='p'] - 标签类型。
     */
    static appendDOMs(parentElement, nameList, {
        referenceNode = null,
        index = -1,
        mode = 'add',
        appendType = 'p',
        nameType = 'className'
    } = {}) {
        // 1. 统一处理父元素：如果是字符串则查找，否则直接使用。
        const targetParent = typeof parentElement === 'string'
                             ? HtmlTools.getHtml(parentElement)
                             : parentElement;

        // 2. 健壮性检查：确保父元素存在且类名数组有效。
        if (!targetParent || !Array.isArray(nameList) || nameList.length === 0) {
            return;
        }

        // 清空父元素
        if (mode === 'replace') {
            InputManager.ac(parentElement);
        }

        const fragment = document.createDocumentFragment();
        let hasValidElements = false; // 标记是否有实际元素被创建

        // 3. 循环创建元素
        for (const name of nameList) {
            // 业务逻辑：过滤掉以 [id] 开头的特殊标识
            if (!name) {
                continue;
            }

            const element = document.createElement(appendType);
            if (name.startsWith('[id]')) {
                element.id = name.slice(4);
            } else if (name.startsWith('[class]')) {
                element.className = name.slice(7);
            } else {
                element[nameType] = name;
            }
            fragment.appendChild(element);
            hasValidElements = true;
        }

        // 如果没有创建任何有效元素（例如全都被过滤了），直接返回
        if (!hasValidElements) {
            return;
        }

        // 4. 归一化插入逻辑
        // 确定参照节点：如果未指定 referenceNode，且 index 有效，则从 children 中获取
        if (!referenceNode && index !== -1) {
            // 注意：如果 index 超出范围，children[index] 为 undefined，这也是我们要的预期行为
            referenceNode = targetParent.children[index];
        }

        // 核心优化：insertBefore 的第二个参数如果是 null，行为等同于 appendChild。
        // 这样可以消除 if-else 分支，统一为一种操作。
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
    static _MAX_INPUT_LEN = 1111;

    /**
     * @static
     * @type {number}
     * @description 统计模式最大统计数据行数。
     */
    static MAX_STATISTICS_ROW = 200;

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
            const notSpecialSymbol = !(prevInfo.isHtmlClassLenOne && currInfo.isHtmlClassLenOne);
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
        for (let i = totalRangeStart; i < totalRangeEnd; i++) {
            const curr = children[i];
            if (curr.className === '_space_') {
                curr.remove();
                totalRangeEnd -= 1;
            }
        }
        // 批量插入空格
        for (let i = addIndex.length - 1; i >= 0; i--) {
            HtmlTools.appendDOMs(target, ['_space_'], {index: addIndex[i]});
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
                            return;
                        case 'up':
                        case 'down':
                            nextNum = currentSubModes[0] + (direction === 'up' ? -1 : 1);
                            makeValue = nextNum => [nextNum, currentSubModes[1]];
                            break;
                    }
                    break;
                }
                case '3': {
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
                    return;
                }
                default: {
                    len = HtmlTools.getHtml(`#screen_${currentMode}`).children.length - 1;
                    let addNum = 1;
                    if (['up', 'left'].includes(direction)) {
                        addNum = -1;
                    }
                    nextNum = Number(PageConfig.subModes[currentMode]) + addNum;
                    makeValue = nextNum => nextNum.toString();
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
     * @param {boolean} [options.recoverMode=false] - (可选) 是否为恢复模式。
     * @returns {boolean} 如果成功添加行，则返回 `true`；如果因达到最大行数限制而失败，则返回 `false`。
     */
    static statisticsAddLine(
        {
            location = null,
            inputListX = [],
            inputListY = [],
            recoverMode = false
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
            position = len - 1;
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
        // 创建新行的 DOM 元素
        const insert = document.createElement('div');

        // 创建序号列的 DOM 结构
        const serialNumberGrandfather = document.createElement('div');
        const serialNumberFather = document.createElement('div');
        const addNum = HtmlTools.textToHtmlClass((position + 1).toString());
        HtmlTools.appendDOMs(serialNumberFather, addNum);
        serialNumberGrandfather.appendChild(serialNumberFather);

        // 创建 X 数据列的 DOM 结构
        const gridX = document.createElement('div');
        gridX.classList.add('DataX');
        HtmlTools.appendDOMs(gridX, inputListX);

        // 创建 Y 数据列的 DOM 结构
        const gridY = document.createElement('div');
        gridY.classList.add('DataY');
        HtmlTools.appendDOMs(gridY, inputListY);

        // 将所有列添加到新行中
        insert.appendChild(serialNumberGrandfather);
        insert.appendChild(gridX);
        insert.appendChild(gridY);

        // 将新行插入到数据网格中
        gridData.insertBefore(insert, target);

        // 更新后续行的序号
        for (let i = position + 1; i < gridDataChildren.length; i++) {
            const positionContainer = gridDataChildren[i].firstElementChild.firstElementChild;
            const newNum = HtmlTools.textToHtmlClass((i + 1).toString());
            HtmlTools.appendDOMs(positionContainer, newNum, {mode: 'replace'});
        }

        if (!recoverMode) {
            PageConfig.setScreenData();
        }
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
        for (let i = position; i < gridDataChildren.length; i++) {
            const positionContainer = gridDataChildren[i].firstElementChild.firstElementChild;
            const newNum = HtmlTools.textToHtmlClass((i + 1).toString());
            HtmlTools.appendDOMs(positionContainer, newNum, {mode: 'replace'});
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
     * @type {boolean}
     * @description Worker 是否正在计算 mode0ShowOnScreen 发送的任务。
     */
    static mode0ScreenInCalc = false;

    /**
     * @static
     * @method mode0ShowOnScreen
     * @description 一个防抖（debounced）函数，用于在标准计算模式（模式 '0'）下，在屏幕上异步显示当前输入表达式的实时计算结果。
     *
     * 该方法通过以下步骤工作：
     * 1. **防抖**: 使用 `_debounce` 包装器，确保只有在用户停止输入一段预设的时间（`this.DELAY_TIME`）后，计算和UI更新才会被触发。这可以防止在用户快速打字时进行不必要的、耗费资源的计算。
     * 2. **获取输入**: 从主输入区域获取当前的表达式字符串。
     * 3. **异步计算**: 调用 `WorkerTools.exec` 将表达式发送到 Web Worker 进行异步计算。这可以防止复杂的计算阻塞主线程，保持界面的响应性。计算使用较低的“普通精度”以获得更快的响应。
     * 4. **显示结果**:
     *    - 如果计算成功，它会将结果格式化为一系列 DOM 元素，并更新到屏幕上专门用于显示结果的区域 (`#screen_0_display_inner`)，然后使该区域可见。
     *    - 如果计算失败（例如，表达式有语法错误），它会隐藏结果显示区域，不显示任何内容。
     * @returns {Promise<void>} 此方法本身不直接返回任何内容，但它触发的异步计算会返回一个 Promise。
     */
    static mode0ShowOnScreen = this._debounce(this._mode0ShowOnScreenFunc, this._DELAY_TIME, {
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
     * @method _debounce
     * @description 高级防抖函数
     * @param {Function} func - 要执行的函数
     * @param {Number} wait - 等待时间 (毫秒)
     * @param {Object} options - 配置对象
     * @param {Boolean} [options.leading=false] - 指定在延迟开始前是否调用
     * @param {Boolean} [options.trailing=true] - 指定在延迟结束后是否调用
     * @param {Number} [options.maxWait] - 设置函数允许被延迟的最大值
     * @returns {Function} - 返回防抖处理后的函数
     */
    static _debounce(func, wait, options = {}) {
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
            await WorkerTools.restart();

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
                await WorkerTools.restart();
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
        // 根据 mode 参数，切换或设置 #explain 元素的 'ExplainNotShow' 类，从而控制说明面板的显示/隐藏。
        HtmlTools.getHtml('#explain').classList[mode === undefined ? 'toggle' : mode]('ExplainNotShow');
        // 同样地，切换或设置 #main_cover 元素的 'NoDisplay' 类，以同步显示/隐藏主遮罩层。
        HtmlTools.getHtml('#main_cover').classList[mode === undefined ? 'toggle' : mode]('NoDisplay');
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
            // 在普通键盘模式下
            // 如果正在定义 f(x) (子模式 '0')，按钮显示为 'x'
            // 否则，按钮显示为 'f'，用于在 g(x) 的定义中调用 f(x)
            dealArea.className = PageConfig.subModes['2_0'] === '0' ? '_x_mathit_' : '_f_';
        } else if (PageConfig.keyboardType === 1) {
            // 在第二功能键盘模式下
            // 如果正在定义 g(x) (子模式 '1')，按钮显示为 'x'
            // 否则，按钮显示为 'g'，用于在 f(x) 的定义中调用 g(x)
            dealArea.className = PageConfig.subModes['2_0'] === '1' ? '_x_mathit_' : '_g_';
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
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen.cancel();
            if (PrintManager.mode0ScreenInCalc) {
                WorkerTools.restart();
            }
            InputManager.ac(HtmlTools.getHtml('#print_content_0_content_0'));
            InputManager.ac(HtmlTools.getHtml('#print_content_0_content_1'));
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
        HtmlTools.appendDOMs(target, expr, {mode: 'replace'});
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
                addSucceed = InputManager.statisticsAddLine();
            }
            // 更新并持久化屏幕数据。
            PageConfig.setScreenData();
            // 如果成功添加了新行，则将高亮光标移动到新行。
            if (moveCursor && addSucceed) {
                InputManager.moveCursor('down');
            }
        } else {
            // 对于其他模式...
            // 更新并持久化屏幕数据。
            PageConfig.setScreenData();
            // 如果当前子屏幕不是该模式下的最后一个，则自动将焦点移动到下一个子屏幕。
            if (moveCursor && HtmlTools.getHtml(`#screen_${currentMode}`).children.length !== Number(PageConfig.subModes[currentMode]) + 1) {
                InputManager.moveCursor('right');
            }
        }
        // 确保新激活的区域在视图中可见。
        HtmlTools.scrollToView();
    }
}

/**
 * @global
 * @description 点击事件监听器，用于处理页面上的用户交互。
 * 它通过检查被点击元素的 ID、类名和父元素信息来分发操作。
 */
document.addEventListener('click', (event) => {
    // 1. 获取实际点击的目标元素
    let target = event.target;

    // 2. 如果点击的是 P 标签且不在 input 容器内，则视为点击了其父容器
    if (target.tagName.toLowerCase() === 'p' && target.parentNode?.id !== 'input') {
        target = target.parentNode;
    }

    // 3. 提取关键属性，减少后续重复访问 DOM 的开销
    const {id: targetID, className: targetClass} = target;
    // 获取第一个子元素的类名 (通常用于识别按钮功能，如 _exe_, _ac_)
    const firstChildClass = target.firstElementChild?.className || '';
    const parent = target.parentNode;
    const parentID = parent?.id || '';

    console.log({parentID, targetID, targetClass, firstChildClass});

    // --- 策略 1: 基于明确 ID 的快速分发 (Exact Matches) ---
    switch (targetID) {
        case 'head_setting':
            return PageControlTools.headChangeModes();

        case 'head_title':
            return PageControlTools.moveShip();

        case 'main_cover':
            return PageControlTools.clickMainCover();

        case 'print_close':
            return PageControlTools.closePrint();

        case 'head_explain':
        case 'explain_close':
            return PageControlTools.headChangeExplain();

        case 'input':
            if (HtmlTools.isScrolledToRight(HtmlTools.getHtml('#input'))) {
                InputManager.moveCursor('end');
            }
            return;

        case 'load_cancel':
            return PageControlTools.cancelPrint();
    }

    // --- 策略 2: 基于父容器 ID 的逻辑 (Group Logic) ---
    const showMoreFunc = () => PageControlTools.changeSubKeyboard('SortSvg');

    switch (parentID) {
        case 'switch_knob_on':
        case 'switch_knob_off':
        case 'switch_knob':
        case 'switch_container':
        case 'switch_container_father':
            PageConfig.calcAccMode = 1 - PageConfig.calcAccMode;
            return;

        case 'sort_svg':
        case 'keyboard_top_more':
            return showMoreFunc();

        case 'keyboard_top': {
            // 键盘顶部功能区逻辑
            const handlers = {
                '_2nd_': () => PageConfig.keyboardType = 1 - PageConfig.keyboardType,
                '_trigonometry_': () => PageControlTools.changeSubKeyboard('_trigonometry_'),
                '_functions_': () => PageControlTools.changeSubKeyboard('_functions_')
            };

            // 如果在处理器映射中找到对应类名，执行对应函数；否则移动光标
            if (handlers[firstChildClass]) {
                handlers[firstChildClass]();
            } else if (targetID === 'keyboard_top_more') {
                showMoreFunc();
            } else {
                // 提取光标移动方向，例如 class="_cursor_left_" -> "left"
                // 假设 class 格式固定，从索引 13 开始截取
                const direction = firstChildClass.slice(13).toLowerCase();
                if (direction) {
                    InputManager.moveCursor(direction);
                }
            }
            return;
        }
    }

    // 屏幕输入区切换 (screen_input_2, screen_input_3...)
    if (parentID.startsWith('screen_input_')) {
        const modeIndex = parentID.slice(-1); // 获取最后一位数字
        PageConfig.subModes = {'default': modeIndex};
        PageControlTools.syncScreenToInput();
        return;
    }

    if (parentID === 'input' && targetID === '') {
        return InputManager.clickMoveCursor(target);
    }

    // --- 策略 3: 基于正则或特定类名的模式匹配 (Pattern Matches) ---

    // 键盘遮罩层
    if (targetID.includes('keyboard_cover')) {
        return PageControlTools.changeSubKeyboard('allNotShow');
    }

    // 模式切换 (mode_0 到 mode_4)
    if (/^mode_[0-4]$/.test(targetID)) {
        const mode = targetID.slice(-1);
        PageConfig.currentMode = (mode === '2') ? '2_0' : mode;
        // 修复: 使用箭头函数替代字符串，更安全且性能更好
        setTimeout(() => PageControlTools.clickMainCover(), 340);
        return;
    }

    // 统计模式数据切换 (DataX, DataY)
    if (/Data[XY]/.test(targetClass)) {
        // 获取点击元素在表格中的位置
        const children = HtmlTools.getHtml('#grid_data').children;
        const name = [];
        // 从被点击的单元格逆向推导出其在网格中的行和列索引。
        name[0] = [...children].indexOf(target.parentNode);
        name[1] = target.classList.contains('DataX') ? 0 : 1;
        // 更改子模式
        PageConfig.subModes = {'default': name};
        PageControlTools.syncScreenToInput();
        return;
    }

    // 打印精度/模式 (print_0, print_1)
    if (/^print_[0-1]$/.test(targetID)) {
        PageConfig.printMode = targetID.slice(-1);
        return;
    }

    // 键盘样式输入
    if (/KeyboardStyle[13]/.test(targetClass)) {
        if (firstChildClass === '_add_line_') {
            const currentSubModes = PageConfig.subModes['1'];
            const succeed = InputManager.statisticsAddLine({
                location: currentSubModes,
                inputListX: currentSubModes[1] === 0 ? ['_0_'] : [],
                inputListY: currentSubModes[1] === 0 ? [] : ['_0_']
            });
            if (succeed && !HtmlTools.getHtml('.InputTip')) {
                InputManager.ac();
            }
            return;
        }
        if (firstChildClass === '_del_line_') {
            return InputManager.statisticsDelLine();
        }
        InputManager.input(HtmlTools.getClassList(target));
        if (targetClass.includes('NeedParentheses') && PageConfig.keyboardType === 1) {
            InputManager.input(['_parentheses_left_']);
        }
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
        return;
    }

    if (/title_mode_([0134]|2_[01])|screen_title/.test(targetID)) {
        if (document.fullscreenElement) {
            // 进入全屏
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
        return;
    }

    // --- 策略 4: 基于子元素图标功能的通用按钮 (Functional Buttons) ---

    switch (firstChildClass) {
        case '_exe_':
            return PrintManager.exe();
        case '_ac_':
            return InputManager.ac();
        case '_del_': {
            InputManager.del();
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;
        }
    }
});

/**
 * @global
 * @description 监听全局键盘按下事件，以实现通过物理键盘与计算器进行交互的功能。
 * 此监听器捕获按键事件，并根据按下的键执行相应的操作，如输入数字/运算符、删除字符、移动光标或执行计算。
 * 它通过调用 `HtmlTools` 和 `PageControlTools` 中的方法来间接操作 DOM 和应用程序状态。
 *
 * @param {KeyboardEvent} event - 浏览器传递的键盘事件对象。
 */
document.addEventListener('keydown', (event) => {
    // 获取按下的键的字符串表示形式
    const key = event.key;

    // 1. 优先处理功能控制键 (Switch 结构更清晰)
    switch (key) {
        case 'Backspace': {
            event.preventDefault(); // 阻止浏览器默认的退格行为（如返回上一页）
            InputManager.del('left', event.shiftKey);
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;
        }

        case 'Delete': {
            event.preventDefault(); // 阻止浏览器默认的退格行为（如返回上一页）
            InputManager.del('right', event.shiftKey);
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;
        }

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
            event.preventDefault(); // 阻止光标在页面上滚动
            // 将 'ArrowLeft' 转换为 'left'，并调用光标移动函数
            return InputManager.moveCursor(key.slice(5).toLowerCase(), event.shiftKey);

        case 'Enter':
            // Enter 的逻辑判断
            event.preventDefault(); // 阻止表单提交等默认行为
            // 如果设置或说明面板是打开的（通过检查遮罩层），则关闭它们
            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay')) {
                return PageControlTools.clickMainCover();
            }
            // 如果当前在打印/结果视图，则关闭它返回到输入视图
            if (!HtmlTools.getHtml('#main').classList.contains('Input')) {
                if (!HtmlTools.getHtml('#load_cover').classList.contains('NoDisplay')) {
                    return PageControlTools.cancelPrint();
                }
                return PageControlTools.closePrint();
            }
            // 否则，执行计算
            return PrintManager.exe();
    }

    // 2. 处理字符输入 (字母/数字/E)
    // 使用正则表达式匹配单个字母、数字或 'E'
    if (/^([a-z0-9E])$/.test(key)) {
        event.preventDefault(); // 阻止将字符输入到非预期的元素中
        // 处理 Alt 组合键
        if (event.altKey && ['e', 'i', 'x'].includes(key)) {
            InputManager.input([`_${key}_mathit_`]);
        } else {
            // 普通字符输入
            InputManager.input([`_${key}_`]);
        }
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
        return;
    }

    // 3. 处理运算符
    // 使用正则表达式匹配常见的数学运算符
    if (/^[+\-*/^|!,.()]$/.test(key)) {
        event.preventDefault(); // 阻止默认的浏览器快捷键或行为
        // 将按键字符转换为对应的 HTML 类名并插入到输入区域
        InputManager.input(HtmlTools.textToHtmlClass(HtmlTools.deleteIllegal(key)));
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
    }
});

/**
 * @global
 * @function window.onload
 * @description 当页面完全加载后执行此函数。
 * 它的主要职责是从 localStorage 中恢复计算器的上一次会话状态，
 * 包括主操作模式 (currentMode) 和各个模式下的子模式 (subModes) 设置。
 * 这确保了用户在刷新或重新访问页面时能够看到他们离开时的界面和配置。
 */
window.addEventListener('load', () => {
    const getStore = (key) => localStorage.getItem(key);

    /**
     * 安全恢复 LocalStorage 数据的辅助函数。
     * * 此函数尝试读取指定键的数据：
     * 1. 如果数据存在，执行 `func` 进行恢复。
     * 2. 如果数据不存在且提供了 `defaultFunc`，执行 `defaultFunc` 设置默认状态。
     * 3. 执行过程中的任何异常（如 JSON 解析错误或 setter 校验失败）都会被捕获，并打印警告、清除损坏数据，从而防止页面初始化崩溃。
     *
     * @param {string} dataName - LocalStorage 键名
     * @param {function(string): void} func - 有数据时的恢复函数
     * @param {function(): void} [defaultFunc=null] - 无数据时的默认函数
     * @returns {void}
     */
    const recoverData = (dataName, func, defaultFunc = null) => {
        const currentData = getStore(dataName);

        try {
            if (currentData !== null) {
                // 数据存在，传入数据
                func(currentData);
            } else if (defaultFunc) {
                // 数据不存在且有默认处理，无参调用
                defaultFunc();
            }
        } catch (e) {
            console.warn(`[GLOBAL] LocalStorage ${dataName} corrupted, resetting.`);
            localStorage.removeItem(dataName);
        }
    };

    // --- 开始恢复 (恢复顺序：数据层 -> UI层) ---

    // 屏幕数据
    recoverData('screenData', (data) => {
        data = JSON.parse(data);
        for (const key in data) {
            if (key !== '1') {
                HtmlTools.appendDOMs(HtmlTools.getHtml(`#screen_input_inner_${key}`), HtmlTools.textToHtmlClass(data[key]), {mode: 'replace'});
            } else {
                const list = data[key];
                const len = list.length;
                for (let i = 0; i < len; i++) {
                    InputManager.statisticsAddLine({
                        location: [i, 0],
                        inputListX: HtmlTools.textToHtmlClass(list[i][0]),
                        inputListY: HtmlTools.textToHtmlClass(list[i][1]),
                        recoverMode: true
                    });
                }
            }
        }
    });

    // 子模式 (需要 JSON.parse)
    recoverData('subModes', (data) => {
        PageConfig.subModes = JSON.parse(data);
    });

    // 键盘类型
    recoverData('keyboardType', (data) => {
        PageConfig.keyboardType = Number(data);
    });

    // 打印模式
    recoverData('printMode', (data) => {
        PageConfig.printMode = data;
    });

    // 计算精度
    // 如果有数据则 Number(data)，如果没有数据则设为 0
    recoverData(
        'calcAccMode',
        (data) => PageConfig.calcAccMode = Number(data),
        () => PageConfig.calcAccMode = 0
    );

    // 当前模式
    recoverData('currentMode', (data) => {
        PageConfig.currentMode = data;
    });

    HtmlTools.scrollToView();
});