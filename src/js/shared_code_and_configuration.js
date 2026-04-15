(function () {
    "use strict";

    /**
     * @class TokenConfig
     * @description 一个静态工具类，用于记录计算器使用的词元信息
     */
    class TokenConfig {

        /**
         * @constructor
         * @description TokenConfig 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 TokenConfig 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[TokenConfig] TokenConfig is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @function _complement
         * @description (内部辅助函数) 计算两个数组的差集 (A \ B)，返回所有在数组 A 中但不在数组 B 中的元素。
         * @param {Array<*>} arrA - 源数组（集合 A）。
         * @param {Array<*>} arrB - 要从中减去的元素的数组（集合 B）。
         * @returns {Array<*>} 一个新的数组，包含差集中的所有元素。
         */
        static _complement(arrA, arrB) {
            const setB = new Set(arrB);
            return arrA.filter(item => !setB.has(item));
        }

        // --- 基础数组定义 (私有，仅用于初始化) ---
        // 放置在两个操作数之前的二元运算符
        static _func_01_2 = ['log', 'nroot'];
        // 放置在两个操作数之间的二元运算符（例如 a + b）
        // '&' 是内部表示的隐式乘法。
        static _func_11_2 = ['+', '-', '*', '&', '/', 'mod', '^', 'E', '[toPolar]'];
        // 接受一个参数的函数（例如 sin(x)）
        // 'N' (一元负号) 和 'A' (绝对值) 是内部表示。
        static _func_01_1 = ['sqrt', 'cbrt', 'ln', 'exp', 'lg', 'f', 'g', 're', 'im', 'conj', 'ceil', 'floor', 'arg', 'sgn', '[gamma]', 'sin', 'arcsin', 'cos', 'arccos', 'tan', 'arctan', 'sh', 'arsh', 'ch', 'arch', 'th', 'arth', 'abs', 'A', 'N'];
        // 放置在操作数之后的一元运算符（例如 5!）
        static _func_10_1 = ['!', '[degree]'];
        // 内部使用的私有函数/运算符，不应直接由用户输入。
        static _private_func = ['A', 'N', '&'];
        // 在 HTML 只占用一个类名的函数。
        static _htmlClass_len_one_func = ['[gamma]', '[toPolar]', '[degree]', '[cursor]', '[cdot]'];

        // 定义数字常量和变量 'x'。
        static _baseNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.'];
        static _codeNumbers = ['[pi]', '[e]', '[i]', '[x]'];

        // 其他有效符号。
        static _other = ['|', ',', '(', ')'];

        // --- 暴露给外部的高速 Set 集合 (O(1) 查询) ---
        // 将所有函数和运算符合并到一个列表中，以便于查找。
        static allFunc = new Set([...this._func_01_2, ...this._func_11_2, ...this._func_01_1, ...this._func_10_1]);
        // 右结合运算符
        static htmlClassLenOneFunc = new Set(this._htmlClass_len_one_func);
        // 内部使用的私有函数/运算符，不应直接由用户输入。
        static privateFunc = new Set(this._private_func);
        // 需要特殊括号处理的函数和运算符
        // 稍后用于添加临时标记以插入括号。
        static rightAssocFunc = new Set([...this._func_01_1, '^']);
        static needParensFunc = new Set(['^', ...this._complement(this._func_01_1, ['A', 'N'])]);

        // 数字和常量
        static baseNumbers = new Set(this._baseNumbers);
        static codeNumbers = new Set(this._codeNumbers);

        // 剩余符号
        static other = new Set(this._other);

        // 所有有效词法单元的完整列表
        static allSigns = new Set([...this.allFunc, ...this._baseNumbers, ...this._codeNumbers, ...this._other]);

        // 为快速判断参数数量和位置准备的 Set
        // 按参数数量分组
        static params_1_set = new Set([...this._func_01_1, ...this._func_10_1]);
        static params_2_set = new Set([...this._func_01_2, ...this._func_11_2]);
        // 按函数位置分组
        static PlaceFrontSet = new Set([...this._func_01_2, ...this._func_01_1]);
        static PlaceMiddleSet = new Set(this._func_11_2);
        static PlaceBackSet = new Set(this._func_10_1);

        // --- 预计算的优先级 Map ---
        static priorityMap = new Map();

        // 静态初始化块：只在类加载时执行一次，用于处理复杂的初始化逻辑
        static {
            const levels = [
                [...this._func_01_2, ...this._complement(this._func_01_1, ['N'])], // l0
                this._func_10_1, // l1
                ['^'], // l2
                ['N'], // l3
                ['&'], // l4
                this._complement(this._func_11_2, ['+', '-', '*', '&', '/', 'mod', '^']), // l5
                ['*', '/', 'mod'], // l6
                ['+', '-'] // l7
            ];

            levels.forEach((levelTokens, index) => {
                levelTokens.forEach(token => {
                    this.priorityMap.set(token, index);
                });
            });
        }
    }

    /**
     * @class Public
     * @description 一个静态工具类，提供全局所需的、与特定数学对象无关的通用辅助函数。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class Public {
        /**
         * @static
         * @type {number}
         * @description 合法 token 的最大长度。
         */
        static MAX_TOKEN_LENGTH = 9;

        /**
         * @constructor
         * @description Public 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 Public 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[Public] Public is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @type {boolean}
         * @description 标记当前是否处于 Web 模式。
         * 如果为 true，则启用某些特定于 Web 的功能（如全屏切换）。
         * 这是一个私有静态字段，应通过 `webMode` 的 getter 进行访问。
         */
        static _webMode = true;

        /**
         * @static
         * @property {boolean} webMode
         * @description 获取当前是否处于 Web 模式。
         * @type {boolean}
         */
        static get webMode() {
            return this._webMode;
        }

        /**
         * @static
         * @method typeOf
         * @description 以小写字符串形式获取一个值的精确类型。
         * 这在区分对象子类型时比 `typeof` 更可靠。
         * @param {*} value - 需要检查类型的任何值。
         * @returns {string} 表示该值类型的小写字符串 (例如, 'array', 'object', 'bignumber')。
         */
        static typeOf = value => Object.prototype.toString.call(value).slice(8, -1).toLowerCase();

        /**
         * @static
         * @method zeroCorrect
         * @description 修正潜在的浮点计算误差，将绝对值极小的数“修正”为零。
         * 它创建一个基于输入精度的极小阈值，如果输入数字的绝对值小于此阈值，则将其视为零。
         * 这有助于清理那些本应为零但因计算误差而产生的微小非零结果（例如 1e-250）。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 需要修正的输入数字。
         * @returns {ComplexNumber} 修正后的 ComplexNumber 实例。
         */
        static zeroCorrect(x) {
            /**
             * @function _bigNumberZeroCorrect
             * @description (内部辅助函数) 检查一个 BigNumber 是否非常接近于零，如果是，则将其“修正”为零。
             * 这是 `zeroCorrect` 的核心实现，专门处理 BigNumber 实例。
             * @param {BigNumber} input - 需要进行零值修正的 BigNumber 实例。
             * @returns {BigNumber} 如果输入值小于预设的极小阈值，则返回一个代表零的新 BigNumber 实例；否则返回原始输入。
             * @private
             */
            function _bigNumberZeroCorrect(input) {
                const acc = input.acc;
                // 创建一个极小的阈值 (smallNum)。
                // 如果一个数的绝对值小于这个阈值，我们就可以安全地认为它在计算上等同于零。
                // 阈值的选择是基于精度的，通常是精度的一个比例或略低于精度，以捕捉浮点误差。
                const smallNum = new ComplexNumber([-Math.max(Math.floor(0.9 * acc), acc - 8), 1n, acc]);
                // 比较 |input| 和 smallNum。如果 |input| < smallNum，则返回 0。
                if (MathPlus.minus(smallNum, MathPlus.abs(input)).re.mantissa > 0n) {
                    return new BigNumber([0, 0n, acc]);
                }
                // 如果大于阈值，则返回原始输入。
                return input;
            }

            // 确保输入是 ComplexNumber 类型，以便统一处理实部和虚部。
            x = new ComplexNumber(x);
            // 分别对复数的实部和虚部进行零值修正，然后返回一个新的 ComplexNumber。
            return new ComplexNumber([
                _bigNumberZeroCorrect(x.re),
                _bigNumberZeroCorrect(x.im)
            ]);
        }

        /**
         * @static
         * @method integerCorrect
         * @description 修正一个非常接近整数的数值的潜在浮点计算误差。
         * 在开 n 次方的计算中，根指数 n 必须是整数。此方法通过临时降低输入值的精度，
         * 尝试将一个由于计算误差而产生的、接近整数的数（例如 2.999...）“修正”回其整数值（例如 3）。
         * 如果降低精度后该数变为整数，则返回修正后的整数值；否则，返回原始值。
         * @param {ComplexNumber|string|number} n - 需要修正的输入数字，通常是根指数。
         * @returns {ComplexNumber} 修正后的 ComplexNumber（如果修正成功）或原始的 ComplexNumber。
         */
        static integerCorrect(n) {
            const input = new ComplexNumber(n);
            // 如果输入数字的实部已经是整数（其 BigNumber 表示的 power >= 0），则无需修正。
            if (input.re.power >= 0 && input.im.mantissa === 0n) {
                return input;
            }
            const acc = input.acc;
            // 创建一个具有较低精度的新 ComplexNumber 实例。
            // 降低精度是修正浮点误差的常用技巧。
            const newInput = new ComplexNumber(input, {acc: Math.max(Math.floor(0.9 * acc), acc - 8)});
            // 检查降低精度后，该数是否变成了整数。
            if (newInput.re.power >= 0 && newInput.im.mantissa === 0n) {
                // 如果是，则返回这个被“修正”为整数的新实例。
                return newInput;
            }
            // 如果降低精度后仍不是整数，说明它不是一个“非常接近”整数的数，返回原始输入。
            return input;
        }

        /**
         * @static idealizationToString
         * @description 将一个或一组数值转换为对用户友好的、经过“理想化”处理的字符串。
         * “理想化”处理主要包含两个步骤：
         * 1. **零值修正**：使用 `zeroCorrect` 方法将因浮点计算误差而产生的、极小的非零值（如 1e-250）修正为零。
         * 2. **精度控制**：使用一个通常略低于内部计算精度的 `acc` 值来格式化数字。这能有效隐藏计算伪影（例如，将 4.999...98 舍入为 "5"），从而呈现出更清晰、更符合数学期望的结果。
         *
         * 该方法能够处理单个值或数组，并会原样返回 'error' 字符串。
         *
         * @param {*|Array<*>} x 要转换的值。可以是任何 `ComplexNumber` 构造函数可接受的类型（如 string, number, BigNumber, ComplexNumber 等），或这些类型的数组。
         * @param {object} [options={}] - (可选) 格式化选项。
         * @param {number} [options.acc=CalcConfig.outputAccuracy] - 用于格式化的目标精度。
         *   - 若省略，则使用 `CalcConfig.outputAccuracy` 的当前值。
         *   - 若 `acc >= 1`，它代表一个绝对的有效数字位数。
         *   - 若 `0 < acc < 1`，它被视为一个比例，最终精度将是 `acc * CalcConfig.globalCalcAccuracy`。
         *   - 若 `acc <= 0`，它代表输出精度和输入一致。
         * @param {string} [options.printMode=CalcConfig.globalPrintMode] - 输出模式，如 'algebra' 或 'polar'。
         * @returns {string|string[]} 如果输入是单个值，则返回其字符串表示；如果输入是数组，则返回一个字符串数组。
         */
        static idealizationToString(x, {
            acc = CalcConfig.outputAccuracy,
            printMode = CalcConfig.globalPrintMode
        } = {}) {
            // 特殊情况：如果输入是 'error' 字符串，直接返回，不进行任何处理。
            if (x === 'error') {
                return 'error';
            }

            // 内部辅助函数：根据输入数值的精度计算输出精度
            // numAcc: 数值本身的计算精度
            const getRealAcc = (numAcc) => {
                if (acc <= 0) {
                    // 同精度模式：直接返回数值本身的精度
                    return numAcc;
                }
                if (acc < 1) {
                    // 比例模式：基于数据本身的精度 * 比例
                    return Math.floor(acc * numAcc);
                }
                // 绝对模式：直接使用指定的位数，但不能超过数据本身的精度
                // 防止用户要求输出精度高于计算精度
                return Math.min(acc, numAcc);
            };

            // 根据输入值的类型进行不同的处理。
            switch (Public.typeOf(x)) {
                // 如果输入是一个数组，则递归地处理数组中的每个元素。
                case 'array': {
                    const result = [];
                    for (let i = 0; i < x.length; i++) {
                        // 同样，在数组处理中也要检查 'error' 字符串。
                        if (x[i] === 'error') {
                            result.push('error');
                        } else {
                            const num = new ComplexNumber(x[i]);
                            const realAcc = getRealAcc(num.acc);
                            // 将每个元素转换为 ComplexNumber，然后使用计算出的“真实精度”将其格式化为字符串。
                            result.push(Public.zeroCorrect(num).toString({
                                acc: realAcc,
                                printMode: printMode
                            }));
                        }
                    }
                    return result;
                }
                // 对于任何非数组的单个值。
                default:
                    const num = new ComplexNumber(x);
                    const realAcc = getRealAcc(num.acc);
                    // 将该值转换为 ComplexNumber，然后使用“真实精度”将其格式化为字符串。
                    return Public.zeroCorrect(num).toString({
                        acc: realAcc,
                        printMode: printMode
                    });
            }
        }

        /**
         * @static
         * @method funcToString
         * @description 将一个系数列表根据指定的函数模型转换为人类可读的数学函数字符串。
         * 此方法支持多种函数模型，如多项式、指数函数等。
         * @param {Array<*>} list - 系数列表。其具体含义取决于 `mode` 参数。
         *   - 对于 'powerFunc', 'lnFunc': `[a₀, a₁, ..., aₙ]` 代表 `a₀ + a₁x + ... + aₙxⁿ`。函数会将其格式化为 `aₙxⁿ + ... + a₁x + a₀` 的形式。
         *   - 对于其他模式: `[a, b]` 代表函数的两个主要参数。
         * @param {string} mode - 用于格式化的函数模型。
         *   - 'powerFunc': 多项式函数, f(x) = aₙxⁿ + ... + a₀。
         *   - 'lnFunc': 对数多项式函数, f(x) = aₙ(lnx)ⁿ + ... + a₀。
         *   - 'expFunc': 指数函数, f(x) = a * exp(b*x)。
         *   - 'abxFunc': 指数函数, f(x) = a * b^x。
         *   - 'axbFunc': 幂函数, f(x) = a * x^b。
         *   - 'reciprocalFunc': 反比例函数, f(x) = a + b/x。
         * @param {string} [asX='x'] - (可选) 在 'powerFunc' 模式中代表变量的字符串。默认为 'x'。
         * @returns {string} 格式化后的函数字符串。
         */
        static funcToString(list, mode, asX = '[x]') {
            // 检查是否是错误输入
            if (list.includes('error')) {
                return 'error';
            }

            // 首先将所有系数值转换为理想化的字符串表示。
            list = Public.idealizationToString(list);
            // 系数列表前两个元素 [a, b] 使用最多。
            const a = list[0];
            const b = list[1];
            let result = '';

            switch (mode) {
                // --- 多项式函数模型: aₙxⁿ + ... + a₁x + a₀ ---
                case 'powerFunc': {
                    // 用于控制在非首个非零项前添加 '+' 号。
                    let firstNoneZero = false;
                    // 从最高次项开始倒序遍历系数。
                    for (let i = list.length - 1; i >= 0; i--) {
                        const currentCoefficient = list[i];
                        // 忽略系数为零的项。
                        if (currentCoefficient !== '0') {
                            // 如果不是第一个非零项，并且系数不是负数（或包含'E'的科学记数法），则添加 '+'。
                            if (firstNoneZero && (currentCoefficient[0] !== '-' || currentCoefficient.includes('E'))) {
                                result += '+';
                            }
                            firstNoneZero = true;

                            // --- 处理变量项 (x, x², x³, ...) ---
                            if (i !== 0) {
                                // 特殊处理系数为 1 或 -1 的情况，以简化表达式 (例如 'x' 而不是 '1x')。
                                if (currentCoefficient === '1') {
                                    result += asX;
                                } else if (currentCoefficient === '-1') {
                                    result += `-${asX}`;
                                } else if (currentCoefficient.includes('E')) {
                                    // 如果系数是科学记数法，则用括号括起来。
                                    result += `(${currentCoefficient})${asX}`;
                                } else {
                                    result += `${currentCoefficient}${asX}`;
                                }
                            }
                            // --- 处理常数项 (i=0) ---
                            else if (!currentCoefficient.includes('E')) {
                                result += currentCoefficient;
                            } else {
                                // 如果常数项是科学记数法，并且是多项式中的唯一项，则不加括号。
                                result += list.length === 1 ? currentCoefficient : `(${currentCoefficient})`;
                            }

                            // --- 添加指数部分 ---
                            // 如果指数不为 0 或 1，则添加 '^' 和指数值。
                            if (![0, 1].includes(i)) {
                                result += `^${i}`;
                            }
                        }
                    }
                    // 如果遍历完所有系数都没有找到非零项，则函数为 0。
                    if (!firstNoneZero) {
                        return '0';
                    }
                    return result;
                }

                // --- 对数多项式模型: aₙ(lnx)ⁿ + ... + a₀ ---
                // 这是 powerFunc 的一个特例，只需将变量替换为 'ln(x)'。
                case 'lnFunc':
                    return Public.funcToString(list, 'powerFunc', `ln(${asX})`);

                // --- 指数函数模型: a * exp(b*x) ---
                case 'expFunc':
                    // 如果 a=0，整个函数为 0。
                    if (a === '0') {
                        return '0';
                    }
                    // 如果 b=0, a * exp(0) = a。
                    if (b === '0') {
                        return a;
                    }
                    // 递归调用 funcToString 来格式化表达式。
                    // 外层是 a * [variable]，内层是 exp(b*x)。
                    return Public.funcToString([0, a], 'powerFunc', `exp(${Public.funcToString([0, b], 'powerFunc')})`);

                // --- 指数函数模型: a * b^x ---
                case 'abxFunc':
                    if (a === '0') {
                        return '0';
                    }
                    // 如果 b=1, a * 1^x = a。
                    if (b === '1') {
                        return a;
                    }
                    // 处理系数 a 的格式。
                    if (a === '-1') {
                        result += '-';
                    } else if (a !== '1') {
                        result += a.includes('E') ? `(${a})*` : `${a}*`;
                    }
                    // 处理底数 b 的格式。
                    if (!b.includes('E') && !b.includes('-')) {
                        result += `${b}^${asX}`;
                    } else {
                        result += `(${b})^${asX}`;
                    }
                    return result;

                // --- 幂函数模型: a * x^b ---
                case 'axbFunc':
                    // 如果 b=0, a * x^0 = a。
                    if (b === '0') {
                        return a;
                    }
                    // 处理 x^b 部分的格式。
                    if (b === '1') {
                        result += `${asX}`;
                    } else if (!b.includes('E') && !b.includes('-')) {
                        result += `${asX}^${b}`;
                    } else {
                        result += `${asX}^(${b})`;
                    }
                    // 递归调用 funcToString 来处理系数 a。
                    return Public.funcToString([0, a], 'powerFunc', result);

                // --- 反比例函数模型: a + b/x ---
                case 'reciprocalFunc':
                    // 如果 b=0, 结果为 a。
                    if (b === '0') {
                        return a;
                    }
                    // 格式化 b/x 部分。
                    result += b.includes('E') ? `(${b})/${asX}` : `${b}/${asX}`;
                    // 如果 a 不为零，则添加常数项 a。
                    if (a !== '0') {
                        // 处理符号。
                        if (a[0] !== '-' || a.includes('E')) {
                            result += '+';
                        }
                        result += a.includes('E') ? `(${a})` : a;
                    }
                    return result;
            }
        }

        /**
         * @static
         * @method functionValueList
         * @description 在指定的数值范围内，以固定的步长计算一个函数的值列表。
         * 该函数能够处理字符串形式的数学表达式或一个 JavaScript 回调函数。
         * @param {function(any): ComplexNumber} func - 需要求值的函数。
         * @param {string|number|BigNumber|ComplexNumber} start - 区间的起始值。
         * @param {string|number|BigNumber|ComplexNumber} step - 区间内每一步的增量。
         * @param {string|number|BigNumber|ComplexNumber} end - 区间的结束值。循环将持续到当前值超过 `end` 为止。
         * @returns {Array<ComplexNumber|string>} 一个数组，其中包含函数在每个点上的计算结果。
         *   - 如果在某个点的计算成功，数组中对应的元素是一个 `ComplexNumber` 实例。
         *   - 如果在某个点的计算失败（例如，表达式无效或出现数学错误），则对应的元素是字符串 'error'。
         */
        static functionValueList(func, start, step, end) {
            // 初始化一个空数组，用于存储所有计算出的函数值。
            const result = [];
            // 为了进行高精度计算，将区间的起始、步长和结束值都转换为 ComplexNumber 实例。
            start = new ComplexNumber(start);
            step = new ComplexNumber(step);
            end = new ComplexNumber(end);

            // 遍历从 'start' 到 'end' 的整个范围。
            // - 初始化: 循环变量 i 从 start 开始。
            // - 条件: 循环持续的条件是 i <= end。这里使用高精度减法 (MathPlus.minus) 来进行精确比较。
            // - 增量: 在每一步中，i 都会增加一个步长 (step)。
            for (let i = start; MathPlus.minus(i, end).re.mantissa <= 0n; i = MathPlus.plus(i, step)) {
                try {
                    // 调用函数，并传入当前的循环变量 'i'。
                    result.push(func(i));
                } catch {
                    // 如果在函数求值过程中发生任何错误（例如，除以零、无效的数学运算），
                    // 则捕获异常，并在结果数组中对应位置添加 'error' 字符串。
                    result.push('error');
                }
            }
            // 返回包含所有计算结果的数组。
            return result;
        }

        /**
         * @static
         * @method getTokenInfo
         * @description 分析一个词法单元（token），返回其包含完整元数据的对象。
         * 此函数是词法分析器的核心，它为后续的语法分析（如调度场算法）提供了正确解析运算符优先级、
         * 结合性、函数参数数量等所需的所有信息。
         *
         * @param {string} token - 要分析的词法单元字符串，例如 `"+"`, `"sin"`, `"pi"`, `"5"`。
         *
         * @returns {object} 一个包含该词法单元详细信息的对象，其结构如下：
         * @property {string} token - 输入的词法单元字符串。
         * @property {string} class - 词法单元的通用类别，可以是：
         *   - `'func'`: 函数或运算符 (例如 `'+'`, `'sin'`)。
         *   - `'number'`: 数字、常量或变量 (例如 `'5'`, `'pi'`, `'x'`)。
         *   - `'other'`: 其他符号 (例如 `'('`, `','`)。
         *   - `'illegal'`: 未识别的非法词法单元。
         * @property {number} [parameters] - (仅限 `'func'` 类型) 函数或运算符所需的参数数量。例如，`'log'` 为 2，`'sin'` 为 1。
         * @property {string} [funcPlace] - (仅限 `'func'` 类型) 运算符或函数相对于其操作数的位置：
         *   - `'front'`: 前缀，例如 `sin(x)` 中的 `'sin'`。
         *   - `'middle'`: 中缀，例如 `x + y` 中的 `'+'`。
         *   - `'back'`: 后缀，例如 `x!` 中的 `'!'`。
         * @property {string} [associativity] - (仅限 `'func'` 类型) 运算符的结合性：
         *   - `'left'`: 左结合，例如 `a - b - c` 被解析为 `(a - b) - c`。
         *   - `'right'`: 右结合，例如 `a ^ b ^ c` 被解析为 `a ^ (b ^ c)`。
         * @property {boolean} [needKh] - (仅限 `'func'` 类型) 一个标志，指示该函数或运算符在语法预处理阶段是否需要特殊处理以确保括号的正确插入，从而保证运算次序。
         * @property {boolean} [isPrivate] - (仅限 `'func'` 类型) 一个标志，指示该词法单元是否为内部使用的私有符号（例如 `'N'` 代表一元负号），不应由用户直接输入。
         * @property {boolean} [isHtmlClassLenOne] - 一个标志，指示该词法单元是否在 HTML 只占用一个类名。
         * @property {string} [numClass] - (仅限 `'number'` 类型) 数字的子类别：
         *   - `'baseNumber'`: 基础数字字符，例如 `'0'`-`'9'` 和 `.`。
         *   - `'codeNumber'`: 预定义的常量或变量，例如 `'pi'`, `'e'`, `'i'`, `'x'`。
         * @property {number} priority - 运算符的优先级。数值越小，优先级越高。此属性是调度场算法正确处理运算顺序的关键。非运算符的此值为 `Infinity`。
         *
         * @example
         * // 分析一个中缀运算符
         * Public.getTokenInfo('+');
         * // 返回: { token: '+', class: 'func', parameters: 2, funcPlace: 'middle', associativity: 'left', needKh: false, isPrivate: false, priority: 7 }
         *
         * @example
         * // 分析一个前缀函数
         * Public.getTokenInfo('sin');
         * // 返回: { token: 'sin', class: 'func', parameters: 1, funcPlace: 'front', associativity: 'right', needKh: true, isPrivate: false, priority: 0 }
         */
        static getTokenInfo(token) {
            if (!token && token !== '') {
                return;
            }

            const result = {token: token};

            // 标记是否为在 HTML 中只占用一个类名的函数
            result.isHtmlClassLenOne = TokenConfig.htmlClassLenOneFunc.has(token);

            // 安全获取首字符（处理 token 为空字符串的情况，避免越界或报错）
            const firstChar = token.length > 0 ? token[0] : null;

            // 检查 token 是否合法 (不在全量符号表中，且首字母也不是基础数字)
            if (!TokenConfig.allSigns.has(token) && !TokenConfig.baseNumbers.has(firstChar)) {
                result.class = 'illegal';
                return result;
            }

            // 检查 token 是否为函数或运算符
            if (TokenConfig.allFunc.has(token)) {
                result.class = 'func';

                // 确定参数数量
                if (TokenConfig.params_1_set.has(token)) {
                    result.parameters = 1;
                } else if (TokenConfig.params_2_set.has(token)) {
                    result.parameters = 2;
                }

                // 确定函数/运算符的位置
                if (TokenConfig.PlaceFrontSet.has(token)) {
                    result.funcPlace = 'front';
                } else if (TokenConfig.PlaceMiddleSet.has(token)) {
                    result.funcPlace = 'middle';
                } else if (TokenConfig.PlaceBackSet.has(token)) {
                    result.funcPlace = 'back';
                }

                // 确定结合性、括号处理及是否为私有标记
                result.associativity = TokenConfig.rightAssocFunc.has(token) ? 'right' : 'left';
                result.needKh = TokenConfig.needParensFunc.has(token);
                result.isPrivate = TokenConfig.privateFunc.has(token);
            }
            // 检查 token 是否为数字或变量 (通过常量匹配或首字母匹配)
            else if (TokenConfig.codeNumbers.has(token) || TokenConfig.baseNumbers.has(firstChar)) {
                result.class = 'number';
                result.numClass = TokenConfig.codeNumbers.has(token) ? 'codeNumbers' : 'baseNumber';
            }
            // 检查 token 是否为其他合法符号（如括号、逗号等）
            else if (TokenConfig.other.has(token)) {
                result.class = 'other';
            }

            // 获取并附加优先级信息（利用预计算的 Map 极速获取）
            result.priority = TokenConfig.priorityMap.has(token) ? TokenConfig.priorityMap.get(token) : Infinity;

            return result;
        }

        /**
         * @static
         * @method tokenizer (词法分析器)
         * @description 将一个数学表达式字符串分解（或“标记化”）成一个词法单元（token）数组。
         * 这是解析过程的第一步（词法分析），它将原始的、无结构的字符串转换为一个解析器可以理解的、结构化的单元列表。
         *
         * @param {string} str - 要进行分词的数学表达式字符串。
         * @param {object} [options={}] - (可选) 一个包含配置选项的对象。
         * @param {string} [options.baseNumberMode='separate'] - (可选) 控制如何处理基本数字（0-9, .）的模式。
         *   - `'separate'`: (默认) 将每个数字或小数点字符视为一个独立的词法单元。例如, "123" -> ['1', '2', '3']。
         *   - `'together'`: 将连续的数字和单个小数点组合成一个完整的数字字符串词法单元。例如, "123.45" -> ['123.45']。
         * @param {boolean} [options.strictMode=true] - (可选) 控制错误处理的模式。
         *   - `true`: (默认) 严格模式。一旦遇到无法识别的字符或无效的数字格式（如 "1.2.3"），立即停止并返回一个错误数组。
         *   - `false`: 宽松模式。如果遇到非法字符，会将其作为单个 token 推入结果数组并继续解析。
         *
         * @returns {Array<string>|Array<[string, number]>}
         *   - **成功时**: 返回一个包含所有词法单元的字符串数组。
         *   - **失败时** (仅在严格模式下): 返回一个包含两个元素的数组 `['error', index]`，其中 `index` 是在原始字符串中检测到错误的字符的索引。
         *
         * @example
         * // 返回: ['sin', '(', '30', ')', '+', '1']
         * Public.tokenizer("sin(30)+1", { baseNumberMode: 'together' });
         *
         * // 返回: ['error', 4]
         * Public.tokenizer("1.2.3", { baseNumberMode: 'together', strictMode: true });
         */
        static tokenizer(str, {baseNumberMode = 'separate', strictMode = true} = {}) {
            // 初始化一个空数组，用于存储最终的词法单元列表。
            const result = [];
            // 遍历输入字符串的每个字符。
            for (let i = 0; i < str.length; i++) {
                const currentI = str[i];

                // --- 分支 1: 处理非字母字符 (如运算符, 数字, 括号等) ---
                // 使用正则表达式快速判断当前字符是否为非字母，这通常比检查一个巨大的字符列表更高效。
                if (currentI.match(/[^a-zA-Z\[\]]/)) {
                    // 获取该字符的详细信息（类型、类别等）。
                    const tokenInfo = Public.getTokenInfo(currentI);
                    // 如果是无法识别的单个字符，则立即返回错误。
                    if (tokenInfo.class === 'illegal') {
                        if (strictMode) {
                            return ['error', i];
                        }
                        result.push(currentI);
                        continue;
                    }
                    // 如果当前字符是数字或小数点，并且模式设置为 'together'...
                    if (baseNumberMode === 'together' && tokenInfo.numClass === 'baseNumber') {
                        let token = '';
                        let decimalPoint = false; // 用于跟踪是否已遇到小数点。
                        // ...则进入一个内部循环，以贪婪模式向前查找，构建完整的数字字符串。
                        while (i < str.length && Public.getTokenInfo(str[i]).numClass === 'baseNumber') {
                            token += str[i];
                            // 在严格模式下，检查并处理小数点，确保一个数字中最多只有一个小数点。
                            if (str[i] === '.' && strictMode) {
                                if (decimalPoint) {
                                    return ['error', i]; // 发现第二个小数点，格式错误。
                                }
                                decimalPoint = true;
                            }
                            i += 1; // 向前移动索引。
                        }
                        if (token === '.' && strictMode) {
                            return ['error', i - 1];
                        }
                        result.push(token); // 将构建好的完整数字词法单元推入结果数组。
                        i -= 1; // 回退一个字符，因为外层 for 循环的 i++ 会跳过下一个字符。
                    } else {
                        // 如果是其他合法的非字母字符（如 '+', '(', ')'），或在 'separate' 模式下，直接将其作为单个词法单元。
                        result.push(currentI);
                    }
                    continue; // 完成当前字符的处理，继续外层 for 循环。
                }

                // --- 分支 2: 处理字母开头的词法单元 (函数名, 常量) --- //
                // 从当前位置开始，提取一个可能的最大长度的子字符串。
                // 这是一种优化，避免在每次迭代中都检查从当前位置到字符串末尾的所有可能性。
                const temp = str.slice(i, i + Public.MAX_TOKEN_LENGTH).match(/^[a-zA-Z\[\]]*/)[0];
                // 贪心算法：循环地从后向前缩短这个子字符串，以找到最长的有效匹配。
                // 例如，对于 "sin(x)"，它会先尝试 "sin"，如果有效则匹配，而不会只匹配 "s"。
                let matched = false;
                // len 代表当前尝试匹配的子字符串长度
                for (let len = temp.length; len > 0; len--) {
                    const subTemp = temp.slice(0, len);

                    // 检查标准词法单元
                    const tokenInfo = Public.getTokenInfo(subTemp);
                    if (tokenInfo.class !== 'illegal' || (tokenInfo.isHtmlClassLenOne && !strictMode)) {
                        result.push(subTemp);
                        i += len - 1; // 跳过已匹配的字符（保留当前i供主循环++使用，所以减1）
                        matched = true;
                        break;
                    }
                }

                // 3. 兜底逻辑：如果没有找到任何匹配
                if (!matched) {
                    if (strictMode) {
                        return ['error', i];
                    }
                    // 非严格模式下，将当前单个字符作为结果，并让主循环继续
                    result.push(str[i]);
                    // 这里不需要修改 i，因为没有匹配成功，主循环自然会 i++ 处理下一个字符
                }
            }
            // 如果成功遍历整个字符串，返回包含所有词法单元的数组。
            return result;
        }
    }

    /**
     * @class CalcConfig
     * @description 一个静态类，为其它数学库和计算库提供全局配置。
     * 它不应该被实例化，其所有属性和方法都应静态访问。
     */
    class CalcConfig {
        /**
         * @static
         * @readonly
         * @type {number}
         * @description 存储最大全局精度（有效数字位数），其值在运行时不应被修改。
         * 这是一个私有静态字段，只能在 CalcConfig 类内部访问。
         * 其值与下面的常量精度有关。
         */
        static MAX_GLOBAL_CALC_ACCURACY = 220;

        /**
         * @static
         * @readonly
         * @type {number}
         * @description 创建 BigNumber 和 ComplexNumber 实例时输入字符串所允许的最大长度。
         * 这是一个关键的安全措施，用于防止正则表达式拒绝服务（ReDoS）攻击
         * 以及在处理超长数字字符串时可能发生的内存溢出问题。
         */
        static MAX_INPUT_STRING_LENGTH = 120415;

        /**
         * @static
         * @readonly
         * @type {number}
         * @description BigNumber 中 `toString()` 方法生成字符串时所允许的最大字符数。
         * 此设置可防止因数字的绝对值过大或过小而生成一个可能耗尽系统内存的超长字符串。
         */
        static MAX_TO_STRING_LENGTH = 120416;

        /**
         * @static
         * @readonly
         * @type {number}
         * @description BigNumber 允许的最小指数。
         * 用于 BigNumber 下溢检查。
         */
        static MIN_INPUT_EXPONENT = -2026;

        /**
         * @static
         * @readonly
         * @type {number}
         * @description BigNumber 允许的最大指数。
         * 用于上溢检查，防止数字过大。
         */
        static MAX_INPUT_EXPONENT = 2022;

        /**
         * @static
         * @readonly
         * @type {number}
         * @description 在 `MathPlus.pow()` 中，当指数为整数时，当结果的最大十进制位数大于此值，则使用快速幂运算计算，否则使用原生 BigInt。
         * 这是一个安全限制，防止因生成一个极大的数字而耗尽内存或耗时过长。
         */
        static CRITICAL_MAGNITUDE_FAST_EXP = 10000;

        /**
         * @static
         * @readonly
         * @type {number}
         * @description 在 `BigNumber.toString({ mode: 'auto' })` 中，用于决定使用普通表示法还是科学记数法的阈值。
         * 当一个数的数量级（大致可理解为小数点需要移动的位数）的绝对值超过此长度时，会触发切换。
         * 这有助于在数的整数部分或小数部分的零过多，导致其普通表示法字符串过长时，自动切换到更紧凑的科学记数法。
         * 例如，当此值为 10 时，像 1e11 (11 > 10) 或 1e-11 (|-11| > 10) 这样的数将被格式化为科学记数法。
         */
        static TO_STRING_AUTOMATIC_SWITCH_LENGTH = 10;

        /**
         * @static
         * @type {number}
         * @description 求复数n次方根时，最多显示的数值解的数量。
         * 用于防止当 n 非常大时，生成一个过长的结果列表。
         */
        static RADICAL_FUNCTION_MAX_SHOW_RESULTS = 20;

        /**
         * @static
         * @type {number}
         * @description 生成函数列表时，最多显示的数值解的数量。
         * 用于防止当 n 非常大时，生成一个过长的结果列表。
         */
        static VALUE_LIST_MAX_SHOW_RESULTS = 999;

        /**
         * @private
         * @type {Object|null}
         * @description 顶层常量对象的单例缓存。
         */
        static _constantsCache = null;

        /**
         * @private
         * @type {Object}
         * @description 存放基础数学常数的 16 进制字符串数据字典。
         */
        static _rawConstants = {
            // 基本常数
            e: [-219, '1ecd49d9e3c29326029305c8f68bacfa3c6316f631eac146b2134a1e6c0b75cef869bf281f79ee8c71f281e2c884aeb87fb37c64089a0ec56be456431569d592c56ae708d6630c6ccf7af1f75d487096c3a75ad203963a6ddc1914a', 220],
            pi: [-219, '23993e59d8f1beed1a7593d4faa8f71e7e7bfabd3bce9147f36fe49488ef48e00256540fb0bed3a804f57ca4ae2a25415b67d6bfc0a4b0052eebd7de00d229188a05edd25b4921fa0718579873598ff6e2f639b2ca5cb0a930b4c86', 220],

            // 1/(2*pi) 和 2*pi，用于三角函数的周期性计算，具有更高的精度以减少累积误差。
            invTwoPi: [-440, '7fb8e2cfa572366dac69f800d8ea4a71dec50a009caf878c5a967130e4d2dc7099d5db874d0390b8b540fafae08078229c44539acf4e25efb46ba78b8941b6725e93e7d9700720e4cbafef059ccf263028f519e3ec8defa7424ffb0bf026259cc4f88003d435b98bcf2e0406f9effdb81a5a46340909994465cf71fdc630153a6f51f44ab249beaf7daf8ec4ab820e393fdf4a18a2e16f47f1009414efe0eb850747b99448819486378e7e2ff4e8f829eb599570c017e', 440],

            // ln(10)，用于对数函数的换底计算。
            ln_10: [-219, '1a176bae18c7780dbb8d48b8882691c90a86e72d72de2f768182d52f07d96dbb38aa172b3c124babac9116cabbf5455a8886de7468c185b63a2b557dd589b14e85802b87b72bd8d0eb7d86d273bd8ca8fdd8384034f38977b89d16e', 220],
            // ln(1.2)，用于 ln 函数的范围缩减算法，以加速泰勒级数收敛。
            ln_1_2: [-220, '14a8d935f98be97b04624e3a7e3ae0617137ebf4346878d6338c45f0a167b2dd07c6c4b8c01f39378cc7816de8f6825aca7f00bef7c13790b9238ba6b373b5c18ae1f1364de093c6c002937af1bf247e88d0ca62944fa60c5f5afab', 220],

            /**
             * 伽玛函数（阶乘函数的推广）的兰佐斯近似（Lanczos Approximation）系数。
             * 提供了多个不同精度等级的系数集。`fact` 函数会根据目标精度自动选择最合适的系数集。
             * 每个系数集包含：
             * - acc: 该系数集设计时所针对的精度。
             * - g: 兰佐斯公式中使用的任意常数 g。
             * - p: 兰佐斯公式中级数求和部分的一系列预计算系数 p₀, p₁, p₂, ...。
             */
            lanczos_n20: {
                acc: 100,
                g: [-1, 'd7', 100],
                p: [
                    [-53, '52b5d10815fa7af0887107147d949bad8b5b7', 100],
                    [-44, 'c76ad9a344cf96f93a4e7eacae9acb81ae40a', 100],
                    [-43, '-8f2fe572a97e120f5a6d558a389e1df3a336d', 100],
                    [-43, '1cf5c1fc9a90dee9f8994c0223dd45f6118c7c', 100],
                    [-42, '-59586f5ff65c910fc6a449c0e3139a053ad36', 100],
                    [-42, '725cd8ebcee19e21fe3cef712dbcf6dc36378', 100],
                    [-42, '-667c1e48bc297fd8b20807e74f3166ea4be86', 100],
                    [-43, '294ead85f35487571c2682292f501291f2ae14', 100],
                    [-43, '-1368b0118fea76d336820cbd61439200c7b236', 100],
                    [-43, '6a7c9a31ddc955ce016c93d4c1ae517aa94dc', 100],
                    [-44, '-10885a3395bd689c6668fbd0fc26be4f49a2e2', 100],
                    [-45, '1d459193d1589a24d53f4874e8bd66193c9f72', 100],
                    [-46, '-23fc848056e257d371c8c6c7b134530821f84b', 100],
                    [-47, '1d8f2da838265f25e3932aaa2f8a6615239897', 100],
                    [-48, '-f59e1fb35a07581735246289fdbd716d25435', 100],
                    [-49, '4a7b104175900d38c41d551d2146da8e4aa39', 100],
                    [-51, '-753dcad37bba7d19ebba1ca87f2b9065e7deb', 100],
                    [-53, '4fdc0ec79ae4211fa1f131ad014c6139d564a', 100],
                    [-56, '-ae082147b66cbc8e0df80e62b573ee0dfcc43', 100],
                    [-60, '2b6a1d4fabe444acbcca118bbcd7a4cc9b39f1', 100],
                    [-64, '-949c33a0beb24172c552e15c27504de1158f0', 100]
                ]
            },
            lanczos_n40: {
                acc: 160,
                g: [-1, '1a9', 160],
                p: [
                    [-109, '44a8a23a3272c4df5a07b4c3569139306447244c6247ec9767ccf077230b2256a6aa98b5a7aa', 160],
                    [-92, 'c0f70eef7ef971c9798b7870cef43af61695455d1e323ce7ea50f611fc9cbabbcbafbfc3144c8', 160],
                    [-91, '-11f90870f724f6a7892e50358f435d483b9cec503d8bcbb4a64f4f49900aa61ba813da6a2e6594', 160],
                    [-90, 'cbe2894df2f33a16ef67e4a01735b6fe1654151b20bb497a2ae0eb92d672692e5c76693d10c07', 160],
                    [-89, '-5b86b5d3a2278a0dfb7944a967ff1a2b9d55b3f2d8e6819c4dda6d6ad39214b666ab1005388a2', 160],
                    [-88, '1d3510218bf448bad0f8c86bef0dba66c53f34f0f469d8daddeea0ac42da84af23567f713d1ab', 160],
                    [-88, '-468504ffe5b6666fdda87ae9a5cd558ea678b99ae636f66c05f126ad3be4609e4447e47ceb31f', 160],
                    [-87, 'd635e8545c68b89f71a4a47ad99aa979991e08abefa47e1903c1f40b1e37631b57c08809fa59', 160],
                    [-88, '-cd0e560e86bc7e9c2bd41b00e5e804b9ad62711d5646edbb7f18862f2701dafeb0eb5311cec80', 160],
                    [-88, '101f52b0ca778d5d36c9e272a20b71615a8dc75c34155a0e87bc28e57b0332b1bb351f419a0db5', 160],
                    [-88, '-10df98808e47ef820db4666bfe126f3522f4ff6798635b636f2925e9365ef9cc5a72d3f8c3d4a3', 160],
                    [-88, 'ed4210695095e41bb3cbf0786b384ea6fbdec501c70348f6cf447a7c9b1ae9af86b1e8bfb4f04', 160],
                    [-88, '-b03ee5eddca73a9c8b9d633baff16c63a3aca6afdf4680cbc1a2d83d1466ca0e8f5b225b6e134', 160],
                    [-87, 'b1e06d26f5fc30460f5ca062dbed819aed6319a0b128d48fc07c5f667ae23c582473593769dd', 160],
                    [-87, '-5f8d3c6cd91ec2aa2521d9a77eb0e9e07d8e85cd276f258ed05ca03b21857270e431c8c3b198', 160],
                    [-89, '111995457fda866529de7d305eff9881161a4aeaa7a44be468f47af95651f3c8103912eeae67f8', 160],
                    [-89, '-6aec9131336f84e5e52160f6d58827891b6f2df6e21a3ec325a0068f0b0563905210cee4afd00', 160],
                    [-90, '1641be9f7b59b3a1df5823f6b5d76ca6d94f1f25cc989292b02d8cce60e6559c096c0f0145837c', 160],
                    [-90, '-64dcc9628ce9875d27711885a96dba64501ca6ad1d177a78db2083a32c800ae9d8a071b2cd457', 160],
                    [-91, 'f22b84f20d6cacb8d14a34c58c8a18743e750094d6529954643e595c4fee2dc5e22ff9893c3d0', 160],
                    [-92, '-1eabf114993e629e647417c1507899e184d65b9f94c090d06473edf91b5d12db38426aa4933089', 160],
                    [-92, '53770ed341535b47c415c1b5a6922f2f46ee08f13c0aa833a95f68e218ecf31fa3dac48950529', 160],
                    [-93, '-7650b6b62784dcb4f7737b89b9da483f8c18b08a873642c3babebdfa354c79a4ad1f2fc626b72', 160],
                    [-94, '8a9b47284a3129a4b4e2e8fa350984c4a79b96adcd80a5cf67a0ad404ca609f1f15169877c0e5', 160],
                    [-95, '-84d47ad3ce0aacff0b9521cc3ef3ac6aa96db95b739a7ee258a56dfb9570929c011f2ae92887e', 160],
                    [-96, '66dcceb863f4867f7c3e5606ad259f87e6f0441fd4db2e74357814d03866237f02534ce10d409', 160],
                    [-97, '-3f6e0c07ab220ee508bee8b6c550f1175b7e96aaf0b11a8ee7678159b0121e8b88c9a500ed814', 160],
                    [-99, '132069aec133d8396d7a47079014a7e71e58c51917195fd07a87fd765385a192bbd0451a4360a6', 160],
                    [-100, '-71176b212af6ce7455809324913ddac082f6d7f1c05753911d650e44b1ec2292ca0b72008cecd', 160],
                    [-102, '137f90ad8bfb03c61cf454b1d5e6b245f2894486f02935d3714d054ba90cce197f2cb2fce788b9', 160],
                    [-103, '-3e3eb55f6eba6e07b6a1c43d138ccc4773daf113a5e05f1458f1a05d306afe0c260fa89c4c453', 160],
                    [-104, '8a33282fc9836ed46f867c048356db1310ba18a731d11ea0ffbe843220042508a62a8971223e', 160],
                    [-107, '-4f5ad0fa38fa5fa05c307babfda07b8367a628a63b3b4e9021489601e2e4c924fc6bc16d8acbe', 160],
                    [-110, '1c52aea95333c4197cb866eb2bc07eca7079571820fb01ddd1c0a1083ff52f31f46c5fdd90a006', 160],
                    [-112, '-941b4ce94df4af24844bd23c575cef40511bd8882174907b26c8035f45c6fc2b38513c891ef31', 160],
                    [-115, 'f7e7250545c03a999719f3e13875c260a93525176b56bdc48dcb19c8954b6a89a32dded8742d3', 160],
                    [-118, '-b617fdf4d14d553cf8f4c2e733940098e2a52c7d9d273854038c00899d8d41cecf6ebb17763c0', 160],
                    [-120, '4b0d219891c643fd642b5b4112f66c97455ae16f566c9321a0ae09ce6b4041c4256ceac33e8a', 160],
                    [-126, '-12c54174cd4dab0148d4d878b3c4791cbeb1dcce41389f10ed7b83c39e28fec3d5b896ae00bf76', 160],
                    [-131, '10e0e31dff50b77e07f1c546c62b9c54337712490f3e0823193f6e98acbf8bf859997440eb8805', 160],
                    [-137, '-765301718697dd4f0a181d4ae250253ef18334a921b20f2ccd839bb65aeadbcc52f8b5697c66e', 160]
                ]
            },
            lanczos_n82: {
                acc: 250,
                g: [-1, '361', 250],
                p: [
                    [-226, '9c526ab38093e8d5a1f9b860631baf5a716d73407da61365094adcef11af4c92092a339877c3e8511dfe42e24d13b612ca1d9414151111245531bd6148b81217c92404824d293ed7eda545c9c4e33', 250],
                    [-188, '8145a5cacf0f1250e8e5f87edc79dc2303bcf5bb65df8400a5e08f9e3f3bc87925867cb8280b8cd1c4bd941ad0f8670416f2360bbb5caeca116b32ed49bd65ac9515e1ca8318f4e0baca57a5d6a5f', 250],
                    [-186, '-282ff613cd748aa409a27faa9f34d078af39ce06fd12d2e10c2b89e7a068d4a3b57fa03b62e89c54d8fe9d69fd97b5cf115c6b86299c644706245abcc6a7f2c5453b239902f66f93e7cf358727eec', 250],
                    [-184, '6199e14c204cbe49aba36188abc43459b5561064aeff96e513855e94b090b6d219d8bca412b88e1d564e780f474c29c6b268fc63f24e61a6b278752e93ce09789a16530aee9ea1843bbc24bba9fa', 250],
                    [-184, '-3c4150a01e6b602ede65d31413bd2397dbb558480b07d2aef20351c66855f303ae7f4a91a2160cc6f3ad0244eaec309d773059c6398c8b022cd4983b90a3d4c95e686dde2f0ca0ce8ba1d65eae1e4', 250],
                    [-183, '2b8dd6aba721537fb7489319d272cb5e5ffeaa6261bd8d0e31756196ba21b755967171ab02897499f343e177138aa43b838f00c7febc4efb10112bb192a122cc8a0bcf6f2c22f9282b6f65aa02d2e', 250],
                    [-182, '-188ff43e1e44c43c412df09c3c18ddaa494f7ad5c3f558c78004a5dc5e5ad5f5e281a2c27a24f0e658918120bd579127354dd2c69e8b1ab1b56b020ef82c6bd678041926cb554cb7cabd72c76199f', 250],
                    [-182, '7085ddc469c038e5b3aea2e76a07631176057fee3f45aef79674ad1233210737db8f2d2dfbabe1ab994d5713464af76bcdbac4cd62c171538a7a6911dd9cc2ff2d27a6da5591a269fd171acce6921', 250],
                    [-181, '-2b0ca30190281e37474481a253afd6f5d94d62ac0d35a557a0c7c63d546d1ff5dc64aafafadd41300a3535cb7bfc3eb7a2e85d491728ec2223fafb57301dec635ebf4c596b7ad18e1ae5c87fd39ec', 250],
                    [-181, '8c572ea71857a95119f301291e4a378b334a687f1c968d91563762d268b6a44aaf993cc61e9a668611ac5c8f4b59f196b57b41d898de065a8675d7de834669320f55daf95bb1437169c4f34f35dd0', 250],
                    [-179, '-3f55051509f2f76532bb851917d431074014dc379bfb759e85bf4089dc491256e0ce5e7a25f8858c727ee209f785d9681360eaa4b419ee1120bad1c1cf2130c10c1829fdf6c576b2b8a85c9400cb', 250],
                    [-180, '61be79d4ee90d8b234e996aa9b3e50f06d433a1cef78b8ddc1e4881a6dc948692ccb677a67f4f386594cf7e8fbbd960a56bdc27c3d11a3d3d0a4ed2a3a6da26c47349afda49a38c995f20f4a098d3', 250],
                    [-180, '-d5561e27ff1dd196d823623907321a3680d681bde10da8285c7b9031bfc8f905a5487189ec38fb91e6758aefa1ee31612d5b9c72feaebad7c24375f7063f195b0b254dd1872ce17758d3faf434fb5', 250],
                    [-179, '29797911f3fcf81e2132ba0778c3a39e09f9b8ef6d6b84f79e93a3a714c3483e5cbc51a77cf2d6b8b578e237c8136eb440985bb39d3c353ab910634f107c3d7908d779f1b6a71e310551177a7c851', 250],
                    [-179, '-484723ee5d047ef2e98d4861a36d4c92e91e4d693d19b0027dbb6cc40c24049e2f3ac4361edeb91b50d18c30a39a7a0c6d97dee93541265d0871ac8774235e561b790428e025ad4fd60d288eb634d', 250],
                    [-179, '71835307c36ad65b409a7610aeb455d17081e162774b1eb826d2b8e9f5baabb580515e2168282473017ec596ccade02b288457a3e7cf6f0ee2fa05daff449869eeff05b274f2341afda2b86bf1231', 250],
                    [-179, '-a160a48f908996317d408e00e2897bc7c8dab482dfb61706d5288f9b1d0331eaa3e757c0ee455a31d4e246b2e6bac6fb99a712860605a0d16c7cb0a226946df90f9d34d8486d726400e785f78aa59', 250],
                    [-179, 'd0781a754940659109797f3dae28d2670a5bdf9dd7893a04bb84eebf35f2df696a2a0ac67bc349d05a8775ec10fa9d91d57aa8753b3098962103cf3297bfd4282f66818852a01953d2e051e9848bb', 250],
                    [-178, '-188ca1927a199c8adad584f1b860a96bf56e8720078f2cdb3eef578d328578e9452a8d60703a49b8769965bf34c3864fe9c7cca71b80997f7ce797d88bfa29e9fa1f078970c78bdfe8036cfb4e206', 250],
                    [-178, '1a6d03330928c904d22526f766e5608b294366c144c98b95c8c9f5962479ad3f6efc9c9697ee279e9f92abf2928e0d4267983f352bd07d19ba42d49819d2a498769f1c6530887b4e45b57acda1048', 250],
                    [-178, '-1a102072b21a9d3f5227a1a7766cbc5463078b072478674257686e9052efcb26b4b044d48c006f2fa349abb78c9d37e264da7f3ecc792ca29ba92e4983c99ad0cc4f9a9e10bb647f24eed77952b27', 250],
                    [-178, '179951e7ef33cf935c66144da0ac709956b25248e9899b3bd72bae90f1cbeb43eb76e0c97f69ee77c2339f9ff5a27c6af28fe676cb9a44544b26a5681125d4dc11c7315e83b88008cce427a4d1457', 250],
                    [-179, '-c4803c29764744c02bd15ef5c947354ad96493b3dea1a6d9ac7c0f11ed37a637367938893e58ab25a0b7035b460cb646e51ea88f966a9706bf75618ed1e986448c2ba90b2a93de4a4a7fb845214cc', 250],
                    [-179, '96ae70b5abcb7039b66aaee944f818f8da72db9c4646486eafdeb3436301d824d619683b3e37bcd6ed33711e04c40dfc57e53ed363f2a4508d9ef74c9a95a24f37e34c764726d386c1bdf05e968a0', 250],
                    [-178, '-aa7496c97d0f4ec33c042776da44a3fef7dc15cecbf0eff4ebe4bc40dae676c327fdd71e9fa03d569362198b95d5348b781fb24ba0b277ddf35730d287f8457bf859c36c2fc2a30d905e9dd5ddda', 250],
                    [-179, '4583d7d96a2bf540f0b6e30bfde43f43ebf277df33b649cd9b1c10a7ba64e009c94680994bfffe86edff007e7054c9502ea5e2c0030e06b5066e6456035f22caf37af9ab0b772086557679593f2a5', 250],
                    [-179, '-29e50772d253ce627aa82861bcd8f10ac0c5f523453db2061ec054d182a9d890f85d4b8f6d406d21cff4e0ccd69eb794ef0d3ffa5fe604ad737b11ebcd2b89840a742f7ed6198e9d6213b5754840b', 250],
                    [-178, '255594a9839720f9a286caa8084b28151122358a0fac9c3456900e61a1267e042ff14dff161e4a894b4d1561a27da8dcb87eea215a236c7d82d7bfcfae7e01ddff4532ce8ff68b6447eda5539bfd', 250],
                    [-178, '-1339a9d82affcab3579612b9f05208aa8be92c1e2e13f7585c0d8e072e14bcd5daf649b7a22eafb099ed28464699d7ca3e78497ea4ab9c83100b13d5f7beef4b69ea60abb76bd4073402adcf77cb', 250],
                    [-180, '3938f6ccf08dd14dec29a7c59c5691cd354f5da71c9fa8d032e3a9993f819a669689823b2a0f0689aac16021952be0e4f8419f3cb4c5db394bfe5a961314a65d5fb7c3b03da9c7834adfd352e2895', 250],
                    [-180, '-19347401601cd7d5fbf242b39d30bdedf9fa9275c09a51a04de216ba258a9d50e6755802db6b45d22ce2cd4ef9b285151aeb22b30cc9b698f26828db6aad8f8c8657ef5b2cb0ff6baac98d84fa655', 250],
                    [-181, '66aead8dd3505329626510c47665b19ddef2eefb9640744338d5660356d5d87a887e1497818b8c26e2a6c6e626116289d0beadd1bd0a36c75f0ab4c7ae0c09f9242cba0f47d8d1890a96d84a5664d', 250],
                    [-181, '-26af0f70959bbaead23c141307ce944c506f8874719ab3f4499bdaa9be7d74d5d050e2dc9255567d644438556194cca0748fc5488fd0eb30c37576a7dec1a5834ea1948fcdf2589b39565e64bb925', 250],
                    [-182, '86ba564b8f419bd2644ff3555e1701d6573f934c2ac8e2c35ced071d76b8e6c0f8ff68444ec14e3a134488cb73ed8a4f5febe8baeba4324274a75d9c79dfe1e7dcd229dce6941b73ffde8247b18e9', 250],
                    [-182, '-2b5c448b460bf23ac1b2fd79fec8f20e016eacbc9483a932290743624ae8d8597bbc0d4a40e034e82e376687ea25eba0f43f457bff48f5e98dcd70ac739fe2131f9d195e4534923eb3b2c1e1ebe4d', 250],
                    [-183, '80e1e8d7c06954903f68b0ca9ea6283359f837274036a93e4899cb1742fa1c8d5b8a83ab3d3d68f1cc22510b6adb315513cea9a73b20fbe50a2e5fe6c9a85734d93e218d2f27b515b39729ad74cb9', 250],
                    [-182, '-38919e967f13b97df0a3a9ae310e038508d9b25b796e64bc8e8536a37836d71095c44bebb8b3fa4e8aed28c5c856486dfab08a8ac42c723f818ccf23309b252e1c9c6f20592a1ca11d5d0fc05966', 250],
                    [-184, '59703c26f1d4ce5963ea95a472493e0b8245215347eef61a2e7c0482950db218bd10ecbd20f6b65fbe84f0634b2d55050b0729e83ca0521dbc14bf77d184e467b27a7b34ce2046861e02bd10dc9a5', 250],
                    [-185, '-d06ffc843506315560a994c4f91a54d53fe668e097a8891ef108446ad448f63a76b7c772955b07644a6713d208d8343c6072d437cb4e1c9dc6de8deb464414e28fb88a3187d178708aecefd5ed8fd', 250],
                    [-185, '2cb3da5c8028905dda31c31fdf4392a973ead64f553f73f975b32a2710654807854a9b337b28be975b9306e5c37725b6941795f61e7106bd165c4c06ee4552d601e1db83dc2a1b86414b0a4e720bf', 250],
                    [-185, '-8cfbff3c3f9a280bd90f6e72c59350d6e8d68b8d7859ec5e33531f73e7e0475daaf342a2f82976dd073e107d87bab8f60a80e00e7bb4684e421423f1a5236134987b4152a956a5b017b9564fb5f9', 250],
                    [-187, '9f69af9331ae4b334ab8650472f8c3eb34c99a3e3dd59a22cf125a7ae82e83f8a7aa4ea0667127f1d6ae0f743d367832949d51113cd91a531a73d7a5c6d046555e6ad4b241bd914d3ab968d813938', 250],
                    [-187, '-1a6db0779b0d529d49686a61daad5013a44425e02d6fff7e9682a465a5eb1d0260bd876f92855c64b7b3d9fea344ec0f5f3a2c8e50a75c67adeb83ea9b9f7084307b4cd4988d96bfd48e294be46c8', 250],
                    [-188, '2814f406fce6b82bfdd9aef9cf4f75074cf818d6d3d99f0358cc97a51e47855427c83c8827e8c585ac282657bca00f078eb42cf8d878afd2cea781c671dc175329b8e37e99aa0395c68e88906534e', 250],
                    [-189, '-378102b58a9ac97105c4367f89bd597ee928361940cf820dbca55da115619defa46674aa1a184da8b75c77d55db09b4498996d1d6badd670b6481830bf4e443bf828b18198bd1389476cefee5426d', 250],
                    [-190, '460804a880175de032a2352bf2629be912d8e8feb6abce065b569d04fa9413c874e622b0cf09cf6bd4f96027a701829991cb9b799a876402374fb924b8873c1088c1101e9a2d4a96dc9732e790cb7', 250],
                    [-191, '-505383c5a8eccc717142b9c0617f6cfaff128caa30cb1d4d0e12e672c994de1260a47d9a6a5facaaef37a21e0eaec8aab0cd6939d8ea8bb73d6c435eb8e51567c2c552baa0a15e3c2954582ec5bf7', 250],
                    [-192, '538bf30f8561914d21ae5e5ed4fe2e95e6e678eb888cf9a53d8b92a326140e4c0771ca2b9768386b7bc85918ae500bce75503a3bc08eea1c60ddbb64307a09b899f4ab61cd66149f0e0fd9b1fb01a', 250],
                    [-193, '-4e94aafb4508216c039539f5fc7ec2b6986969b8d7cca80070e5007e578d4c403120ca000c262ffd3864cc05d3049e3c41ff947cc344f3e2e557555a3ef6e72e4257ddd42e51028c2130435a417b7', 250],
                    [-194, '42a317bb151c034fbb4d3742997073147f0adfe8056dd2d3753174f5c045018a51ae0116a8f9246cd249da9ef37a82b7699312688511dad2f8d7ac0d37d481043de4d611e24b3859c633ac4e6e150', 250],
                    [-195, '-32c81660de19c5c16c7e14e4b553b5bc6d3f98185bee5897557d3601327598d7b5b9150a2a31134f61541c93bebd86dd2331772de21459e495158ab263c8809d272539ac2a51f0242aa342a291d00', 250],
                    [-196, '22a700cee6d1d2d390a8d7e98a2c52614aaa555c44ec26cd664f30c2083beb9250aa269a4a1e0e996af53a6f8094027cff2abd84fdbefdbb98b6d37fd9912f7824dc4728e84a6f3605e206a98da51', 250],
                    [-198, '-d2e8d3d5f2ce9f51ff4737dabb6f3c2ef66bf6200225f2b7adabd003101014ae8a739ffecf0df120a0834358705f6fb22c2e60a4223961d62bb276500dc10196f5dfbe9ca1b90df804ad24f4a46ee', 250],
                    [-199, '72022b7e61a8fe00c447cd37796798711b1a2a813509a60eb1f239237c22e0c339adc40d87300d097570874c51f4d5cbf6ceb4ad05931c64dd9883d0ee545127f99287fd6a9fce4c771ffaca9a884', 250],
                    [-200, '-367a500256e5ab3ac7f7ab83886469225fc11f35fdb33c3a8f74ef79f7c584bf9b4545482257244f060a1b2f672336de3db27ae8d9595384676ccdbbf1c969fdd0a1e57424ffe8c70e4a6f6c6c473', 250],
                    [-202, 'e4eef57c1b98d2bd01598bb2db2a41f34b3a7ba4b20a78933d38b8f57f25df4fb7ba3136e5d0a7c3fed5a8b4405fa6694df6a5c39681f894437bd00727b933f1ae87ad2c918a47526266de0c2a23b', 250],
                    [-203, '-542158d3211aade96f95af7152dedbfdf6448558b9d79cceaee1f659b5f6d9ed2c5a4c202a6aa7fe96eaa3802fbabd9405f880607e7f8772fe9c0d6d83883dc7c67127fb3fd628c6753b2cce4d422', 250],
                    [-202, '44c8ab6bb2c8b89081e3cbda85ef89e9f084d946d5f9b5a1bd29641dff2d411722f4c76bc442b09b9922caaa6160a31c802ce0ccf62f26520a426e01141d759ec1364abe145063ca7b8ff693f2b', 250],
                    [-206, '-4a109023115c25e8f2159419fb7002fd00e83622d84ce158a174952af68b758217a9d93f98068a062248e14a698ec65de30832e5ee87ca90d7723a82eabdd29da18b43c9bf4f97f94e183756de58d', 250],
                    [-208, 'aee22a9889eb89705703c518257a106ccba29c0a3c0a18529b46b9f69c3aeb680169987a0c0c7b1832721d4d880fff26d894b35f693910afca73b18fe95edcd377abc5735608a64535ed8fbee2c10', 250],
                    [-209, '-231346cddb320b52893ed28490a0c8c6fcebda9f4cf0e5851f1da5af3a89eeaf9896140f291f68193512b71a4eae3112f364de6cad7518f28d834d96947246cfa40b120592d6d97799321c6b1a4a7', 250],
                    [-211, '3b326a771a58eb5b28fbb6ca6f1175453ccb07ae70f87bc1b6480b29699954e035b21a5a6b07a81e3f7a55ad80e54ee50cc4f07c4617a29a4fa459786a330eb26f723b27e42aabb1695eb76d6da55', 250],
                    [-213, '-5331f3fbb7f696657977ce9603d39c5d64b35f9ad0dbfebba83ac73d14905837b5f79696375e537ccb5698cc144cc914df68594bc832e0cae178a45f25b44dd0a41111c4e86023db175742490a16f', 250],
                    [-215, '603a803ad6511300956baf5d344d8ba1ba2dab395805f8a68ce0e9b719b5ed82735848c2b5bd8cce8706a69ac2da2f5916313affc73d3730b5ef5fb3f464f4cc346c669a7b0987f5d3ed0a366728d', 250],
                    [-217, '-5a6737671ef267eecf6add20bd73cffc8749d7e0d64ed3a56d598ed2431fd97b50a43dfad4f8aa5a47e8116faa294620e5f1d2483bc3087bfe250119ce3ae931ac69eb661e1fde2d44f4b4891dee6', 250],
                    [-219, '43f5cf63e03e197f328dc9d8ecc386388873b7c433a8c8a1538e7edfa084f6c1a9a63cf0a5c84271053ab75f59da243ce33e2b1dfbee6c39e67e144380455be8e8e846186229994bfe71db73bcd67', 250],
                    [-219, '-66e4b7c104c64e5f0c3795a744036d22d718a932679c0b40b45dfa838c80f249f0b52e3be8e65c73ff8a92d965490220567a523294f5b7c76fa1e85087c8b81c5ae1e1e021c91406a78dbe1df0d', 250],
                    [-224, 'b76ad0836e8abc473734379c64060afcf31d947a24ce7ab9be25541daf68d8b63bc049dc6d5e7c3ebd01c17cf1e677d327ab193151c8b5ec14098446985f77852cfe47ef9ae237d3d497ac2f65fb4', 250],
                    [-226, '-3f2909e05737375aac0a22864dde41fa417111798fa0280b60dda4a6e9de9f699795789f2d2831bd48741ab28dae702aab1103b91e466208ab73e4ddf513ffdfaab709567760990cbaa2e230b5c83', 250],
                    [-229, '9feef8318bd222d68eaf7eca8d8e1fbaf2396539d69ad499132fb99b13b639bbb17e80ba13fc6394878ca347927171a8e0200cfb7efb89dfbd3f9d0ad965a7bd7ee8fb7227ab1de6d494e5b60f0d8', 250],
                    [-231, '-1ce53b39ab47b1114f0e9d46b5d2b12abde958ed116d330751db15318f5659e727a37510541a11fb1e509a642534d77c99665ef94b14c0e1b15c7801bd7e2ac9e6c84dcfbc17471057622d6697494', 250],
                    [-234, '23f3208b301e53464a51d3721991ac48ddaeb018c843536eb92793810176c7c0fae3a033787010ec92ab89fa1ecb241501fab26eae6bf1f3240dcc972de31d61ae9843c0c85e0dc0642345678c81f', 250],
                    [-237, '-1d86bae4dedd4ebc138a711c5309f07df5f1600b7bb71fd3714eb61ba91dfb28a608d29c7657a850e6508a99c190549603be15ae7249c62418e34c728b4fd3d5628cd28ec7ba5138213af6bcc7075', 250],
                    [-241, '982c744b1f2280b3c7303e3ee4274665f5e7ba932a12090df24c8cc623b54c4961a370cb400f04dfe7763918e2ea1793ef4aa397ea3b36ebb95923830fa3dfda4aca983b8489e46ca6bf04fdd4da2', 250],
                    [-244, '-2e447a19d38dc371697d260e56955042fece61aba068eca7994e51c89908118e64ee176a7fa32c46beddd4c95a2ce2c2a5b3a113e078a28acdd787714247cbbeb8532d6dd31f6364b044f47bf8d22', 250],
                    [-248, '4ce5f03ab919fd7b3ce1cea5407b2334ad747c54afba33b252628bf0f161bea0d0105223aaeb0794dc00b2b661840236329ad7214124fbb9ba2ed6795915de0d32af30b50d11c5ffa08d9c29d81e7', 250],
                    [-251, '-659580c32c63a912c98c1913b83592f288c043da68e8f5905ce6f039195c8fc6dc5fd784775fc68de848881e520a06f6901af98a6823351f0c99bd465ec2ff7904cd33e5b09b4bec485de0378d28', 250],
                    [-256, '1709cad201c02ec4dc930c0c7ff4cd648402fbbb2fd827c81dc4be56e63388e9499cd09c18cbc2c0453596bb4de1be6a5684940a3c1e070b526dce1c1ff6a5701859ab3f4267bccee4ad3219414b7', 250],
                    [-261, '-1f4b38bc2c07585a2f47a280b8d439d2644fd5885a59869be0ec3c9b8832d713cd028e131d578bc0b7e5fb7f2f40f9820da50e789359b33584b1bcb0c797a7d81f0e9556453d477bfdbef784eed95', 250],
                    [-267, '802f8292c0e362e4a9499be79452f5cf992d333a895378086c1b046c88cfeb492042b42d56bee1e90435124d6b83ea90f751d6c7802c600c576a9eaba52bf266945c016ea8ceea48efb2a80694631', 250],
                    [-273, '-751fe0847e730792126817ea6aa131251ecd35fd0dace0adb09d8e015d7052eb9e90ec42c39cf03024267bc5b242a7c00dddfa55e35320b848a52d696ff44a344109d7d8a531d79960133323697d0', 250],
                    [-280, '99dde470790129806a45d4263ad6c400695a644b96dce29c9ec87e12ccb97e4c55fcdd72151c307f31abeaa965220dc40bb927cd4585964930144da783d2add4f7f80e5d51d1a43d9b8505017c7eb', 250],
                    [-287, '-ec3efc433087a6a33d81a5fa2489b32f7dd04a4d3f960f435d9f7571c505d8ef414b87a2f911fffe2af09078ef2f645da9cedb825688e762df0960ad354bd2cbe256baaa456c37ebfde2351b1098', 250]
                ]
            },
            lanczos_n164: {
                acc: 420,
                g: [0, 'ad', 420],
                p: [
                    [-456, '5cf8b6e5230092d37f9bfd32376a7bb17e752cd2993ec478523ac34c68934e5c9a556b3eba8c12fb7acb53bb22fcfa66a661b7c7e89d6a996ecfb65bfeb156fd4e0731a23c55e1153ffffca18cce51eab4b7cca9f4e395ca47c118c72b880438039523aabc135be9203653bfb58684c52dfc9d78d30f7bac8fb5149182bf0c3b97fb027845df44c8495846dda513efe5e76a8b80aed4e74b156edf4ce355b', 420],
                    [-381, '19148ec6f1c7899223d39495700cda19a009672229d8c32c4a26489e56d7556f1ddd7b9743f64c7151a9a33262525b91f824a42b633c83472ef78f6d0582330bbbbd9d3cf720ca8f3949da2cbd74efacfc5348cf0a1b9b91f0a31a2fac1e1b28d5cebff31bfd1b62c25390308d3a64e4f101f7352f036ce714068fc1baf3dda0d76940bd963e8b289f4e0c84fe9493d72937dca4ecc797b05817b557872402', 420],
                    [-379, '-fc70e6b7a1e1ec65832e5ec58a3f8f4bf92a35137d77559c22f681cff91bcb0bf04fb77fdbc7ec164892db11e8d7efc11e37dd98a3ed5a43292ce922ffebd808d824628a1415b88a97180e8ee8ddfe93a84e089baf2f765b2c6cff957e47c4e5eebb0f78c6160fd8d063a320b567a4255684434d81f5fb61f4b698d6a12eba55647b0252238a81481692fad6ab11b88535f12b82fadd5bfa3fa897e76b148', 420],
                    [-377, '4e7a7962101ebb8e99850e4407b5836c4a8227cc2d3cd108f2e971024ad059f527592d29bbea72410247d26d1f044cfa16624bf78e53282a41d42a19c59413515c6a20385d156b80c082ab7f7103cfc32667445ca577871de0e74bc24de5a4fa47391242c941a71e720b5f203d446bcdb9b8d34cdc3351ea5566d2213761b743de6bbff86faf05b0d8505affa0c5fb499c51412adb6a15c109134f4f1054d', 420],
                    [-376, '-a0bcd37df866ade686ecb9dd9bf38d0888c61598e67b2e27a6fb79d5d9cd0f5ba4e8c3c1788cc54ada8ce70c0851802db46bebfdb31f42bbd990577de3b7dfa82f55be1150d30e44aa340f42ac92df95d994621a2804540cb8059f74b2cdcc463e847538feb6ad057e1d4a1a656abf948341b120f2ed3f9be5ecbb841bffaa7d5a3740a6ff9efd8d1ea8be73de8a3bbca219b9789c324f17f6cd81bdf691f', 420],
                    [-375, 'f3fcf37082da807b80de3051dfcd4fdcbc89555a39a8847ab6474179818bae8241410554de69e75c0b216419b937beee05db9f05634329b2fd20a4f2972e3e67e298983d7af3e299661edc00ef164dd6093c727529219aab4e411c338ad67ec6768df736135e5ddbfe93513ec899acb4cae9aba6bdb683e04c03879d35cfe1ee1dd954efcdba3a0b6ae933cb5cb0d99d5a25a56e646543c8a1d1d83a53e64', 420],
                    [-374, '-124be1f9d72752cae226bf5b8e2688620347296d9f26c52cbafd650f6093c6a449e9b2171fcb9c98673ea58a9e825447a158e9128fdf393d84de52f168fd30b12104327c3e37de1a9d0c4fbdffa1e142c2da8f3bfe7300084a87d939cb5567f657bc1793364456dd4e008c721da11d67d0fdd2cef3520fbc21053eae380410b636e2f8b236086b89889d5a5c510a82f790817e73155db2824f22e83306756f', 420],
                    [-373, '1212b3433084159bf0770e0182a8f6ecfbd55d2781b7fc7123432d9f205931954ff3ecb310e270ffdf7fa408f40b204e942c91671ee66ff6b0962dc3d3ff7e3b70eab177c3cff333c89065b299979bde78af03da99445a21c0bf658b258cbe8478c1f22144a5347712902dd0a05ac5a593c3c83cc8aae0432a898009fb929cf39dd25709517801a2c64215c258343dd130738ef6a9c143ae30686abe429140', 420],
                    [-372, '-f1da57a049f53cbd84102d9f4a9d1ee9865eb05fdd329595b8d55302fcae26cbe8ea0629903b32bfc33c01c05ff37fac29aefb14a9a8d3bc3d29971afe49770980b2af5c2d6fd544e742a5219b3e6dce0addad695ba64650a69db7904f7956a62a5e37afa102cfcc2acb9b4934f8de584e0ae9f1bdec610b62bb6ed18b29054d1667113af2f13a83f5833bae828aea388d101dd189f33a9b4f800e4222031', 420],
                    [-371, 'aed2033101ec1d60ac97fffd1817e93461fa7ae12f537935ef2bb9301b434ecddbc7a724aa6e84799411cf32bcfb07c31a8fb7d0ef58fffd4d695926e9e20c12551558be8b472af4066719193e369497d44718bc85a4ae0bbd9210d8cc565577bc4bf64629d68fe058c668354b4814eeca1ed3b40c4f10fb75b028f1af5b1bebfed5381e45bf876e2da5a2f7fe2b0f5d0ab27995f5fdcf2669f19d701d345', 420],
                    [-370, '-6eef07b9adb689e1831d8e04ac5ec617b8c0e3f07a126259542a18bc2d03ec3cf5f7686051b6b83a8c6c0d78be4b921abcb950c7c00739ad66435e0759f89cb874f18a5fa65624442326e7d7ea3a5a9a5d8c4a1b24509eaab16383ef0afc4deb49655c4eb023b509379dbe365935b9023e7e6f0c1583a2ced18fc5061a9aab650d161bc738d3032e919a366aa796196949b390a73219239627faeeb744c85', 420],
                    [-369, '3e8fe0028cc8348a26872ae228e8cc17a8083941b99bb2f86ca8625dfff3a22d160be9dd70996821d0e9b135bd4bf773ccce3f24d1aed1101ad7af65048a383846ada237e4b5f51d3a2ce75645171e39d45603df1f760824724a3c822e206bd7950596627f42e9ea9def9a2363dfc4c30ff1c84b5fc5d88bcf58645aaf154a83300c49e4f9e79c820be004764c857ffd65f38375ed42063d2c09541c4c9e1', 420],
                    [-369, '-13cb30cd00b0a372706e44748b585dbba5c9e9f384e85309c9bc5c2fedc50ffe5b2bd8b298dd7b2384ac7206e44e92a0000017700a24a6a513d7e884b64fc42cdf8859ce5a43888df69f24320352f0a94f5a02521c46914a8394c19e27721fce6ed06ab7cc5efd695ed5e4e8d8764dc66321eeb7e1ff00aefb24bb8cc66088e9fd707f67799a8ad1e96f287824b4e6f6a7b2d32674d836c98801dd67af8ac2', 420],
                    [-368, '91160281517a2f549b2d35947f2d4baf36c0a9805965ffaf51e6402317689ce9dc3b65958338076c1b802c10aba7f6fb005cdac56055923b111c9131630f9efdf157db713132e65451ee483cffad7e28c6dd317db1aa93cb716cdeff6fae8c8d772dc24243f11b3b768b04d3d7d14dda9cc3b8cb9034113e3790601a31989c1ba8b573140c5a19888f959e7483fc9d158ad77b6bd2a20724fce78f7eb427c', 420],
                    [-367, '-3c908a3ee4c4bf37e44538d79ee09d07479a1aff879423281352dee37ee93223a469ba185fc0999cb1f2aba8d0c9ae80b9d3b74f9338503a575e2eef5625d4822728782b558a7083a1c78796bc372e27bc85b64f9c6f11075c1d75575b5492e9cd4e513a836b9f9e8847f719579f80694f9cd373f9d5137233c3e3489b41053d1718042731e199a97db50346c98d86366ec222ecc172dc81060bbaaabb9b8', 420],
                    [-367, 'e7b6ad3bff3024b73087a9725463d53f35ac316912178e65f6c280442a899a3e91d216bb4a6920bd91992359e1b239b8bd8b80a59456e56ed04db2c1fef1066bdcc3664f35177b43a16a1ec884dba1026552fe96003215e0e9fe8d09c027181bfecaec81994b563d9044db5ec35d92742430fe9e5368235fa0e1a0451045ef5b1779f6eb02c3ff98dcd22984566d7224dcd82dd78fc6f21ca12efaaec4e53', 420],
                    [-366, '-51a8076bee620a0f76c9c1803c9c622b10a97889b8bd5068387f38f9591b793a980fd7c4e3f6225a27d02d90ca9e2c0faaf806ccee546f2174a6ae36a3b46e99babf59622bd23c2352fc653efd295558c28002e119fa111fd3f1c6ecb162f570830afbcfe5760734466d2ba8f9fdd2addfb98ef7c8bfe45c0059fbf5b94708be513482d54f454873148cc53234dd4665f2ae9e295dddc16df85e47e1bf3b9', 420],
                    [-365, '1a9ece7244db05757093c3d3a9c2d692f568477a4dab5e9d29c0e8dcf3e2fa579e93927f2872e0f7760ff98fa269e941d98f346467fb77d8e6a6b564d853064cc8e3b24489398347f17f7fbae860d643910788e1bc74752eb28eb989840a2e4111076cd921732632c0b9406dbc6a60ec36d6f7f6ac00e117c59640f9f3b1a4de6b3497848a3fae70e39d44de6fc97c434a237ea303a873aac5385fc828e68', 420],
                    [-365, '-50964a9e87cd3c54a9c07f40f091ff28de8bc70b3309e36e0ee28d2d0d11f5ae3b2ea9264069ac2af9a1986f58b550a790f425a52c29bc65466ab044f620caf1629e1048e2aaca89253310de780f7fe5dbcdc7736eea31132a93a6932e2d53a00626b6f6ffed720e195cecfb5ff1c9a0b40342b3f91f85d184f363ff62bc3d6480a89a40756703df06d3b99c8e054e63ab803ba1aeb8b87ef8b3b2ff5ab64', 420],
                    [-364, '16baccd7e572324c74b55a1c9bc4ab881c4358a7094eb00b1e75b4b012483771a32b5dd4d6ff275a16baad99b7f87a3812d10bb3971e5a04569fdc677232694f80567bcc8f2967ad3a98d3670be1328e4fcf3b8fdd328258e3acf796b1364196a638f1600b2eff91ff16e6889987cddd8c22827c50e2e2ebe448c230abaf4492a6783ac5fe4a55d79d22b8f97e4e01c80b44f12152d772441b49f4ee7424f', 420],
                    [-364, '-3be857d75a661f09a19d8f7dd4e92751f727f200c274288881b482b386d7bba23b157937833c562082c2111c4507a58629fa80f2365adb7f3645d47f50fa584ffd62a193dff184c4ef5738509f159d144a77a98393b9027f3cbd94262b7edf79443f67dc383f87a5c8e29401c65667e7fde7b068da256bc84dce6e314954ae33f2322e8b31f441308ef066beca485e832846e7cd5e940e3cc19bdb13cd21d', 420],
                    [-364, '93efc7ea675086a4f0edba48573c5898ca7125a2971ac29bb1fb487fd6216e734977b02e29a6c7e93539153cb07080aa7bc7efcdf108dfbfded49443bf7aed6f2dfba70fa361bf31e8a1e9ee183d747b29372bec833551e997e599f0492c8066897139fb15af979e63b2a2fb7be70686e512380e3855a5bc6b6b9507738ad4edd25d614f70582fa942eb2ff9c6c1c7999c427a585adb43286276ed611ea4a', 420],
                    [-364, '-15715c5fc59e0b3dc4ffd4e874b7515aaf03950f25e7147f593fedbcfc7f7022041b6cfcd92b9631248395a97241da9c14510401af9560e98bbd21983a57c26f0ccbde10c62098ae67f703b0973f375db2cd9dba4676985c0340bcf45adb9be0623f68ea6c99be7a142c8db837454fe11fb1770cb89b5ea1493df4aa6c290bdfae577c50da3630fbda50bfb9e7a0f648f67528f7d135d45678564e051009d2', 420],
                    [-363, '4ae2180eb9c82b626a776fb218b33d909796963cf05405a680f6f5823ccddc947cf9f010f262d0aa5207582660e713340f54f3f7d3d133c1ac20cef845236d6b3b3de66b403eb204a876c6143e52497204808c0c74382297842fd905c6e2ad426bad35275b39f2454aeb171b33fd0ae9d69a660be61b37ec1551a3aa67f65cba29575b3343974b78efda847a059e027d5ebbbe02b1e911a018710350e758d', 420],
                    [-363, '-9a1eb2365d5293d954f9114ea9a2e3edeee2552deaed4b24915fbf7651b5b1809ec8b88df5c6629ec56d90521893070496ef86b23e060ec26bcf95d67c757f02d9a01d3c68a9e613b9a0384fce165f87f11fd2a129dd9309ec0c1e46c8e337d0ecef5b6f50acef3761f4a4b6a5d5a923afea468b09ee053615ac57a2d1cd1de3ca247196cb6ca6eebb55bb6cbcf702e96b11ddd2b1eb662c0c65d6bdd4f6f', 420],
                    [-363, '12ba0e4840436a47169cb3859db8847f109b48f7b9720aa4b0b6baa4a1972c63678863e3e7efc2ac997a31609911928c9a57c93f04458c65335668bd956d885fda83e5955ac3f5d3ac7e054f98d0cfb63d880e7acc94af1f1dca9cba0d6b8c2edc4aabccf1411eea43b6f659c9471c4d6b15acff61c546cac29c58f8bff42ffab566ba0c1e977db5741f557a0cd49bc2b1d1add346c5bf48a70907f93d83ab', 420],
                    [-362, '-371cb309709edc8a9de40d6da3b01b31d461228ea301a69b0b31dc6c4454193b0bc2e8977faf9ba9546b414ff63230db06059574b84002e432379c9c852740e3de2fc81cbe7e3da4dbbf9ec55385bdaa4026b5ef425dac76dcf247fdd2999f3e5a46cc8190cf4375a03ea1f2e60474a5b3916fcd04fbafb123faa7a23db57d016208134158e8eb67e55b48481e42bfaf69a9d4f8fd3304fea52e618232a2b', 420],
                    [-362, '600bcd004ccbb992731052d13a699f6a6299d2ba6d4378cbc9ef995c24d48ee7c60d92b9e0e6373b3a5f50c700f3f4b0acaacd3bc8bfa114b5d38ddce4b32cd2b3f4ec660dde0ceba58afd6680782057ea4bece7d2a60ced5b64fa9d1dcec09d393261ef14ba21e8d9b76d794f3c5d893cd11fe1f796019339e6b36605b886557d0b58d9e79e407edacae42c5034e99eae75628401ce77088bdc1ee84194e', 420],
                    [-362, '-9ecd624ac9dab54867def6c7cb4f61bbf1794cfef6b7e09b82629564688b6600a2f23fdc1eafe766be235e1f3e97897b159caef1a98f3c165bfd9fc31a4179e00364d0ddd39434746372728e098c4f4c144b163b89eb60efa0b8fe2cfbbd48f2eda2e2a1727d4e4c9f4be27b8e6f0a412499e62bc6799c65bf21968b9ecdd6584604f5574aa786dd9a4fd83d2c96371b70cb628c58426dab3cfc31958c46f', 420],
                    [-362, 'f967bce033be759a22238627012c37cd01606e9b2934d39f93a06165896311fa113d8d30ed26159d6568d6fbb6b3937f2a5e3d81c2010b04c43deba396f8ff96b11fac778f252ddd7398419f942f5b07e168490935479ecad003674f4fbb94fe7a1dc8f79368327c1f37efbcb3e5c5caae6198be78ada97f9578d4d86ae601db3218ba97fdd5f1b3e9e5854816550b4b47bfde3a5e56532d71ef09cb8b059', 420],
                    [-361, '-253fa75d80c15dbd764e498c30aa0853af7ba504ff182538fa7f96883cfc8b0e3159992cc462e65d540e3817577d8357f134499cf7a73e92ce49b53b853b89457d2c7552f2ebe18ec3b3d3214cb9dcd4e5da3b7362a2bfb363d96ac2a079b9462f410a9e154f739ce5b0cd844d51cded5eb4d9466ad0222f01c267f8ca38a8d0f153042dd43c944a334622e71cc4c17ca84c122249cef208de402c8c7c2f3', 420],
                    [-361, '34f4cb6f50ef5b0c7a0e1595fd0c376437ff5bb7912a9a722c8ebb5e44094540b78dbdcbeefffb9bbaf08661eaff076d654f983316805ff831bbf0d3e68e5cb08e8df8067ab0028550a23d7b5ca52034f8514b0d543d538989ca1960d505f0478fa70228d2504edf9bef17cc49bd554906bf2b5050e8ce19ad7a01942d0e19fd00f39ff6def50492195494ec598f192aaf387973ca379f7ec3efceb19d891', 420],
                    [-361, '-47bc57283cd39d48bfb067a880d3071e0d871e9c55e33cc9502213d2a72ecb2d04ab7db485021b6bfad759608ee4e1bdeaff6d661f1aca964eec830e50ef57ee020ccf7fc1b9de2926a6a3d743efe9e6077e7a37afb0add336a095c1556b4aa1681bd0c5066ad11934699fc397a8f8910a72df0207fc63bb94d0df814a17d14081a0c627e65b1e0c8c15fc817c99eb198cae7fa899594f16179c6f080c67f', 420],
                    [-361, '5cabc30f425267d60c929697ac88f3047936c8393df0871663d8d3fdef43a82592d4dee0f8a7afc424aa019e20ed2f84bb10b1aca37c37e6a8db7d3fbb648c57941cfda091547bcadfff7750690fcdffd06650fccac592123f744314fbb92ac857a9a53c8e687db36149603214a0568f615020629527c7f8af69dc314b59d96ca0b5ad704f39291ae32fc34864f2717d5dea1017c1d0e80fc6f17f1cf956b', 420],
                    [-361, '-724250bc13148b7e3933cca9aad5c2d300ba0285bb24e84410bef73233a74a2fb899676eedb47185e038845ea895c6ee3fb13e079b5b30bbdcead363bf79e3499b7c135eaafb7e34282195c6bdc37f0145f3b7ab1ff6a2543274ee582121af274cf1ec4ceb9f30290c480e4532d2799c868356e5c010a4bb9704e667ced5b76b7bb8b1a324a54720378a29a90f0a9b4d1ed283201c1ef53856f57157628c8', 420],
                    [-361, '868df78e2711099fe4e077e35edad4cb9520b1e9e07a53ab4c833e7a0499059f564d356380faf74235fcbef094e3ffc80630149cf924f151a30555c5c756ed4a5a03c54175c760167023e3e22a2088005bb1115a1cca49e618ffb0891569a6793ecff4d1ad31c4111d488a3069617272af0f098e86c020af6d19fd911752ba66902dd4a1cbfa561287b7d42be86bdf9704a697d9117aecab5343d8c0b5ca7', 420],
                    [-361, '-9772c5d633eea3f3c393b8211dc1b00d17b772d7d28b1268526ce76b2f3f8a803fdf0ff30187f82f48f825ba15a20825e1ee08c2501e3b8a315ebbdfc74d3857740027d9728220a92bf8fd5784aae751d5c86f46eaf5b215b48ab87caee39a1aff49e29c18c86bc7c8682ca96676d8fb532b995b5f70a0ee2e5ae703aa123e6e8afb23679acaeac072d129819ebb3a98ff3ef746f49874d0969f1a607e373', 420],
                    [-361, 'a3074af915292196937587da91910b71db9d8353f47ad1891e2e25880d476f4763bc6f06ddf68bd7d6ccfe5c3e7ff677740319e43596aa4fe4ee9d5d957b2b7f723e18af789f37d48b940f7da690b1059c35173e3f2bf7c86f303854c2ccfb88702ec5cbd72b8cf6bb2c6be21166856355fc371249aec5834c16fcb0939352d01caf188a742874479f946d2ecec575d781fb968f1ac2f7ff9320df4071b1b', 420],
                    [-361, '-a7f0239def99f095a023425277e2132c31088b2d813363976f4177337fcf148f9ca83d83b8174ba0ef5fb6e67ac21455afc7463b14401fa02449b9a46c530ebdcf44269ab8da6c753fb4373866a24c47f2cc5ecce4c4991bf673669b89b8d24d8f772d36715ee902c06c3ac7a61bad26107a239f004bf2ce46a83aee0ae60bff6222dfd0d75d67544560a3b860e425072f4cd545e454d54f402d7cfd5716e', 420],
                    [-361, 'a5a2e139aa1b71801da916db455fa7fc7eb54d7ceb618a20901960efcfb09f857c1ff6b5449d9221dd790a05113305a3b4dec49a6b3dbd1d611903d3794b35825f5efe090e79409219b45b2ecba468afebc13b95c9abd1ce77919ed87404704c2310960ca0ef32828fb92fad92859ba38872a568c82d226a0e69edd4393252ffa198b43215e85b99ee2800fe9beba2e54f2ce5b2898f6cf6f5bf0f790dbae', 420],
                    [-361, '-9c7e86420fd56cba3f8379284dc5caf5a14273e4868c2a48654feacd8adcd1f7af9ec3ffa03400d96de5efdc6457cd753f64829af1513ddc1e5bd0252b45852ff0cf7e531251b8a65cf8e94df08f07438af5706b799c26d817d32290301d7b1bd20da77ce271ca431a3245fa14227cb746d544f1d0d306a1d0e904de7ca4c035a5117b386aa520f60d76f205b6956c7397a5d69915d289d327e239dfe1aed', 420],
                    [-361, '8db3caf9be39c1b3d1b684af5c1426e0c35090363830f7c77ae059ea1117c14422da87a619e765028acadecbda6778efb30af7cbb50417f325f21e9ef2eb4f66dea71857b0be781baa6e5c143536c3f367b932e60c8a590aec04568a43487c4bcd13271ab018d99e22c2552635b961fc52edd84530b36169aab154c42ba57acc7444d27c83e8a6b890a3939dc6791f4b0b30e5cb71a2bcea57a17eedea73c', 420],
                    [-361, '-7b0503f8a62c67a5ab021da2dd137c0f80355da534dc01172ed5361c6119c69dce1fe4188bd786cfa5d7e259283b67557cb5c6328ac24f5eebce7d1416eda5a041e28becbeb7b4907ef68a292aed69881baba94e6ef538eaa5016114b158ab22cb24d90a3219b40ad10295027fbf865b74acc945e15e7beab86c4c3086fcf51fc3350a238b0d5999be6306b0d4cb4b4d0393c166878c30d0ea7470408f0ae', 420],
                    [-361, '666ff8ed6aae2176d2045e53263ec6126836a358502f9e34644d924a372b9acab755e351cc38e200023c0754b58c7308160df444d2a492f2b7dd96ebe7094674254a875c0cdcb725708d3fafcf7445110b61bdca1cb4f2563674f376312506117bca565b49951bcd63202003c96135d3022d55a10a933b39baac02d6bf4888696c2f7c02ce00b8d2e3f4b2419eeb85616a3a47d2526765fd0e200f86142db', 420],
                    [-361, '-51d7ea36165b9e39696ea29ca455b9572c21baaf8ff92397a7521cb3bcba6b6541e7edd55551869ec7bdaaee33a06b4869e0fc4806aa59962eed876af30e42bf787f0ccf17ecbe02a7254ee9d0d213bba4300b563a0906e7c3f806e4bd6509f9133238eec57197729ea195fcddcec9d00af4c1ed4f44ce797e9dbb3fa2af70fb7b08b33079b2328d3d7c9b6c0828b249beb055174d479959c9f5e0973cfde', 420],
                    [-361, '3ec2da5877a4efd94a8cff47a693a12462c6669ec710dcd5f1c00e7d5b590e85ff288a43063acdbb4709359f437aa2148ba766678d56e7b3c29da169749a9d405ae3126712eada99226120b9acebb7edec8421057ed9228b04beb73807e2b2bdc281b9bca36c6cc27961c2571618d80a45ca6408bd265860370fe1ff1aaaaaedb337293b3a05108f1dc1412afb60f66686cf3308f7640da2ef9c1e01aaadc', 420],
                    [-362, '-1ce120121999f924be0c4732c1b749f6163859e7b5ab73cef95dd3026e3acab8b73dde8e60f4a3545d59d9e5fe68d35a56a8e0e2ab5d42422fa0a1616ba33a03505ac8fffa2c115ee3d2c5958dfe1749b7a40f1b303e8a8a1b6019ce9fdefa050f84a8ee65e9e93123a4c183e74bef790f536a3522ae9b4e714d1da48c8c55d5fa6b1c42b5ce63d5a379b3b3ee77b8ea2cfb04398d3bff82ff20ca9ffc379e', 420],
                    [-362, '146b3b687d39fa466064acba93f3dc428d86499a7401381f617b76316028911cddf5f633d7a18851ca2c5fd728d51b186f7f8de48a13df5f60ffed860b51229dbb4710fecb1b1bd08657ac97c116803cfb2c08d1a09079c66226d96c387b9c78342b3fcddc66210182bda09dc978c6148a8b6f31692126ba2f5f54304f28e768ee22845b35f86df0f0203957f69641161551b8318b56956535d61ee2a739b1', 420],
                    [-362, '-dde26fb5f34999a300212e82a5312a706af7f61543589d5177b9d5d123a9203ceabc83864a5df06e8b0dff2a53a49d358d0c2220c92869560fdf2d451fdb3539e642075f1c5a9dad84a327adc574578d0c66f69e7c14077b88cea46408ae7906b3b2b09f4219417cf7cee9a664543ed5e52ef077324d435303e8431c1fecf3f30483b28b2b93ce2be7db81f222e8de9a98a6e205cc1d3574aa822356a7cbc', 420],
                    [-362, '90c953346ec5c59f589ba7afe17bd5f1f30c7b70900c75f638b357f467b42b8ff81f9d6106b95d8f3b6807968ed0d981471623e4f4dc44635bb9ab01305849006792fd32320e6c76b0fdb748d8c02520e2c2450966ca7cdf2b6aa707126d4c64b064be7451439f80232f409cc3ef0fc11a8848d0041a17b314181c4c57b0375611788af57205ce707ef66b632f4e2a3a7dd65feeb38a91ee6a42b8aa2a453', 420],
                    [-362, '-5aca3f2a4bf29966bf7e9f5c67682ff4ab0b8da9fe1624bcfa02b62c7a5ea1d64502ebafe7bc6b2c9e56eefecf2da1684c470acdcd28355731a3a66514add5db1836662cc7d777b1c0ffcdb83c7c172f12655823be2f9542c14a43e3cd7b47c33bf77878e8327e75a224241492279b9eed6b83a46b473ac119bd4f382db147a850e1c739dfc76ac7526507f23f0caca854c3333e5cc50ad54fde9d0c72edb', 420],
                    [-362, '36b7db6428cd7c2122fd4d706bf85475446bbe495005b61e398dea530c93daa25930d8ecf0c6780fccf0a2e18cbcd4dc925c40bf30f059d1e0824ae6a22949d52351c3e5526729b2a58989a4dca0e0cad4f3c61dc69685d145ff29e40e4223ab952dcf1b86fabea7571c7623bd33f540be33f6ff3d4ed5b22c1cd2ae4bcf3a4b9d97bb6bc5c9c6abd1de1b69a8059e50e1847c125dfe1bafac860f3bd572f', 420],
                    [-363, '-13d028ce2ab3d4aabf91f43911ada0937526da255e96533426a6410e4ec423032af6490c1addbbd9632468061f11f25db25e75969a58ae7cd41deced7fc48859e164bd04a4bf0078cb93e45caa08b6193e34a09177618abc0f5916b643fa8bd2f215004a94c911302fdb0a1492014baad682c0a91dfdb981258798746517df727e64be9ddda3cdcbf518965a13feb18d300ed865091513ba23763e88226a7e', 420],
                    [-363, 'b091e6a54e8d18021776b450a899ebc69e931d61df06e01a6f7be2f9289312402d658ad3e1b955a38fd53907eb945f486f26555928aabcb2ef8878bc40fb7677166eaaf1bdd2d594c8afe591288d0238bcacde0551207453822ac69e0685ef9f149e87a6c51261505cc0a702feac8a7b21a78a146c9ec0ba75adb7c07a7ee78884c37e34b9e53c130101502027b5801af269b87cb34cd434f7da4027864f2', 420],
                    [-363, '-5e8f771d1797c14d8f3a919e017a25d8428348ccb7e224e5b0500ae0558ca495f08e87e55960fb196265d5070aed3bc2cf99866e42bd803b997ac057de808a71ec6c0434faa2ed921c8d208a559e0a3c86fc33f3a87e1c7e64d10da917c23cd874f5b509523a513166db194c88779374ab3ced5589077ccbd9d985ef2c226f826bb45c346d9be69a8da75e2fdea8023a2bd9641bb298095982a4cc572a9c6', 420],
                    [-364, '1e6f451e82f69f4bd35989c8c5eaeb164ce1728a4eb0f5b1f9e98e9c08ad8588cd7a5b6681f16a97d97ca27b5ec474f80a04a328a8b74708ae9469914761fbaa9a4ec42f6454e83ad196f5df8881dc614cbe56c98a079d2c2e769bca06eb36a476b8af8cf8973cabe97f7285485ca9eaf6ddf4eedc13398b57eb20ed85a3a1d952663414913cdad8b998cf32761762ab58bae2b361b2fb17f12e3842cce92c', 420],
                    [-364, '-f125bcb7bf50d8a866e93a64297159f113266e6bfecc6b11533f8e1ba28dde69d3ca12099d6ae9bb4a671a35a62d84ce7e6627c90f5359c7dbb40f432e25788458020f7489fe17c5245916eb19a4386a858747fba5dd17c8a272f89b7768683fc3594e50c8b87077887a043ed48166237910417ef543a348d2f020f06576bd021099951bc00b66609296d8c6b88b61c3ca019097ad340e42af8dde241b80f', 420],
                    [-364, '72d86684c79e3eeea42b1dd82fd721384bc75e75525e914cd4b7ee93de399ec2de5e4823c09d77a3dc00b1a8273287dfac14ee03968391f4f5fb5022956387cb05a8dbfdd672081d7111ab8ccefeef5daa06bdbd898af1eb636538638b08eb1ca79a820ee7340852b2d56f20c74af0f565428dae1487481774d70a3abfe204e0b08cc7624c24250155385c468fb300fc286663f3db6513fbcd85e21552b81', 420],
                    [-364, '-3499d534296bfb2b2e3abea00e546dc6c79b998e9195be5034866b875661edb39c6694d82c3a552d50217199cdf320bde0865787a0c01d19565c4851d254232b89720bfd521d3a394393fba2af5707dc3cfb40cf149504f806cf2e7c3c33318eca4a5a61a85b22bcd2e326f13deff9996332e5508eca0f8649e20ad4b674b2854524faa685e24d1aee723384f727034dba32e3dee8b66283a8298e43992b2', 420],
                    [-365, 'e7b36be44fc55469daa391af19aa3de044b7be6607b6813fff2b33046f0ff4ec9423fe33f22c8fea8cdfd7cd0161db8670de1a5d9735a740fd106eae7701312bf4ddb411c870f847bc848b9b841723e81042c94e4e330754425f3558cccda162c6753f3633a47f705678527714a4a6db79fb3a2dcff29e448033088926e5a051be8dab4d3e42247c4d8e76fa9db4f0a1c92cf76182b9ab2abb0d5d5c266d1', 420],
                    [-365, '-6227c4a9fbaa0d873b35b0197f26aa9d74c8286aa37d228f3aedb1f5a958f69c66e52f4d363068718356f0ca9158fa2804c0d5d894b1d77c9dfcac3a6272257ac86217363e9c914b91e1ab89015fec738b52816bb0fa45cf6f52eb50246899fef7cd4bf93cd852aaa3463cd08752c39cf6045d025b9c3903c535e263bfaf1e1345d656641f141768eee0c34044507bf6a6935ab40a58174fcb94444d4078c', 420],
                    [-366, '18fe432f1ae79c02b710f07bee882924fc7fbc47d400d172c1aa7318efdda5037dbb3ac66cf98ca4f80e0347b2e9c83ded4a163880f19bc2952bb0ec6e28fd0e7e71510b245805e59d1f0fd3a8818df3ef26a16e8658cbf217daeafab0e205af249cce0276036b3ece2c25445b55d7a24d39d873872e7d1302b28034878139f64a1ab9e1b9aa8eace83a083920edc0543b1613cbd6883979efd87cc0fb1e29', 420],
                    [-366, '-9cac51732bfddbf32fa2f99e27b585d6fb64e0db48716e8507a1bbcebcfbfedaddb2074fd1712326bbe3f9ea2d2a6e3686c27ca44587f424a658b85ae2e0c746f163661883de2e643c86b750f401fe206f04be97dc48a16bb87359d2bdf5b73a907e244b0cd6273d1a3c3349b57422575cf0e895a2b23ba0b5dfcf71659ddf51c5e5bbb6a4841f801c38fcf8337329e24e675baf310e3917ee61e0f1bc744', 420],
                    [-366, '3b06c299301f9aafdddfc0978c0f5721c92916130aea67ef17195fd770f2315f9dd72bff46a3d93e61c78298f1dc488fc0c4b94f6055c660df101fa6258ad733f19be8db6ebe3f55de699a8eb9471881af14555491cc4994c0cedada91082285e46b7f172bec01168b5148e23a492c63aaa7ef420d25df39f346542ebf2159ed20374bb391720d6d236f230c5ebbf5ed989e03cb20ff563bd0d20d44d8c46', 420],
                    [-367, '-d5d415e99b86ed11607ebd4cfbbf1dc024fdb2d87dcf30b38efec2a740d220bbf721edec0c23163bf0d22165d8d9babc8fbe7166df4eb07dfdc610c4d190675a8732599245c3096b56b0a96a8a8216c0652ab21524e9616b3bdbab06323955cd7d178603329a82ef30882a08ce9ee515ef65b4186c2ecafabcbc8326b114eb5efe43c44aefef2daaebf958f97d358a4bb4011e9c469a2563c98f4e04dd1a4', 420],
                    [-366, '77291b3d2fd860b0936d54c3458e71edd58c76e110c9e675922eb4eab072701177d3437eb592a1aae3030e3ca5a473c0237dbdc6fb785bd5aa109d8ff7f84d42f3f5187464bf186ced3753c3971b34d4aac438d41d4e272d021348e59edff109bdcebeeda242a8c1b6bc35fc61b4c64e2e60f6c0781aa908b8142ca2295ca31bc0058e200bea2f5d904d5e76c9ef8598128b95c2fe3a1ada097e0771ea6c', 420],
                    [-368, '-f95e41b4f0c4498cc81ddaf439a0f2af9f4800caee4dee4d558bb7368a6f7bb1fdf0e551bdce02aa22eefe2c93c2035c82cd598ca3d992632c031bfc05b62acbf748ea4f8370a1c2d4806183e799c233f976b269da0047b8fc5979d3c6412f7fb47f75c13e9b1f85a16eaa3e1b01064a174605e64d22e048fbc24275f41a441415928ce4869af948b2d61d7157095aa6bb9028e76ab8b34f545f3c069ba21', 420],
                    [-368, '50427700c6bc9ec74c3baa8a307a7146cb38198b85d06045a32fd5757a5190639430c99a45ca1c4fe6913557727db44efdc06c6f1fe6e72211043dbf35b4464432992f596b9469451c8e0c6fad04534839ab35509999bc6af7e3eb6124dd73137d4423e8e18d2fd1fcaa57229f89e18db189942bdf5013a47aaa1533ca9ac59f5cd5ee3e14a2743c61bb8b8edebba8cf689dc5e3ff3c2881f073ac95d3e71', 420],
                    [-369, '-f8447e8336e1895d2426b3baa860b0a3842c065470107430ff224b4541c71cc8e62322a813b41454ff76788a4a7585897329f6d22b002c72ae8530ea17516d7769722564468c855635e01e1850597a748167299587b850a5cefafefd3937bb3e6bcdc7b532b11115e95cc6c488c0b38b12d3379bad3bec8388819081e00c4997799b6f32f5e5345886844130b9d58a399b429ca4e4ea790bb1ef8e2efdeae', 420],
                    [-369, '49cc26aa7f6a6dd783c86a3ab9d5ec54efe48d8177414a59b08669bf6c42451c6dda2d41696c8a20d1474a6d995ed856ec1247233f1f509ff47fe62d62241919868fefafd15583a34620cf2a7551066bc1d31933bd907d88ea070e64a4877332f81d58558f780cec31526d6230bd508f61eb421defb927d4bc68b549dc3de1aee8f37c807fbd795c6990abe3284c0c771503d2265c39662cb6e46c63f94c2', 420],
                    [-370, '-d2c252cf4faad9513b0b2e5a59dca04f3946b088044b7d0fa145ef86de439dcd9b2a221689a311c1314f9281407ba0bef61d6c78247157db6cde7763140e34a8bdd4e958e1dbc57b2f1169411d37d2e9d59163a5cf12cbd35d36b6e4b4054a2854eb7c288189e25db7c5b8abd15a57b0c5aed07716aec4e5e7c147b0b7f14cff4d0b4806e91b09a11f56188a4c086b426bc7df7720d62510f26124cce1a7b', 420],
                    [-370, '39d1b61714e19f4a153f545b4dd157583e9660ab8423ed18e8decb9f868a93020482295759e60e4515cae983200e019d65ed30685a7cb112d187e0fd95d11d3228331505d1668d3fd26defac7693fdacceb11d1927b87f1208e653d8a9476e24a35c3b98ee54ffb770be2f38c6f7a3007c8576040711153dfb92154511528157520d8186128ca89ce0269748a7d1112bf0621358fbd484b68b48270908ac6', 420],
                    [-371, '-9856903a90d346ba4cb4c36e0832c9e5587f707cd8215e41b27a1ecd456ac5e4040e7eda3c5f2bc07a4c7b5d240ea1327b14def2fc9a393f8220dda1d72aec316136b1946e570fd7a2e8fc448d0efc5ca6db021119e0258982b2ea249285eb598495cf2618ff85529dd7a7f4b0255cad30cc523e87ba74d67795a94f4df7965d1525a57c88bb1bdc6764aa776e3a064bab35d876bfcd883bf2c819fcc39cd', 420],
                    [-372, '181638a4c3938e6f5608936db611fc19ef5e2cce44ae46c0d6fcb6b35a3d6e57a5e7aa43d0e707029e91eb443592bd467272ba2c88501a68590198590a44cb8e0fb92218ece7945f4b23f6965971e311301bc5c7cb07f7789d3bf7c5365cc2c57b4f0819fa5df159794a36cdc54a7624334c6e4be6f50e228becc55931af50020358e2fd0738521d2858b10dcbae582c65fe150112cde38bbe64c803cd6e93', 420],
                    [-372, '-5d978d71d1f6893408ba5cf425f9f0f07e1332d92b03c395f4d95d74e1becfc604258fc877ebecebae47745831f868a0aedd8cd122dbfc78650f447997493b81f716f8705e891360648d5c4659151a803f965045f7c0b1e5633017aae7e6d98551642d945e8bc79f17376f2c52598e90c089a44cd9da442fb9ec35a2119e6ef9ab609ea32b5e887b2b4f5c638a6de5e10d96a15d8055238e57a9ed5ab5ff4', 420],
                    [-373, 'da2143851d6ae7514ffc85cba7fbccd228aa7975b6da6a04b763faf35534dc6892cbf10835eb29dc1bcd8abcf4cbf53d44ff8c0200eb686002d477b48a98adb4cd9369e5e9fc79f472547bbc413006d4c2e3d983bd879598aff23b8acedfac63f9868074d5dda762b044513d1404dc9fde7b5b0f3a844c786f37869f71550665e47088604e4be1e7c2c5645296d645e2d6820bd7482260622781a1be4bd7d', 420],
                    [-374, '-1e7c3530fe335b0dca313d8657fd79add63136a0b6c345f4b0fa8ed334c3863e64a05f31f660ba56c74a40f1f2078faa66d47a6eb05ee9cb2e035f726cc9011cd559b92d1a839d676e4a573bf267bb701191c370973aca928ccd27e770066b52edb1c9a7bf536f495fb5c5562b52e06f0d1c45f6aa5679897d57613b95e6f6de8256e3a5e4de61d137f2c735639ea1b63e023b73652da0f8734f0a4b1117b0', 420],
                    [-374, '689d4dcbe5ff5ab61c0a8eae320a20fd9331312ab01dcdac671c318e38ce32523f460f21973b8f56047318eaf99c272b1920764ec99fe0f5b3fb8cc17b3ed56959e5a72ae006abf37b6ffa98b093da1e4e9bce1bd3f150cc1ff58ac5ed260ffbd08f965a37bde32ef5ae00f7e14656da244848c798e4280b3956e4ade74c60bd79023e360e94086317223b334717217e3e3c9b7e65bd6628739c282cf2016', 420],
                    [-375, '-d724c10b4ad47b249df006d2b344fa9c0593cc9a111a1c48bff7cf386d59f76aa0c0cdd9d87287d10f5224b1ff0942b2367fa41f725565556dcfc89637d983d0d7ee42e9d6dfbb713d87a6d75366e0e8a4d1a28687f8576cb7d6fe7565d9f43fb3be9d284ef4eefee38579db24750f4c9e4434cbfad8b1ac0eb968b5b8eb311a23424a40d7a40475acfa8148e08eacb3ce3085e2881b1cc2af0ec10813377', 420],
                    [-376, '1a81b4571fe115df3db7946aa8cf5931adf80aadab90334b9e884f3e143301553003725c42fd9da6f809016676dd861803840b869251760de098d80c504dcae2ddc917fe831301520d3a2537a6d40c402c7c42d68e08a2ac4afa1f1fcb7f4e97181215302ee3d2a596496ac070477d2f94a078d7fe285ccc7d8e74db632b96643dd307947f68707eacb3aad6d7d0c891045170ce56480852453298d0fcbcce', 420],
                    [-376, '-501bd14eb0be5e36194873c55b767cf0b9de39fdea08bded8c9d8b4a41e3990183256b9e488b3fc27f0c177b30d351d6adcaf9dca2cdaf9164ec77aefada6994983c6f7ce11ef9e5d21a239322708a5db8ff5dab8466568e7f4329378001c6a942116665ab4eab113bd53921ba0d082940a1d1f658929d0922e5dbc57d0aac7ae5c733384d855227b31d45be5c004be97af0d87e3f74e5633394f8d4dfbcf', 420],
                    [-376, 'e7e67dbf5f4e949aa3b6b78c5db6bad110f468d7ce172ac390ccc26246a48d1c079bd62bddc0da954b877e2fca10d41a41e86d8c9ac89a25865051fc5673d9ec858583faafe8821683dc5e16acd84eedc6ce38ed7d22a9b0d5542e65d5acd3d62f32728f2a24f9b7a1229f389408871551d8f767d3ec8f64256e0370be4c87c8bad6036159dd972d8e4da47922a24297121228dc92b1a204d460e3a35870', 420],
                    [-378, '-fb1467aed459dc8457f1a8a9bfaaabb9c74d329889fd295493cb02839b149b996a32e3503601956f4bac648e0ef464097872ed0c17b669d7cece16615126e5ad8c8c038efe7d8c01649f00f5045e443d06865dc311e8ed552ba8818fabc0b2ea719b93d3ba29b15983feb31a0038c0c15620517a6c2b0b628c8d7a2cb8b2a0cc33857d61de0ae3a31dde580da1be1c6dcb61cabf0a6654e710ba3566f4edd', 420],
                    [-379, '1a0493d0bdba766017f928208ce5ec1b8005844896c1b43f6f20e00bdd835e7f1d257e53c61822c402c39b64fc7a6c67f83edfe7cd942dee90cb323f65d61e79dfad2febda042b6e0596c5cbaa1f8440b41fc8558e375519afab1dbcb68158629da21a093bc4a85d674edaa7040ab40b2985b0068bd6e6c33a6d57bae2a7a2112e80c0cb10be98d902493f7092e7712bde122d4726c3b06d178a8dac2a7d59', 420],
                    [-378, '-69a57ebaf6adc7b5a9198036ddf124cc37dbe866fa20124cc21b5bb025c5a9b81c6ec19346c8dd55bf551999f4c8238194d1ee18cc6c924130b2433249709ed7a747adc568b6322f581906ac9461b80edbc01620269f9378377b600685ab74479a51a928701bbd5f1856df75094e6b5ab09aa03e35a40680e7b2ecb61cc1114e018e578d54170945bb4e86db807efa7f4c91147f43f7cee327236b957ef9', 420],
                    [-380, '6425ff7e25c67cb68a474a37a61a9f2fd0f6993d423d4743409df9a3d99b3fde4218857a757d6f88acad3d52a3a8b8c478b42c77111464f4ff6fa17e3f33f5dc304fab28451f9ca2b934c0eacf124a7605704e3e55d6124386c37ae5606959b1d739c8aac809ed48a9793fb9d108f1f78281ae48d31ded1f09717320944b498c2dd80344c0e400230286dc0a4f78a053e88d7d620be66625dc85e35156112', 420],
                    [-381, '-912e9a3585841acca43ddc81e411b799141f4120d390ece38454afa34072559ebc59e28772b1e66dcaa38005c9d444658996b5cb4b2bf89f97da0023a5a09a1648684216aeaed8be2ae8e17546cd1714bbc3559db6320d712658deaa8fd7ce989880fd8b0c2e00887fa8a0d68954669c41f675aaf486a9c1203ba16e23ccfe60685b1c928fb0f73cbac70c1ea819e40d84d6600c318247c6445c520bdb6c9', 420],
                    [-382, 'c90f3f3f8502531790645d56222d33394d430e398cdc6cc6dae0c836f21d13fc6dcd5c2e8c58bb2aab999ce380d987bba69e636363c895aa9f313e26b761c9810ed8be7fcdcaf2a12b1940bdc2396289da87e15a306ac3cfc8f14df9e60c724b9070d7401cf41d7b32964007a4745985e578766c246c54e4b4a7055452357213611c95c0e85b89571cdc1fad26406864ba842c91f9f460e3f433d83b79101', 420],
                    [-383, '-109dc1e43621ac566fdfc3a8da6d3f0c95271ccae350c15865cbe0f24577367f3786b7128f553300f1f5de2216b73e3923e688e486976ce8e0aa943047bbd286e1bc8be15a94c84617f454cd8927f2bccfa9985db23c48fde7e97cb9f551fc2f7efa7b5993a628625fcc525eb689688df23e7436b39f425497ef003cca447312a35d8c5980fcf607efce4dbd084c7cea10ed7b08b0ae73c0b23d5e55ac040d', 420],
                    [-384, '14f796d2087a8ee30cf4a1cc8977e8a6b2fa1a232cc8ad8b4348a4a3d7a0a5e47895f2a73511bfccf089bc0d65d86c24bb6f1b38c59d21d63ebbb49f45bc017d1d504ed88cf4a28a28f80eff0be6db015efd1bae7a1ae6641ff0bc852765873ea24206fc9a0fb7e2eb5653e9b77f263296a1f6096234e3991269832b5097d45783b8fbb112cc2ee267b0921647a26ebd23a501c2801e3515f3958e5dda5e55', 420],
                    [-385, '-193bbf8b51b4c10b8f1ce14f67cb71fba441639f81cdb2c33367454361f1dcf79c98e4bf7920046a425406341b37c91f0ac459faa2a669a8d051d695683133a09ad51584a9e6b923199b63bce7e4fa38093b9f421eb02fc90255968b2fe95da0e5faf2af275d0f57bba218264cb1d84ac22cab785584a67d9b18f4395d7db251a33e43663a8535bca7070e2dbd7d05e7163ad3abbfbd9b278d95bee331e6cb', 420],
                    [-386, '1cf20de35d9cbd9676be261ffd6af9ab57dc919931ca63805bc7108e5fda0c817e7a780c56ae678ec86b1bb3643d424468a7aa7eb0907e180478c0b7271c384d604fddc587655cc99cdd72edeef4ddaf72736787cd2865385ef359eaa8ff0cc2e95592241a388cb24fd9152a074d2b7b7b563ba11cd535e1066f6a790d3320c19b09f0993a1e8cdaec4190de18c95ea9d9c929033740d9d99acac1c3c92b7a', 420],
                    [-386, '-329b34f4d3b2a80c69460f3677b544fe2308a020005a66cda1adfae6a3c2bcce11e94ffeb0dd31629302bcef11e416e90c9b8689e8cddfaf90563affb00bc5e33f8764e002d4a4f5d62cae6a3840231f10b2514d06a0bd1e580b79c5ac0ba1772ac68778a81903bc5d041d85e47cb890cf403772d6b3baaeb1b20fbfd384d9663626919fa1a4f2c2b9a15fd581c1dd21ee77942c210ab1fcf05cf2c395c41', 420],
                    [-387, '34a3f6444196de686fe9d04e2c7f96ecabef0deb70b08caabb69d6bd450ba4f60514480cf66acb24debfd16a2967c0a57b90e0f30ed80b6174cb188a1c230bdbb961a3c0d94c66394f271de15881689e0cc2d14809809a0329afb713e40c34e7691badabcc2d1a2cf3531c83be0e55121d00f0e37eb52a870fc78560ea4f281e284f19cfca7dad288e31055597771a9220556d4a1d000a6cc931a4990c35b', 420],
                    [-388, '-3416e7cdf293962f8f983970ebdc1713fcc23d6478a83055b1cf8c77b10aa77e4521b6666234600358c7d326f38a756969e6cdf6cd490a342c5427eedea7965d65f3991420b961c0b87451d2cbfc476957626834742cb12797fd7bba639ef2c9484d57fdebb1ebe1bfe3236504eb2a163683f156364d3806ad1ffc2502f4184345676f8aff2e43256ded52f813c79312a90171c80a74288397f3dff48a959', 420],
                    [-390, '1e9fc6ab1c8c43a791cd663bd8a91c1f37d4ee04c7046de706cfc9f009c96ba7466fdbf1017827af3e0f44fcfc4767e4dfa13f15f76130d6cfbc441f9af191f3b072c4d74b3b15e01c97be2f53f57d396881546a387ca787390b3a153d5967c2f56403a27a66cfb5ce83192b1154410382d4f3c97d05413b89f3340d0d9a9bdbafb7590167f460daee56b5d63d73e2deaf080c667d3c9727a7d5026c06ee6d', 420],
                    [-391, '-1b5d1eca85c6f78d18ed924cb596a062eb55116ae1f2fa92a5da7ae65fa3b2cf44257f6090e1d31112d1b1b246e8f4528ea5fdad55e0bfdbf7cbda4ff95e2d9f57561967cc70b3ff17aa6639fe201f3588bcacfcb6ffdbe7dc0773e227830a8858796dd926f3b893ec0931560450879284042a5bfc83d7f917c8dd26574c99a6aeb341c041c2ad13af8e10d302da254fd4fc4eef7d1f31fb2ac5c6e35d71fe', 420],
                    [-392, '173515d33cd50c46652ac65c26adbf9801247c865b95723e9da94d69e4726854bb7ffd7370e77162212d2a6dbf4ab7f4f24863b6c98354388636d3228d4bcc636fd549a9fbf282d412d5e1ba6e1ad8d0153237cbf9b625d0918ed9246b4c09c22278c7cf0b28a4726d75e3eb69f9f016b97099681753cc4bb1e1a068c621e0ff5d34ee4d9a196506fbf40846545e3d2df5b3a2ac81303c57292f7c1776ac43', 420],
                    [-393, '-12aa947a03cd446789b9725e729ad9181e5f6f92f154352eef36d50507a2d8c14d46648a51b889842a4653d85516996b7ca5dce0168d7ebf3be56399768fb33776be8ba7713eb624786fadbe681f22f77832dcbeda769c2b451498f8908245cf8f024fbe715065b93e067f5b20539ce2510195bda3eae7bc198ba7d1c0b1e10c09840287b53e0e626278efff5ac064a468189e4e814877e2fd956d543dae9f', 420],
                    [-394, 'e3a076410f5757dfcba11d1d259b0bf4eac51a3d232720edb4afe6721997da564a1122e8ffb096bc0a4ea2566b7273db53ec67be822707c748deffcb2f449849ff490b885b3fc2edabee058b4cb36a019a4503839fae34280509bab8d7fc10f4451ffc3e9d6811d18f827b9efdf93dfc1c8cdcdbfd016cb715ea0a1c46bec43f18c3125c33825492bd712df57cff0106d008c7c6d5d4be70927490c30e05b', 420],
                    [-395, '-a43e9e108f819b6821551caa6a257cf43563b8bb927b29abd157e1297c56c11ddc08439106b0e9f3ed20ccd4721b250a667f780c61f72ca9ba5d45c244946e921a3ff9e9a609d0c4f470ecc19a37b92bc8581f3aefd66080ffeab461a7be96f89e354b32747c00faf9aa9ffee84d1171090effbf0185a853e39678163edc912e56eb758ab37f1cc040b6e961632a954413c406b1aece55e2bbe8bbe7f7b29', 420],
                    [-396, '7017a55346ddd381563cc7fc58755301dee8327f2f9f4a29665cd400d23f3b60d429bd4ed5a851ab14d9ea2692a2da39f61470691d59837ca87fc81e0a7339ef3d59e8db4056e89af1bfbe24a60dcfb08912fd326d675e407691d085d288feaa22667c532abe3397cf779740662a6b52e64e364ec359035de79f633806dcdc5902381e4f0b1a25f023d523ea428a4c5e66e710503849df6901108f5608573', 420],
                    [-397, '-4849329e1f0300500741fb6824f3a917711aee9e73cefccc2c97cd9c95c7a937035140193ed86105c4748da2f4413e7e47c065b66e4163be1b8b8a693973d59499300d9ae12e31bcb8f9a98c5b68937cdfc36769a329ec2fa82f1dc020fc7527c4807f44c713a9f902bdd171f01f0964d9cb0013294ef11bb7aa0333de244e7c33403ed0b1974040cb8b20e30726676c3ba0730467431fe67de700877513d', 420],
                    [-399, '1b8072e23324664923a21f632327387428139825b8e8fb91689a871a1559da215a660deb1b4fce9b64a5c951a931778bb891a7ac9c987d892aaa6a0b41d79ad23e29afad920ed96e1bc96e7d9315c745bd48071c23201b33f98acf6f039691ddc4dd04b3a96e0d254036e1624ef83ab225127dea3024894d5d6345d0bb3949f474e31b79eabbe63f8bb29ef52f37c9462d4ebebc23fe6424884cf30cfc7b54', 420],
                    [-399, '-1941ef9ddf784106fd6f74772ef4601e367d68c24a80f6cb776fc5f563d076b0e5fc48f6e89f88a515a7302e48a5dd82e7848ff87e5c807aee8b7ff1cfca3bcdebf5431fde91883b832215f838d794cfbc2c186b71dc49a2975c50b33132b25fa42bb87b999cbfd3b2f9049c1f0aec68a99e0d656ee7c7f817d99b31e1187d1da4ccb0a6433aa4e6eaf4d67b69398fdfe1beb06751227ef03e7b078eabee2', 420],
                    [-401, '888d8d9a89953bcc5dc1c1584ac7398df1aae1e49c92a6d5b18c19ca2fd87de8178a3c7d0ee6946dbef614a4a06d00b9276047c28026bd980d34a31a6adb322a73e6aff635b5441fd865ea85d45eb17677d49b112669688246212e18e597f762fc553ecbaf241d1730e557e9d6caa6d8076752d40fca713c6a562dbdcef1289aa6e06d7d8378f755fd3df08fefa34d8600ec257e7a37347a4f49adff32386', 420],
                    [-402, '-45745c3f50da52c9d0aab40effbeec4419eeef1c0d91952cb7f7d594d78ec9c9d57c274949f1e4a9028a845ce88717d02bb52232fe0f0209eeb61132c7433d0d6fbfdfa376539c2825fe308dc137d460ce671041daf911911b58507147331a929fa6fdccde142e2fee4d4472d157490791f466e9694eae8c0022907f9bfcfbea93820b928dbc3a808d1430328e75af7f291d067498fa833036e7bf535ded5', 420],
                    [-404, '14bf03801904d205d95a95bbbbd8175d9106ed39d7f78d296357d158d443a299aa3ebcb98aa63e0ce0c62454beb64b0b32670ff670420be6af1f5692c3ad78ac21f32eb5feb759c71fa7f680f90f1602a51d297eefd0e45ca3e11687983bc318c5fb2d757ec515634b8837ddf04cea37a6474ce2a32ae78a42f5718558403d6ca8f3119d8addce6b450e5e2e70f024f22a47201cd721cd957cadb45df8e728', 420],
                    [-405, '-94df4aa3d600b02d546b7209e491ec4c51e33599b23880b1ebfbcbb40827438732256e204081a5ba0a0185dcf847e81386ccdfd42d243244c410301c7827dbb4a6dc6d0f63c7126c11dc1ffa1ce6ca6ab6ac18516254e0059a42935f3554e672364abf8c7e5db46846744985912942c8adcd6afcbff742f909159cc94f1b6c221c81a28a1a5d43ad22f5d67dab21dd7d02ea7c88692b3ed2911fde79da1b8', 420],
                    [-406, '3e929b202ffc7c8f79ab96b942c1ff3b394378467f09a5468472cae3d0fc0b6bb75491aaa5dbc2d36058a16aca182b504508618f8451b30b402033e4c0359ec8142848c783a25f6f1f7b25380c624ab9ddb6f3fa5380965d5210bada844e70a9573fb5f3c53833ed21e044c4c2774edd62473919480ff8c1dd7a9a2f8b15a68b5fff4010ff909a7db1c8fae7cef1020d5c9e8aa3e93af95de7841bf2bc439', 420],
                    [-408, '-f6204784a662df8388137d36915389f728b552030c8104d383a202195cc3186f7e7db5f155fe6704d01003736f5a8cd1f3ee2f4a5fb09aa902a5e154593b99dc46e26d1a14208549565723148af0ce8d2e7940474a72ce538e244aee0a41f2222bb7d9f447745c9f57403f2de26bc76ba02700818e1d5a9589f50fb4bb547f32e22d84794439a8db4327690293c811ea12309a83ee3f3bc5d6f3e9bcbce88', 420],
                    [-409, '5a7783b33ed94d7ff94b4b147507bd0d8b2896eea59cbd3686953fa3007a4fdb0ff3a4959fc3855eabb6323f806f7211fefa4c0f9eef4bf60ee736ec96bacb4fa4d494b8106623dad6449658176121896fec2b63030aa16f4e9e1339079f35c9bb678ce1b002ff1bced62a6bace613380de90f07d1d05943149a3dd9f8d5dfa190fb79a2695f1c5a0cb07a0ee8145582d158fa18732eb18ae0a68bb329b3d', 420],
                    [-411, '-1363eda48a9ed1ff61a420a4da58d5a8f42a58c8fcba943b316a8a1fac2fa4be105176080c53cb019b8d5585c2c471be9922f03405cf77c955f61c525c7f91e213d217e9516fb8a5cb50cc6bd2b6d287cdf73cb5e1f2b7406cd2649f6030192fc6038aabd16e24fbd91cd43237d54f71f3e11f3fda880e1d87f066dac5fb268c3530a06f352187fcdb7bc2e9ed6c86329ff730f1fd44c275910c23cd8b1bed', 420],
                    [-412, '631afa7c96c280c2abcfcc188d69bff97cdfe8af5cc4ac2bcb1a1cfc7eb7f80d20eabff0d3e6bf57f7f681a349860fcee6252a638862a6bf9898736493249797eb5ddb1b027f89d27efeced52e316f3f04976047abb4f2650c024c3602c1d2c4cda160e1079d6daf9a6c3017ef31214ec20a7621362efa1319153126febab5ac53f09e270fba216ec0bb8a64a1c683dd49f7b828ba926e5c77af9725922cf', 420],
                    [-414, '-126635c2bdc9e080f106f2bed3147d07faff2801ab5070ac1b281d65880451625e3c9646876712f403e1d9aebc81ce4f40c6ff7553086a962716ad0a544b8c2f85390bf2f03cfe2753aa6d4f8712a2b8ad625a51c9db88c4b8d3144cbe0ef6fbd6e9fe6413c3b3369955761d33d757ecdcd8c4db29b4d0bebbba8b2531f84158f9311d38121285e8820249885f778a5b48d0713862c469ce3fcc6c14950c90', 420],
                    [-415, '512b59d163ec42ffb6f9367faf47d007a5bbf6c30ed05cf4442db1d3a76379116f3bf2fbc01f35baba5bf80d44a64499f0e209f2db4067ddd9ba9d403a8b2d4a0f403f2c995413552e9483776debc2ddaf833869963229e4cf95941eb9c2a87595445042de3b721f858b1b2bf614a152f64ee6005e3bb1ec1ce36811ea8c07a880c681aa405efc2f923fbad0c5b7625d68cd627e9b9de380d50a751bac3c0', 420],
                    [-416, '-14bbfa2a05b126bb84fb8e8e982e8c8ab132cc7ed1e3910f53b1c2d28246bced604c20cbf91a2028c28737fb0276409e3858b1750d1214da488318221085fd40964b3f1d3328b7905889aae5b555e22e78a63be64c04b338633a297d2f7c949e5909d54fb20c3e888c96d9ba772057bd6cf77a6acec1efd6a9e55a6add3d3a768ac3bc09191b24d208fb567a62b0d049d9c5b52f187d004c133042aa2ddd5', 420],
                    [-419, '1e9b76b6eb9370fa53576140bcdf2990d2ee5d81fdd5ca5df16da137645b56da528e22ad59d2e0a7d49539ee178989524aaf9cc0591b4a90992ba13704b1be06fcf58b891ed2c561785410148aca71a3426e2d02d0810bbf9c73e0aec920df2ef57a9fa27d05038d986fc9dce89f2cd45b230fef7e5329c2b06996a7ac0c2236662bd47eb8516f5a54acddea05eb2f07a432a5011f3d8d674ebb5f5b131d8c', 420],
                    [-420, '-6ab8506eaa7978d6a538d8f64f3b9f33313a2217e98e499e80826bb8336abf1b0ef80c273e80b46ff3c84e0539176ff36af9eb9ae62de14fe7ef54f687faee3f82b1cd18048f5ed87ded09457ac608302ec572d32b90a2e545ed83a26c92fb656dadf680d931a5a504c2439a3fa067b87ee1e4e47f698a9cf4399ad0f820f974b9647efd61a384ac54ec49fcf89ddc854ea4ed7b69a8ef9b4df6865d6f5f1', 420],
                    [-422, 'd61b2fbccbd713f7d7880c44e23d376a333b3293e79aa516171420d92f32e6cf2ace4bb1c63783611e953f141a66fef78019ddff49deab1d6d3731093d20fa56ff5a907003158111712be9c815d8f2edb34056a82b126430438dfadad5ff241d41568e88ed18731bfe5d5ee37395224925fdf242a4368766d027e158f08587c5124f72666c7df164674f12134fae95ba0bd7d5125b1f8f1e48677e29fc550', 420],
                    [-424, '-18a877e157f614ffda8c3d2d84d8d79cde489cdcf37a65c2167bca71f9bb96461587d9935a382a886769dc7a9bed3db7c54dea62e374798488e89e13906f6cde790fee7297165c8ab07f803f0fd85ccb04b570484d71815885520ae377bc79ee0225ec5aa56d8c26f7a6a99fea759a431d32dfcbffe44f71104646e67dfa23793128f7d7ffb898341fb77abac3a8a0fc3e4a54e94a62ef44d0fb512dc500bf', 420],
                    [-425, '429b7fd4b7326bf94ff63088cf3ae85fbc2f18c714ce0256345bb750fe789099af3be7f810c430aa6b3db7820908cae2c002e0ce28228bb9b38c4f8533d6977bea012d360c6bdee3436ef7874ffb0124002a9101ff41d98d8ae578f911257479079551eb2304b6cf47ef3c1e5d8fac6952821ae4d2442e05f57a85707f72dcbe8149bdbb5c99447c3f17aedbe1d063784430068f33605ac5ed40e28baf622', 420],
                    [-427, '-66c29dbe20e48a3deadc4537b0b02d6839b95cba565ee0a6027c09222cd919fd5deafbd30935873fbae1132b98bce39539e85b105d3e35cb388ebd68c39c19ab66967f54771a904ca96562a27400a2292bf3798a20659e343eb23d725aa2a0e14fa7b904b95d1df5beac17572f8e58b8039bb7a8192cb37cb61de00eb9cef897e166b4f23371a8c03d49fc72a5dd9753eaec2499e7e3531a9dbe6d93fc139', 420],
                    [-429, '90790bdb34b8596148a86722be4f5093049137e756b9c1818873d7d13c20a15f5799ac88527f78aecca7171d397ccd2e69f5c9e407b579883ef1ca2c56908f792608313a1d1f3f1cee571410d7c08895ef1fe312713e9e0f904f91082c59fa1eda8b4f513890fe5a16a7f1a0ea84dc269cb2e65bc9c4df018849bf90c322405d38434f765db82a573d41f18506aefc619332687202e662242e527615bd872', 420],
                    [-430, '-1274b4d3fb40caad15a11bb895ac54106509f479edd01354736bfdbc15a7a391103b81d9081d39cbc6c249b78bc21f57bd9123067a14d609ff1d2e58ae99cf48a5a4a222e1c9c37089467d0e722818a9b0726c803d730c5d77505939f408ae6705212cfb137c59e98c4c2a014c7ca1293413b538f1f4516fd57a6b05423da24e938783d3e859130ab7ef9c2a6777c40671e838bd6ec2c7d0c29ec9a5bfa77', 420],
                    [-433, 'd58fc22bcc9d14e7494f6bc9de0184e4c183f214f42b8f5ac1ee0ac266c9e0263845724a764c859e14f9e8c873e21d09ddb09dce772e9db0725eba65ef93a93e7ff7c5b8394667d78eca78c4810530a25e621c70cb9c22ee09e5a1d8ae384a4571cd210f2cd711c57665382986737badbfab839202978062d8d6cbb1f3ea12e36c89cecfd795624e228b4d22055df3d2962515c99db10f7e2bd4b843210be', 420],
                    [-435, '-df1c4df0fe162823071dafe682d631ad22a5bf06357a2162e135a23ddde2a8a8144aa4a9436ff2205807babad37aabf9fe00047439077032f0a05b2cb3de71a4e989c59e7b5c800369b86e24d1c62644e4f03f20b67add42cd156b0b065595e68e0b479b82defe1849fe72c4ffdd54c03db1c7f2e2807653d4b4159dc51731fd4db120029bf3482b5d53d8ade86f98954eee2afc26449a6ad88e4c2682de7', 420],
                    [-437, 'd1b41759a32dd88cbf220444131a97a9a99b9a1407e35ceb2c63167d6b30c8595d805be1fcfd8ab5d8ad5e984a4eec557b9948e46799e4a1dd3e6c6294ba23181ec7c42400130e8fa8a78c0955f2f8d0b1a943d2cf6fcb70910cfa131469d8f74292d9f5ae861a0d674779f7d1f4a142ec689643d936d71f42a0bb4818982d9474d296c18ab8b5552d9c0689b469ca77a78ab20fa4a22a5bd50cf4b452527', 420],
                    [-439, '-b0ab6ec47ac59a06043666e428f1962c950f3cc4e7c03151019a4f8e4520f7ce2a7964afd53c86adf87e24804fa136aaddb41a63b49ad214af4f4955c9cadd476ba54d34b061e0d59d2cb441eeaea538c30c2703b275154e225d36b7f20df4121659d536c242a461b35bfdc8b2a69b5fee81183a535e0f13012386d673ce72bdef13bd21617d58b80ec82a7ec3277e2649e36c4ba0fe4dc7a0410ab4faecb', 420],
                    [-441, '84e1c4bdfb133ed5d2b9ddf5346e80f79c1956d389e769c6630db6107fbfb91d34ad86feaa849819ab71ab675434c285122b532f8e8378f3119a5e78ff62fab86c97897fd7120f929d4b2f124da08f579c5c724d4b7c1e0b72b83dd0b01bb4e086c5081924bd3419c8377d59a6421073cb2c6c7289fb25f68592cf5f304fd626efd3693f5c2166fd357617988f48e4574d4aee106b71956f0b2c3ec8d61bc', 420],
                    [-443, '-58dabb2aa0c789721e41d036559a8c6f395818dc26804898b15992e4b359c14c8450a0d282c6a27025c1d08fe2e82ad4c0a860e9965602a25f43a96780e24abd04ad86f144478c63fa990200c56d560a277a003ffdf732ee6891bd5e033508e1526d077b5a6641aec9587ba6b91f5724cd9b81e5d6ceaab6558d82f60d6d2a3e62150ce007766b8e2ec34e90ebb472cf5f2012ea9b9ebf13d63c50c6a4770', 420],
                    [-445, '3495036c79c816ad62e599fda444a117925e3fe53aaf9b56692599c6478f670ed3e3c44475f1a211bb28ddbdaf9c0cfeefec32024386b1a28df36d379ac4d6a9e132372b5a66d05d92629d2b8dab1af820c2f215d9bc83d3984e8b23135371dde9b26c176721fdb00345b42bc4e5e3a47eebe5fe6c1dcd51a3f6cacee277a8e34ff53553a748d4fcdbd4a45b2c610db4d0289ef5d04dca342c7afa7069f6e', 420],
                    [-448, '-1120eaa8efceb9ec013c4e4f249166c6a5e3b22edbddce2b256b2c4b28427c15ef3d3233e503d2b2c66453dc6697838803fd084d256bbdc609c3fbd2c0f4c759f50c4b6f88655897a0971bf8170bc9159fda0a2a82220632a73b6d66285df1eb05bd494f4639f54940c5395504f2d8f72809f5639049411c2129804a4033e036f85ce3061f8e513db2166380e542c338c9331b7ad01116c5bd25a30cd57348', 420],
                    [-450, '7d26fc8b461089aafe60dba665e44cec2a99c6ab9d041b784ec2fc3bebbb13629d1a52f063ab39a788758befd0e16fcccf3084b7c72ef4d47f853f51a54495effe554e515c2a2c7286a06d134943810fea5c4105c469c3574b6621e59ea96086819ea36b45feca7ee1b32878eda36d8cb66135d7e192dc129938f0c55c2137758025e283279566a07d8f47a07ba4a6f504e18749b1b29edbcae27dfb8a4d9', 420],
                    [-453, '-1f1fb9aefb028877686bcc8b1d57933eb372680c74640b54b82acb4422c8bd29235490532b06f6fdabcc2894004423d0aa325cd0e987124e0c30559765c59dd9b86fe1b9aea963fc41e416375212786ff00a3958d34f4988e0bdfb8a6fd28be5ab192fdcadde523398874b31c598f789aa7b9e25746dac0d6d213111ac04b4b22efc3fc8a95a718325c79db881b4e5ff2a67ed75d8464269c7da18504ac64f', 420],
                    [-455, 'ab9f073693241203babf40daf5c37bd4db527085ac62aea7f5f7637122546a07d6a006161f00a394758e45f5a5cc5e6f5859b1bf0386e145717bad6309926e672bb7d610b484f7254c569e10aed001f5c9fab2f524f09026aaf1c295d5a41153e4c918a813d4f093a16c5a0171bc1691d3be5b497d8b3524a473a8839a1e319f6df4e637c12475d759c8f18ab3df5b055ac37f37264cda12461b5b49c308a', 420],
                    [-457, '-32e63501f36485132b4135baea2bcd3eb098d1d2a4c57f90e54e70b87067bf953e539e7edc8479b8baf7863708ed85340218e24f4ba691a568db992440cd1db94c41b1df8e9ad99c8d6685e53fe534843f38c5e2b99d86606cb7c74733ea4431de9c3c6cf9d42f5d9c16d627dc6527e810e29868476a078f9d1949b407eaf74d4f2b8a48eb43479da0a5637ffc13420d142e2155f6d7f4e6921f1403364a5', 420],
                    [-460, '810216ce1bc83330bb1a721e72fc798c29523f5cbc5e1d9198a54d8d1fff8029efc316c5641e5a177f00d07ab1703bbafb7c7984abe5aa1adfd4d2b550859a56b0cd88b311c8c5b13dedea417382d3639541ece4e245fe93fc5b0cf759c25eb276c9d24a94ebf484355002340cf767ef553e00eccfbe21ec38e5b93cb7001bfe5a07d7d8e86d661bdac52327b953dd654a01989946dd22e8389eeacc001a8', 420],
                    [-463, '-11559078ad168cd5e78a89e383274b86728b893acf35c55a9d16d4dd4d097a84806ff1979d78b8b6d9631c7bfe798f67c7bce456fb18a18a6b39f1fb3ecb4f2f52acc79c15204644e572e6e05cd7ac9591cd2eca2ab6e57340e63af719314b9e362b81c2945f75e6c6a9389219cb370e1fba9ef6737291630f86bcb589389ca854269c80f5b1d53d8f9dbf3c15fe067d9af89ed7367dd7e9b512f134eea4d4', 420],
                    [-466, '1f5a5573ff2c71e7ed26c0e6a2ddd0c844b9aea3c2e74c62d5b0804b5d692fadfe688197d01f6f94a3cd30bba9479db01be04ff42d82d5c460eccc16f3f538756df1bf23d232f728465881709f4b901de69bfd0c0a723452ff89a5b08c48345e5f7cc94cd3a2673fad78727a7994c3928c9bc794b26e2139153d271f71bb7129e87eabeb7dceaa0606dea48f1da07129f44aea0fce6e4448695c6e53b91585', 420],
                    [-468, '-4baa3014fc9038bd31d75576ace12270a656a42c6a7d0f09c9873e1d79dd0bb3a3bb3e4c071e42dc54f7871d32d9a2fff91e8ad3678d52c756e08220dbe01ec9c21c3d9ede02aa9bc15745cbf471d2f4efbf5f1b81990246162e9a5289d62f1dd8587ca16aa7528d4c8cb77cc3cf276e6e661d65426fa28efb15fda6df2a94ff4f1a76ca253699d7d21726788b3d86e2f74575f1e13674249f6ff87ed1051', 420],
                    [-471, '5e42de4b94ec901945edea189d723a544333f9b6223d6596ceba9737c885a43139ea78ea4251a6043eae3cbebea8cf7678f30ad921516f2fe30b2a2c20547e0d7076c88dacb6b29b073e8af24a3e23675879640a8b777719b060deef51fd0fee5368fd101f7d6b142f3ded58584790633a738c1015377efba1544241c743f2d64bf4c499a04590b5fad223a3c614871b4b124cf8152339dd4ca5f88c40cb9', 420],
                    [-474, '-5ff92bb8d34c52da513ac474f01af74379ed190dd673649b350917d06dceb83dd6a664b67575cc5e3ca2303c6e817eab04dd08eae131aea4cb7324b66f00c678ab16d8f7bc4d091df5ce5556adfa43518f3687710d68c2d5878499374a37249dcdd576618be25382263cd9d30570f6161d7631aba4c6750a636e1d8a0d913f27b85d0236ba065a37b06fb8d5d80c7c5b386a2dd804f53a52e2453de2d464d', 420],
                    [-477, '4ef32b163bb520ffa4fb4ced9c43ca631e235fea91c0ecf21f94036f099310f23b18dbcc6d6117385b721267835c2c026e614942445e2dee2486d719bfb6596e9516664fa8860cf4a7ff3ce94fa944b0fcaff01abbc20ed896263537c5904d2b1cd06edbbbd5fade6cfe543956548810ab579d544de991765a4a5115e62866363e21fd7913eb2b29f3ac70377eca2e37fa80a27f8d3462d2959a53c889a9b', 420],
                    [-480, '-33d09135f99188cf88e6f938cbb3a5efc9b06672d112f2f8ea420759b12f4dae549b43d71324778dcc417c2b5b2f5666c4bf710fe24e2f98ff7aa821fc030867c8beb475d46c09b419cd394fccb246666f48b96ab641dddc943e90a91eddf0d08c185b3f9d0a7a2cc61abe27687198c65e524d89b452cbe80166009026ea4f2b8f3bbb43a2621904941a40c6137dba5652c303b3d3e9a61e1202f24290a11', 420],
                    [-484, '10b8f08ddd00efb1545ddfed6bd4b39a6f995e46dd170704216586ce462c83e9ca9114246c1dcb99d8b5d0174286ab6c25b55507b4232f34bf323d7f8ae855dfaa71e9046dcd8a976e1b8f0379f99645f57547c14ad3ba38a01a7a0534e38007a46f523a2e4292e52edc9949ebc7aabe09a685d15d2d4d5e6f157acfa135c1f645923c9d1d7cc5f37af18e808d88caa65c48f0590bece80c775a77444de2ad', 420],
                    [-487, '-6b0c765ea99ed37779d21de8deb049dd0dfc4634fb678de93ec5dcdfc15df54e476f397fd5f58fb9976fd3fb27e791c099e59dbd534daa9ff5d4a366ee817611295cbf22bc4d26721bd0214828ed908fab371713bcbf7b7dc4790be54afee5d876c74d7940b1f10ffbf1979742c0350ea7ac6425091ec0d886c52548fe7dc599398fe45320aeb03bf746ed5be61882cf2fcef8cfb597483c5faed7b7cbaa3', 420],
                    [-490, '209ff170bed190887658a2b6d86d8f8ee2d391eec3b822acf73fea4cc24865e9f2640e493c95a6f9005608114e49d5badc9240d6fe27ed5f312a12e926fe910a8d4cef005ca09008aad4e048ae4c8c5dab2d7460ad7b4e8e4ed906525041808ca23d17d8aad0ef9ff64e330b404255f6b8d81d6cdf2bdee3e599f31b2fe9cf70aecb52c14212bb61fa78a62c74b12a135fca4f00afce7a0de76001eb7a23e', 420],
                    [-494, '-4a514ff164956b370667517d664451d88458497a151d15eda18e6c08457dc9e61059c2a3fb9d63a73690f8929d66005828bc60e3093cca0a18115cabec845a5b2c04ab8cddc014beb0f9cdb17752ce445e3a5b02d7b2263d87b59b314561411c0c3fafabfa1ca41dfa414046a8e867a29452f7570004ea0e3184956361fcd0828b8471830de6921c11b15f90790e2a4449aef7ef1f25df200daf1fdef8b03', 420],
                    [-498, '7be2d6c7378bdbd6cfb7f7034a551bf7909f71f9ce694099597be2fbf5f4ee57e68305d7b24e7dc81c1d6d4f8ac9f48b6cac01e1440f2f754a4777a485c3e94acc10f8b7e8612a90a62e5fb64eeb910fe9fd51802b07e822bdbdbaefc41fa7c62969ba4761b10aaefc2043545fcd872ce17645208f54fbd49058ccf2357c9ce062772a904576fab100a222c18ef0ae57b9596f4252ae8836febfda45e5ce4', 420],
                    [-502, '-9394259951face3f1d0f71e8fbddbfb22d03839acfd91617af88aa9b085d17b228b6d517881792a0833546b3064cf03621b6edacb8e24508b847fd4889288014ad370c1ebba66fd3bb186311284904a5cc732d70fe50ec89ef594b1299f216966c7c66c3dd2964d6694dac97556deabce141b24ba6260237c1026fcb006c0d71e7bd8177845a19e7c8efbb9efa271bc8f10e1527e453cd9c865b7af552e64', 420],
                    [-506, '7a4f5396b92eb6545f2894f80ada2dc43647e209382c512e5911a840c0878b776c1ab9e4f16f15b22abf0e21ecd9a5c9eeb9f93a1bbc896475e926189f5d6c21f1b3c37511981e9b22152ec11cfa0f679e227a39ba5d9312cef44d10fe16dc83e2d328304ba5592dda4083e61a58a21518c90bda9be3c158cc4efb53a57c31270b7d97295791fbed497c769c2c2cb5324048d2d4f9352ce8a88e8a4a84ad8', 420],
                    [-510, '-446a18b70f85639a031ece14a8483f436bab0da91d3a22a9a5ccb1bb0186f846ef14f2b60f434aedd7d40a2cd49e45a84e56fe12f9dc89b0ff7b194ce113e6932db58b6352987e98e4b734f7e54d6c848918040fddaa032dba7a42dd225f20615dbef8df0df32dd7e595c1969f76c99729a06abda7f996dd40193982bd1f281fe32d568c5711549663b4fcf8cee2cd2904026b4ec85e51f5e3fd7ac936990', 420],
                    [-515, 'f97c8344092f8714f8ffae6b0343c58e983e83bbb67d6994c8d5e6d8347b2c408e653b5574e98ba845272a25067ce6d2e89242c52084f0e3b0cbf206b05d646abe5650b5fe5b0085033af3cc79e0866d52edff54f5941ae666e7a1a88e3f6a7619c2d31fad98fd6ead601e670cd61ab8090d7e8a649d2d52e76f4dade16b4c0927a7b93e5940a7806aa102e0192f25d931b5d68d571b6959ccc9dc38476de', 420],
                    [-519, '-39012df21aec5322db229dac0110f4e05610c0fc66f406f1f06b8db2a52bdc6f3fcee0b0080d5f0cb08dcc60043a9831d41ec16a10d7b7bf88797b0c52ae7d3bf639ea6e5059106f5e95095ab2363563303d31cec20da7b7c02ce2680ea91358fb05db0d31c2185099817d13551217f17129aa18e19efd7f60b85af0d533b4d0b37c6c98a1afa941e8c5d29119b32d1ec0ae21e0996ca87e9126ba2dab2d2', 420],
                    [-524, '4df319ad7ec18b54b36db791c2870f23ae27e0bd25c52c1043758b73eb38b9c0600fb84bcbbda475db595dae57c617ac70e517aaa79e0c507a166216d725a03185ae00c0d2815e2da7c0d81b9219896f39fd697e3021fcedbd0564e24e90987e79a93c4fdcaafe883d4dbdf8d89c6d8955d9b301f8033c8276a1aadd91aefa4bf09840775fc7e5ab989f07196c9feed13b7a18e9c6e7d2a7f1597f20b2b7a', 420],
                    [-529, '-3c7978f9fb8f7a2c5331bbbf4250b714fb8df7b89abf7951fc76e0343ceff9d16c9ed96038339276f63595fb949da8dbbc3fd406d1ca6214f493b3906bd9bc64eccfc023ad3a04b742b343778f90b0d53062eaecc79da2ceea973684515b7ee0fe940947d28c705f4541a4aaaa965463ef4301d63fffd75511632fac6f8aa09a3c0cef733a76b67b39a4e30097740fadc573c8aecfe39c1f143f91d895980', 420],
                    [-535, 'fa04ff65ff3a204015cf2b5dbd2d0cea325901f7ec7c071b551ffde0509465cb282ccd95cd0d2ec612ed680c34b1616d4911b1b84b2d8e1a3bcc92c601c7f532c60d9d73771a8ac2aa111317acdbb745f178b633da9e7948204a3323d2d1dea1b9f9487bf480f370022ada4f8421d4adf1c6c4d9f769c5b5f8c4162d87d2acec0be4bda99742258eb028da57fd12b4abf46869720ab52a4a4213ba11045ca', 420],
                    [-540, '-332492397516e27681962327a6519e859df2a31434b2f5a2b34fa10302b5ee25adc8436ab4119f9968b96951b997ed3bbc3a53fcf40bb1eaa9d1efb0b7f222dc5d99930fe8a19bde048fcdac9d830ae345859ca4364936f5af29583da6cc99865c86a10ed558a6f6bf38ef27022d3114019025f95d703def140810db862b2987dcc5c3134bef0785089936ca483572f838a2fd492575166774c11658de6d4', 420],
                    [-547, '1d99bb95dd4f91aa0ffe23dd72134748db577a2a075e29abb367fa41eceadb2de930e10de0c6f90b2332d4d7a92ac27f3dbd3fb1cd0f2bcea1fcfae6432660758827c38d834fe08496deb62759777e8c68cb1361fe77f3d7774ce3c3108a19892a4c50093c273318d6677b7767a451bc8bef199857e5af288472de17b752bb55350194b77e770063769c6e752902352c4b13244214917cfe1b4898db4b47a4', 420],
                    [-553, '-b24b204b1ac00c3ecb7498d7c753efa1c76e92395194e2e2cced675a5f56946e5a6df21f4ace8146f6b57e4efb19bb6d58cb0e07517d547fd1512f65365d3b4b7670b74691ee1c0981b9383600464a1c65ba1904e8da79e64a41d8e0c0721526982d08e548160d547f9c9e50fd5f897dc2bedcee26c6ff06787372363f09265167d51fe14f9190a337b46a00f21111df4fa8e8c65090b4a3ef42612f1c465', 420],
                    [-558, '2640b01988fe9cf4be539aed6859e54519d0e861b60122933af6f162d91f3ad800d5acf37df1092cf1382c3ad083c6be3f4ee74d581e5ca1bd849d7a77631b17a525b67b08ee46d27c8aad0dac88c0dbe22b7fcebeb7d93f354e44544e5254378c00cab48d186e1a2d0b194b7eb44a3499a1042d1012eb56dcf33b89f398e82b9578176dcc9defa3547ee87277f047927c67414c40933e5fe45207f4e293', 420],
                    [-567, '-60d7aa573a8a10d5093e9031dc52e7c8463a076bad3b1da782b125f7a4070cac26febcae14508340ee9d18a526c57eb392a10918da21724eb3d51296c63eeb4321c46037aa4d6fa706e1675949582cb92b4136e0dfccf5b1f4014085386d05b269f660adc75f5b62fc96b080be949d1e0f1ff039cb05600d55aa2d855065f7eb99754e2daa747d1feb8663b9145f32063588021eb21ce98f95178cbb77200', 420],
                    [-575, '601eda8b8f74dc58ccaa50e0a786e3b0d20ca1c6a8d84fb967424617a792b9a357a917fecac9ea378d25f68b8f57166712172fa20368655df10f9e3f4381281cef409d2b0ddc1b1a6ca3969db270fa1129665af22837bc73685e7a4fa615f1e67c763683fa120ee313331a94114b4c42f510e877598813605264fff56fff8d05bd82adcc55f1d10e307dccb260e8c0c5e8f248658620c0b61b6d98635e707', 420],
                    [-584, '-b2308a8b9477a62b35f199a313d794974998bb9222324c85f4421ac745149c55e67c524fe65899a0286a398d0d4fd85c92e8cd98bfbb4e8523b8102dc38062aa30a4f4645eb6ccde0cb30caf9f107cbad89b812db489c6cc95f76420e21b6a9422d420b9b3adfbac1675c70117111e9b53e6f6c9701352d7359e0190b2d2acc7423ecc335df4ff8e2226acd0828a8167b1fa52aaddca9001f01dc2a73b8ee', 420]
                ]
            }
        };

        /**
         * @static
         * @returns {Object} 包含基础数学常数（如 e, pi）和复杂算法系数（如 lanczos）的集合。
         * @description 获取高精度常数对象集合。
         * 每个常量都以 BigNumber 的内部格式 `[power, mantissa, accuracy]` 返回。
         */
        static get constants() {
            // 若已完成初始化，直接返回单例，不再重复挂载 Getter
            if (this._constantsCache) {
                return this._constantsCache;
            }

            const target = {};

            /**
             * 核心解析器：将 16 进制原始元组解析为原生的 BigInt 数据元组。
             * @param {Array<Number|String>} rawTuple - 原始数据元组 [指数, 16进制字符串, 精度]
             * @returns {Array<Number|BigInt>} 结构为 [Number, BigInt, Number] 的原生数组
             */
            const parseTuple = (rawTuple) => {
                const hexStr = rawTuple[1];
                let bigIntValue;

                // 检查是否为负数
                if (hexStr[0] === '-') {
                    // 去掉负号，加上 0x 前缀，解析为 BigInt 后再取负
                    bigIntValue = -BigInt('0x' + hexStr.slice(1));
                } else {
                    // 正数直接加上 0x 前缀解析
                    bigIntValue = BigInt('0x' + hexStr);
                }

                return [rawTuple[0], bigIntValue, rawTuple[2]];
            };

            // 遍历原始字典，为每个顶层属性（e, pi, lanczos_n...）劫持并挂载 Getter
            for (const key of Object.keys(this._rawConstants)) {
                Object.defineProperty(target, key, {
                    /**
                     * 顶层属性的自覆盖 Getter。
                     * 仅在代码首次访问该属性（如 BigMath.constants.e）时触发。
                     */
                    get: () => {
                        const raw = this._rawConstants[key];
                        let val;

                        // 判断当前处理的是 Lanczos 复杂对象，还是普通的基础常数元组
                        if (raw.p && Array.isArray(raw.p)) {

                            // 初始化 Lanczos 结构壳子，保留静态属性 acc
                            const lanczosObj = {acc: raw.acc};

                            // 1. 劫持 Lanczos 对象的 g 属性
                            Object.defineProperty(lanczosObj, 'g', {
                                get: () => {
                                    // 首次访问时执行字符串转换
                                    const gVal = parseTuple(raw.g);

                                    // 【自覆盖法】：将 g 属性重写为纯静态值
                                    Object.defineProperty(lanczosObj, 'g', {
                                        value: gVal,
                                        writable: false,      // 防篡改保护 
                                        configurable: false,  // 防止被再次 defineProperty
                                        enumerable: true
                                    });
                                    return gVal;
                                },
                                configurable: true, // 必须为 true，以允许在上面执行自覆盖
                                enumerable: true
                            });

                            // 2. 劫持 Lanczos 对象的 p 属性（系数数组）
                            Object.defineProperty(lanczosObj, 'p', {
                                get: () => {
                                    // 首次访问时，利用 map 瞬间将所有 16 进制字符串转为 BigInt 元组。
                                    // 这样生成的数组在 V8 中是内存连续的 HOLEY_ELEMENTS，速度最快。
                                    const pArray = raw.p.map(parseTuple);

                                    // 【自覆盖法】：将 p 属性重写为原生的纯静态数组
                                    Object.defineProperty(lanczosObj, 'p', {
                                        value: pArray,
                                        writable: false,
                                        configurable: false,
                                        enumerable: true
                                    });
                                    return pArray;
                                },
                                configurable: true,
                                enumerable: true
                            });

                            val = lanczosObj;
                        } else {
                            // 基础常数 (如 e, pi)，直接一次性解析为原生元组
                            val = parseTuple(raw);
                        }

                        // 3. 顶层属性的【自覆盖法】
                        // 将 target[key] 的 Getter 彻底替换为已经计算好的 val
                        Object.defineProperty(target, key, {
                            value: val,
                            writable: false,
                            configurable: false,
                            enumerable: true
                        });

                        return val;
                    },
                    configurable: true, // 允许顶层属性自覆盖
                    enumerable: true
                });
            }

            // 保存组装好 Getter 的目标对象至缓存
            this._constantsCache = target;
            return this._constantsCache;
        }

        /**
         * @constructor
         * @description CalcConfig 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 CalcConfig 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[CalcConfig] CalcConfig is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @type {string}
         * @description 存储复数转换为字符串时的默认打印模式。
         * 'algebra' 表示代数形式 (a+bi)，'polar' 表示极坐标形式 (r∠θ)。
         * 这是一个私有静态字段。
         */
        static _globalPrintMode = 'algebra';

        /**
         * @property {string} globalPrintMode
         * @description 获取或设置复数转换为字符串时的全局默认打印模式。
         * 此设置会影响 `ComplexNumber.prototype.toString` 的默认行为。
         * @type {('algebra'|'polar')}
         * @example
         * // 设置为极坐标模式
         * CalcConfig.globalPrintMode = 'polar';
         * // 获取当前模式
         * console.log(CalcConfig.globalPrintMode); // 'polar'
         */
        static get globalPrintMode() {
            return CalcConfig._globalPrintMode;
        }

        /**
         * @param {('algebra'|'polar'|undefined)} mode - 要设置的打印模式。
         * - `'algebra'`: 代数形式 (a + bi)。
         * - `'polar'`: 极坐标形式 (r∠θ)。
         * - 如果传入 `undefined`，则不会进行任何更改。
         * @throws {Error} 如果设置的值不是 'algebra'、'polar' 或 undefined 之一。
         */
        static set globalPrintMode(mode) {
            // 如果未提供模式，则不执行任何操作，保持当前设置。
            if (mode === undefined) {
                return;
            }
            // 验证输入值是否为支持的模式之一。
            if (!['algebra', 'polar'].includes(mode)) {
                throw new Error('[CalcConfig] Input error: Only supports "algebra" and "polar" modes.');
            }
            CalcConfig._globalPrintMode = mode;
            // 调用同步
            this._syncToWorker('setPrintMode', mode);
        }

        /**
         * @private
         * @static
         * @type {number}
         * @description 存储全局计算精度（有效数字位数）。
         * 这是一个私有静态字段，应通过 `globalCalcAccuracy` 的 getter 和 setter 进行访问和修改。
         */
        static _globalCalcAccuracy = 220;

        /**
         * @static
         * @property {number} globalCalcAccuracy
         * @description 获取或设置用于所有计算的全局默认精度（有效数字位数）。
         * 此精度值将作为所有新创建的 `BigNumber` 和 `ComplexNumber` 实例的默认计算精度，
         * 除非在构造时显式指定了其他精度。
         *
         * @type {number}
         *
         * @example
         * // 获取当前全局计算精度
         * const currentAccuracy = CalcConfig.globalCalcAccuracy;
         * console.log(currentAccuracy); // 220
         *
         * // 设置新的全局计算精度
         * CalcConfig.globalCalcAccuracy = 100;
         *
         * // 抛出错误，因为精度必须是1到220之间的整数
         * try {
         *   CalcConfig.globalCalcAccuracy = 300;
         * } catch (e) {
         *   console.error(e.message);
         * }
         */
        static get globalCalcAccuracy() {
            return CalcConfig._globalCalcAccuracy;
        }

        /**
         * @param {number|undefined} acc - 要设置的新精度值。
         * - 必须是 1 到 `_MAX_GLOBAL_CALC_ACCURACY` (220) 之间的整数。
         * - 如果传入 `undefined`，精度将被重置为最大允许值 `_MAX_GLOBAL_CALC_ACCURACY`。
         * @throws {Error} 如果输入值不是数字、不是整数或超出有效范围。
         */
        static set globalCalcAccuracy(acc) {
            let numericAcc;

            if (acc === undefined) {
                // 如果未提供精度值，则重置为最大允许的全局精度。
                // 这提供了一种方便的方式来恢复到最高精度设置。
                numericAcc = CalcConfig.MAX_GLOBAL_CALC_ACCURACY;
            } else {
                // 如果提供了精度值，则对其进行严格的验证。
                numericAcc = Number(acc);

                // 验证第一步：确保输入值可以转换为一个数字。
                if (Number.isNaN(numericAcc)) {
                    throw new Error('[CalcConfig] Input error: Accuracy must be a number');
                }

                // 验证第二步：确保精度值是整数。
                if (!Number.isInteger(numericAcc)) {
                    throw new Error('[CalcConfig] Input error: Accuracy must be an integer.');
                }

                // 验证第三步：确保精度值在允许的范围内（1 到 CalcConfig._maxGlobalAccuracy）。
                // 精度过高可能导致性能问题或超出浮点数表示范围，过低则无意义。
                if (numericAcc > CalcConfig.MAX_GLOBAL_CALC_ACCURACY || numericAcc <= 0) {
                    throw new Error(`[CalcConfig] Range error: Accuracy must be between 1 and ${CalcConfig.MAX_GLOBAL_CALC_ACCURACY}.`);
                }
            }

            // 所有验证通过后，更新全局计算精度。
            CalcConfig._globalCalcAccuracy = numericAcc;

            // 如果当前 outputAccuracy 是绝对值且超过了新的计算精度，则进行修正
            if (CalcConfig._outputAccuracy > 1 && CalcConfig._outputAccuracy > numericAcc) {
                CalcConfig._outputAccuracy = numericAcc;
            }

            // 调用同步
            this._syncToWorker('setCalcAccuracy', acc);
        }

        /**
         * @private
         * @static
         * @type {number}
         * @description 存储用于格式化输出的全局默认精度。
         * 这是一个私有静态字段，应通过 `outputAccuracy` 的 getter 和 setter 进行访问和修改。
         */
        static _outputAccuracy = 0.9;

        /**
         * @static
         * @property {number} outputAccuracy
         * @description 获取用于格式化输出的全局默认精度。
         * 此设置会影响 `Public.idealizationToString` 等函数的默认行为，
         * 它与 `globalCalcAccuracy`（内部计算精度）是分开的。
         * @type {number}
         */
        static get outputAccuracy() {
            // 直接返回私有静态属性 _outputAccuracy 的值。
            return CalcConfig._outputAccuracy;
        }

        /**
         * @param {number|undefined} acc - 要设置的新输出精度。
         * - **比例模式**: 如果 `acc` 是一个 (0, 1) 之间的浮点数，它将被解释为相对于 `globalCalcAccuracy` 的比例。例如，如果 `globalCalcAccuracy` 是 100，`acc` 是 0.9，则实际输出精度将是 90 位。
         * - **绝对模式**: 如果 `acc` 是一个大于等于 1 的整数，它将直接被用作输出的有效数字位数。
         * - **重置**: 如果 `acc` 为 `undefined`，输出精度将被重置为当前的 `globalCalcAccuracy` 值。
         * @throws {Error} 如果输入值无效（非数字、超出范围等），则抛出错误。
         */
        static set outputAccuracy(acc) {
            let numericAcc;

            if (acc === undefined) {
                // 如果未提供精度值，则重置为当前的全局计算精度。
                numericAcc = CalcConfig.globalCalcAccuracy;
            } else {
                // 如果提供了精度值，则对其进行严格的验证。
                numericAcc = Number(acc);

                // 验证 1：确保输入是数字。
                if (Number.isNaN(numericAcc)) {
                    throw new Error('[CalcConfig] Input error: Accuracy must be a number.');
                }

                // 验证 2：如果精度值大于 1（绝对模式），则必须是整数。
                if (numericAcc > 1 && !Number.isInteger(numericAcc)) {
                    throw new Error('[CalcConfig] Input error: Accuracy must be an integer when greater than 1.');
                }

                // 验证 3：确保精度值在有效范围内 (0, globalCalcAccuracy]。
                if (numericAcc > CalcConfig.globalCalcAccuracy || numericAcc <= 0) {
                    throw new Error(`[CalcConfig] Range error: Accuracy must be between 0 (exclusive) and ${CalcConfig.globalCalcAccuracy} (inclusive).`);
                }
            }

            // 所有验证通过后，更新输出精度。
            CalcConfig._outputAccuracy = numericAcc;
            // 调用同步
            this._syncToWorker('setOutputAccuracy', this._outputAccuracy);
        }

        /**
         * @private
         * @static
         * @method _syncToWorker
         * @description 将主线程的配置变更单向同步到 Web Worker 中。
         * 此方法充当主线程配置 (`CalcConfig`) 与后台计算引擎 (`WorkerTools`) 之间的桥梁。
         *
         * 它包含关键的环境检查逻辑：
         * 1. **环境隔离**：通过检查 `window` 对象，确保同步仅在主线程发起，防止 Worker 接收到配置后再次尝试同步给自己，从而导致死循环。
         * 2. **依赖安全**：检查 `WorkerTools` 是否存在及其状态 (`isReady`)，防止在 Worker 未初始化或已销毁时调用导致程序崩溃。
         * 3. **错误处理**：捕获异步通信中的 Promise 异常并打印日志，避免阻断主线程的同步赋值逻辑。
         *
         * @param {string} methodName - 要调用的 `WorkerTools` 中的静态方法名 (例如 'setCalcAccuracy', 'setPrintMode')。
         * @param {number|string} value - 需要传递给 Worker 的新配置值。
         * @returns {void}
         */
        static _syncToWorker(methodName, value) {
            // 1. 环境判断：只在主线程执行
            if (typeof window === 'undefined') {
                return;
            }

            // 2. 依赖判断：WorkerTools 必须存在
            if (typeof WorkerTools === 'undefined') {
                return;
            }

            // 3. 状态判断：使用公开接口检查 Worker 是否存活
            // 修正了直接访问 _mathWorker 的问题
            if (WorkerTools.isReady) {
                WorkerTools[methodName](value);
            }
        }
    }

    // 导出对象
    window.TokenConfig = TokenConfig;
    window.Public = Public;
    window.CalcConfig = CalcConfig;
})();