(function () {
    "use strict";

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
            /**
             * @private
             * @function complement
             * @description (内部辅助函数) 计算两个数组的差集 (A \ B)，返回所有在数组 A 中但不在数组 B 中的元素。
             * @param {Array<*>} arrA - 源数组（集合 A）。
             * @param {Array<*>} arrB - 要从中减去的元素的数组（集合 B）。
             * @returns {Array<*>} 一个新的数组，包含差集中的所有元素。
             */
            function complement(arrA, arrB) {
                const setB = new Set(arrB);
                return arrA.filter(item => !setB.has(item));
            }

            /**
             * @private
             * @function getOrder
             * @description (内部辅助函数) 确定一个运算符的优先级。
             * 这是调度场算法（Shunting-yard algorithm）的核心部分，用于正确处理运算顺序。
             * 数值越小，优先级越高。
             * @param {string} token - 需要确定优先级的运算符词法单元。
             * @returns {number} 一个代表优先级的数字（0 为最高），如果该词法单元不是带优先级的运算符，则返回 `Infinity`。
             */
            function getOrder(token) {
                // 定义了从高到低的优先级层次。
                // l0: 函数调用
                // l1: 后缀运算符 (如阶乘)
                // ...
                // l7: 加法和减法
                const levels = {
                    l0: [...func_01_2, ...complement(func_01_1, ['N'])], // 除正号、负号外的一元、二元前缀函数，如 log, sin 等
                    l1: func_10_1, // 一元后缀函数，如 !
                    l2: ['^'], // 幂运算
                    l3: ['N'], // （正号）、负号
                    l4: ['&'], // 省略乘法符号的乘法
                    l5: complement(func_11_2, ['+', '-', '*', '&', '/', 'mod', '^']), // 除四则运算、取余运算外还未计算的二元中缀函数
                    l6: ['*', '/', 'mod'], // 乘、除、模
                    l7: ['+', '-'] // 加、减
                };
                // 获取枚举属性组成的数组
                const keys = Object.keys(levels);
                for (let i = 0; i < keys.length; i++) {
                    if (levels[keys[i]].includes(token)) {
                        return i;
                    }
                }
                return Infinity; // 不是具有优先级的运算符（例如，数字或括号）。
            }

            if (!token && token !== '') {
                return;
            }

            // --- 开始：常量定义 --- //
            // 这些数组定义了解析器可以识别的各种函数、运算符和符号。

            // 接受两个参数的函数（例如 log(base, number)）
            const
                func_01_2 = ['log', 'nroot'],
                // 放置在两个操作数之间的二元运算符（例如 a + b）
                // '&' 是内部表示的隐式乘法。
                func_11_2 = ['+', '-', '*', '&', '/', 'mod', '^', 'E', '[toPolar]'],
                // 接受一个参数的函数（例如 sin(x)）
                // 'N' (一元负号) 和 'A' (绝对值) 是内部表示。
                func_01_1 = ['sqrt', 'cbrt', 'ln', 'exp', 'lg', 'f', 'g', 're', 'im', 'conj', 'ceil', 'floor', 'arg', 'sgn', '[gamma]', 'sin', 'arcsin', 'cos', 'arccos', 'tan', 'arctan', 'sh', 'arsh', 'ch', 'arch', 'th', 'arth', 'abs', 'A', 'N'],
                // 放置在操作数之后的一元运算符（例如 5!）
                func_10_1 = ['!', '[degree]'],
                // 内部使用的私有函数/运算符，不应直接由用户输入。
                func_private = ['A', 'N', '&'],
                // 在 HTML 只占用一个类名的函数。
                func_htmlClass_len_one = ['[gamma]', '[toPolar]', '[degree]', '[cursor]', '[cdot]'];

            // 将所有函数和运算符合并到一个列表中，以便于查找。
            const allFunc = [...func_01_2, ...func_11_2, ...func_01_1, ...func_10_1];
            // 右结合运算符
            const rightAssociativeFunc = [...func_01_1, '^'];
            // 需要特殊括号处理的函数和运算符
            // 稍后用于添加临时标记以插入括号。
            const signsNeedKh = ['^', ...complement(func_01_1, ['A', 'N'])];

            // 定义数字常量和变量 'x'。
            const
                baseNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.'],
                codeNumbers = ['[pi]', '[e]', '[i]', '[x]'];
            const allNumbers = [...baseNumbers, ...codeNumbers];

            // 其他有效符号。
            const other = ['|', ',', '(', ')'];

            // 所有有效词法单元的完整列表
            const allSigns = [...allFunc, ...allNumbers, ...other];

            // --- 结束：常量定义 --- //

            // --- 逻辑判断与属性分配 ---
            const result = {token: token};

            // 标记是否为在 HTML 只占用一个类名的函数。
            result.isHtmlClassLenOne = func_htmlClass_len_one.includes(token);

            // 检查 token 是否合法
            if (!allSigns.includes(token) && !baseNumbers.includes(token[0])) {
                result.class = 'illegal';
                return result;
            }

            // 检查 token 是否为函数或运算符
            if (allFunc.includes(token)) {
                result.class = 'func';
                // 根据 token 所在的列表确定其参数数量
                if ([...func_01_1, ...func_10_1].includes(token)) {
                    result.parameters = 1;
                } else if ([...func_01_2, ...func_11_2].includes(token)) {
                    result.parameters = 2;
                }
                // 确定函数/运算符的位置
                if ([...func_01_2, ...func_01_1].includes(token)) {
                    result.funcPlace = 'front';
                } else if (func_11_2.includes(token)) {
                    result.funcPlace = 'middle';
                } else if (func_10_1.includes(token)) {
                    result.funcPlace = 'back';
                }
                // 确定结合性
                if (rightAssociativeFunc.includes(token)) {
                    result.associativity = 'right';
                } else {
                    result.associativity = 'left';
                }
                // 标记是否需要特殊括号处理
                result.needKh = signsNeedKh.includes(token);
                // 标记是否为私有/内部 token
                result.isPrivate = func_private.includes(token);
            }
            // 检查 token 是否为数字或变量
            else if (codeNumbers.includes(token) || baseNumbers.includes(token[0])) {
                result.class = 'number';
                // 进一步区分为基础数字或代码常量/变量
                if (codeNumbers.includes(token)) {
                    result.numClass = 'codeNumbers';
                } else {
                    result.numClass = 'baseNumber';
                }
            }
            // 检查 token 是否为其他合法符号（如括号、逗号）
            else if (other.includes(token)) {
                result.class = 'other';
            }

            // 获取并附加优先级信息
            result.priority = getOrder(token);
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
         * @readonly
         * @enum {object}
         * @description 定义一个包含高精度数学常量的集合。
         * 每个常量都以 BigNumber 的内部格式 `[power, mantissa, accuracy]` 存储。
         * 该对象已被冻结，以防止在运行时被意外修改。
         */
        static constants = Object.freeze({
            // 基本常数
            e: [-219, 2718281828459045235360287471352662497757247093699959574966967627724076630353547594571382178525166427427466391932003059921817413596629043572900334295260595630738132328627943490763233829880753195251019011573834187930702154n, 220],
            pi: [-219, 3141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647093844609550582231725359408128481117450284102701938521105559644622948954930381964428810975665933446n, 220],

            // 1/(2*pi) 和 2*pi，用于三角函数的周期性计算，具有更高的精度以减少累积误差。
            invTwoPi: [-440, 15915494309189533576888376337251436203445964574045644874766734405889679763422653509011380276625308595607284272675795803689291184611457865287796741073169983922923996693740907757307774639692530768871739289621739766169336239024172362901183238011422269975571594046189008690267395612048941093693784408552872309994644340024867234773945961089832309678307490616698646280469944865218788157478656696424103899587413934860998386809919996244287558517118n, 440],

            // ln(10)，用于对数函数的换底计算。
            ln_10: [-219, 2302585092994045684017991454684364207601101488628772976033327900967572609677352480235997205089598298341967784042286248633409525465082806756666287369098781689482907208325554680843799894826233198528393505308965377732628846n, 220],
            // ln(1.2)，用于 ln 函数的范围缩减算法，以加速泰勒级数收敛。
            ln_1_2: [-220, 1823215567939546262117180251545146331973893379144869839427264516567089274806459178493452037169711655300052070648129885763295192323639741784518560049386476449817107025145695567161878812659111083175957652385595296989949867n, 220],

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
                g: [-1, 215n, 100],
                p: [
                    [-53, 115281222487236795085904982334470370125985207n, 100],
                    [-44, 277947265944464522151435377734635407994971146n, 100],
                    [-43, -199573682368921464923844230218927845943161709n, 100],
                    [-43, 645829385876961431573583647905046562599963772n, 100],
                    [-42, -124529381420611917930445037294364627905522998n, 100],
                    [-42, 159398318585764758536183319714794496374039416n, 100],
                    [-42, -142843014928629917057974802744460819938197126n, 100],
                    [-43, 921184358342676191581228281464290332976000532n, 100],
                    [-43, -432833749549692867761711660188075006534070838n, 100],
                    [-43, 148420836516752694361699808008952073016743132n, 100],
                    [-44, -368689888044353928770082267392284565621547746n, 100],
                    [-45, 652781895913385552598176302042887133895368562n, 100],
                    [-46, -802523465868120729148561283981123931135408203n, 100],
                    [-47, 659194203953991414516120012360168168208177303n, 100],
                    [-48, -342341068873116391039674224255318108855751733n, 100],
                    [-49, 103810967961811470675749183275721921491413561n, 100],
                    [-51, -163410628488598773507529429634561972925005291n, 100],
                    [-53, 111308037678915954168968535687762289249572426n, 100],
                    [-56, -242564867967017629227972110700241450489072707n, 100],
                    [-60, 968175919935748348628165476698103493550619121n, 100],
                    [-64, -207132335878451935890862968789591119090505968n, 100]
                ]
            },
            lanczos_n40: {
                acc: 160,
                g: [-1, 425n, 160],
                p: [
                    [-109, 8741268357130299573881514017347615688263864664324767110311673609262202106418260505418639274n, 160],
                    [-92, 393076793123183214806255274217892501875543741975772714433774090770493753521044552078551237832n, 160],
                    [-91, -585779355984960502267768272470285695291895490703885975746574335905534403296462593746151564692n, 160],
                    [-90, 415320891813291710881501783935110759386566066740078527429385132432662053381360112763556400135n, 160],
                    [-89, -186442186530266044112728508915368183762453643010175682080437334749137500059878476543968905378n, 160],
                    [-88, 59496274814544705493268846981711041097803907871868105145956701285976404898315131947259777451n, 160],
                    [-88, -143650977591537679239515842709970980657458884014582369333178746419764051106691934697202561823n, 160],
                    [-87, 27272165654363957896861611682150745397565528988108324655064532352513556434868882757160401497n, 160],
                    [-88, -417706450429659751342757770060811589538735238901177514333881341646706380128518603223559105664n, 160],
                    [-88, 525469091097318170934710855884785045201183147780233325535919200913958626938167670788637461941n, 160],
                    [-88, -549948241735049351679665928868879200192281991046082147342183760699866784793424633300028478627n, 160],
                    [-88, 483303209839143403120156564200396934999696806374520301403219382632814254819450481248155946756n, 160],
                    [-88, -359018823304644528784955904574306911926946970340810194276345179850114622161506037454341595444n, 160],
                    [-87, 22646322939721892109667200627985936612754831031136279400216208095653835370062076659155560925n, 160],
                    [-87, -12165141071952807458537924288561347739249765292502293888919512436774196463114118525293408664n, 160],
                    [-89, 557330890452605054326094442256383139575379115933702936602931845713123649174748113569909204984n, 160],
                    [-89, -217808218997787438445543906762586863283784180191322141010308246485813119643322438964633861376n, 160],
                    [-90, 725406923558920376718611338699450124810810848992468728682604649851264627124159933656426972028n, 160],
                    [-90, -205460435014447888624614311475133662511873563407555367955896324098792643984166329006410224727n, 160],
                    [-91, 493308996965529977628295943439092809568209317144867949165823107130058614997185716437571060688n, 160],
                    [-92, -999667985553878220978508164572347378051516959458321289143366138113684762527907392643866505353n, 160],
                    [-92, 170021350285647372046408132735121122157777706050107197369594223603202593169661598071518463273n, 160],
                    [-93, -241012498118489937125025305503286688418424425876821069999003394431685917549793855021686877042n, 160],
                    [-94, 282346538124177277557697916591388724582804851811720043378127177692278560178603076187911078117n, 160],
                    [-95, -270579487100400165125132487960823521862622854081622911159119912864202691342856624213960329342n, 160],
                    [-96, 209534672803048247411842172913060700960932773742503157274414476914114490605992768037146645513n, 160],
                    [-97, -129208929328664526278404298426741939559490801099941479759227668972110478068364977400649275412n, 160],
                    [-99, 623385567188690055385602881008241377195351383486820404065096818630696543300090656694693224614n, 160],
                    [-100, -230371410153071006367154142236351220725366160613060444062537462550483519398114473968847605453n, 160],
                    [-102, 635499861557849391410054500689314308094756588598749761805746333578605297783852872358471108793n, 160],
                    [-103, -126795212739481756272320993874998733549442055815823688393199726946060921377611009746490672211n, 160],
                    [-104, 17594876850332814211285623953346438550298345087197772912774842216429289874714101069653287486n, 160],
                    [-107, -161648483174153048499962233976388218459482106218224935270281236380097613239231767659557727422n, 160],
                    [-110, 923118789962126265060403932517597655412428845892017938645023434432818610125507800375231553542n, 160],
                    [-112, -301698558748094876554278169205220993442175174491678080232481404157714911757871519775350452017n, 160],
                    [-115, 504987143536538622004857898515582141193924706938644536437184413770379405305415119935946310355n, 160],
                    [-118, -370931456292520317182750899509779800556475405450585571508404635931838696105352053544141153216n, 160],
                    [-120, 9555136606995488902640007105488586035178520801504941059343912482432878007535150018702032522n, 160],
                    [-126, -611779919560863605642739931322721144264264990979856866149125472917967410918042296664826363766n, 160],
                    [-131, 550112664259847150217231135964943287619390219867950538567084789864836872197253294451210291205n, 160],
                    [-137, -241030735332058346363725270853667216980041792728117893455077000233466662070521033055368889966n, 160]
                ]
            },
            lanczos_n82: {
                acc: 250,
                g: [-1, 865n, 250],
                p: [
                    [-226, 680169650420692275014171126724343516611340059381501422440595215930159259116674367861686580329920376977147537816680233287462357280948217227635096037235952853953513937660600768060517452107315n, 250],
                    [-188, 562473394399628822632317473189108823627675357169688316418540821569192932412460853103160787377563487133956482026085992266028525855272257733909301409452355004677468910559308780595605594270303n, 250],
                    [-186, -174858466656363094113430429204778273726488013251077094198016663522993235407841669529340609984458920558830453649516413135791899912872286256622521273514933349583797599878417525536469260861164n, 250],
                    [-184, 26541900375989396259420698587943219888099841534156419089839421792503901525651107200916457690789463303967653229699099110497020565423216415040612188274280310097871007895740083538213272791546n, 250],
                    [-184, -262175066160256972586936990639338513115143231551740176156524925432370840589419663782174798575850243095270256519035497096871571216324980927752793843585942428541689220160778076350308757987812n, 250],
                    [-183, 189507291879821645571598488517238081553666434140924627172522543133318054710268373289075218415935230287991564801648739561859698620625982543540051227640545449724405151266915575034280903978286n, 250],
                    [-182, -106872681765666301438737706988903972453326043434786618162916921562207246815591666837059227599869787233348916736411563331633129113449445616004427292499692561048936205710462957129577002310047n, 250],
                    [-182, 489596479884533060456843633105623739378773048983378557589025566727412393974255919089283862438467012910447253819576281365789914206495478597367635417806882067327717372169251403821840744737057n, 250],
                    [-181, -187311324128893279624409215442143417865385278233336301334778552080461527920672831534945224314245373966429649403054007275739607002522878946489963081915729881940270360167884011529368070076908n, 250],
                    [-181, 610633326752383645383852412575902763119623117771259087671703685229579635923565156365290832684165272617503382313302754561104463613093977644560762370946495400879423896539322587058405165456848n, 250],
                    [-179, -17222701643674225576103009318059576977992681527053301352769802311281628649699130606432649934271490683405814717378003425618148753377729545477589742823667264644243346161810979752833719730379n, 250],
                    [-180, 425292404085262070446064931236576442622336177006409662632206781551441009726135951794305771404413025857765026010401533414238186511522716569151315195139831487325228897090692044495273666320595n, 250],
                    [-180, -928244253010604307413473773039546370746078468941115588970915022404751198749103073900736246594816906429339333245128609091313324046990818891739818159633858668092472848485920518921003678781365n, 250],
                    [-179, 180458984349717312172335234203210042731574717629225302188726957764728273834732295790925579000652843529840154548801114801917566215579007687310975616982096243451721051545188246348699902920785n, 250],
                    [-179, -314487066541832059239361098370822836756745721219524040216856834038114414837809140251098881338304633885867893784613432145911072277258288935599914879578069509118597633897006270351784188535629n, 250],
                    [-179, 493904358434456983390090720862599224644054482955997710456582088874825309569599398495473348489295402784988024836424658765590056746210456514154797993623555100128643984098120080646567742083633n, 250],
                    [-179, -702166853857455053462799644861250227346898709485780634398953652898738390981760664587053525146728115894322571945526653612474213595471352875973768139168565439949001440383361414055851369998937n, 250],
                    [-179, 907066473436665105712807361942323804160071374991732504286523339058415096450507130374195541586506017126293326215289112578937864731229379900836242867286873549331512623589964613855434904193211n, 250],
                    [-178, -106816203839668387415671409119809324239652442130619321389617640955584023893883917725029750057857629971507657415285893275197264296916388020439832832020062259857471173478659363229672035115526n, 250],
                    [-178, 114980965097580910376266020358230381340901302609394988744163355153314058438079821193956159935797945623238159007565182281105337507913092807587246977013581621129296182173559566891551232233544n, 250],
                    [-178, -113402240316051685933423730245078727358353147377443213412301441535051498258983396462908051324563967377332026298204478707958609801722713686373694953204909116200070944718311853396341980212007n, 250],
                    [-178, 102680785590530819750603663276165439772670000694028667959436942789470355899857286682530383308528463510606294072849039103371136609719420169688567406832703082979601814154427948280439171257431n, 250],
                    [-179, -854991693188852377627598451089509175211086507874518154798701759635303398189105233097819315062818269299457194357274475775568887309474997030075779961387457895055450006243225091206996670158028n, 250],
                    [-179, 655627224964580712200745902906884362182699525822229745357888788929502114575054299444196819325122465247491480626950690290918132423849088346890582193738645902297223731914334210511520074918048n, 250],
                    [-178, -46354100602376672663449221405140421750644596341363375930164104226865902655101808500284627351518628496793566616351673669992383102031893601808582958481277819353923231863857745329334837960154n, 250],
                    [-179, 302465549348500589116331545133816969956402758581149945830050717149338420233768141006054488162613054313095358743963449057722103592652240240617746858749143107505740049598022298952265807164069n, 250],
                    [-179, -182287053658831974448238182715351748473384141428808213038876771310753058543571591029147383569974770003192006863951116833083306721636510511401021948048113279236059980238531107566336521569291n, 250],
                    [-178, 10152788470664369073240929662467350868695897398422482218466399104249225901056791417338294478688003254536086916977444467976457617491529920115941777874432100441741302953844643963036650150909n, 250],
                    [-178, -5228164897310085481440572161370423366303549730812928594647434666178522273651147643840810985072995714217159555765939391558549156876507395752315350007168918566459728737947272626163975944139n, 250],
                    [-180, 248979883844259652300747024335502037996092410928167496780635460036531076395522394396011319669189825846544043333923390007066005730226759385249920556291778140022002511351532787999992382892181n, 250],
                    [-180, -109668576406529980030709409317220875790134136375905770058980958171945787212601306847972548343476514770418687500503832311883020286022094027031309762408561891369943005605235491428423150052949n, 250],
                    [-181, 446779307574584543844014746091148524739581077108314270387709143353776883051485557903732160331582633079140467942633635111362545023595155336864829419674760022926126639438219014567858471790157n, 250],
                    [-181, -168316530453570742243112440768846224181134467524452836527679881617551696916939106075185140441159549412194555779210041592539518959069134387293221760523071167838370729712945415153512505653541n, 250],
                    [-182, 586212109241414494586699667020358678665324614867276066426047734351640842593880857062232990948654462484938276734830477527151195291272031895538749896850049344780425523841973762275178687699177n, 250],
                    [-182, -188664765841332967909782468135763648312939282469247397582848068386023054402647602545269106954326652115859505394859958108390981304370596931773010410084081761378130416076965513908952131092045n, 250],
                    [-183, 560778204459947608030848514172877570554483794766149477830736032684585326077769304546841368094505309042899721707649552340819547041612793516176695542441849147591527603918054807470127007091897n, 250],
                    [-182, -15383476610821955050816930951286203676652722055740065247831952664909883915668102586777892865578060235075006505163979430429612602758912765108130428455499745750183357253365658442184043551078n, 250],
                    [-184, 389153929108082863263656699361996446263435635474142981907340118645424683252114368946446204952958548197514707218217646764830599542526826106990932384401577933139150082601113081348841060288933n, 250],
                    [-185, -906928514212710159757366384445774048958582080227345395516216398821122756530468183797989210785990582659046100779883230998736948449048929347758190976606106273516039414978812211137048234350845n, 250],
                    [-185, 194504483157524171724116704594652085577582499961457356540907376051733339053386673417305732878723548626705296447885852818856612852988991543856689614009258808807228576778925064562968956969151n, 250],
                    [-185, -38339661700539731114172817582903470783000686669875028210693636461057417208643109926867852313193944858499708349128712073201286919643272630813753437556976606618516026817547151115017142646265n, 250],
                    [-187, 693618387981099440041349417469827665031469038506708272201877746880208906680942197156989620242106361561395344298322503618002417521357552845661983643009083945779670215523394583229848222775608n, 250],
                    [-187, -114992468739915601029445437682494836069564529884488297819326149410536022641287465983291029636024093253490962906958409416185614424278363804726810536244058075505433085399289010454274743617224n, 250],
                    [-188, 174399427322655708159375170274127153280456454444591532182466753692395172717870127520062801701814083990297978675884414426120714028526526811818618507831396184426473547053399324227739949880142n, 250],
                    [-189, -241502251544178826520930838625953864603809161903917382651391746250120923542337161018771030918832375782513335888368926139799193019866246614058889081511033984682698257525469115775508160004717n, 250],
                    [-190, 304712051195682729344853517434941315603964240744828994185159240566258683872666950967418898332695755256243688560719827775597953233897671600674225437377043612243516316724726437514178343799991n, 250],
                    [-191, -349506046127992690033299771795711792585898735563125413821284216554005887165455783496624552459352570451816888841334159402214590858393919845747451914088552308484987876378309467489131358346231n, 250],
                    [-192, 363518481417736780218144713283889935787815718620310611308149816038330685355284602709272989402063643328083210943526585226302208582200547209056519796341200264663337139930881924057850982674458n, 250],
                    [-193, -341911251479873308071624867431184265989894530475755120300727038953525862754844302818056270945969066961560820001315283837394015523809951717291927922697380416293068433801237128674602312275895n, 250],
                    [-194, 289943432163337144493364484492521193361135628765227689494109481380439929337022160891519614769351570784964689070329582700784958616116264935927716496772006918256730085035112369512340510925136n, 250],
                    [-195, -220954890763351263570403233841871144044079528134946034374130085867859437265853610728969818719007887061856252589097272096521568017489307939028268210715595282057679617968741875283678382857472n, 250],
                    [-196, 150775257955729615650841216269370259927360008384441810720309215908477917659354176448064284573374284548820853166797035550876124083446145142965587697010180624734070198556098654861314515065425n, 250],
                    [-198, -917684544512178479432167377000996724223006141524152693263083476332891305874742730596530753587973530920937181080434572792328989203461432691764688982482418950439609549553027018324477215393518n, 250],
                    [-199, 496060278310287847421975684778140581147005045613125714030089398204041829633507955611351524607397261610689847660686037082429924529969857497082030561406549872516809688804731276311595676444804n, 250],
                    [-200, -237037326316974383832888018825615524167471533015261152797487401539615530006126201727660714757083760844987383399704387856437624271654744863243698238290990521011351127587294714747358542218355n, 250],
                    [-202, 996108240912355683986153255034676873427693148057228804357410552993572452845322569659048673791868042729789513934034707359648322864150265399539780982157413635070234827415558433289582812504635n, 250],
                    [-203, -366057703714625098708412418238431155762055443659189092101765968431889600621276383205402890954111817405422099998133657151083028118195363415216410540084434659123471030960016150704711729992738n, 250],
                    [-202, 1169079179242836272293031685502530907846977876132696116472034951339055249620996314336031434674236863204284225648211539899801490588361188549399358436940725828365418250590051089774767849259n, 250],
                    [-206, -322261612580311709735842081935311238962732925017634801188101445901314434251002269989618693330541230422114124029546665317808687677373439653741751444214160793215886404653683026346464263398797n, 250],
                    [-208, 760932362063595444970354975910142575161322226416622533196481194435521261910462557149311876568187842441107469729581187505525143073601315953360743019411314983097423589720952608501179760913424n, 250],
                    [-209, -152615518045220775327768570714501031731950353296022530124209799096920123274681400361711449580936393969132051425019888056193619490533154886466890704975050828070748557611860406793285208745127n, 250],
                    [-211, 257570753047767679160169023926885590742591812348618389073456676726426012315292642957088405828783061689034572430589425987504360245066841079181366644605213926656024642275831573325277755267669n, 250],
                    [-213, -361988865255022112628027080018500316791301311548875827902767022214316225310455225811711410674532244076453362862954615845897943938182280487520163612710994716392515760503488493427205889630575n, 250],
                    [-215, 418698219548539521528242693313700619050843328008632794447910712043522427170410707948438853223890289210438912471286417411739041816471377980521126647086917061769918489096520429950846881919629n, 250],
                    [-217, -393351728485828430481487580489617320248553164847159404249130259310946780456204401877412342847504669088916709176630207904413665682977102022330540449743066316755161902203483331187234592382694n, 250],
                    [-219, 295700414250929605774519881197132755640387433092201210799528733637511045825920835150550015022901962125581377433961624078927576260779251762602471367907345313658366125510656787918903572155751n, 250],
                    [-219, -1748819496974026956259586277711386200613607496942894330279657246552865462163002193625139754491630053990417803134423484618141537832112500505068692621627992783768803274795642283866271637261n, 250],
                    [-224, 798063549744949593064199690800220107176549581256419179478448481392714406206737577294400639194283599447332377546574627823562463713010906142899958876055181891608936634093123719759142755655604n, 250],
                    [-226, -274815702299152903848050368288633519750462748871496732199667744319994355327186600981920454206172142726853300933471306186797645492124980321590504578946840773839713189235624650876966243359875n, 250],
                    [-229, 695883732588246912001731109903719582115618513442840093764126976834963481326978679641585997651880392111601462028679890554234512970611766792664708670272123380879122031948206143058945851322584n, 250],
                    [-231, -125726419550564152076101449922736317135980375425793912838134934627103503700056062405415998113379516780292694998645379778738907163019238175941265666194095348376295475047528892605077176022164n, 250],
                    [-234, 156420174982201556654066806661803715942329846762479568021838262295776163781889916448981373597743993858449086377685412966754961735635791857222970297963596579270049109887705776847410217666591n, 250],
                    [-237, -128471318705398149226179057548154612243012221784906122404618696793157750960378120952675349112054892662685918076159901767872324958090048130954261907956401219444568052334079144173229646311541n, 250],
                    [-241, 662120093724730965636910201158326412686525980164299026044683966013586665108999075722031594124722009478367118395655349632301165103315935825142743032306108548129280666554072723797718215773602n, 250],
                    [-244, -201313654933823578643686672016108545230459067388906543500720119505738668019861265912089408764719531738403275492283355042539077838978330723934125405360622275190471709884728308100197410376994n, 250],
                    [-248, 334590393804436306547446257167775210970817442227311897295142249642138659468020012859085419292191300790023608877388707597828407599901795169762747563509670351745042569093671321368698740900327n, 250],
                    [-251, -27625021307967264503064803153959241580861859954394243279348907740884930695202338825256802249751790569993657765386887777506721597877477809446468844932285906749719007477723966661125601725736n, 250],
                    [-256, 100241329494979270803231627428618526053681852840328197239241502219390182236711483599829417927298620424904316826411661368918662151898694164962029786601579971810951074409671705684222854567095n, 250],
                    [-261, -136162053501925472047551195934229137768957546865529317345536272683577663754457679743773970767511190276811434544797302705568381521361029324645596474125053973428326610008888610087484951293333n, 250],
                    [-267, 557746052549152008511878345077006432693980122236518956913206347048819919826637447795039526927479583498273833350279305123819970678108279843732563773723198784153510030501414971174112918586929n, 250],
                    [-273, -509618440261407842032015114390985796345876936334229527060672758874162513528650800620551744178041478846676757397433412481552732305112033529317510550582907624014617015140712101903548565329872n, 250],
                    [-280, 669486987371898219119570845582061039099844758512067470257074755445834759895991577563377093634203109136005148625323658986983469785230391812676138639374174758100994392452100670606905773115371n, 250],
                    [-287, -64245373826147013564265940614312259470444709170483854683271986104000240156033761961560704871533055098466081506026059426876358889734797237631929505097927912476259941667903181529289005404312n, 250]
                ]
            },
            lanczos_n164: {
                acc: 420,
                g: [0, 173n, 420],
                p: [
                    [-456, 1845629677266408308782652760281928728033386617479162718916252279825847524110366584177368654714442587728156513116488435899040825161592785909141095627501615216324602012555484967793625548680895880153013200260050985781137693767198071845197474026501129924916564849847798923377475646207291773231535885997008889797811811963495555524945841270204053894021428877641180320348724376147925546331n, 420],
                    [-381, 7966128520308582146446002066995699045556922868394753276273638576785704944553415236412771501969650428383781836880561939562722092977744277948666760684688510296507750029886965937908811046861506276811332221065050492861650137469850718838176458804759330567546796354229211027305142043403950014993264599927245243766133162728708778073382982674361700794169471138425772499318585028040798446594n, 420],
                    [-379, -5011346863118378508727953773186751024672766787702344331563648011466674260201457223279577782126441537146043064410137284267518866963444884514553094591159006002821182621683297325922263229590076238886276039457092410456509304254880868941320874966399334466650636161990523731335400142764608263756581527772339752082490958257174990230408903982101197437466570491179990913527202708494925345096n, 420],
                    [-377, 1557918583889519595680824627984478872713257402818734278079170938850291677680576642801977393337524361559270014870733758179343182627001716929321435290090638154777754750089680270096030410547687537118961784206499731016723497330215744498077798972526988742400611832756948574527137920673403948093620225801546588567973841892584754673505826804547945654305140313275118072979485856181773206861n, 420],
                    [-376, -3190891387794672554396841153927314793742223394015539627552064434199529513831663867024207743916727827765448876731358285731022381491992688404322526056833762857930800284604105321807552003820155805214540852961199702431087677649197278488401924212077391379116267572287385254753978579840889236855488159530640353243990969881304959466319778140266434504282438931594384623156156490667173832991n, 420],
                    [-375, 4843543038899423205297930819115619935530305447222849799326960313206330796922444660923110618507116532453600386385140369133328646418797081919625349487563001572666540899706873062292211266100068114234193357200870065486795034232960886949390196539561555648631289853366454507342935245559673650188975394551485179379184482405836931993747476905204123930461709128716405313986624108445273767524n, 420],
                    [-374, -5811397283320405262440099196766871086615788380301398243173982813092064627773939581204860574685851211252175002416539939693055572930922208698805069198153761548773603688759884855455889530688963554703679062528566450022410807692605203265856443451158401209690423061867451946708046011551744311624788852262657929584843809409117659768368328855591601986310082577445166753287249545123728881007n, 420],
                    [-373, 5740449717567893137362279378784718327581684390928105717393657701342351948187512083801523834299866608836382691025747386297680187418376583986643590905900892828772078347167007189459950653614079932536338136335591528143818220764921525945829551124023562246756606248857689737697075192403501104472457516276213871576048853015526164575001591812431256772275062570221707792346302678419963547968n, 420],
                    [-372, -4801156196199579054031967740353924891151300988867451965720904034083832832498643022223618215559509637866254179028981695232712030279895482221516298233549655146061640859776352598723740895065134121848183685987726814399280149234101997845759661179860981231710315469872648184457354101940842177057211747377866119646571556542497579006489723250432454471990694479761220874224891976843528380465n, 420],
                    [-371, 3470456057719648719870441709171239899405985081494108926163190557696218383775645216455117399528132445037303899908437131149830388117678794757898850223789227798495636781114495598929691485969015573682978926945188004433553536385294934563542062804626923621796884730576022806436159109733067420551222816371367872643579403935903260923262893793773678554233477260780997582794746155986696917829n, 420],
                    [-370, -2202206704588508524476135485738325718364794800587746750033084630557815090619810030343194253446540187512792831420908912099569556054976672194062717664800118702869061432666450304301143092110350185044847821430399452376916834800525598282301082249816613327489827873315744242922392926625605197933833545681162419013239327001555774111530665726953399956472359772087410551449395990755445853317n, 420],
                    [-369, 1241953234696248733613583452799969841966467861030267939043514657586872742203734189327587186293649488363079984189868182217581411654645680008618600813110498880257176280189360098991505578062427865197657737998421112807585981502474855891856187730141127610338843170520500428194093556377609194138362959351717852788493239407600241219505527307188744687442971843738874205366615142659885681121n, 420],
                    [-369, -6286975917175966724905323097897563767902513649904310750514551048830416117839035343006183343006368056182135921738551648283204143067880873311228919828282252185083612403158544022201425491525054740912938332087226493110550463988443519405041364509547331587408645227515932080375356556504478699892761882086347290170445475738757376616132096978622952420830890452325642505079518557838448233154n, 420],
                    [-368, 2880182261940432557668443438636882992539931389318383345513092929012619188213024420528525042514700079152392025206926419410934863526805764907538753420123625944317468760111276278557216927831575259907502390628734663488788215559991815793351450702415712054427869673502142829622203557399986642549948260500555610765770275492831658968525471264658678736888581448166588763311052236748835471996n, 420],
                    [-367, -1202301690431803723849144128498466041586563745982728991626789260292859408039009703637375053456189087071447843520823782080015694274266473597892815348751982668016420060332797187334738740820370037584811972640640805487914533347014848638839316568103774451001196513289631676865930154626905217745536576148266299538919422320274578936984173318718448152110362650277395847100965976532235041208n, 420],
                    [-367, 4599874950474307466724492658402885222991378619412974923415620188584986797227416751811997411439870588827023498029450437403273401063404163403615256903175470896076472865479886010727699285806857632688246127227261670196748037741076263496480606131814606733752701226035905426020134505486578127921013970013055080611345950515155190499167417359933330221867826221941835626442319015344956264019n, 420],
                    [-366, -1621005805805141871089635250181685165619241642252791249183872419326939320333986479577180862201086214763185551792161933054204583088166144869762504610808595484942404220688009773451529141938440852781818385922017504004471034013257450524278357933229300288674559828445220337556045868518857313657027078531739849613330796144519374616116747485554419780149543208904903594990908071141890061241n, 420],
                    [-365, 528455102851352066258937623518296668008587106015208732705547358159401154355804619000609680299406953113647573934382824783908876989826733055353196511749862830132701978224913081858642390151467175728676637773116604316753255407097529494110821553791019599446586288522903560691616998542575666792514167570465638442465794648987193181842205952711889653791595218338293366989812826649332452968n, 420],
                    [-365, -1599778792973149510476654815103544087607773719619092555828896158573272164939317976554540756642982641595614672461896331218779099272223071633586368501541204206696134420147158435445352715363465993438523541088672503705570687881984779184570463958238445594527841459049120181956884375988070871793161131598755396245086957578730584829715884652800862001854256292288080742436704901193190976356n, 420],
                    [-364, 451219660166945576627526949438759894613874736026183214699986418562237038008385069066063674718417456009287087235486837045703987758939364427673766344181472801327383256674689812391782594351643756547889703406357661966566149571435983169699366990404080705155712224284700942167015162801246053416178769048131911812242965699272607900055013917033323071494834486104472321032836981810390319695n, 420],
                    [-364, -1189258839255832053049959656550614996543545269785932237103596996355806200481288816096595376991022265061171450331357454203013654836755555855323739445580586345758284973723239372433018215102573416254441449002327904710225382889965484298926351919703808165089882187711054156422815678440579952641519956002592439995661491819741457025859488982171859287982172624958937061193573043349799883293n, 420],
                    [-364, 2936772465045609678594359325822170417921615058854605293741440090910283381123824375681377457938879495248964546067948533510540755171618096105205440608268808533335202732852068616618102985057890172713851525079606417887409775793820297165904429986656242256859225855060494915587480276986728170185891135547334737599972154041843596367057506924772030111061533498900197706599794012954177956426n, 420],
                    [-364, -6810771867861920643635556928320129461732667120047849668344374213589527967198268615921668849973902369771328158946522012514045989046816097824505639085837504327518649243248165653106683043327857961114888451958330246908276521815928743352195901262098089044033724189389412878766496807612681589683333823631400013267323769468038172859537147851419306258033161868368588292203426488672184175058n, 420],
                    [-363, 1486547576293243756953392480185121057769714661163946162621401286231046643864508158635690542120910365291949786730944166947066910436318491683238639323920341563688899993563969501059239793649105487275737006918747475871345392088821438903715474457260128053469293085357259785512397595973805164526742041885367386131689915458426325291984274099368291491421647180463197278921490009502004442509n, 420],
                    [-363, -3059519843812352864723901563560341543303629468170700463682627096284157977738241595208715325451579551453295545993422286433815316564117601598850745415404884108506688813103971697389493991005108008208215917237308505855264059706672058804269990175417058937253369037468243572834194296071636872534889146096350894455611590238409461382068753437256971220391082011180421980156510758445153865583n, 420],
                    [-363, 5948091459199824437804842195527568709828413132585005058226750017469892253764286694686494495267714859143415641645855487888506414984853944023566153899679227092287020361224959865027808486306772298880786389163406269418823553322225933617647506642421027409513716080802986003239848705203529601055117325395813556898761159800365895544647497292015930400895641806885392730279093830207697421227n, 420],
                    [-362, -1094061034342959283014436521085397589330222140697899430115899646104369263565306021890636243166756802061465929927485768848812188510014188978693175493643361853290225416849444305817257020775395124445165566421466195135047795634797029317377822449393088382946600177988499729053907276658286296658109276789105058380919176316340226045013581126779403622108029497690669092889036300490197117483n, 420],
                    [-362, 1906664396783765152933522197205843867008448100505546553421677159479214380448651497942195500325917314373410250304886478109326578018452528509227182698561860678046213660889363494608294852627522839789346790315147848269936080357681236242166263022577790551265476612806318701453041465253050266306827259753691661897470194258859182858781633194092112415122953998306750421850199846471264901454n, 420],
                    [-362, -3152472255182105024725383368502982152092889229165111537797355060967913077851127872841460247101909846238265773826008760374161790667105595810388879842985827948027195621473255307886101369255258911130225646715426919166858087588285875197311067842464082077608458767245806051744840882852189318011209234119218498955984928759430934818665550103227515143620421201971355454038047097610468639855n, 420],
                    [-362, 4951081616908537536649144330271593970769129014931439890589296159181179303132023985709410392830169557590962137957570501347868940783872705729656090107816200149380002843064066312204636945598083840372486255905568039858279760883411055328820611105045641515057640742921666307833076544997747539132910224857393494599773560734334789406226309465200977305703002647239009695222712128611831820377n, 420],
                    [-361, -739443584345836644929452267691368792585195262453140125203765986649429719935606495087144944690441645642120955253066475025653247949954593201696190562570284047365479323554480296346536604039271929433976762304645182204434719005256137371744387166368702569546760935368024600815222358197258219482231600245780566952025962593930946282533464495095066503872888048759479952935787683766885401331n, 420],
                    [-361, 1051263508753799287682931649387915612319744904604691019615141303640663902090584741501371259677179661705331299125591241610703545683249125223781850501438720639940011492026590995239998367013742687097027208551689698975069110955432408337768244363508971451371753766410152638148268080328748433360186749326516047211645776428969471417358093356906691471883808551842280608771945612229941516433n, 420],
                    [-361, -1424065308896869054458519737722941679288671326655347128662633969390936136013475598821778402406851902455476707053337487811917027269388622723745982926218336374384388383795664203473835072147947442465950408156939867618177194526627286521791191680951196901980398017905230567468503340323229411423919956071696679075098029115068707291733195819403574432438151923994114864322317307879310280319n, 420],
                    [-361, 1839662386435680821398593376154022126886939520831016868213765402296749831645947633398232478039062071930139397715144050021046435126158313026912979733702166984393549084124656078973066473563363130516130698215346506045509478793104765216690922316743015575364354684084642192159042707035461632461403203623834147779488529221308955592399619467526420684753987018804068242493506265268163155307n, 420],
                    [-361, -2268219732055963848960914333896512196987173152000918057191986451496446813897745089619909245621690936145458381343529952211759218401877131827411811689925210406601506260574295623000200654898632245008098594950975172701225621079337557182043866523808056350405506528857291092198816649091690844795980811450468078145830052653935843614379930170892561898033724060814792497236197760913517193416n, 420],
                    [-361, 2671117253967715776068140373403469572681737950599424207934234923052402788110620607173129701591391883210977912206004255305186232094888150538669374910774142312822471096898765524568265092748493591068362634236615677304360592828983467678614936126138249176459369887119634687282462463079659162005032290849711758978092776158864262092308009756960219884148761828171364116794004764384058629287n, 420],
                    [-361, -3006484914081467032190965935143821718051386028702095926788311612846967015525101865542158910513114908051478652951493893615746027734017581265423518797690015284434405472970608433790821073898609068533718351470477020316204685320339618840690078192144682455653272096626392923326755070244654031753417181362490771137344059755265544468608796521919394226279369698951965259986338934631724213107n, 420],
                    [-361, 3236369030510217051975809236161237262061398184952713535679234110381122614553562067593142606655431921157955055465322502491715793074918386992558150809736222866496118107312991280726649635513656657655318297106486257052727217038416782640220644189020527945368963681709121543658397906436450918667186338004992432118237623141863591732833572105451713084202446277452433848815443059963215682331n, 420],
                    [-361, -3333831347187491593457490780267983890512813425039375154795521939811519690493830810209113632312691721236829209602787967180709426801783914138177363338074148145431710687873463565448791726455231333524130474362536323263882007218502824415801275672621191668362324488680661424098577617831680796783211886832830586034329021705861160401627329120285764117449875571542104817922484068361212096878n, 420],
                    [-361, 3288137150352093556952366053392518957115612903884897873701775089301912505661349300253077823017521088078896362369781153197799230181758202750179976335179429785990148702838474589221261581374752198092442986291211408251472754953928061649160608682912530960868605066639944204040481816962150322734478729410535352438145350974092367251685120156275961914838738700500019708173288329306755357614n, 420],
                    [-361, -3106653973282106771628557437343919623626658182676920112546506985318473079538309736699645576739718675502903566630107082299376386772677151813318723127535757308403321648009734206005898698109334887851488599378451678137876200598937359224356295767987306232217346596528238587213373064254569782661838896040089215696792594911942033380792618782121339396139284434971613322510342492834634799853n, 420],
                    [-361, 2813011352216862447859087678421154210114232664477310187022320807750403459085600196674029989288692792641168505590474615890758091591098671690084586483347764719872854003193349631058842919015059475752173579532610693337750180908588497407055790033577941317900272957669442808215562382754923409383721134031807282270824968911294291439628735131437620050197712037135119515701986716613726873404n, 420],
                    [-361, -2442130223386693559125449597338127585346663522875768066860890533545251435256889131816636525323085908810038342578253722367643165159249137897384351260156262816077855271098960676724637379463333841307635666749830586804872707441901305763172856944090081234643608647891726982059487939976791695206887236460858984256341260951920730246339009164766617382329419675334932361315415271280512397486n, 420],
                    [-361, 2033541547728531823279221754164447112899128003706877811875695262239515012167047723382460238150996058410238417732212401457668245230891000681980143086406491627289961379852903853118164449130519440764298720504454399969500202887651807987131174796034055834983109212340028896733225241763974344522210075365982347999499697833107421257527904715476285464247297585054956271259580931587887416027n, 420],
                    [-361, -1624719124292413413906525850537645762882285865659362677577445809134503161242417033823380881069925050663488720043160235923768601394037358579056714033134697466489012501691280980208690147859295843812280718097043496822834774452238440394575547701298475542997784509622406378598037715538879224630673403590111539584927187062609728992027951924962737151483863779069903005676644782508579475422n, 420],
                    [-361, 1245906320914293118821214842461361707190457989021125392841401501201992307993386051335933577989606793724321437600082042817113221475108192895961055055295299077049873002403455655310859301704215927657778502105435385314439189721104469694118456670476644891130935073961922475981305909220709264799068218918217801962463520136108513273304130302085841033495054214496288967627848127668008168156n, 420],
                    [-362, -9172814676902811396187082290616481301723202527222099516288984718284127489854337286649666083617420570180033569480774875919113977500626014151988968811891209649050640955271077731316114520612170024582399067250551272084107494586113710195545655939764792401898979445332647745517769148460705533337867037731871771587752469276419959299893504502012557834973386245357382953810697952561830049694n, 420],
                    [-362, 6485542878963160318561596793639911129665214020686319689729302511038397573765735594415536732542841297051310645317217183635898474514472576802024858008586858564808415066550951153100374760714814531591093632384169555045483903596595202850934898630615826063097750566950060327432755233433882731513999841178957294321636045663724452289551826836201443435921928285621363168914532141696996030897n, 420],
                    [-362, -4404752747950370006036000086802027405576736069526106713902054785935454611326731801591113414218924277117579217506758820591068429937821884018190993937622051722797660364446567881247373220218803600157129761875203133325150034105608877389884472621891442613900504577236866670966910013971101116734476781357294742186923236459764283211385444944564887681499592790735701537949635055742312152252n, 420],
                    [-362, 2874235731132091213264942464590844327889394914406498774037762546307959637962674022896188146477234835395001790933730360238307987691186517063066387137331038430777891307891335063230063372402137596713334011438428968181598139830868911092032920411136806935575911476543491335829237804472755028313800038662897139713500625773794206241693032113727585140343475119392697614919226403228150309971n, 420],
                    [-362, -1802323222999952921455356982079707089756977735402890080165951424759006622565671649677388872138207833122256562515477565312785129007082420847842688151174653516070761186161702355646669862952175494079346974924983883067096697968007326010339891598169292720906593559127910292224744939178824999588313644956374393989944226865383199944544091699173966272351176192067934411246072823062131584731n, 420],
                    [-362, 1086241199210028934211280143100357308486188727754491097592170156196759003316462366310697361611360829763905903795852820641877243427856049645361988091938908671555564984872547731352594988891451868631788261442748760341963589527022169866355144724376871929155756852977700649346704654966242112244295643190426347114792114673672030146752664831106140545535315947409176896589671269473334417199n, 420],
                    [-363, -6293140777659086533803556816095965971134739488050930754905199255447541280280088209220650994100841443701490065506779035953786097615120836500433754845943621285861121973280229996143788340100595246520233654054198603736203137550276219882430669247121945227474597542172854433055550922059821739308354213454602529139613719309652658501830950997282126785453523515127071367926548942318729325182n, 420],
                    [-363, 3505187632593435365179832373235215775827053081305129250028863389910998137145558465766952576365115560006353226360899153916862430473207681407942156473681637641414575008186560990181075827207385012686440720847329525042747543640295307426432643489096046278841582093678159689378873878763095885536820002823089984174967984624899070989217657464450952776198588023001721645364829334979118392562n, 420],
                    [-363, -1877171228220083486082403290069022880247589377154061724248177473851133538841081678021037580336289204341772389526884745724078669358606129876142017418686492392666768766392594215451936633915632078969416043382274931659649036253151543387798050225155187627937204913574597899963713797876467809902799998232768659939776096926238068944593013085179080138396984312666262891001898354424742586822n, 420],
                    [-364, 9666801671650709360714776038780812970042276677842643857861964954723382554267698799545362227489638507467595259150616648044876598149500856885670449554034263827617128043106096570377345246875478368731327378891466887805164945291227808849502873403668432344338720496337042043697367484583463658799699012886884080481318677906441304771886872701004743878865808285598664241850599909380131186988n, 420],
                    [-364, -4787151148019616033137344144182144712010481093857448872133537189481174729220455132505864735477193748612752931006186367811642141503650766954951900001192620264480060482446543664690666165888701730288152325955812878707943747019074928175474193197226949011443098825424558530408567165685506674434830794124151254935963069826294929044205803498507584878636455629924624530725371887039883098127n, 420],
                    [-364, 2279858101313522562690811657150439683170820676342876816190748717677897007987069204281353032769379279454235242229551947547716173980810599378912532650967132033886267875538489098862304912839478245044150586823769328348920613464553059994417944769968343104081680401907965236671561699358542714522885246646973860807765907824433018875831425902932729251116954508587304852931718506424550370177n, 420],
                    [-364, -1044209860339264798099525578226172514644236907842809111852213495417317234434733089117336011834891103117171007395602524866674759552878627909095459862425684520471992217441703886240959076725965336350034390097856661646549486003388813190773535361368185497474592895933418332388392159089229156332966011328528078832935566483081410176605420794900480929597063676211571563685727670715532546738n, 420],
                    [-365, 4599622522113113065916164000520382328610343675122450092964800392959549748488794519227209673655221946638786016761963061895483829747659586577180826337544009744826912507243571775068218654059155023073383437256371715323695408854884226961076145376823161810216753094299047817168158831322915760796815834274228455096177648908259634646154288222923308506888184254918478768756775446490833381073n, 420],
                    [-365, -1948536245702537191949474624241174348936243041367491649595039982325424508072360217809771695200392289727375335501475424529149585054473097180999537645320572330589559830034932065814596830346335351481979812786270549323435758473821267779384978655249171074814559711305039872590039174622982540193136944881762881384153730629169765952480236250137115351183892050580754742910205042123808704396n, 420],
                    [-366, 7938466264407910464967760466618649152165418628612873727862334644396523105462978642564275793661886949933128771678694607730056686391320733689107188510502752441067319156681038315139473622508201842553830494786330905160875270547905149267441010434165301776746490566382394410119782547446085033121451667463150559250615337505742412364202923103360591572526947700808210573834367057400468020777n, 420],
                    [-366, -3110205053457000923119627387135434174637131970317597733868782551121160625042231812166333724028801665126410324437302148918607644950201565086287833017941343181005186186822005755447784797403905793897154924779760019532176795726121954700694724031727867317235692499818390714400194877010730670648766003023037437731742851196127272806573685237454986630373147763239914014045506933372015593284n, 420],
                    [-366, 1171765976031518536075836628801301976849194997835425662056400315308505809442910417313178063283583244929888547727469837693234364939901555130520889518269261743124988447076047446207858653144967882312535223406313974340428898875679587521927216133210212244761845802103102094679349678605793159122703408588191577057510455944245200378253697603499395425776142175108064301748144959360038964294n, 420],
                    [-367, -4244827473248533571130514663090755976228653630413808285178354837533892911514493329407109906752530907438282443161031417552554262645793364722036610878997146181520049338665432717093236868244187163035381456564283219201970335098035199489437582555133294220095882824080797268206561591644046736991668856644520096245035767940894751132160962772420799157965968773463454691476799697120754782628n, 420],
                    [-366, 147845167213620815776918641260679592099794701757551103951546393202557129368614459398093501067029524480329584403279800613140828534145997415794285788479074468792345006210437025947494765283154664557853382648740621457820152411103911233559082169102227314964796802746726086516318881650799576700040557605050834842247274662998795530685323496472320440362236163405525572066822614340978469484n, 420],
                    [-368, -4950346401465099922837226365150480240573769257202176584768581282705958724379443565388248202629151159805257339500975579071211341257235305762360705002017130590609955508432684388700101349648817879559821094521566850824417348005061780156340302565323738662916069404384418979617871429169393250260255124787137335762347634450304515247896977885102964276709184864566269368256529008481406663201n, 420],
                    [-368, 1593278445728826789560792076029689107574334309834509429161548398618470549787107436064130147302622605961703193448599722258369266833908028700834757162831310188361444845826250869015995429173366423714176089032169864685355375196255813999278855414746659327316633079114626494685238663969466764442508916456610681256452229853310871012422066737646128271732065621845603322440280086043565047409n, 420],
                    [-369, -4928497091358106895868221976539468177301386403513969798476970845478556495592385417757422521849574962003600096736675170322682314243284134243995755178689488487352572286989262521808697314741223938446396074442564128215021937474007385086038122303807462776913774908424119131107212911707072067442847321646576656146515081686425458412374735247693228496001906901238222770702732556853446696622n, 420],
                    [-369, 1464994453088893516566798879485929604863427869405246612139437399801032952211364843711644723344934754501110441501625418278963207062876529275305926883050216057071792507920687002434995753430924864797411645727229150150759750328028633500341862779016642793418732299354387310022195288104369395446278548570243227147649552266881426220960898491650558901374883862593196553120531792526491751618n, 420],
                    [-370, -4183895441482231875912983984473113904844990748867838621936803182509465137107195297434569502799927388554572590896677859878749837700318698486913626326688855423974997355408857949159416430892192231228231166090472749376952330122882921297983998616932440849059202774257686684175562593806290867846524219570211412121027660818065354046587549906651691110063763823894775718870698858020346927739n, 420],
                    [-370, 1147800739617366706165006895298733981699905110331559441607460596485087040255212370254189779782797260532335049378936450337068608625683847450493948052724524615521906298973838919895965371983058900097495390093620632160960433889080259426335993829509531059233963547296289706690756321655969668305818426224052085542195774010997905198863479730675267285811498063924566888111113784882986257094n, 420],
                    [-371, -3024148967045153287858378949075063094482399418775652065740623234344432237189144616407796119764822946047830088499673453286545336209835036306581524465678765881099115488984891391631146996891846990891478199477325934345660828311341027268706366460552111540645003929336365322674852336602219168855302832639185987096850402986865562041727192648283546726616105450594746952358332414567348189645n, 420],
                    [-372, 7650567628626433725541859387444931676610513909752756307451796555597894602643180318673641761403306539614923295299098851214382301587477338212373848665804890159782833059222133614282867224791834153033019977968820166858557888741718107973641133272431292761999122171161225889545708640899307885266812889578365591996505612640948090080707860526412951493675891446359158338058898308868036456083n, 420],
                    [-372, -1857946798368746533698492643730978483855925368975885818366777601609129617340094837546589775943929149857556900137119043637299521783757154535181098643111023451186395702480218766965761471418280546311307994863199870489076087432062543143996586340095198509983385390420325664881364467159678762335798922750577578981908773556232052455094611452066488300301487693218598317786093716982352011252n, 420],
                    [-373, 4330218484800778990138457527504635201897013571367408282688149026609861672240700407917870879702574474421064410036049423604339315726504478149301383946279349034346644827213201683569211933789286352377285504933107461378707752982147798345611416954357474233195156981262534967349783088306639286176741395533984000158591082197057050147479547856711026798874916360060100731476311005801325313405n, 420],
                    [-374, -9682853865035358565579000049213942504278795386242937528501414962062296052156932334078406471231761471702314820956484727338781570902031071204114588026481426366181534693404322170291185525858708258449224162196593572199926055733031809208654528433627663451890792110178510452731615891054151205446251719371856469306781851859490102503106998827029244265788680616402558448610269346386767058864n, 420],
                    [-374, 2076759897155835477582454959673179593329616892146944004724353439692923774650239237082125730514555193867845640748661141436207242909490743725425274302099289408576019317465328637157522316318558660044198427325770639649502080736704996298364012981719267988206513107556817901407525400524240616981195972255776185411111334227131522136123153671015844115178861532099275178540428167797825019926n, 420],
                    [-375, -4270934477089539636158524580978345121787026223593197030266399616882810930343696731661521845553250554507668225121661327127576547830836101792455029043077807035143514339577530274280897044441649062792940303498030472470991998939948502655232425401642947284491552538423241685623241010159529157872513114344738572810956893535696295959993500445585122196882493108908459075149276464604755604343n, 420],
                    [-376, 8419174177000690694725113843843016318843597635283913479720704632603927184433132714324382473223243274441438061738851590654869312716258133248096353333752288867979965736259703715032333429200583101316110969959306881692705601099159174141018454727027366630979701987163769685574666652532194062141957253035143218126863213918040881988078086426514683817394950216690874476909859366685539876046n, 420],
                    [-376, -1590281539513852246370396085397297412573216578478922577241805803418241218810660206276573039829786884328484948447644426625997063112502462902259949373281822675352269900952730832684472308630563180604579333121294675338718901682275017359034822569772037012651074853976999279292490089728887840809195522384683647502393816737275145446609731984899071184328005043385309796300998606216644918223n, 420],
                    [-376, 287723920801137471139324522856248635980496006555486579018049459818096164276828874856817656796332392883513143359063702699905642768044803167042262892583821657663972020281503082735879617311549014145504452500471310950977974620596682347094969088888042109552592175114231766070823693996886686468113830876376729579507778056502520511411418921828204479515765343272519206918712773839545391216n, 420],
                    [-378, -4984322675137349012590591464469523769087225395286875738535112108398165528205563526684327580912130409780795783385598695014165159750597409647717846159969600167940048222139735976996693369920835885937953638009904149297886684837930919042389514164473456875464028495244799610488819274188444966198323031902280856472109016805350004085885012624661591728254578876526989875361794130835992956637n, 420],
                    [-379, 8263926267262437957393027551613655594387347229371505444161796171880333120712271584003087020119570632405947039124154175659854434815407129932541680062334818904945578181619261707974445542672524874734584593625582846376448514241752313253701846608544870808064645088260068782035933965533323434917560438228353655694230408813894883411624492879437379720532407262192701708042851718631351024985n, 420],
                    [-378, -131077914755311740685695311259797775456954965832981183318192127048479481631219040764195176041958418282945278848093429452733668200419228884848670757587219544161767364736761151120851689700413862797380650931218533592915390212097415701863825946486537782500977641331905824804171086695332384535500379194211949750901873712521578562207261118203771571771084793948203072065479949251991928569n, 420],
                    [-380, 1988102085773816435817462634828000390124253962124912420007786252503199392047895470722654802018105556522111041767633015072434424848552679463919463562175223831086964158753085359595810406851089988469344045808311696445719187374089076663229670704132186667992653232810777149376817032332628774399054675547675981832825256064838869410725840006211893483815374072232129020870780844019138519314n, 420],
                    [-381, -2882089297983761768751999493588180600440808513303773150104325112581367663197672914182669112693296263062461806957001528815907091942007316176088111262166494440765854129812396235817376467998612290695968309320628584072660988042524333376739334389293441046362613331786406008154360846028004603059198292445180184878764110812080281582510546437756118262909480980216019112500478961546235328201n, 420],
                    [-382, 3991344939219447354567578012259116549446721249145437448572682149265446457350022094812050741880643806366691413590218984213617272449341184786193658194424371674400421081328706008246750580609399308614674183403611192145320020115192269393451245016915053498091138125744708381542437530881010244002457075849757573983873961277622131361368381727463264536610671625599995264423539734858427764993n, 420],
                    [-383, -5277731236440740044135716606023311465357496414627044893328735226742020135422256528969462683577227274789718015475540090264559903553486804409431467733435720359418164124263498806440110505763796242316430252025124455940842591555067092942791132181177649991658906082625362485897128925955417244274056455956623649349526872266147050875142279576315533785795952690534762585437297010432610665485n, 420],
                    [-384, 6659687023449758248661136846481260049551294902812338639567900022825022446378395850404428963936633514088077100941804853200451809846737853300321725539163745911287567974471489178698023243615884491639185340780072601427139299402323428281035460469414482865318189888813207510320955305633866097990659282514772579851812528857093520847413291638310161015631587274314021443540106600296990006869n, 420],
                    [-385, -8014753039373745145268964881024811895083496011551843241815645588571430104006741112080278271239570345400698322147401948247937510890629442052267463781208587200349683387488580363684827575784575479826541167985520638093600941920718110168207482150560240444822980919717160283554630167609188007957659463802125195673643360681023092244406933884753788503535154338981021819977354506695498393291n, 420],
                    [-386, 9193818831296883390396879751151612375888153449024175290819480389548975517976402488168088033085828356705903609572059683819308562133031060215867193173309833251061863579073072829628882607373157553522665882252260760402618166250395727005752375628024373858456508289480533878962108217889924035260623027891148107761174999988551105818519693303704638694947859696860890259407994124096691055482n, 420],
                    [-386, -1004613299479106749911309650356764622546792550898493312708149549062146303628401203691308037370873766647602004386385363053267614258756072333866462911881977556423899152779791421197291569840014380562949866843336547200088528621162625029765557583371655638613790716655411269862583600006970156783310779012565658888174177821918023640010275373792716751621552117975622465904097549473373838401n, 420],
                    [-387, 1044995326812425324806491145822587126201518888402530760989312043043872695055126343018062141889580080885124301638930955579963947967498742076743160357676027636885385878980709843949961919648704164409942905194245553807498285105951301172570690102256298110431065780395297565741520959140574722836009472928336875412855677808436317190109889202825317994279309167165307332313574255452184691547n, 420],
                    [-388, -1034057081664033267058753569285608824629310949608651277650581433208952706932905643648304189137600400930113825959765044661481384574545842294737025565185166958543695481190073465583026292200515345344646337118071789390695400750471894993028980094125508927537909719290190795838421191042053149059902625812847521871300644707380628140251936887005457588534761114364776188193011941971470100825n, 420],
                    [-390, 9726984206875397836641760094329541731157637033374529531060001836410782736512498743760489586995061612711859581995895207258340376434949141707660648279647625575643981454943965074449147433355435571834833161781120438133865734263119894948111628847714889319603056501111704029867147552801306368566540678833463896175282357225098757922967723719597987147520539163893527319052574740134907801197n, 420],
                    [-391, -8691408260617450360477516739911733385608107084472330102527774646850464593844486731415120237941876299329833025335576419480339709980175253762810002606498043271147308927636403487588825377100587880830165103824615954925319454989838583102392928314411527206394931614818208485085047366612607352837531570969747428595573150484253370010462124065158322752355748119126068694744153223379979956734n, 420],
                    [-392, 7371236382884052864279050697774395185102419188389443705990220389977267791247027205181751559663051857132581253003108479431929956946206361303744319700866144280768102388994635693984694074268209572024233332876244259665953957911638062058291679065821163740959603846598630724042973304802388471631142965281175928341387942126366421679132505533949773431119352548076175808278873287345390922819n, 420],
                    [-393, -5928890286610479309286456965230838036953245985663746222720632954976471514692248336139205952540341842541070095882232330085714668381111475197376651131159347197881558905193119881286759120706638252976770129474722626667796700976688355276691977339437984240404251507407155758412847858771257923821591563650157578905556119155122971413267295442519794770580877188297120193613166512768401911455n, 420],
                    [-394, 4518746082380828569731120618265793427024264104793156415260423472642578766875309566532676525615720355963161114670843854595836372678484545600705075398821057396393777586778937914659005056699608150450706486352397022940689464388588243142746827879439160226452575865938101766831490986064309230819568791932869792746477048658111252753714324372331542903555190741372774045334299357980889505883n, 420],
                    [-395, -3260510737691339117235686268255862036353618892337012198658308724356832232135066261369421314263715299719740044590837613792622881998121382279819728868651968041136169738783962556236544502625505134058625686176540426003829769267245303947068475288304763178865536070271424065025618601373174457757954521608808364891830343487336868254373504795836955222694401362762625653361251224949528427305n, 420],
                    [-396, 2225207804060263781720839526464891641705788250405456151863017524765160056455602607950260343378232687106068960157758023741780514726193872224146760722534746448672754228219373849230437086718481798002661891305756259052380165156099703886998985386210624724329493029543226731467652528467067168300987711960897504544654888886047738553215526413859675615588647122633089002529335004567995188595n, 420],
                    [-397, -1434988105096859992425030931825275612763020394316129347878364773156418527806945579717568763963040825880833414087202998937562665536486394146903600663161434312988614870188759728111554618169640710017167145216617092745495041538570244045153240644980074403844006592558842560177881128586879914327233162002915316438134740714850420306925082740601827320778408395065211770183509536264399835453n, 420],
                    [-399, 8735241097936785943279822241176260488737889416466805368458610951284670871976548153735199853969585318438303216437422429148656368583289504971306579009896353555646876234514700844305550474906958781511635864652324440522205476871959453330194131360238730597308328176200294405836790795289069510289898691149271288596894383753860992053240218362301662162640476897931227270806406646719760333652n, 420],
                    [-399, -501401897453800005907764921860221063492358157027218525714614229307787426175904083669679246757305388732525402014406132995503838776226682519686133597879434990702597127783258436235672478518911168172546963663005702630786707791238051076032853853263998419001722844256274075958442129873027348790957577218183535909920600909799595438135774197456436945587295410490575028363735438161821220578n, 420],
                    [-401, 2710788270572235105198783328864287430024953745385144088617927264021539739798029483648988655180414570391653023003636421746811100766676033659461126163005152949531483876358323230559486352616050106206130320471802824339109960358763776275168378217864291554815524139806387670466571043163185532861734389102369109534210562794122085498698139400097371746609528534484198139616969252062455079814n, 420],
                    [-402, -1378780490361953252091600944825089212298427447937069563534155967236773932201120825307618675189252201713374224907915756388370454496633389074891941895480304536782106302853978790010853382392154394946343057416197043780140469559518021690539079339138928927573972377997634210161480942422548528861960066065961610520302989499642950407469554100022961097139921548824654830825470443945649888981n, 420],
                    [-404, 6589492582956708215961809098289689711037842054378125731458361122730493912123673212621931948844700673433781428252719897038534053267876011930983092692088144601318735878620919215452763747312978835018502167307524297421479942319038733609082907880824693770424686362800196002287540387023005280702646772020674347475088200551578594203783110774512712973559341300898916240932351908554961643304n, 420],
                    [-405, -2955345350749357882065304350895275848919399145925544718375157173044528059035940491609512139055922769817501339253381965219840112770442827839345580297711425355048901778584875828108699909722211417208945380501799295627259863428295207253960870226601764876499587070336382466055501376527594279406985387591144128137640620868589666677956406003396627349740179034156238029507040812650215612856n, 420],
                    [-406, 1242165004339794020618607343179020960158132513852337305314492706198302534628595834912749794521499543719193509408398218906731886874208635433971643328854107539636114999487345918459395797597186063069917105563774546920054456353580589011298055006903008885760917628896661777197510275349795233990399169288163517794338774848643941857770806541189865569227163635944049737654735612277856912441n, 420],
                    [-408, -4885985697528875971786192385674010031583030518676445825091817181583210401028103259018603209024419872343018040222021646440634480910575798891609931467005322134385253309712069035304831037872256022256397669227421273363158575387801138169848903779921280838403857491182353025937230714764455639508942965378606916200664349803985646080897272377178119527969097911920840778228533061762086063752n, 420],
                    [-409, 1795907736545068308834220787074360463324130245146074404407228018116459961241682258832513161842066245131532440873757286352098502268799766810637468186144491957875448994938800679080687495883300036848623538717507233952615117740849027631190105607868689435468230644821843578271159513769638621937692674869729443419617746050388807580767860834864649315027869928191797516832176095766466698045n, 420],
                    [-411, -6158856044033966134952572682681733945241330164134223828766930527331864956843915349959584346858499769876330743079627399498115977054600575535420989816889438130432268098129549190458110666311645545455460637855390097465840516169001409597967403743954991090654275627220310670714573064698424907235623209515125421354497635455971210523950992455109481691989129454307427695414937850701352213485n, 420],
                    [-412, 1967396017619877741175355075997860570126209206784323613142807673299980744339198902945648144453985936789272422475943685931010228874356991031849981237655497546166689873370702838820234045933052257146531100960443439513672678956881520127975209591579043665912056160148654239989076509654971296726050318032840977532136670562486461215475778026729909702779970295660074115976220811543711392463n, 420],
                    [-414, -5844062129429898905996539571533607481290042517392386473387974680581232533808594524649693546060392621237047185410565058662880362861899277521131483633518044799478626415249741032921764222505347230983094187092034681254894687788724302913825967979532359262914584584329013460782057363604117690313008387369509396126190204867453212446610520173922469278716024626382390507089242772927721835664n, 420],
                    [-415, 1611337622325101814426180742733124335299697443616696177671105672993656355966213451663855137159535911827407841960664856318972647103773008432273128512068742299019331554069844532862923057215348003392231427423646672691575976012009393080224634169914192453584830134123190005646287008694179098357330015626041093844239573705205710456007297276619490219990237671573886675616271887528636367808n, 420],
                    [-416, -411607822977166420574057826410003494892208657314943190308117377705911227707639150428623922505965975989145908049445366936446795057158936871266508809088288190337722200512729535755010744816778895446706405133287946462446367800294985153569473983685914019060477614826936395508610773347315425232043252545568351287938460863182471401553717405715462670507626027645476848272300012245518310869n, 420],
                    [-419, 9721633815938011212316294829880477360551519686198717617006222295743176528912149065356325843858262212270497518177645074989391226309515567428788272023665180570877592065590145044396758370132162018178634758581218304567830327964984064289652355303660120326453948521263683619770052583480915195964052367507597701407079761552839403696775307847387946187117252404170674694928292815675063475596n, 420],
                    [-420, -2118557524771739371417064393047068386035535864504124109719323276460172129708336718483490107036832668633800485555886945676901108490653528504310236748255723882471110533329781810016945798493640519383631466711673523517218387066689442376719080576941052401107237944211138496802601357599660147866782348897245252656825466832591045274645758909696239049667775760837335976473204233301933880817n, 420],
                    [-422, 4250341000677982904304047089905744527681769836998789092145999217569679620012550240881359024347915809023849183426302711332335376346839684107609537289095230658567433398365004590354913353335468476315190671758948147146542048920214787656629390843212189648343958946268402499140337500513666674111086069026535335478185138752913678516856091951402754403210336400027566211715629025149562373456n, 420],
                    [-424, -7832019551076886509755413128609268238115293384447118655638465442743980919576133708314131135397476514104266561579575374638960290316655688832400127684149417908102520759458571983851002938473458595547256355238917068557770836597497201512955657589749390189791647133891579832917644615796860268553123667659022208558286297411380341162500885213312859808368888420999115196975611864109916946623n, 420],
                    [-425, 1322260863655960736354766236938119852651567254573149396930827374042948217668276447573242930661269108881150498522228471814677824841786319038006394599478981961858630353485143755467285719951308159722579806670020655524111099538101624228420210836360807647358209937215209113552335494847033093672149778955012300999826600369651974970788403372891313006294979770976622456894005164899475060258n, 420],
                    [-427, -2039950173327902569623376822064155770475658871337791951287547253656160174847716368090938404850105170525880957240034368947319305816286768655753712984118576650279697374466970845860234465883201092832720607884975464656341150691836606225169887369722250391541927346843919702172590481368846686494991796403323045109771070281520020519936428459235298413650887522288225359504245399923313328441n, 420],
                    [-429, 2868010507882606843218404003585595171152642942633422809448691443423971423620912664866088495736959395837943359165889882578154140013001688692946378564674194654079301171921623788213960602091106762192575872557418931358019201472741970526630101441113146582006781150614343435371876848525248493249789927221123376699458968475264851391024230663514589788710669125093732171304285976553437517938n, 420],
                    [-430, -366378005074053169941823962614160339810019660380679372016453534136780484306099050640991753874874523780483351335791533735514062172492265848459721482290480745463940300022450221286054173689988600826020300310273046916573544293346220821405367290491387774349435126397023769535002518343182843761838369075670095640933030432696033615499489718599320387619083593568992642984604359940814666359n, 420],
                    [-433, 4239529037710152215555165069451012118203025149775539331060544977489237285377415935514813218149918849064731676163523816761783528406982424640431381452824295407928715191124693396759686206276473942196566824605223295143995878770386343393025959124765672146622826723087100136990348354201864312449849427735229332818511651859908213366236172183000783321163953967655236124228898785656176775358n, 420],
                    [-435, -4429091692074527746123303100570104260942646485060519261125380251160937682874170004664793240694429294073348940890872889359776349892841130464412195108974131374711376504764497554970107067460500789202594474378321710632258162582539480255969529994867558058914185429254242859758714879707469503303937875740969296948239693777305655364947025637970832725753920929513240872014116784271899766247n, 420],
                    [-437, 4162940243345193595737575621376875236130346901789896979990025538947247881952772989581890361884143724476242099233153393457390364001450029615000141683530016580577055370095132829856570599478859859157027524293632763117807297003115785091778371255391202494226413508468833558205115791401828313043272338529017512031142704072070584191420259294610837047831565165077211634462008042803566028071n, 420],
                    [-439, -3507167493774393134023831590287360781871564809459879451987930131083938260067628354779396894151232067753606511123335044315350950337308855837033728291138371506585199336046201613692786062239951955103710004710795279172996191860671299757765179029585162897567068167785858178351944300833401129408566126244020121343789817099604571605936288674288219921577974915347702148131583158636103315147n, 420],
                    [-441, 2637912543194697818910352250678598821332152553817636502251771924817841598329554910540656014292677959413493691149448495787807958536955285782163815655634082870663623200318125202496401579377029064658660712581531850229992462864706167050312879635923877751338978077759167595372563135676900783675768001705402736766574537668913077265752231244301893837558468872151303609360029664452308459964n, 420],
                    [-443, -1763898396036927514866058672904657546055943786887897462267363531648486623540220435025380243653286260590409786086287280176548141892570412612628905449713318763939821050163272618639771744932119033968625650429945077786593932074249824776055138796193269213532343884207062048790529609812585072884137986979757554035665665270808610961875174171870059604608578087776408452164925952382231791472n, 420],
                    [-445, 1043836135176011743370609282336860597399972558300940925764301204964158692183889706383087040884195022216190616817233391458956298608886988212305301265139972047309076071656875529443010061005149865037661404105335419312222581673573118518283312562401481787861875024464063672350141149942268166489727929980923660999030645849337421618734090306825919273050085086124796909070780503670189891438n, 420],
                    [-448, -5440463432215203771533733639233557260003939834006869585935505866832762910387536261674565964716250647946339875197703848945053405901633954375452194753137219283191162166387253095397048599218305232038232985031065385992500622394031068863125747661887737086019992775596657805323159239010270575458880236459107891103808403163098197610109063831443079319841725020664669644072651187623170503496n, 420],
                    [-450, 2484467618758282977082950659508851065019691378550209600904537921601231207887750334268914263175182878330812134639554498346705457912049450607696397867781879265741463869209037788340439937882967014401377221916434921096931442511712927792383356051493086957467128340502768463824313411547830109139167987445498487567759064475486258965355748521514246045414494878347694005116336558371430245593n, 420],
                    [-453, -9885733716633676223553493111908080342582297755183092874792751476719280496519589604416290324776716665257099534177336343313953476652073308912618666555884967573521083391517133028520545572115256233278518913263543959043540885845091595652505879661410035427302555151534424281884581831792351013240610167357392389174467155087403372275258899765292298574988000585415932479319552163850406774351n, 420],
                    [-455, 3406947808203314816330692354894791778617252399157241020782338178174942664559728397694554936002796755875445359374057825353629260117081899606637186330314994476904853782198918479001839441301162487643528249059476865385395846880049864703185924545471013531632532233387005595347806155624931859489697720324133259750769485384300038510067686032722910377538989822778729112588783739360648114314n, 420],
                    [-457, -1010429200332560199806696427060827740647243976330601196606279464468504989555688350260825445420921948557273101702079007245849609635180725656728947073275731714095550840297151549126158581630646695150805421071168953230739403051420059042518280057598580996991484876436971645131105083569643167081104280402439793334616336423467455966548591171486683717916508877909649850349221252812198077605n, 420],
                    [-460, 2561012624392340727981112138320546602700126564755962866417907254947452744343726257021782463278749637898070381857828227731789478809693276689688478110088147414865742077781786071579746244594108429523305104511244788193029620557559115378514701479334326794684360449467588487916355620017583852837463592402829645905528353458670627774604963836534742362577824223652921151299386206822242189736n, 420],
                    [-463, -5505784603888462260455690284274411246691780295535689360129514859892234391433449998919248578328685048754549093094800215037442202967182343788671523648563711722522739747273236739853995563175445555678786279830231337296945103514353410238380072528581328405644971426313694278503087298265270529340439988593694607152848687781512589053003128469211483035424573180685301132406339249403012752596n, 420],
                    [-466, 9958450552802512987747490348091091743468646464352084776532315075196176438704517028540699741940227640725551389023723903998485906476315381580266553862808569970524354377140566237342804956978076126738011470572214386475016740971299719444603705258244247105814305015447450967443207099551813801121294620265778290488445561138007126002629493097162732812384571025902663967806844910011145590149n, 420],
                    [-468, -1502063881090769441681686645235707709080832772092025104862757011708729326528294836749002960243193435590021463440099959894320088349331931945814811493071673873028436434661291558075509130622082088745991699082838853613507376111163607040355406363518523421811177735046848486751244434720788056496906487864253480292668143252564036287018394750625377259749564867677608702328909422671359184977n, 420],
                    [-471, 1871231507430015936017963291861397910618032620236758356411840356580722255302689768847389638304025119092156898312911370029644434801128650731075220857275082776702701619148880812801619395107459452856653746421799045432953789417034991301389741111849249965754546529695136765651615766045926017385133813562759906993444323681177391822247665564642552711241917447344361370677115345309127675065n, 420],
                    [-474, -1905219731112129286031630304530184288513998445836102775749313176687087494718996893052234698664544776715607428003333737127600478554913123100222939999571704212257778473215256329627398777474459937711690544880877940181830683098788784758060612653155757508944972755745360096762108386825909057593475567095069765338592761747188024137902765154330400721626372960082202262827945969059170698829n, 420],
                    [-477, 1567277828787542484554273347008369278276328636408743076915292223082192495681218187786346798188821644556096191693223043523362003033587553023829884315939956710968959061096644559111250537316382185091225469424636231362463797160711164331691162855837253119639986515799932843712685665463640637646781758220418571826848991200536255537175160438426374288745123409438641740576313008565462276763n, 420],
                    [-480, -1028602691886985538864476698060865911300814041959751809565569679265194281475954767317782033157315199660167258904470517379664611870162643410206262810740713162656605228401218387294450812483423640503938603126162622238067880609796054619822402379811367322903611149876287323659281440514059040095142297596013002684416782362763574641719574909966474096203682341747324359306912140698248088081n, 420],
                    [-484, 5311456890017093553152921365983559994161921771971354075352946583360534506619277223857020687907618498898805633781152002988384685318976761147780169563336939800279223942717239113850881500046819647159521526409447356471407260217491380519416549336122852242640071879436862691491267872712037699968755526004750833436262601265194301655724898212234328936974547856660177370242519126515863380653n, 420],
                    [-487, -2125082808005993213085473505011163562788020137765332845742794151018240558106941087184383380506349540729259355600923558641965535773638505858679545480992546694873248665370457051557560368941228126977175344143072598317018199225128188126073857816716323797072219663959986818448491420364685611743051103377634495625384264386333696877069073856390778108848838341945136106980208125926044383907n, 420],
                    [-490, 647652579511925360777729500707051916406926777376651457281208717451652206208803577146555168290581240844706486108462856669411337923832950673828138726933427345334005336320768690224729339135260063119865558358681632463550243338828946849315995686366212853388190570798649894058584514155751366107108969156556732128251427637194248069818148598297696788942587721462194635123342566404845445694n, 420],
                    [-494, -1475320459622983565188783545092439116727148342548897507414456500985147860734994170312135869431752487273690848044812824580795860515277573271883678803085235857925171971379213766340553775572610217730049240801194190759541580232780960856639986054031122266468509354186894420283253304945947525562546316839610927536508672147400677723188203650414170672373775900410243064257896522973216475907n, 420],
                    [-498, 2459331554476473131099364911461646375235698235062230296565309389145726658418770878636834165350086170317485086156174333654375431341792869821163283082492949981261666170040330330683953038891085862955014827358021088717038826065919319610073430634884929990411170009846229691443964586275053004081239464601257245759581815008838513585751782730401887005117450101592318024771733069183749872868n, 420],
                    [-502, -2929666690044340837024112885829387246046138760202136908569763952546895329319156475096296306046881940753802988403701193121164213901640036846894481518554548656215059147099911357329711183992946392154875202348945934864184968883421557907394423694908079696449626018752523556800258821313604777439067268596344793163668590855783928197906422880090630797790610199874657955022093824126658883172n, 420],
                    [-506, 2428041125317286920415349190059250027553144154067424342865947124311388751713143549513750257218739575330658387914589376900629278718528269248121722889709956145656813907878249645022747574507199597304507159499741765233091139582993700850127692168818494185953839830342638639837889851387169980315501492396010915855596669498076758519505469723707865869725181981838657175590279374732532402904n, 420],
                    [-510, -1358133027503647400217199929150729986421737570572892166088888461802066099299477406169705219022523917355285039179101605836533216624854178327719153462884118725129219729815734081125641417453327991578524635577897210022148102060949893881059598028660113191040575821699663094836136941051355832816500995165192830555785318412240627222536352431868001007383117443861489939999225772473440233872n, 420],
                    [-515, 4952692614107005697434985131088935397309270174549505072636209474656748955592365688510569435604891772175688675391548356960331909766847177402923599124315365464901296446446463494699448830758658634781053756230881083593856945506416651527644911398935833908724286531490964979782463087854857507645155785314746668992222130759323333034539574009594964325055130659490591409557851918550201300702n, 420],
                    [-519, -1131630111376804772443357143062686300701525253559843560694143832253239795575886085223334993180684547782351914519034050221719004222654750705930186726342523728100396177014578673831440061124581728666185766848749393954825303715114815403232406541345354036914378174078405561803261847691106872674664620186439287682752954412106639761975996763753382294968335854162753795462384589583695917778n, 420],
                    [-524, 1547421000133033360832329901591310691690657531835157928960426726038950626642533710600984034177776505672145872348028970296336332659045871965755988907052144692934417206768518960200121825889106148681285278337288493430661327640458088975514849974254584129842336201442713893885482762691850898720067827416772299173440842388880835313793978919522651348189393684192642716334275307954034649978n, 420],
                    [-529, -1200512921245188830304367003600075349702144256158930311457753680580954428522218175990623835538768051897413658251559463539529104568184249574667024880021190853434848896628625655625659157848520373462670525971694611663298632977135189748057661231838114513630465226661404177051299031958215150187245358015487450207869791511218839757736737384566045428180305847121945695685511898417792113024n, 420],
                    [-535, 4963276353939617424912042409107328397892820285070658491616414266528604512983435024641413300446396903322003159885021134672441871476918154314256748978479291138740959360574185169516361887322315434042884692584699576210246592252863262669557196183133312395639329309300564845169716060135670717495998759682684942020256146319510139385176726957895210816372361514300271622266131598558081598922n, 420],
                    [-540, -1015265235240183602648641767706010102858129902491485166500123069676965096083650915082008597134616649117971735176408636261827007362104122606843961396341761352655840334306069244330453517304810842258253911521104274188887246691095321316349893340534423075978422387838286930189950982105879634930493532662709983542186150926375909924792187334975968505586894740042507046813686818940025431764n, 420],
                    [-547, 9401861275260322481058716388547765146787770085777612410368387836482994669221576117019651714400598343822555794006718825500604555802402659957525299437148137941446756641863798847980598765119314610214854919677652816570396222127401943025982421401971558739078012089094753251277531637645282588731484441895900462716646054079824543645238730985087510210825019673961743817249894658241087621028n, 420],
                    [-553, -3539402500391896224458992912545723306460693687361162751580233996094533344037701177523445775617702077185213942285577101786835205517032346300991876174915398669504651278564136620684740317448885184459925577103329144388544002205238450893772225538473994044839983565290787845518708903005299003139924058151892895195297261200540163638471460729681925799149774284326419578661860457034896491621n, 420],
                    [-558, 47460958156192109925620776028239640754744354867570882328765062422566679616262518117678429523863388285374055462583674828584607804320989084866770838849674107279373768599109925469205143705964912689264305773782796228804306818541375025818637074507061683749126416477121245880696392477735973476218971216429556344745290716596981829935333013558379581045321670667611411823411214399212675731n, 420],
                    [-567, -1922473105850786730226449264172462419452364708386769486449428934171985708407247084705900265538612163243174679220700158089738112552976036918074084068852402535206875114363169984565022691128120945939542590234425416975289502753993446386511904737202292587825290516700639613449348793618211424809954637604365615664762974751540691391483120107625439681906450431657937183733473318284897513984n, 420],
                    [-575, 1908141857017546714163756385910373510444486297004346118751434021382537877493126410055083894892483222873935529038283131751681245311414691536305123839665433866524321045161815591283557811417114839687361891316068023642151285019752182056157422749311771850623957896283729520621236941842070859418630745461892410587428421506188400811725561349032557293450347037887215007848995819652465944327n, 420],
                    [-584, -3537340966498797615700656494366535317106304397769169369112367189250000258802201174602235505347651741446098809668202464361624563017170639236446372498464801271027967750609595425005104549769867751800322950506864725762301776982693643721265161980450233295196888290647987093330055064269012063847057313278975638905072280600551362883625444479210401696919435259148099664780435232575003539694n, 420]
                ]
            }
        });

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
    window.Public = Public;
    window.CalcConfig = CalcConfig;
})();