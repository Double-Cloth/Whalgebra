(function () {
    "use strict";

    /**
     * @class BigNumber
     * @description 代表一个不可变的、任意精度的十进制数。
     * 内部表示为 `[power, mantissa]`，即 `mantissa * 10^power`。
     * 符号直接存储在 `mantissa` (一个 BigInt) 中。
     * BigNumber 实例是不可变的；所有修改数字的操作都会返回一个新的 BigNumber 实例。
     */
    class BigNumber {
        /**
         * @constructor
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array|object} x - 用于创建 BigNumber 实例的输入值。支持以下类型：
         * - `string`: 标准或科学记数法表示的数字字符串 (例如, "123.45", "-1.2e-3")。
         * - `number`|`bigint`: JavaScript 的 number 或 bigint 类型。
         * - `BigNumber`|`ComplexNumber`: 从另一个实例创建，将被视为纯实数。
         * - `Array`: 内部数组表示，格式为 `[power, mantissa]` 或 `[power, mantissa, acc]`。
         * @param {object} [options={}] - 可选的配置对象。
         * @param {number} [options.acc=CalcConfig.globalCalcAccuracy] - 此实例的计算精度（有效数字位数）。
         * @param {number} [options.pow=0] - 应用于数字的附加 10 的指数。
         * @throws {Error} 如果输入类型不受支持或数字格式无效。
         * @throws {Error} 如果输入字符串的长度超过 `CalcConfig.MAX_INPUT_LENGTH`。
         * @throws {Error} 如果输入的 `number` 是非有限数（Infinity, -Infinity, NaN）。
         * @throws {Error} 如果科学记数法中的指数过大。
         */
        constructor(x, {acc, pow = 0} = {}) {
            const type = Public.typeOf(x);
            switch (type) {
                case 'array': { // 用于序列化/反序列化的内部表示 `[power, mantissa]` 或 `[power, mantissa, acc]`
                    const len = x.length;
                    if (![2, 3].includes(len)) {
                        throw new Error('[BigNumber] Input error: Array length must be 2 or 3.');
                    }

                    let mantissa = x[1];
                    let power = x[0];

                    // 确定最终精度。
                    const arrayAcc = (len === 3 && x[2] > 0) ? x[2] : undefined;
                    const finalAcc = acc ?? arrayAcc ?? CalcConfig.globalCalcAccuracy;

                    // 如果指定了精度，则可能需要舍入。
                    if (arrayAcc !== undefined || acc !== undefined) {
                        const rounded = BigNumber._roundAndNormalize(mantissa, power, finalAcc);
                        mantissa = rounded.mantissa;
                        power = rounded.power;
                    }

                    const finalPow = power + pow;
                    if (finalPow > Number.MAX_SAFE_INTEGER || finalPow < Number.MIN_SAFE_INTEGER) {
                        throw new Error('[BigNumber] Input error: Power too large or too small');
                    }
                    this.power = finalPow;
                    this.mantissa = mantissa;
                    this.acc = finalAcc;
                    return;
                }

                case 'bignumber':
                case 'object': {
                    // 检查对象是否符合输入要求
                    if ([x.power, x.mantissa, x.acc].includes(undefined) && type === 'object') {
                        throw new Error('[BigNumber] Unsupported input type or invalid number format.');
                    }

                    // 如果用户未指定 acc，则默认继承源对象的 acc
                    const finalAcc = acc ?? x.acc;

                    let realNum;
                    // 当目标精度和源精度完全相同时，跳过舍入
                    if (finalAcc === x.acc) {
                        realNum = {mantissa: x.mantissa, power: x.power};
                    } else {
                        // 否则，进行舍入和规范化
                        realNum = BigNumber._roundAndNormalize(x.mantissa, x.power, finalAcc);
                    }

                    const finalPow = realNum.power + pow;
                    if (finalPow > Number.MAX_SAFE_INTEGER || finalPow < Number.MIN_SAFE_INTEGER) {
                        throw new Error('[BigNumber] Input error: Power too large or too small');
                    }
                    this.power = finalPow;
                    this.mantissa = realNum.mantissa;
                    this.acc = finalAcc;
                    return;
                }

                case 'bigint': {
                    acc = acc ?? CalcConfig.globalCalcAccuracy;
                    const {
                        mantissa: mantissaFromBigInt,
                        power: powerFromBigInt
                    } = BigNumber._roundAndNormalize(x, 0, acc);

                    this.power = powerFromBigInt + pow;
                    this.mantissa = mantissaFromBigInt;
                    this.acc = acc;
                    return;
                }

                case 'number': {
                    if (!Number.isFinite(x)) {
                        throw new Error('[BigNumber] Input error: Non-finite numbers (Infinity, NaN) are not supported.');
                    }
                    if (Number.isInteger(x)) {
                        acc = acc ?? CalcConfig.globalCalcAccuracy;
                        const {
                            mantissa: mantissaFromBigInt,
                            power: powerFromBigInt
                        } = BigNumber._roundAndNormalize(x, 0, acc);

                        this.power = powerFromBigInt + pow;
                        this.mantissa = mantissaFromBigInt;
                        this.acc = acc;
                        return;
                    }
                    x = x.toExponential(); // 转换为可预测的字符串格式。
                    break;
                }

                case 'string':
                    // 安全性：检查输入长度是否超过配置的最大值。
                    if (x.length > CalcConfig.MAX_INPUT_STRING_LENGTH) {
                        throw new Error(`[BigNumber] Input string length exceeds maximum allowed length of ${CalcConfig.MAX_INPUT_STRING_LENGTH}.`);
                    }
                    break;

                default:
                    throw new Error('[BigNumber] Unsupported input type or invalid number format.');
            }
            acc = acc ?? CalcConfig.globalCalcAccuracy;

            // 预处理字符串：移除空白和下划线，并转换为小写以处理 'e' 记数法。
            let mantissaStr = x.replace(/[\s_]/g, '').toLowerCase();

            // 处理科学记数法（例如 "1.23e-10"）。
            if (mantissaStr.includes('e')) {
                const parts = mantissaStr.split('e');
                if (parts.length !== 2 || BigNumber._isInvalidNumericString(parts[1])) {
                    throw new Error('[BigNumber] Unsupported input type or invalid number format.');
                }
                const exponent = Number(parts[1]);
                // 安全性：检查指数本身是否为有限数。
                if (!Number.isFinite(exponent)) {
                    throw new Error('[BigNumber] Input error: Exponent is too large and results in Infinity.');
                }
                // 安全性：检查指数本身是否为整数。
                if (!Number.isInteger(exponent)) {
                    throw new Error('[BigNumber] Input error: Exponent must be an integer.');
                }
                pow += exponent;
                mantissaStr = parts[0];
            }

            if (BigNumber._isInvalidNumericString(mantissaStr)) {
                throw new Error('[BigNumber] Unsupported input type or invalid number format.');
            }

            // 解析清理后的字符串以获取核心组件。
            const [rawPower, rawMantissa] = BigNumber._parseNumericString(mantissaStr);

            // 将解析出的尾数舍入到所需精度，并获取最终的指数。
            const {
                mantissa: finalMantissa,
                power: middlePower
            } = BigNumber._roundAndNormalize(rawMantissa, rawPower, acc);

            // 应用来自选项或科学记数法的任何附加指数。
            const finalPower = middlePower + pow;

            // 为零提供一个清晰、规范的表示，单独处理。
            // 检查下溢：如果数字小到一定程度，则视为零。
            if (rawMantissa === 0n || finalPower + CalcConfig.globalCalcAccuracy < CalcConfig.MIN_INPUT_EXPONENT) {
                this.power = 0;
                this.mantissa = 0n;
                this.acc = acc;
                return;
            } else if (finalPower > CalcConfig.MAX_INPUT_EXPONENT) { // 检查上溢
                throw new Error('[BigNumber] Range error: Input number too large.');
            }

            this.power = finalPower;
            this.mantissa = finalMantissa;
            this.acc = acc;
        }

        /**
         * @readonly
         * @type {string}
         * @description 自定义 `Object.prototype.toString.call()` 的返回值。
         * 这使得 `Public.typeOf(new BigNumber())` 能够返回 'bignumber'。
         */
        get [Symbol.toStringTag]() {
            return 'BigNumber';
        }

        /**
         * @private
         * @static
         * @method _isInvalidNumericString
         * @description 检查一个字符串是否是无效的数字格式。
         * @param {string} input - 要检查的字符串。
         * @returns {boolean} 如果字符串不是有效的数字格式，则返回 true，否则返回 false。
         */
        static _isInvalidNumericString(input) {
            // 此正则表达式匹配一个可选的[+/-]符号，后跟数字。
            // 它可以正确处理像 ".1" 和 "1." 这样的格式。
            const regex = /^([-+])?((\d+(\.\d*)?)|(\.\d+))$/;
            return ['', '.', '+', '-'].includes(input) || !regex.test(input);
        }

        /**
         * @private
         * @static
         * @method _roundAndNormalize
         * @description 将尾数舍入（银行家舍入）到指定精度，并通过调整指数来进行规范化。
         * 此函数使用高效的 BigInt 算术运算来处理大数。
         * @param {bigint|number} mantissa - 原始尾数（可以为负数）。
         * @param {number} power - 原始指数。
         * @param {number} acc - 目标精度（有效数字的位数）。
         * @returns {{mantissa: bigint, power: number}} 一个包含舍入和规范化后的尾数和指数的对象。
         */
        static _roundAndNormalize(mantissa, power, acc) {
            // 类型转换
            if (typeof mantissa === 'number') {
                mantissa = BigInt(mantissa);
            }

            if (mantissa === 0n) {
                return {mantissa: 0n, power: 0};
            }

            const sign = mantissa < 0n ? -1n : 1n;
            let absMantissa = sign < 0n ? -mantissa : mantissa;
            let finalPower = power;

            // 确定是否需要舍入。
            const threshold = 10n ** BigInt(acc);

            // 如果当前位数超过目标精度，则需进行舍入。
            if (absMantissa > threshold) {
                // 计算需要舍弃的位数，并确定用于截断尾数的除数。
                const mantissaLength = absMantissa.toString().length;
                const digitsToShift = mantissaLength - acc;
                const divisor = 10n ** BigInt(digitsToShift);

                // 截断得到基础部分
                let roundedMantissa = absMantissa / divisor;

                // 获取被舍弃的余数部分
                const remainder = absMantissa % divisor;

                // 计算阈值（除数的一半）
                const halfDivisor = divisor / 2n;

                if (remainder > halfDivisor) {
                    // 情况 A: 余数 > 0.5，绝对进位
                    roundedMantissa++;
                } else if (remainder === halfDivisor) {
                    // 情况 B: 余数 = 0.5，银行家舍入（向偶数舍入）
                    // 如果当前最后一位是奇数，则进位变成偶数；如果是偶数则不变
                    if ((roundedMantissa & 1n) === 1n) {
                        roundedMantissa++;
                    }
                }
                // 情况 C: remainder < halfDivisor，直接舍弃（不做操作）

                // 更新尾数和指数
                absMantissa = roundedMantissa;
                finalPower += digitsToShift;
            }

            if (absMantissa === 0n) {
                // 理论上舍入可能导致归零（如果精度极低），虽然罕见但需防范
                return {mantissa: 0n, power: 0};
            }

            while (absMantissa % 10n === 0n) {
                absMantissa /= 10n;
                finalPower++;
            }

            return {mantissa: absMantissa * sign, power: finalPower};
        }

        /**
         * @private
         * @static
         * @method _parseNumericString
         * @description 解析一个数字字符串，并将其分解为指数和带符号的尾数。
         * 例如，"-123.45" 将被解析为 [-2, -12345n]。
         * @param {string} numStr - 要解析的数字字符串。
         * @returns {[number, bigint]} 一个包含指数和带符号尾数的元组。
         */
        static _parseNumericString(numStr) {
            // 逻辑解释:
            // 1. 找到第一个非零数字 (firstNonZero) 和最后一个非零数字 (lastNonZero) 的位置，
            //    以及小数点 (decimalIndex) 的位置。
            // 2. 从 firstNonZero 到 lastNonZero 提取所有数字（忽略小数点）作为尾数 (mantissaStr)。
            // 3. 计算科学记数法的指数 (scientificExponent)。这表示小数点需要移动多少位才能
            //    放到第一个有效数字的后面。例如 "123.45" 的 scientificExponent 是 2，
            //    而 "0.0123" 的 scientificExponent 是 -2。
            // 4. 最终的 power 是 scientificExponent 减去尾数的小数部分长度。
            //    例如 "123.45", mantissa="12345", scientificExponent=2.
            //    power = 2 - (5 - 1) = -2. 最终表示为 12345 * 10^-2.
            const len = numStr.length;
            if (len === 0) {
                return [0, 0n];
            }

            let isNegative = false;
            let startIndex = 0;
            const firstChar = numStr[0];
            if (firstChar === '-') {
                isNegative = true;
                startIndex = 1;
            } else if (firstChar === '+') {
                startIndex = 1;
            }

            let firstNonZero = -1, lastNonZero = -1, decimalIndex = -1;
            for (let i = startIndex; i < len; i++) {
                const char = numStr[i];
                if (char > '0' && char <= '9') {
                    if (firstNonZero === -1) {
                        firstNonZero = i;
                    }
                    lastNonZero = i;
                } else if (char === '.') {
                    decimalIndex = i;
                }
            }

            // 如果没有找到非零数字，则该数值为零。
            if (firstNonZero === -1) {
                return [0, 0n];
            }

            // 通过提取第一个和最后一个非零数字之间的所有数字（并移除小数点）来构建尾数。
            const mantissaStr = (decimalIndex > firstNonZero && decimalIndex < lastNonZero)
                                ? numStr.slice(firstNonZero, decimalIndex) + numStr.slice(decimalIndex + 1, lastNonZero + 1) // 小数点位于非零数字之间如32.45，20.03等
                                : numStr.slice(firstNonZero, lastNonZero + 1);// 小数点不位于非零数字之间如.0003，300.00等

            // 根据小数点相对于有效数字的位置来确定指数。
            const effectiveDecimalIndex = (decimalIndex === -1) ? len : decimalIndex;
            const scientificExponent = (firstNonZero < effectiveDecimalIndex)
                                       ? (effectiveDecimalIndex - firstNonZero - 1)
                                       : (effectiveDecimalIndex - firstNonZero);

            const power = scientificExponent - (mantissaStr.length - 1);

            let mantissa = BigInt(mantissaStr);
            if (isNegative) {
                mantissa = -mantissa;
            }

            return [power, mantissa];
        }

        /**
         * @method valueOf
         * @description 返回 BigNumber 实例的内部数组表示。
         * 值得注意的是，由于它返回一个数组（一个对象）而非一个原始类型（如 number 或 string），
         * 因此它不会像原生 Number 类型那样在标准的算术运算中触发自动类型转换。
         * 例如，`new BigNumber(2) + new BigNumber(3)` 不会因为此方法而直接得到一个数字结果，
         * 而是会触发默认的对象到字符串的转换行为。
         * @returns {[number, bigint, number]} BigNumber 的内部数组表示 `[power, mantissa, accuracy]`。
         */
        valueOf() {
            return [this.power, this.mantissa, this.acc];
        }

        /**
         * @method toString
         * @description 将 BigNumber 实例转换为其标准的十进制字符串表示形式。
         * @param {object} [options={}] - 格式化选项。
         * @param {number} [options.acc=this.acc] - 输出字符串的精度（有效数字位数）。默认为实例自身的精度。
         * @param {string} [options.mode='auto'] - 输出模式。
         * - 'auto': 根据 `CalcConfig.AUTOMATIC_SWITCH_LENGTH` 自动选择 'normal' 或 'scientific'。
         * - 'normal': 标准十进制表示 (例如, "123.45" 或 "0.001")。
         * - 'scientific': 科学记数法表示 (例如, "1.2345E+2")。
         * @returns {string} 数字的字符串表示。
         * @throws {Error} 如果提供的 `accuracy` 不是一个正整数。
         * @throws {Error} 如果生成的字符串长度将超过 `CalcConfig.MAX_STRING_LENGTH`。
         */
        toString({acc = this.acc, mode = 'auto'} = {}) {
            acc = Number(acc);
            if (!Number.isInteger(acc) || acc <= 0) {
                throw new Error('[BigNumber] Input error: Accuracy for toString must be a positive integer.');
            }

            // 在字符串化之前，将数字舍入到所需的输出精度。
            const {
                mantissa: finalMantissa,
                power: finalPower
            } = BigNumber._roundAndNormalize(this.mantissa, this.power, acc);

            let resultString;
            const isNegative = finalMantissa < 0n;
            const mantissaStr = (isNegative ? -finalMantissa : finalMantissa).toString();
            const mantissaLength = mantissaStr.length;

            if (mode === 'auto') {
                mode = Math.abs(mantissaLength + finalPower) > CalcConfig.TO_STRING_AUTOMATIC_SWITCH_LENGTH ? 'scientific' : 'normal';
            }
            if (mode === 'normal') {
                if (finalMantissa === 0n) { // 舍入后可能为零
                    return '0';
                }

                if (finalPower >= 0) { // 正指数：在末尾追加零。
                    // 安全性：检查结果字符串是否会过长。
                    if (mantissaLength + finalPower > CalcConfig.MAX_TO_STRING_LENGTH) {
                        throw new Error('[BigNumber] Range error: Number is too large to be represented as a string.');
                    }
                    resultString = mantissaStr + '0'.repeat(finalPower);
                } else { // 负指数：插入小数点或前置引导零。
                    const absPower = -finalPower;
                    if (mantissaLength > absPower) {
                        // 小数点位于尾数内部。
                        if (mantissaLength > CalcConfig.MAX_TO_STRING_LENGTH) {
                            throw new Error('[BigNumber] Range error: Number is too large to be represented as a string.');
                        }
                        const decimalPosition = mantissaLength - absPower;
                        resultString = mantissaStr.slice(0, decimalPosition) + '.' + mantissaStr.slice(decimalPosition);
                    } else {
                        // 数字小于 1；前置 "0." 和引导零。
                        const leadingZeros = absPower - mantissaLength;
                        if (2 + leadingZeros + mantissaLength > CalcConfig.MAX_TO_STRING_LENGTH) { // 2 for "0."
                            throw new Error('[BigNumber] Range error: Number is too small to be represented as a string.');
                        }
                        resultString = '0.' + '0'.repeat(leadingZeros) + mantissaStr;
                    }
                }

                if (isNegative) {
                    return '-' + resultString;
                }
                return resultString;
            }
            if (mode === 'scientific') {
                if (finalMantissa === 0n) { // 舍入后可能为零
                    return '0E+0';
                }

                const midString = mantissaStr.slice(1);
                const midLength = midString.length;
                const scientificPower = BigInt(midLength === 0 ? finalPower : (finalPower + midLength)).toString();
                if (midLength === 0) { // 尾数只有1位
                    resultString = `${mantissaStr}${scientificPower < 0 ? 'E' : 'E+'}${scientificPower}`;
                } else {
                    resultString = `${mantissaStr[0]}.${midString}${scientificPower < 0 ? 'E' : 'E+'}${scientificPower}`;
                }

                if (isNegative) {
                    return '-' + resultString;
                }
                return resultString;
            }
        }
    }

    /**
     * @class ComplexNumber
     * @description 代表一个不可变的、任意精度的复数。
     * 它的实部和虚部由 `BigNumber` 实例表示，允许进行不受标准 JavaScript 数字精度限制的计算。
     * ComplexNumber 实例是不可变的；所有修改数字的操作都会返回一个新的 ComplexNumber 实例。
     */
    class ComplexNumber {
        /**
         * @constructor
         * @description 创建一个新的 ComplexNumber 实例。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array|object} x - 用于创建复数实例的输入值。支持以下类型：
         * - `string`: 标准代数形式的复数 (例如 "1+2i", "-5.2e-3-4.1i")。
         * - `number`|`bigint`|`BigNumber`: 被视为纯实数 (虚部为 0)。
         * - `ComplexNumber`: 创建一个克隆，可以指定新的精度。
         * - `Array`: 支持两种格式：
         *   - `[real, imag]`: `real` 和 `imag` 可以是任何受支持的构造类型。
         *   - `[power, mantissa, acc]`: BigNumber 的内部序列化格式，将被解释为纯实数。
         * @param {object} [options={}] - 可选的配置对象。
         * @param {number} [options.acc=CalcConfig.getAccuracy()] - 用于 `BigNumber` 的精度。
         * @param {number} [options.pow=0] - 整个复数将乘以 `10^pow`。
         * @throws {Error} 如果输入类型或格式不受支持。
         */
        constructor(x, {acc, pow = 0} = {}) {
            switch (Public.typeOf(x)) {
                case 'array': {
                    const len = x.length;
                    // 长度为 2: [real, imag]
                    // 长度为 3: [power, mantissa, acc] (一个 BigNumber 序列化数组。若 acc 小于等于0，则按照默认精度构造)
                    if (![2, 3].includes(len)) {
                        throw new Error('[ComplexNumber] Input error: Array length must be 2 or 3.');
                    }
                    if (len === 2) {
                        let r = new BigNumber(x[0], {acc: acc});
                        let i = new BigNumber(x[1], {acc: acc});

                        // 强制统一精度
                        const finalAcc = Math.min(r.acc, i.acc);

                        // 如果某个组件的精度更高，则将其降下来
                        if (r.acc > finalAcc) {
                            r = new BigNumber(r, {acc: finalAcc});
                        }
                        if (i.acc > finalAcc) {
                            i = new BigNumber(i, {acc: finalAcc});
                        }

                        this.re = r;
                        this.im = i;
                    } else { // len === 3
                        this.re = new BigNumber(x, {acc: acc, pow: pow});
                        this.im = new BigNumber([0, 0n, this.re.acc]);
                    }
                    break;
                }

                case 'bignumber':
                    this.re = new BigNumber(x, {acc: acc, pow: pow});
                    this.im = new BigNumber([0, 0n, this.re.acc]);
                    break;

                case 'complexnumber':
                case 'object': {
                    const realAccuracy = acc ?? x.acc;
                    this.re = new BigNumber(x.re, {acc: realAccuracy, pow: pow});
                    this.im = new BigNumber(x.im, {acc: realAccuracy, pow: pow});
                    break;
                }

                case 'string': {
                    if (x.length > CalcConfig.MAX_INPUT_STRING_LENGTH) {
                        throw new Error(`[ComplexNumber] Input string length exceeds maximum allowed length of ${CalcConfig.MAX_INPUT_STRING_LENGTH}.`);
                    }
                    const ParseComplex = ComplexNumber._parseComplex(x);
                    this.re = new BigNumber(ParseComplex.re, {acc: acc, pow: pow});
                    this.im = new BigNumber(ParseComplex.im, {acc: acc, pow: pow});
                    break;
                }

                case 'number':
                case 'bigint':
                    this.re = new BigNumber(x, {acc: acc, pow: pow});
                    this.im = new BigNumber([0, 0n, this.re.acc]);
                    break;

                default:
                    throw new Error('[ComplexNumber] Unsupported input type or invalid number format.');
            }

            // 如果虚部为零，则设置一个标志。
            this.onlyReal = this.im.mantissa === 0n;
            this.acc = Math.min(this.re.acc, this.im.acc);
        }

        /**
         * @readonly
         * @type {string}
         * @description 自定义 `Object.prototype.toString.call()` 的返回值。
         * 这使得 `Public.typeOf(new ComplexNumber())` 能够返回 'complexnumber'。
         */
        get [Symbol.toStringTag]() {
            return 'ComplexNumber';
        }

        /**
         * @private
         * @static
         * @method _parseComplex
         * @description 一个健壮的复数解析器，能从字符串中提取实部和虚部。
         * 此方法设计用于处理多种常见的复数格式，包括：
         * - 标准代数形式: "a+bi", "a-bi", "a + bi"
         * - 纯实数或纯虚数: "a", "bi", "-bi"
         * - 科学记数法: "-1.23e-4 + 5.67e+8i"
         * - J/j 作为虚数单位: "3+4j"
         * - 乘号和顺序变化: "3+i*4", "i*4+3"
         * - 隐式系数为 1: "a+i", "a-i", "i", "-i"
         *
         * @param {string} complexString - 表示复数的输入字符串。
         * @returns {{re: string, im: string}} 一个包含实部 (`re`) 和虚部 (`im`) 字符串的对象。
         * @throws {Error} 如果输入字符串的格式无效或不明确。
         */
        static _parseComplex(complexString) {
            // 步骤 1: 预处理和规范化输入字符串。
            // - 移除所有空白字符和下划线。
            // - 将所有虚数单位 (I, j, J) 统一转换为小写的 'i'。
            let sanitizedStr = complexString.replace(/[\s_]/g, '').replace(/[JjI]/g, 'i').replace(/\[i]/g, 'i');

            // 步骤 2: 标准化虚部格式，处理数字在 'i' 之后的情况。
            // - 例如，将 "i*2.5" 或 "i2.5" 转换为标准的 "2.5i"。
            // - 这使得后续的正则表达式可以基于 'i' 在末尾的假设进行匹配。
            const numPatternForSwap = /i[*]?((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
            sanitizedStr = sanitizedStr.replace(numPatternForSwap, '$1i');

            // 如果字符串为空，则无法解析。
            if (sanitizedStr === '') {
                throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
            }

            // 步骤 3: 使用正则表达式匹配所有可能的实部和虚部项。
            // 这个正则表达式由两部分组成，用 OR (|) 连接：
            // 1. `([+-]?(...)?i)`: 匹配一个完整的虚部项。它能捕获可选的符号、可选的数字（包括科学记数法）、可选的乘号 '*'，并以 'i' 结尾。
            // 2. `([+-]?(...))`: 匹配一个完整的实部项（一个数字，包括科学记数法）。
            const termRegex = /([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)?[*]?i)|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
            const allMatches = [...sanitizedStr.matchAll(termRegex)];
            const validTerms = allMatches.filter(match => match[0] !== '');

            // 步骤 4: 验证匹配结果的完整性和合法性。
            // 检查所有匹配到的项的长度之和是否等于净化后字符串的总长度。
            // 如果不相等，说明字符串中包含无法识别的字符（如 "3+4i+j"）。
            const totalMatchedLength = validTerms.reduce((acc, term) => acc + term[0].length, 0);
            if (totalMatchedLength !== sanitizedStr.length) {
                throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
            }
            // 一个有效的复数最多只能有两个项（一个实部，一个虚部）。
            if (validTerms.length === 0 || validTerms.length > 2) {
                throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
            }

            // 步骤 5: 分离并存储实部和虚部。
            let realPart = '0', hasReal = false;
            let imagPart = '0', hasImag = false;

            for (const match of validTerms) {
                const term = match[0];
                if (term.endsWith('i')) {
                    if (hasImag) { // 检查是否已找到虚部，防止 "3i+4i" 这样的格式。
                        throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
                    }
                    hasImag = true;
                    if (term === 'i' || term === '+i') {
                        imagPart = '1';
                    } else if (term === '-i') {
                        imagPart = '-1';
                    } else {
                        // 移除末尾的 'i' 和可能存在的 '*'，得到虚部的数值字符串。
                        imagPart = term.slice(0, -1).replace(/\*/g, '');
                    }
                } else {
                    if (hasReal) { // 检查是否已找到实部，防止 "3+4" 这样的格式。
                        throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
                    }
                    hasReal = true;
                    realPart = term;
                }
            }
            return {re: realPart, im: imagPart};
        }

        /**
         * @method valueOf
         * @description 返回 ComplexNumber 实例的内部嵌套数组表示。
         * 它通过递归调用其 `re` 和 `im` 组件（它们是 BigNumber 实例）的 `valueOf` 方法来工作。
         * @returns {[Array, Array]} 一个嵌套数组，格式为 `[[实部数组], [虚部数组]]`，
         * 其中每个内部数组都是 `[power, mantissa, accuracy]` 的形式。
         */
        valueOf() {
            return [this.re.valueOf(), this.im.valueOf()];
        }

        /**
         * @method toString
         * @description 将 ComplexNumber 实例转换为其标准的字符串表示形式。
         * @param {object} [options={}] - 一个包含格式化选项的配置对象。
         * @param {number} [options.acc=this.acc] - 输出字符串的精度（有效数字位数）。
         * @param {string} [options.printMode='algebra'] - 输出形式 ('algebra', 'polar')。
         * @param {string} [options.mode='auto'] - 输出模式 ('auto', 'normal', 'scientific')。
         * @returns {string} - 复数的标准代数形式字符串 (a + bi) 或极坐标形式 (r∠θ)。
         */
        toString({acc = this.acc, printMode = CalcConfig.globalPrintMode, mode = 'auto'} = {}) {
            // 纯实数
            if (this.onlyReal) {
                return this.re.toString({acc: acc, mode: mode});
            }

            if (printMode === 'algebra') {
                const reStr = this.re.toString({acc: acc, mode: mode});
                let imStr = this.im.toString({acc: acc, mode: mode});
                if (imStr.includes('E')) {
                    imStr += '*';
                }

                // 纯虚数
                if (['0', '0E+0'].includes(reStr)) {
                    if (['1', '1E+0'].includes(imStr)) {
                        return '[i]';
                    }
                    if (['-1', '-1E+0'].includes(imStr)) {
                        return '-[i]';
                    }
                    return imStr + '[i]';
                }

                // 完整复数
                if (this.im.mantissa < 0n) { // 虚部为负
                    if (['-1', '-1E+0'].includes(imStr)) {
                        return `${reStr}-[i]`;
                    }
                    return `${reStr}${imStr}[i]`; // imStr 已包含 "-", e.g., "3" + "-2i" -> "3-2i"
                } else { // 虚部为正
                    if (['1', '1E+0'].includes(imStr)) {
                        return `${reStr}+[i]`;
                    }
                    return `${reStr}+${imStr}[i]`; // 需要手动添加 "+"
                }
            } else {
                // 计算模长和辐角
                const modulus = MathPlus.abs(this).re.toString({acc: acc, mode: mode});
                let argument = MathPlus.arg(this).re.toString({acc: acc, mode: mode});
                if (argument.includes('E') || argument.includes('-')) {
                    argument = `(${argument})`;
                }

                // 拼接结果
                if (['0', '0E+0'].includes(argument)) {
                    return modulus;
                }
                return `${modulus}[toPolar]${argument}`;
            }
        }
    }

    /**
     * @class MathPlus
     * @description 一个静态工具类，提供基于 BigNumber 和 ComplexNumber 的高级数学函数。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class MathPlus {
        /**
         * @constructor
         * @description MathPlus 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 MathPlus 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[MathPlus] MathPlus is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _oppositeNumber
         * @description (内部辅助方法) 计算一个 BigNumber 或 ComplexNumber 的相反数。
         * @param {BigNumber|ComplexNumber|string|number} x - 需要取反的输入值。
         * @returns {BigNumber|ComplexNumber} 输入值的相反数。
         */
        static _oppositeNumber(x) {
            // 根据输入值的精确类型，分情况处理。
            switch (Public.typeOf(x)) {
                // 情况一: 输入是 BigNumber
                case 'bignumber':
                    // BigNumber 的相反数是一个具有相同 power 和 acc，但 mantissa 相反的新 BigNumber。
                    // 我们使用数组构造函数来高效地创建一个新的 BigNumber 实例。
                    return new BigNumber([x.power, -x.mantissa, x.acc]);

                // 情况二: 输入是 ComplexNumber
                case 'complexnumber':
                    // 复数的相反数是其实部和虚部各自的相反数： -(a + bi) = (-a) + (-b)i
                    // 通过递归调用 _oppositeNumber 来实现。
                    return new ComplexNumber([MathPlus._oppositeNumber(x.re), MathPlus._oppositeNumber(x.im)]);

                // 默认情况: 处理字符串、数字等其他类型
                default: {
                    // 将输入首先转换为标准的 ComplexNumber 实例。
                    const input = new ComplexNumber(x);
                    // 然后递归调用本函数，进入 'complexnumber' 分支进行处理。
                    return MathPlus._oppositeNumber(input);
                }
            }
        }

        /**
         * @private
         * @static
         * @method _customFunc (内部辅助方法)
         * @description 在 `MathPlus.calc` 解析器内部，作为执行用户自定义函数 f(x) 或 g(x) 的分发器。
         * 当解析器遇到 'f' 或 'g' 词法单元时，会调用此方法。它通过递归调用 `MathPlus.calc` 来计算相应的函数体表达式，
         * 并巧妙地传递上下文，从而实现 f(x) 和 g(x) 之间的相互调用。
         * @param {'f'|'g'} token - 标识要执行哪个函数的词法单元，值为 'f' 或 'g'。
         * @param {object} funcs - 一个包含 f 和 g 函数体定义的对象，例如 `{ f: 'x^2', g: 'f(x)+1' }`。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} unknown - 要代入表达式中变量 'x' 的具体值。
         * @param {number} acc - 计算精度。
         * @returns {ComplexNumber} 自定义函数在给定 'x' 值下的计算结果。
         */
        static _customFunc(token, funcs, unknown, acc) {
            // 根据传入的 token ('f' 或 'g')，选择要执行的函数。
            const another = token === 'f' ? 'g' : 'f';
            // 如果要计算 f(x)，则递归调用 calc 来解析 funcs.f。
            // 关键点：在递归调用时，需要将 g(x) 的定义 (funcs.g) 也传入上下文，
            // 以便 f(x) 的表达式中可以正确地调用 g(x)。
            // 'unknown' 则作为变量 'x' 的值被代入。
            return MathPlus.calc(funcs[token], {
                [another]: funcs[another],
                unknown: unknown,
                acc: acc
            })[0];
        }

        /**
         * @private
         * @static
         * @method _toLessThanHalfPi (内部辅助方法)
         * @description 在 `MathPlus` 三角函数底层实现中，负责执行“角度归约” (Range Reduction) 关键步骤。
         * 为了确保泰勒级数展开的高效收敛和数值精度，此方法将任意范围的输入角度（包括负数和大角度）映射到最优计算区间 [0, pi/2] 内。
         * 它利用三角函数的周期性和对称性诱导公式，在高精度模式下完成映射，并根据函数类型（sin 或 cos）精确追踪并计算归约过程产生的符号变化。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} angle - 需要进行归约的原始角度值（将被转换为实部处理）。
         * @param {'sin'|'cos'} name - 当前计算的三角函数名称。此参数决定了象限映射时的符号变换逻辑（例如 `sin(-x)` 需变号，而 `cos(-x)` 不变）。
         * @returns {[BigNumber, bigint]} 返回一个包含两个元素的数组：
         * 1. 归约到 [0, pi/2] 区间后的高精度角度值（内部数据结构）。
         * 2. 符号修正因子 (`1n` 或 `-1n`)，用于在最终计算结果上叠加正确的正负号。
         * @throws {Error} 如果输入角度的绝对值过大（如超过 440 弧度），导致现有精度下无法保证取模结果的准确性时，抛出异常（或打印警告）。
         */
        static _toLessThanHalfPi(angle, name) {
            // 提取实部
            angle = new ComplexNumber(angle).re;
            const acc = angle.acc;

            const typeFactor = name === 'sin' ? 1n : -1n;
            let changeSign = 1n; // -1 为变号，1 为不变号

            // 将 re 映射到 [0, 2π) 区间，并记录符号
            if (angle.mantissa < 0n) {
                angle = MathPlus._oppositeNumber(angle);

                // sin(-x) = -sin(x) -> 变号 (1 * -1)
                // cos(-x) =  cos(x) -> 不变 (-1 * -1 = 1)
                changeSign = -typeFactor;
            }

            // 利用周期性，将 re 映射到 [0, 2π) 区间，并使用高精度防止精度损失。
            const highPrecisionAcc = -CalcConfig.constants.invTwoPi[0];
            if (MathPlus.minus(angle, [highPrecisionAcc >> 1, 1n, acc]).re.mantissa >= 0n) {
                if (MathPlus.minus(angle, [highPrecisionAcc, 1n, acc]).re.mantissa >= 0n) {
                    throw new Error(`[MathPlus] Input value (${angle.toString()}) is too large.`);
                }
                console.warn('[MathPlus] Unexpected loss of precision occurred in trigonometric calculations.');
            }
            const highPrecisionRe = new ComplexNumber(angle, {acc: highPrecisionAcc});
            const n = MathPlus.floor(MathPlus.times(highPrecisionRe, CalcConfig.constants.invTwoPi));
            angle = MathPlus.minus(highPrecisionRe, MathPlus.divide(n, CalcConfig.constants.invTwoPi)).re;

            // 利用 cos(x) = cos(2π - x)，将 re 从 (π, 2π) 映射到 (0, π)
            if (MathPlus.minus(angle, CalcConfig.constants.pi).re.mantissa > 0n) {
                angle = MathPlus.minus(
                    MathPlus.times([0, 2n, acc], CalcConfig.constants.pi),
                    angle
                ).re;

                // sin(2π - x) = -sin(x) -> 变号
                // cos(2π - x) =  cos(x) -> 不变
                // 逻辑推导：
                // if sin (1):  -1 * 1 * current = -current (变)
                // if cos (-1): -1 * -1 * current = current (不变)
                changeSign = -typeFactor * changeSign;
            }

            // 利用 cos(x) = -cos(π - x)，将 re 从 [π/2, π] 映射到 [0, π/2]
            if (MathPlus.minus(MathPlus.times(angle, [0, 2n, acc]), CalcConfig.constants.pi).re.mantissa >= 0n) {
                angle = MathPlus.minus(CalcConfig.constants.pi, angle).re;

                // sin(π - x) = sin(x)  -> 不变
                // cos(π - x) = -cos(x) -> 变号
                // 逻辑推导：
                // if sin (1):  1 * current = current (不变)
                // if cos (-1): -1 * current = -current (变)
                changeSign = typeFactor * changeSign;
            }

            return [angle, changeSign];
        }

        /**
         * @static
         * @method re
         * @description 提取一个复数的实部。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 一个新的 ComplexNumber 实例，其值等于输入值的实部（虚部为零）。
         * @example
         * // 返回一个代表 3 + 0i 的 ComplexNumber
         * MathPlus.re('3+4i');
         *
         * // 返回一个代表 -5 + 0i 的 ComplexNumber
         * MathPlus.re(-5);
         */
        static re(x) {
            const input = new ComplexNumber(x);
            // 从输入中提取实部 (input.re 是一个 BigNumber)
            // 然后用这个值创建一个新的、纯实数的 ComplexNumber
            return new ComplexNumber(input.re);
        }

        /**
         * @static
         * @method im
         * @description 提取一个复数的虚部。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 一个新的 ComplexNumber 实例，其值等于输入值的虚部（新实例的虚部为零）。
         * @example
         * // 对于 "3+4i"，虚部的值是 4。
         * // 此方法返回一个代表 4 + 0i 的 ComplexNumber。
         * MathPlus.im('3+4i');
         *
         * // 对于纯实数，虚部为 0。
         * // 返回一个代表 0 + 0i 的 ComplexNumber。
         * MathPlus.im(-5);
         */
        static im(x) {
            const input = new ComplexNumber(x);
            // 从输入中提取虚部 (input.im 是一个 BigNumber)
            // 然后用这个值创建一个新的、纯实数的 ComplexNumber
            return new ComplexNumber(input.im);
        }

        /**
         * @static
         * @method arg
         * @description 计算一个复数的辐角 (argument)，也称为相位 (phase)。
         * 结果以弧度表示，通常在 (-π, π] 区间内。
         * - 对于 z = a + bi, 辐角是复平面上从正实轴到代表 z 的向量所成的角。
         * - 此方法有效地实现了 `atan2(b, a)` 的功能。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 一个纯实数的 ComplexNumber 实例，代表输入值的辐角（弧度）。
         * @example
         * // 1 (正实数) -> 0
         * MathPlus.arg(1);
         *
         * // i (纯虚数) -> π/2 ≈ 1.57
         * MathPlus.arg('i');
         *
         * // -1 (负实数) -> π ≈ 3.14
         * MathPlus.arg(-1);
         *
         * // -i (负纯虚数) -> -π/2 ≈ -1.57
         * MathPlus.arg('-i');
         *
         * // 1 + i (第一象限) -> π/4 ≈ 0.785
         * MathPlus.arg('1+i');
         *
         * // -1 + i (第二象限) -> 3π/4 ≈ 2.356
         * MathPlus.arg('-1+i');
         */
        static arg(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度
            const zero = new ComplexNumber([0, 0n, acc]);

            // --- 情况 1: 输入的实部为 0 ---
            // 这意味着数字位于虚轴上 (包括原点)。
            if (input.re.mantissa === 0n) {
                // 如果它是一个纯实数 (即 0)，则辐角为 0。
                if (input.onlyReal) {
                    throw new Error('[MathPlus] The argument of 0 is undefined.');
                }
                // 如果是纯虚数:
                // - 虚部为正 (例如, 2i), 辐角为 π/2。
                // - 虚部为负 (例如, -2i), 辐角为 -π/2。
                return MathPlus.divide(
                    CalcConfig.constants.pi,
                    [0, input.im.mantissa < 0n ? -2n : 2n, acc]
                );
            }
            // --- 情况 2: 输入为纯实数 (且实部不为 0) ---
            if (input.onlyReal) {
                // - 正实数 (例如, 3), 位于正实轴上，辐角为 0。
                // - 负实数 (例如, -3), 位于负实轴上，辐角为 π。
                return input.re.mantissa > 0n ? zero : new ComplexNumber(CalcConfig.constants.pi, {acc: acc});
            }
            // --- 情况 3: 一般复数 (实部和虚部均不为 0) ---
            // 核心思想是使用 arctan(虚部/实部) 来计算，但需要根据象限进行调整。
            const result = MathPlus.arctan(MathPlus.divide(input.im, input.re));

            // 如果实部为负，说明数字在第二或第三象限。
            // 标准的 arctan 结果范围是 (-π/2, π/2)，需要进行修正。
            if (input.re.mantissa < 0n) {
                // - 第二象限 (实部 < 0, 虚部 > 0): 辐角 = arctan(b/a) + π
                // - 第三象限 (实部 < 0, 虚部 < 0): 辐角 = arctan(b/a) - π
                return MathPlus[input.im.mantissa < 0n ? 'minus' : 'plus'](result, CalcConfig.constants.pi);
            }

            // 如果实部为正 (第一或第四象限)，arctan 的计算结果就是正确的辐角。
            return result;
        }

        /**
         * @static
         * @method conj
         * @description 计算一个复数的共轭复数。
         * 共轭复数的实部与原数相同，虚部符号相反 (a + bi → a - bi)。
         * 这个实现通过复用 _oppositeNumber 辅助方法来提高代码的抽象性和可读性。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。可以是表示复数或实数的任何受支持的类型。
         * @returns {ComplexNumber} 一个新的 ComplexNumber 实例，代表输入值的共轭复数。
         * @example
         * // 返回一个代表 3 - 4i 的 ComplexNumber
         * MathPlus.conj('3+4i');
         *
         * // 对于实数，共轭复数是其本身。返回 5 + 0i。
         * MathPlus.conj(5);
         */
        static conj(x) {
            // 1. 将输入统一转换为 ComplexNumber 实例。
            const input = new ComplexNumber(x);

            // 2. 构造新的 ComplexNumber 实例。
            //    - 实部 (input.re) 保持不变。
            //    - 虚部 (input.im) 通过调用 _oppositeNumber 方法来取其相反数。
            return new ComplexNumber([input.re, MathPlus._oppositeNumber(input.im)]);
        }

        /**
         * @static
         * @method toPolar
         * @description 将极坐标 (r, θ) 转换为笛卡尔坐标下的复数 (x + yi)。
         * - 计算公式为：r * (cos(θ) + i * sin(θ))。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 极坐标的模长 (r, a non-negative real number)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 极坐标的辐角 (θ, in radians)。
         * @returns {ComplexNumber} 代表转换后笛卡尔坐标的 ComplexNumber 实例。
         * @example
         * // r=2, θ=π/3 -> 2 * (cos(π/3) + i*sin(π/3)) -> 1 + i*sqrt(3)
         * MathPlus.toPolar(2, Math.PI / 3);
         */
        static toPolar(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const acc = Math.min(inputA.acc, inputB.acc);
            const cosTheta = MathPlus.cos(inputB);
            const sinTheta = MathPlus.sin(inputB);
            // 构造复数 (cos(θ) + i*sin(θ))
            const complexExponential = MathPlus.plus(
                cosTheta,
                [MathPlus._oppositeNumber(sinTheta.im), sinTheta.re]
            );
            // 计算最终结果 r * (cos(θ) + i*sin(θ))
            const result = MathPlus.times(inputA, complexExponential);
            return new ComplexNumber(result, {acc: acc});
        }

        /**
         * @static
         * @method plus
         * @description 计算两个数的和。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 第一个加数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 第二个加数。
         * @returns {ComplexNumber} 代表两个数之和的 ComplexNumber 实例。
         * @example
         * // 复数加法: (1+2i) + (3-4i) = 4-2i
         * MathPlus.plus('1+2i', '3-4i');
         *
         * // 实数加法: 123 + 4.5 = 127.5
         * MathPlus.plus(123, 4.5);
         */
        static plus(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            // 优化路径：如果两个数都是纯实数，则直接执行 BigNumber 加法。
            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re;
                const reB = inputB.re;

                // 确定运算精度
                const resultAcc = Math.min(reA.acc, reB.acc);
                let mantissaA = reA.mantissa;
                let mantissaB = reB.mantissa;
                // 对齐指数（小数点）
                const powerDifference = reB.power - reA.power;

                // 如果数量级相差过大则直接返回
                const bigIntAbs = (num) => num < 0n ? -num : num;
                const guardAcc = resultAcc + 5;
                if (powerDifference > guardAcc) {
                    const diff = bigIntAbs(mantissaB) - bigIntAbs(mantissaA);
                    if (diff > -10n) {
                        return new ComplexNumber(inputB, {acc: resultAcc});
                    }
                } else if (powerDifference < -guardAcc) {
                    const diff = bigIntAbs(mantissaA) - bigIntAbs(mantissaB);
                    if (diff > -10n) {
                        return new ComplexNumber(inputA, {acc: resultAcc});
                    }
                }

                // 通过将尾数乘以 10 的幂来对其进行缩放对齐。
                if (powerDifference < 0) {
                    // reB 的指数更小，因此需要放大 reA 的尾数。
                    mantissaA *= 10n ** BigInt(-powerDifference);
                } else if (powerDifference > 0) {
                    // reA 的指数更小，因此需要放大 reB 的尾数。
                    mantissaB *= 10n ** BigInt(powerDifference);
                }
                // 如果 powerDifference 为 0，则无需缩放。

                // 计算
                const resultMantissa = mantissaA + mantissaB;

                // 构造结果
                // 结果的指数是两个数中较小的那个。
                const resultPower = Math.min(reA.power, reB.power);

                // 注意：直接使用 resultMantissa (bigint) 和 resultPower (number) 创建 BigNumber
                // 需要通过 ComplexNumber 构造函数来完成，因为它能处理这种情况。
                return new ComplexNumber(resultMantissa, {pow: resultPower, acc: resultAcc});

            }

            // 通用路径：对于复数，递归地将实部和虚部分别相加。
            // (a + bi) + (c + di) = (a + c) + (b + d)i
            const resultRe = MathPlus.plus(inputA.re, inputB.re);
            const resultIm = MathPlus.plus(inputA.im, inputB.im);

            // 组合结果。resultRe 和 resultIm 是纯实数的 ComplexNumber，
            // 因此我们需要提取它们的实部 (.re) 来构造最终的复数。
            return new ComplexNumber([resultRe.re, resultIm.re]);
        }

        /**
         * @static
         * @method minus
         * @description 计算两个数的差 (a - b)。
         * 该实现通过将减法转换为加法 (a + (-b)) 来复用现有的 `plus` 和 `_oppositeNumber` 方法，
         * 展现了优秀的代码抽象。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被减数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 减数。
         * @returns {ComplexNumber} 代表两个数之差的 ComplexNumber 实例。
         * @example
         * // 复数减法: (1+2i) - (3-4i) = -2+6i
         * MathPlus.minus('1+2i', '3-4i');
         *
         * // 实数减法: 10 - 1.5 = 8.5
         * MathPlus.minus(10, 1.5);
         */
        static minus(a, b) {
            // a - b 等价于 a + (-b)
            return MathPlus.plus(a, MathPlus._oppositeNumber(b));
        }

        /**
         * @static
         * @method times
         * @description 计算两个数的乘积。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 第一个乘数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 第二个乘数。
         * @returns {ComplexNumber} 代表两个数乘积的 ComplexNumber 实例。
         * @example
         * // 复数乘法: (1+2i) * (3-4i) = 3 - 4i + 6i - 8i^2 = 3 + 2i + 8 = 11+2i
         * MathPlus.times('1+2i', '3-4i');
         *
         * // 实数乘法: -1.5 * 10 = -15
         * MathPlus.times(-1.5, 10);
         */
        static times(a, b) {
            // 将输入统一转换为 ComplexNumber 实例以便处理。
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            // 优化路径：如果两个数都是纯实数，则直接执行 BigNumber 乘法。
            // 这种方式避免了不必要的复数运算开销，效率更高。
            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re; // 实部 A
                const reB = inputB.re; // 实部 B

                // 1. 计算尾数：两个 BigNumber 的尾数直接相乘。
                const resultMantissa = reA.mantissa * reB.mantissa;
                // 2. 计算指数：两个 BigNumber 的指数相加。
                //    (m1 * 10^p1) * (m2 * 10^p2) = (m1 * m2) * 10^(p1 + p2)
                const resultPower = reA.power + reB.power;

                // 3. 确定运算精度
                const resultAcc = Math.min(reA.acc, reB.acc);

                // 4. 构造结果：使用计算出的新尾数和指数创建一个新的纯实数 ComplexNumber。
                return new ComplexNumber(resultMantissa, {pow: resultPower, acc: resultAcc});
            }

            // 通用路径：处理复数乘法。
            // 应用公式：(a + bi) * (c + di) = (ac - bd) + (ad + bc)i
            // 其中 a=inputA.re, b=inputA.im, c=inputB.re, d=inputB.im

            // 通过递归调用 MathPlus.times 来计算每个部分。
            // 由于 re 和 im 都是 BigNumber，这些递归调用将进入上面的优化路径。
            const ac = MathPlus.times(inputA.re, inputB.re); // a * c
            const bd = MathPlus.times(inputA.im, inputB.im); // b * d
            const ad = MathPlus.times(inputA.re, inputB.im); // a * d
            const bc = MathPlus.times(inputA.im, inputB.re); // b * c

            // 计算最终结果的实部 (ac - bd)
            const realPart = MathPlus.minus(ac, bd);
            // 计算最终结果的虚部 (ad + bc)
            const imagPart = MathPlus.plus(ad, bc);

            // 组合结果。realPart 和 imagPart 是纯实数的 ComplexNumber，
            // 因此我们需要提取它们的实部 (.re) 来构造最终的复数。
            return new ComplexNumber([realPart.re, imagPart.re]);
        }

        /**
         * @static
         * @method divide
         * @description 计算两个数的商 (a / b)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被除数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 除数。
         * @returns {ComplexNumber} 代表两个数之商的 ComplexNumber 实例。
         * @throws {Error} 如果除数为零。
         * @example
         * // 复数除法: (11+2i) / (3-4i) = 1+2i
         * MathPlus.divide('11+2i', '3-4i');
         *
         * // 实数除法: 10 / 4 = 2.5
         * MathPlus.divide(10, 4);
         */
        static divide(a, b) {
            // 将输入统一转换为 ComplexNumber 实例以便处理。
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            // 检查除数是否为零。
            if (inputB.re.mantissa === 0n && inputB.im.mantissa === 0n) {
                throw new Error('[MathPlus] mathematical error: Division by zero.');
            }

            // 优化路径：如果两个数都是纯实数，则直接执行 BigNumber 除法。
            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re;
                const reB = inputB.re;

                // 确定运算精度
                // 结果的精度不应超过操作数的最低精度。
                const resultAcc = Math.min(reA.acc, reB.acc);

                // --- 精度优化 ---
                // 为了在 BigInt 的整数除法中得到足够精确的结果，我们需要放大被除数的尾数。
                // 理想的放大位数不仅取决于目标精度(resultAcc)，还取决于两个尾数的相对大小。
                const lenA = (reA.mantissa < 0n ? -reA.mantissa : reA.mantissa).toString().length;
                const lenB = (reB.mantissa < 0n ? -reB.mantissa : reB.mantissa).toString().length;

                // 计算需要放大的位数：
                // - resultAcc: 保证结果的有效数字。
                // - lenB - lenA: 补偿被除数和除数尾数的长度差异。
                // - 额外的保护位，减少中间计算的舍入误差。
                const scalingDigits = resultAcc + lenB - lenA + 4;

                // 确保放大位数不为负。如果被除数尾数本来就比除数长很多，则可能不需要放大。
                const finalScalingDigits = Math.max(0, scalingDigits);

                const scaledMantissaA = reA.mantissa * (10n ** BigInt(finalScalingDigits));

                const resultMantissa = scaledMantissaA / reB.mantissa;
                // 指数需要减去放大的位数来补偿。
                const resultPower = reA.power - reB.power - finalScalingDigits;

                // BigNumber 构造函数会自动处理舍入和规范化。
                return new ComplexNumber(resultMantissa, {pow: resultPower, acc: resultAcc});
            }

            // 通用路径：处理复数除法。
            // 应用公式 a/b = (a * conj(b)) / (b * conj(b))
            // 其中 b * conj(b) 是一个纯实数 |b|^2，这让除法变得简单。

            // 1. 计算分子：inputA * conj(inputB)
            const conjB = MathPlus.conj(inputB);
            const numerator = MathPlus.times(inputA, conjB);

            // 2. 计算分母：inputB * conj(inputB) = |inputB|^2
            // 结果是一个纯实数 (虚部为零)。
            const denominator = MathPlus.times(inputB, conjB);

            // 3. 将分子的实部和虚部分别除以分母（一个实数）。
            // 这里的递归调用将进入上面的纯实数除法优化路径。
            const resultRe = MathPlus.divide(numerator.re, denominator.re);
            const resultIm = MathPlus.divide(numerator.im, denominator.re);

            // 4. 组合结果。resultRe 和 resultIm 是纯实数的 ComplexNumber，
            // 因此我们需要提取它们的实部 (.re) 来构造最终的复数。
            return new ComplexNumber([resultRe.re, resultIm.re]);
        }

        /**
         * @static
         * @method mod
         * @description 计算 a 对 b 取模 (a mod b) 的结果。
         * - 算法基于统一定义：a mod b = a - b * floor(a/b)。
         * - 对于实数，结果 r 与除数 b 具有相同的符号（或为零）。
         * - 对于复数，使用高精度算法精确计算高斯整数商的 floor。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被除数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 除数（模数）。
         * @returns {ComplexNumber} 代表 a mod b 结果的 ComplexNumber 实例。
         * @throws {Error} 如果除数 b 为零。
         * @example
         * // 实数: 10 mod 3 -> 1
         * MathPlus.mod(10, 3);
         *
         * // 实数 (负数): -10 mod 3 -> 2
         * MathPlus.mod(-10, 3);
         *
         * // 复数 (5+4i) mod (2+3i) -> 3i
         * MathPlus.mod('5+4i', '2+3i');
         */
        static mod(a, b) {
            // 将输入统一转换为 ComplexNumber 实例以便处理。
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            return MathPlus.minus(
                inputA,
                MathPlus.times(
                    MathPlus.floor(MathPlus.divide(inputA, inputB)),
                    inputB
                )
            );
        }

        /**
         * @static
         * @method pow
         * @description 计算 a 的 b 次方 (a^b)。
         * - 该函数能够处理实数和复数作为底数和指数。
         * - 核心原理：a^b = exp(b * ln(a))。
         * - 对于复数 z = r(cosθ + isinθ), z^b = r^b * (cos(bθ) + isin(bθ))。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 底数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 指数。
         * @returns {ComplexNumber} 代表 a^b 结果的 ComplexNumber 实例。
         * @throws {Error} 如果出现数学上未定义的情况 (例如 0^0)。
         * @throws {Error} 如果结果的位数估算值过大，可能导致内存溢出。
         * @throws {Error} 如果底数为零且指数为负。
         */
        static pow(a, b) {
            /**
             * @private
             * @function estimateDigitCount
             * @description (内部辅助函数) 估算 a^b 结果的十进制位数，其中 a 和 b 都是 BigInt。
             * 用于在执行昂贵的乘方运算前进行溢出检查。
             *
             * 核心原理：
             * 一个正整数 n 的位数约等于 `floor(log10(n)) + 1`。
             * 因此，(a^b) 的位数约等于 `floor(log10(a^b)) + 1` = `floor(b * log10(a)) + 1`。
             * 由于 `BigInt` 没有 `log10` 方法，我们通过其字符串长度来近似计算 `log10(a)`。
             * 为了提高精度，我们取 `a` 的前 15 位数字计算 `log10`，然后加上位数的偏移量。
             *
             * @param {bigint} a - 底数，一个 BigInt。
             * @param {bigint} b - 指数，一个正的 BigInt。
             * @returns {number} a^b 结果位数的估算值。
             */
            function estimateDigitCount(a, b) {
                if (a < 0n) {
                    a = -a;
                }
                // 处理一些边界情况
                if (a === 0n) {
                    return 1; // 0**b 是 0 (当 b > 0 时)，有 1 位数字。
                }
                if (a === 1n) {
                    return 1; // 1**b 是 1，有 1 位数字。
                }
                if (b === 0n) {
                    return 1; // a**0 是 1，有 1 位数字。
                }

                // 核心原理：一个正整数 n 的位数是 floor(log10(n)) + 1。
                // 对于 a**b，位数就是 floor(b * log10(a)) + 1。

                // 我们需要计算一个 BigInt 'a' 的以 10 为底的对数 (log10(a))。
                // 但是，JavaScript 内置的 Math.log10() 只接受 Number 类型。
                // 因此，我们通过 'a' 的字符串表示来近似计算 log10(a)。
                const aStr = a.toString();
                const numDigitsInA = aStr.length;

                // 对于一个有 'd' 位数字的数，它的值约等于 a_head * 10^(d-15)，
                // 其中 a_head 是由前 15 位数字组成的数。
                // log10(a) ≈ log10(a_head * 10^(d-15)) = log10(a_head) + d - 15
                // 我们选择 15 位，因为这大约是 JavaScript 的 Number 类型能保持的最高精度。
                const precision = 15;
                const aHeadStr = aStr.slice(0, precision);
                const aHeadNum = Number(aHeadStr);

                const log10a = Math.log10(aHeadNum) + (numDigitsInA - aHeadStr.length);

                // 现在计算 b * log10(a)。
                // 指数 'b' 本身也可能是一个非常大的数，直接转为 Number 可能会损失精度。
                // 但对于快速估算数量级的场景，为了性能，这通常是可以接受的。
                const bAsNumber = Number(b);

                const log10Result = bAsNumber * log10a;

                // 最终的位数是 floor(log10Result) + 1。
                // 我们使用 BigInt 来进行最后的计算，以防止结果本身过大而溢出。
                return Math.floor(log10Result) + 1;
            }

            /**
             * 快速幂运算
             * 使用 MathPlus 的乘法逻辑来计算 base^exponent
             * 目的：计算超大结果时，只保留需要的有效位数以避免内存溢出。
             * @param {bigint} base - 底数
             * @param {bigint} exponent - 指数
             * @returns {ComplexNumber} 结果 (ComplexNumber 实例)
             */
            function fastPow(base, exponent) {
                const currentAcc = CalcConfig.globalCalcAccuracy;
                // 处理指数为 0 的情况，直接返回 1
                if (exponent === 0n) {
                    return new ComplexNumber([0, 1n, CalcConfig.globalCalcAccuracy]);
                }

                // 将原生 bigint 底数包装为 ComplexNumber
                // 必须这样做，否则 MathPlus.times 无法对其进行精度截断处理
                let b = new ComplexNumber(base, {acc: currentAcc + 10});

                // 获取当前对象的精度，用于构造结果
                const acc = b.acc;

                // 初始化结果为 1 (乘法单位元)
                // 内部表示: [power=0, mantissa=1n, acc]
                let result = new ComplexNumber([0, 1n, acc]);

                // 核心循环：无需任何类型转换，直接对 bigint 指数进行位操作
                while (exponent > 0n) {
                    // 判断奇数：(exponent & 1n) 等价于 (exponent % 2n !== 0n)
                    if ((exponent & 1n) === 1n) {
                        result = MathPlus.times(result, b);
                    }

                    // 只有当 exponent > 1 时才需要计算平方
                    // 避免了最后一步 exp 为 1 时多余的一次 b * b 计算
                    if (exponent > 1n) {
                        b = MathPlus.times(b, b);
                    }

                    // 右移一位，等价于除以 2
                    exponent >>= 1n;
                }

                return result;
            }

            // 将输入统一转换为 ComplexNumber 实例以便处理。
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const resultAcc = Math.min(inputA.acc, inputB.acc);

            // --- 优化路径: 识别 e^b 的情况 ---
            // 检查底数 a 是否为常数 e，且指数 b 不是一个实数。
            if (
                // 检查 b 是否为复数
                !inputB.onlyReal &&
                // 通过比较内部数组表示 [power, mantissa, acc] 来精确判断是否等于 e
                inputA.onlyReal &&
                inputA.re.valueOf().every((val, index) => val === CalcConfig.constants.e[index])
            ) {
                // 如果是，直接调用为 e 的幂专门优化的 exp(b) 函数，以提高效率和精度。
                return MathPlus.exp(inputB);
            }

            // --- 分支 1: 底数和指数都是纯实数 ---
            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re;
                const reB = inputB.re;

                // --- 处理特殊情况 ---
                // Case 1: 指数为 0 (b=0)
                if (reB.mantissa === 0n) {
                    if (reA.mantissa === 0n) {
                        throw new Error('[MathPlus] mathematical error: 0^0 is undefined.');
                    }
                    // 任何非零数的 0 次方都等于 1
                    return new ComplexNumber([0, 1n, resultAcc]);
                }

                // Case 2: 底数为 0 (a=0)
                if (reA.mantissa === 0n) {
                    if (reB.mantissa < 0n) {
                        throw new Error('[MathPlus] mathematical error: 0 to a negative power is undefined.');
                    }
                    return new ComplexNumber([0, 0n, resultAcc]);
                }

                // Case 3: 底数为 1 (a=1)
                if (reA.mantissa === 1n && reA.power === 0) {
                    return new ComplexNumber([0, 1n, resultAcc]);
                }

                // --- 路径 1.1: 指数 b 是整数 ---
                if (reB.power >= 0) {
                    //将指数转换为正数
                    let isExponentNegative = false;
                    let absB = reB;
                    if (reB.mantissa < 0n) {
                        isExponentNegative = true;
                        absB = MathPlus._oppositeNumber(reB);
                    }

                    const realMantissa = absB.mantissa * (10n ** BigInt(absB.power));

                    // 溢出检查：在执行昂贵的 a^b 计算之前，先估算结果的量级。
                    const orderOfMagnitude = estimateDigitCount(reA.mantissa, realMantissa);
                    if (orderOfMagnitude >= Number.MAX_SAFE_INTEGER) {
                        // 如果指数为负，结果会趋近于0，是安全的。否则，抛出错误。
                        if (isExponentNegative) {
                            return new ComplexNumber([0, 0n, resultAcc]);
                        }
                        throw new Error('[MathPlus] mathematical error: Result of power is too large to compute safely.');
                    }

                    let resultMantissa;
                    if (orderOfMagnitude < CalcConfig.CRITICAL_MAGNITUDE_FAST_EXP) {
                        // 计算 (m_a * 10^p_a)^b = (m_a^b) * 10^(p_a * b)
                        // 计算尾数部分: m_a ^ b
                        resultMantissa = reA.mantissa ** realMantissa;
                    } else {
                        // 计算尾数部分
                        resultMantissa = fastPow(reA.mantissa, realMantissa);
                    }
                    // 计算指数部分: p_a * b
                    // reA.power 是 Number, realB 是 BigInt。需要转换类型进行乘法。
                    const resultPower = BigInt(reA.power) * realMantissa;
                    // 构造结果
                    let result = new ComplexNumber(resultMantissa, {
                        pow: Number(resultPower), // pow 参数期望是 number
                        acc: resultAcc
                    });

                    // 如果指数是负数，最终结果是 1 / result
                    if (isExponentNegative) {
                        result = MathPlus.divide([0, 1n, resultAcc], result);
                    }
                    return result;
                }

                // --- 路径 1.2: 底数 a > 0, 指数 b 是小数 ---
                if (reA.mantissa > 0n) {
                    // 优化: 如果 b=0.5, 直接调用 sqrt
                    if (reB.power === -1 && reB.mantissa === 5n) {
                        return MathPlus.sqrt(reA);
                    }
                    // 通用方法: a^b = exp(b * ln(a))
                    return MathPlus.exp(
                        MathPlus.times(MathPlus.ln(reA), reB)
                    );
                }

                // --- 路径 1.3: 底数 a < 0, 指数 b 是小数 ---
                // (-a)^b = |a|^b * (cos(bπ) + i sin(bπ))
                let isExponentNegative = false;
                let absB = reB;
                if (reB.mantissa < 0n) {
                    isExponentNegative = true;
                    absB = MathPlus._oppositeNumber(reB);
                }

                let result = MathPlus.pow(MathPlus._oppositeNumber(inputA), absB);
                // 优化: 如果 b=0.5 (开平方根), 结果为 i * sqrt(|a|)
                if (absB.power === -1 && absB.mantissa === 5n) {
                    const zero = new BigNumber([0, 0n, resultAcc]);
                    result = new ComplexNumber([zero, result.re]);
                } else {
                    // 判断是否有实数解
                    const mid = Public.integerCorrect(
                        MathPlus.divide([0, 1n, resultAcc], absB)
                    ).re;
                    if (mid.power === 0 && mid.mantissa % 2n !== 0n) {
                        // 有实数解
                        result = MathPlus._oppositeNumber(result);
                    } else {
                        // 无实数解，返回辐角为 0 的结果
                        const angle = MathPlus.times(absB, CalcConfig.constants.pi);
                        const cosAngle = MathPlus.cos(angle);
                        const sinAngle = MathPlus.sin(angle);

                        result = new ComplexNumber([
                            MathPlus.times(result, cosAngle).re,
                            MathPlus.times(result, sinAngle).re
                        ]);
                    }
                }

                // 如果指数是负数，最终结果是 1 / result
                if (isExponentNegative) {
                    result = MathPlus.divide([0, 1n, resultAcc], result);
                }
                return result;
            }

            // --- 分支 2: 底数是复数, 指数是纯实数 ---
            // z^b = |z|^b * (cos(b*arg(z)) + i*sin(b*arg(z)))
            if (inputB.onlyReal) {
                const module = MathPlus.pow(MathPlus.abs(inputA), inputB);
                const angle = MathPlus.times(inputB, MathPlus.arg(inputA));
                const cosAngle = MathPlus.cos(angle);
                const sinAngle = MathPlus.sin(angle);

                return new ComplexNumber([
                    MathPlus.times(module, cosAngle).re,
                    MathPlus.times(module, sinAngle).re
                ]);
            }

            // --- 分支 3: 通用情况 (通常是复数指数) ---
            // a^b = exp(b * ln(a))
            // 设 a = r*e^(iθ), b = c+di
            // ln(a) = ln(r) + iθ
            // b*ln(a) = (c+di)(ln(r)+iθ) = (c*ln(r) - dθ) + i(d*ln(r) + cθ)
            // a^b = exp(c*ln(r) - dθ) * exp(i(d*ln(r) + cθ))
            const c = inputB.re;
            const d = inputB.im;
            const r = MathPlus.abs(inputA);
            const angle = MathPlus.arg(inputA);
            const resultAngle = MathPlus.plus(
                MathPlus.times(d, MathPlus.ln(r)),
                MathPlus.times(c, angle)
            );
            const module = MathPlus.times(
                MathPlus.pow(r, c),
                MathPlus.exp(
                    MathPlus._oppositeNumber(MathPlus.times(d, angle))
                )
            );
            const cosAngle = MathPlus.cos(resultAngle);
            const sinAngle = MathPlus.sin(resultAngle);

            return new ComplexNumber([
                MathPlus.times(module, cosAngle).re,
                MathPlus.times(module, sinAngle).re
            ]);
        }

        /**
         * @static
         * @method exponential
         * @description 计算 a 乘以 10 的 b 次方 (a * 10^b)。这常用于处理科学记数法。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 系数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 指数 (exponent)。
         * @returns {ComplexNumber} 代表 a * 10^b 结果的 ComplexNumber 实例。
         * @example
         * // 1.23 * 10³ -> 1230
         * MathPlus.exponential(1.23, 3);
         */
        static exponential(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const acc = Math.min(inputA.acc, inputB.acc);
            // [1, 1n, acc] 是 BigNumber 10 的内部表示 (1 * 10^1)
            return MathPlus.times(
                inputA,
                MathPlus.pow([1, 1n, acc], inputB)
            );
        }

        /**
         * @static
         * @method sqrt
         * @description 计算 x 的平方根 (√x)，并返回主值。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 √x 结果的 ComplexNumber 实例。
         */
        static sqrt(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                const re = input.re;

                // 基准情况: √0 = 0
                if (re.mantissa === 0n) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                // --- 处理负实数: √-x = i√x ---
                let isBaseNegative = false;
                let absInput = re;
                if (re.mantissa < 0n) { // 取绝对值以便使用牛顿法
                    isBaseNegative = true;
                    absInput = MathPlus._oppositeNumber(re);
                }

                // --- 核心算法: 牛顿-拉夫逊迭代法 ---
                // 公式: x_new = (x_old + N / x_old) / 2

                // 步骤 1: 生成一个低精度的初始猜测值，以加速收敛。
                const lowAccuracyRe = new BigNumber(absInput, {acc: 15});
                const numberRe = Number(lowAccuracyRe.mantissa) * (10 ** lowAccuracyRe.power);
                let result = new ComplexNumber(Math.sqrt(numberRe), {acc: acc});

                // 步骤 2: 进行迭代
                let i = 0;
                const max = CalcConfig.globalCalcAccuracy + 5; // 设置最大迭代次数
                const minPower = -2 * acc - 1; // 收敛阈值
                const const_2 = new ComplexNumber([0, 2n, acc]);
                let difference, mid;

                do {
                    // 执行一次牛顿法迭代
                    mid = result;
                    result = MathPlus.divide(
                        MathPlus.plus(mid, MathPlus.divide(absInput, mid)),
                        const_2
                    );

                    // 计算新旧结果之差的绝对值，用于判断是否收敛
                    difference = MathPlus.minus(mid, result).re;
                    i++;
                } while (difference.power > minPower && difference.mantissa !== 0n && i < max);

                // 步骤 3: 如果牛顿法收敛过慢，则使用 ln/exp 方法作为备用。
                // 公式: √x = x^0.5 = e^(0.5 * ln(x))
                if (i === max) {
                    console.warn(`[MathPlus] Square root (${x.toString()}) calculation takes too long.`);
                    result = MathPlus.exp(
                        MathPlus.times(MathPlus.ln(absInput), new ComplexNumber([-1, 5n, acc]))
                    );
                }

                // 步骤 4: 根据原始输入的符号，返回最终结果。
                if (isBaseNegative) {
                    // 如果输入是负数，结果是纯虚数: 0 + i * √|x|
                    return new ComplexNumber([[0, 0n, acc], result.re]);
                }
                return result; // 对于正数，直接返回结果
            }

            // --- 路径 2: 输入为复数 ---
            return MathPlus.pow(input, [-1, 5n, acc]);
        }

        /**
         * @static
         * @method cbrt
         * @description 计算输入值的主立方根 (³√x)。
         *
         * 此方法根据输入值的类型（实数或复数）选择最优的计算路径：
         * - 实数路径：采用牛顿迭代法（Newton's method）的立方根特化公式 x_(n+1) = (2x_n + x / x_n^2) / 3。
         *   相比于通用的 `pow` 函数，该算法在处理高精度实数时收敛速度更快，效率更高。
         * - 复数路径：利用复数幂运算规则，通过 `MathPlus.pow(x, 1/3)` 计算主值。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 被开方数。
         * 支持字符串（如 "27", "-8"）、数字、BigInt、BigNumber 或 ComplexNumber 实例。
         *
         * @returns {ComplexNumber} 返回计算结果，为一个 ComplexNumber 实例。
         *
         * @example
         * // 实数示例
         * MathPlus.cbrt(27); // Result: 3
         * MathPlus.cbrt(-8); // Result: -2
         *
         * @example
         * // 复数示例
         * MathPlus.cbrt('8i'); // Result: ~ 1.732 + i
         */
        static cbrt(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // --- 路径 1: 纯实数优化 ---
            if (input.onlyReal) {
                const re = input.re;

                // 基准情况: ³√0 = 0
                if (re.mantissa === 0n) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                // 步骤 1: 生成一个低精度的初始猜测值，以加速收敛。
                const lowAccuracyRe = new BigNumber(re, {acc: 15});
                const numberRe = Number(lowAccuracyRe.mantissa) * (10 ** lowAccuracyRe.power);
                let result = new ComplexNumber(Math.cbrt(numberRe), {acc: acc});

                // 步骤 2: 进行迭代
                // 采用牛顿迭代法的立方根特化公式
                // x_(n+1) = (2x_n + x / x_n^2) / 3
                let i = 0;
                const max = CalcConfig.globalCalcAccuracy + 5; // 设置最大迭代次数
                const minPower = -2 * acc - 1; // 收敛阈值
                const const_2 = new ComplexNumber([0, 2n, acc]);
                const const_3 = new ComplexNumber([0, 3n, acc]);
                let difference, mid;

                do {
                    mid = result;
                    const squareOfMid = MathPlus.times(mid, mid);
                    result = MathPlus.divide(
                        MathPlus.plus(
                            MathPlus.times(mid, const_2),
                            MathPlus.divide(re, squareOfMid)
                        ),
                        const_3
                    );

                    // 计算新旧结果之差的绝对值，用于判断是否收敛
                    difference = MathPlus.minus(mid, result).re;
                    i++;
                } while (difference.power > minPower && difference.mantissa !== 0n && i < max);

                // 步骤 3: 如果迭代法收敛过慢，则使用 pow(x, 1/3) 作为备用方法。
                if (i === max) {
                    console.warn(`[MathPlus] Cube root (${x.toString()}) calculation takes too long.`);
                    return MathPlus.pow(re, MathPlus.divide([0, 1n, acc], [0, 3n, acc]));
                }

                return result;
            }

            // --- 路径 2: 输入为复数 ---
            // 通过调用 pow(input, 1/3) 来计算主立方根。
            // [0, 1n, acc] 是 BigNumber 1, [0, 3n, acc] 是 BigNumber 3。
            return MathPlus.pow(input, MathPlus.divide([0, 1n, acc], [0, 3n, acc]));
        }

        /**
         * @static
         * @method nroot
         * @description 计算 a 的 b 次方根 (ᵇ√a)。
         * - 该方法通过计算 a 的 1/b 次方来实现，即 `a^(1/b)`。
         * - 它能够自动处理实数和复数作为底数和根指数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被开方数（radicand）。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 根指数（index）。
         * @returns {ComplexNumber} 代表 a 的 b 次方根主值的结果。
         * @example
         * // 64 的 3 次方根 -> 4
         * MathPlus.nroot(64, 3);
         *
         * // 81 的 4 次方根 -> 3
         * MathPlus.nroot(81, 4);
         */
        static nroot(a, b) {
            // 将输入统一转换为 ComplexNumber 实例
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            // 确定运算精度，取两个输入中较低的精度
            const acc = Math.min(inputA.acc, inputB.acc);
            // 计算指数 1/b
            const oneOverB = MathPlus.divide([0, 1n, acc], inputB);
            // 计算 a 的 (1/b) 次方
            return MathPlus.pow(inputA, oneOverB);
        }

        /**
         * @static
         * @method exp
         * @description 计算 e 的 x 次方 (e^x)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 指数，可以是实数或复数。
         * @returns {ComplexNumber} 代表 e^x 结果的 ComplexNumber 实例。
         * @throws {Error} 如果泰勒级数未能收敛。
         */
        static exp(x) {
            // 将输入统一转换为 ComplexNumber 实例。
            const input = new ComplexNumber(x);

            if (input.onlyReal) { // 处理纯实数的情况。
                const re = input.re; // 获取 BigNumber 实例
                const acc = re.acc; // 存储精度

                // 基准情况: e^0 = 1。
                // [0, 1n, acc] 是一种创建 BigNumber 1 的方式 (1 * 10^0)。
                if (re.mantissa === 0n) {
                    return new ComplexNumber([0, 1n, acc]);
                }

                // 优化：如果 x 是一个整数 (power >= 0)，直接使用 pow 函数计算 e^x。
                if (re.power >= 0) {
                    return MathPlus.pow(CalcConfig.constants.e, input);
                }

                // --- 策略: 将 x 分解为整数 i 和小数 f (x = i + f) ---
                // 这样 e^x = e^i * e^f。e^i 通过 pow 计算，e^f 通过泰勒级数计算。

                // 计算除数，用于从尾数中分离整数和小数部分。
                const realPower = 10n ** BigInt(-re.power);
                // 计算整数部分的值。
                const intPart = re.mantissa / realPower;
                // 计算 e 的整数部分次方 (e^i)。
                const resultMid = MathPlus.pow(new BigNumber(CalcConfig.constants.e), intPart);

                // 计算小数部分的尾数。
                const iterationMantissa = re.mantissa - intPart * realPower;
                // 创建代表小数部分 (f) 的 ComplexNumber。
                // 注意: 这里将数字缩小 10 倍以更快收敛。
                const iteration = new ComplexNumber([re.power - 1, iterationMantissa, acc]);

                // --- 使用泰勒级数计算 e^f ---
                // e^f = 1 + f + f^2/2! + f^3/3! + ...

                // 设置最大迭代次数以防止无限循环。
                const max = CalcConfig.globalCalcAccuracy + 5;
                // 设置一个极小的量级，当项小于此值时，视为收敛。
                const minPower = -2 * acc - 1;

                // 初始化泰勒级数的第一项 (1)。
                let mid = new ComplexNumber([0, 1n, acc]);
                // 初始化级数和为 0。
                let result = new ComplexNumber([0, 0n, acc]);
                let i = 1; // 迭代计数器，也用作阶乘的分母。

                // 循环计算泰勒级数，直到项足够小或达到最大迭代次数。
                for (; mid.re.power > minPower && mid.re.mantissa !== 0n && i < max; i++) {
                    // 将当前项加到总和中。
                    result = MathPlus.plus(result, mid);
                    // 计算下一项: mid = (mid * iteration) / i
                    mid = MathPlus.divide(
                        MathPlus.times(iteration, mid),
                        i
                    );
                }

                // 如果达到最大迭代次数仍未收敛，则抛出错误。
                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: exp. Input: ${input.toString()}`);
                }

                // 组合最终结果：e^x = e^i * e^f
                // 注意: MathPlus.pow(result, [1, 1n, acc]) 等效于 result^10。
                return MathPlus.times(
                    MathPlus.pow(result, [1, 1n, acc]),
                    resultMid
                );
            }

            // 处理复数的情况，使用欧拉公式 e^(a+bi) = e^a * (cos(b) + i*sin(b)) 进行计算。。
            // 步骤 1: 计算结果的模 (modulus)，即 e^a。
            // input.re 是复数 a+bi 的实部 a。
            // MathPlus.exp(input.re) 会递归调用 exp 函数，并进入处理纯实数的路径。
            const module = MathPlus.exp(input.re);

            // 步骤 2: 计算虚部 b 对应的余弦值 cos(b)。
            // input.im 是复数 a+bi 的虚部 b。
            const cosAngle = MathPlus.cos(input.im);
            const sinAngle = MathPlus.sin(input.im);

            // 步骤 3: 组合最终结果。
            // 最终结果的实部是 e^a * cos(b)，虚部是 e^a * sin(b)。
            return new ComplexNumber([
                // 计算实部: module * cosAngle
                MathPlus.times(module, cosAngle).re,
                // 计算虚部: module * sin(b)
                MathPlus.times(module, sinAngle).re
            ]);
        }

        /**
         * @static
         * @method ln
         * @description 计算 x 的自然对数 (ln(x))。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值，可以是实数或复数。
         * @returns {ComplexNumber} 代表 ln(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果输入为 0，或者内部计算未能收敛。
         */
        static ln(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // --- 路径 1: 输入正实数 ---
            if (input.onlyReal && input.re.mantissa >= 0n) {
                const re = input.re;

                // --- 处理边缘情况 ---
                if (re.mantissa === 0n) {
                    throw new Error('[MathPlus] mathematical error: ln(0) is undefined.');
                }
                // ln(1) = 0
                if (re.power === 0 && re.mantissa === 1n) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                // --- 核心算法: 范围缩减 + 泰勒级数 ---
                // 步骤 1: 通过乘以 10^k 将 x 标准化到 (0, 1] 范围内。
                // ln(x) = ln(x' * 10^k) = ln(x') + k * ln(10)
                const mantissaLen = re.mantissa.toString().length;
                const mantissaChangedBy10 = mantissaLen + re.power; // 计算 10 的指数 k
                let mid = new ComplexNumber([re.power - mantissaChangedBy10, re.mantissa, acc]);

                // 步骤 2: 通过乘以 1.2^k 将 x' 进一步标准化到 [0.9, 1.1) 范围内。
                // 这样可以极大地加速泰勒级数的收敛。
                // ln(x') = ln(x'' * 1.2^k) = ln(x'') + k * ln(1.2)
                const const_1_2 = new ComplexNumber([-1, 12n, acc]);
                const const_1_1 = new ComplexNumber([-1, 11n, acc]);
                const const_0_9 = new ComplexNumber([-1, 9n, acc]);
                let mantissaChangedBy1_2 = 0; // 1.2 的指数
                let j = 0;
                // 循环直到 normalized_x 落入 [0.9, 1.1) 区间
                for (; !(MathPlus.minus(mid, const_1_1).re.mantissa < 0n && MathPlus.minus(mid, const_0_9).re.mantissa > 0n) && j < 14; j++) {
                    mid = MathPlus.times(mid, const_1_2);
                    mantissaChangedBy1_2 -= 1;
                }

                if (j === 14) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: ln. Input: ${input.toString()}`);
                }

                // 步骤 3: 使用 artanh(z) 的泰勒级数计算 ln(x'')
                // 公式: ln(y) = 2 * artanh((y-1)/(y+1))
                // let y = normalized_x
                // let z = (y-1)/(y+1)
                mid = MathPlus.plus(
                    [0, 1n, acc],
                    MathPlus.divide(
                        [0, -2n, acc],
                        MathPlus.plus([0, 1n, acc], mid)
                    )
                );

                // artanh(z) = z + z^3/3 + z^5/5 + ...
                const squareOfMid = MathPlus.times(mid, mid);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1; // 收敛阈值

                let result = new ComplexNumber([0, 0n, acc]); // 级数和，从第一项 z 开始
                let i = 1;

                for (; mid.re.power > minPower && mid.re.mantissa !== 0n && i < max; i += 2) {
                    // 计算下一项: term_new = term_old * z^2 * i/(i+2)
                    result = MathPlus.plus(result, mid);
                    mid = MathPlus.times(
                        MathPlus.times(squareOfMid, mid),
                        MathPlus.divide(i, i + 2)
                    );
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: ln. Input: ${input.toString()}`);
                }

                // 步骤 4: 组合所有部分得到最终结果
                // ln(x) = 2 * artanh(z) + k1 * ln(10) + k2 * ln(1.2)
                result = MathPlus.times([0, 2n, acc], result);
                result = MathPlus.plus(result, MathPlus.times(CalcConfig.constants.ln_10, mantissaChangedBy10));
                result = MathPlus.plus(result, MathPlus.times(CalcConfig.constants.ln_1_2, mantissaChangedBy1_2));

                return result;
            }

            // --- 路径 2: 输入负实数或复数 ---
            // 使用复数自然对数的标准定义: ln(z) = ln(|z|) + i*arg(z)
            // 步骤 1: 计算复数的模 |z| (绝对值)。
            // MathPlus.abs(x) 返回一个纯实数的 ComplexNumber。
            const absValue = MathPlus.abs(input);

            // 步骤 2: 计算模的自然对数 ln(|z|)。
            // 这是一个实数对数，会递归调用本函数并进入上面的 `if` 分支。
            const lnAbsValue = MathPlus.ln(absValue);

            // 步骤 3: 计算复数的辐角 arg(z)。
            // MathPlus.arg(x) 返回一个纯实数的 ComplexNumber。
            const argValue = MathPlus.arg(input);

            // 步骤 4: 组合结果。
            // 最终结果的实部是 ln(|z|)，虚部是 arg(z)。
            // 我们从 lnAbsValue 和 argValue 中提取它们的实部 (.re) 来构造新的 ComplexNumber。
            return new ComplexNumber([lnAbsValue.re, argValue.re]);
        }

        /**
         * @static
         * @method lg
         * @description 计算 x 的常用对数（以 10 为底的对数，log₁₀(x)）。
         * - 该方法基于对数换底公式：lg(x) = ln(x) / ln(10)。
         * - 它能够自动处理实数和复数输入，因为其依赖的 `ln` 和 `divide` 方法已经具备此能力。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 lg(x) 结果的 ComplexNumber 实例。
         * @example
         * // lg(100) -> 2
         * MathPlus.lg(100);
         *
         * // lg(0.01) -> -2
         * MathPlus.lg('0.01');
         */
        static lg(x) {
            // 直接应用换底公式，将 ln(x) 的结果除以预先计算好的高精度 ln(10) 常量。
            return MathPlus.divide(MathPlus.ln(x), CalcConfig.constants.ln_10);
        }

        /**
         * @static
         * @method log
         * @description 计算以 a 为底，b 的对数 (logₐ(b))。
         * - 该方法基于对数换底公式：logₐ(b) = ln(b) / ln(a)。
         * - 它能够自动处理实数和复数作为底数和真数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 对数的底数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 对数的真数。
         * @returns {ComplexNumber} 代表 logₐ(b) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果 a=1，或者 a,b 的某些组合导致 ln(a) 或 ln(b) 未定义（例如 ln(0)）。
         * @example
         * // log₂(8) -> 3
         * MathPlus.log(2, 8);
         *
         * // log₄(2) -> 0.5
         * MathPlus.log(4, 2);
         */
        static log(a, b) {
            // 确保 ln(a) 不为 0
            const lnA = Public.zeroCorrect(MathPlus.ln(a));

            // 应用换底公式，计算 ln(b) / ln(a)
            return MathPlus.divide(MathPlus.ln(b), lnA);
        }

        /**
         * @static
         * @method sin
         * @description 计算一个数的正弦 (sin(x))。
         * - 该方法能够处理实数和复数输入，并返回主值。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入的角度（弧度）。
         * @returns {ComplexNumber} 代表 sin(x) 结果的 ComplexNumber 实例。
         * @example
         * // sin(π/2) -> 1
         * MathPlus.sin(MathPlus.divide(CalcConfig.constants.pi, 2));
         *
         * // sin(i) -> i * sinh(1) ≈ 1.1752i
         * MathPlus.sin('i');
         */
        static sin(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                // --- 步骤 1: 范围缩减 ---
                // 目标: 将任意实数 x 映射到 [0, π/4] 区间内，以保证泰勒级数快速收敛。
                let [re, sign] = MathPlus._toLessThanHalfPi(input.re, 'sin');

                // 特殊情况，如果缩减后为 0，直接返回 0。
                if (re.mantissa === 0n) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                // 利用三倍角公式进一步将 re 缩减到更小的范围，
                // 以极大地加速泰勒级数收敛。这里我们将 re 反复除以 3，直到其足够小。
                let divideBy3 = 0;
                for (; MathPlus.plus(re, [-1, -1n, acc]).re.mantissa >= 0n && divideBy3 < 4; divideBy3++) {
                    re = MathPlus.divide(re, [0, 3n, acc]).re;
                }
                if (divideBy3 === 4) {
                    // 这是一个安全检查，防止因意外输入导致无法收敛。
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: sin. Input: ${input.toString()}`);
                }

                // --- 步骤 2: 泰勒级数计算 ---
                // sin(x) = x - x^3/3! + x^5/5! - x^7/7! + ...
                const squareOfRe = MathPlus.times(re, re);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1; // 收敛阈值
                let mid = new ComplexNumber(re); // 第一项: x
                let result = mid;
                let i = 1;

                for (; mid.re.power > minPower && mid.re.mantissa !== 0n && i < max; i++) {
                    // 计算下一项: term_new = term_old * (-x²) / (2i*(2i+1))
                    mid = MathPlus.divide(
                        MathPlus.times(mid, squareOfRe),
                        2 * i * (2 * i + 1)
                    );
                    // 根据项的索引，交替进行加减。
                    result = MathPlus[i % 2 === 0 ? 'plus' : 'minus'](result, mid);
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: cos. Input: ${input.toString()}`);
                }

                // --- 步骤 3: 重建结果 ---
                // 通过反复应用三倍角公式 sin(3θ) = 3sin(θ) - 4sin³(θ) 来还原结果
                for (; divideBy3 !== 0; divideBy3--) {
                    const squareOfResult = MathPlus.times(result, result);
                    result = MathPlus.times(
                        MathPlus.minus(
                            [0, 3n, acc],
                            MathPlus.times([0, 4n, acc], squareOfResult)
                        ),
                        result
                    );
                }

                // --- 步骤 4: 应用最终符号 ---
                return new ComplexNumber([result.re.power, sign * result.re.mantissa, acc]);
            }

            // --- 路径 2: 输入为复数 ---
            // 步骤 1: 计算 e^(iz)。
            // 首先，我们需要计算指数部分 iz。
            // 如果 z = a + bi, 那么 iz = i(a + bi) = ia - b = -b + ia。
            // 在我们的代码中:
            // - input.re 是 a (一个 BigNumber)
            // - input.im 是 b (一个 BigNumber)
            // - MathPlus._oppositeNumber(input.im) 是 -b (一个 BigNumber)
            // - 因此，数组 [ -b, a ] 被 ComplexNumber 构造函数正确地解释为复数 -b + ia。
            const mid = MathPlus.exp([MathPlus._oppositeNumber(input.im), input.re]);

            // 步骤 2: 组合最终结果。
            // 此时，mid 变量存储了 e^(iz) 的值。
            // 根据公式，我们需要计算 (mid + 1/mid) / 2。
            return MathPlus.divide(
                // 计算分子部分: e^(iz) - e^(-iz)
                // 其中 e^(-iz) 等于 1 / e^(iz)，即 1 / mid。
                // [0, 1n, acc] 是 BigNumber 1 的内部表示。
                MathPlus.minus(mid, MathPlus.divide([0, 1n, acc], mid)),
                // 将分子除以 2i。
                new ComplexNumber([0n, 2n], {acc: acc})
            );
        }

        /**
         * @static
         * @method arcsin
         * @description 计算 x 的反正弦 (arcsin(x))。
         * - 该函数能够处理实数和复数输入，并返回主值。
         * - 对于实数 `x` 且 `|x| <= 1`，使用 `arcsin(x) = arg(sqrt(1 - x²) + ix)` 计算，数值稳定性好。
         * - 对于实数 `x` 且 `|x| > 1`，结果为复数，使用基于对数的恒等式计算。
         * - 对于复数 `z`，使用通用公式 `arcsin(z) = -i * ln(iz + sqrt(1 - z²))`。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 arcsin(x) 结果的 ComplexNumber 实例。
         */
        static arcsin(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                const re = input.re;
                const one = new ComplexNumber([0, 1n, acc]);
                const absInput = MathPlus.abs(input);

                // Case 1.1: |x| <= 1
                // 使用恒等式 arcsin(x) = arg(sqrt(1 - x²) + ix)
                // 这在数值上比泰勒级数更稳定，尤其是在 x 接近 ±1 时。
                if (MathPlus.minus(absInput, one).re.mantissa <= 0n) {
                    return MathPlus.arg([
                        MathPlus.sqrt(MathPlus.minus(one, MathPlus.times(re, re))).re,
                        re
                    ]);
                }

                // Case 1.2: |x| > 1 (结果是复数)
                // 使用基于对数的恒等式。
                const term = MathPlus.sqrt(MathPlus.minus(MathPlus.times(re, re), one));
                const piOver2 = MathPlus.divide(CalcConfig.constants.pi, [0, 2n, acc]);

                if (re.mantissa > 0n) { // 如果 x > 1
                    // 使用公式: arcsin(x) = π/2 - i * ln(x + sqrt(x² - 1))
                    const lnTerm = MathPlus.ln(MathPlus.plus(re, term));
                    return new ComplexNumber([
                        piOver2.re,
                        MathPlus._oppositeNumber(lnTerm).re
                    ]);
                } else { // 如果 x < -1
                    // 使用公式: arcsin(x) = -π/2 + i * ln(-x + sqrt(x² - 1))
                    const lnTerm = MathPlus.ln(MathPlus.plus(MathPlus._oppositeNumber(re), term));
                    return new ComplexNumber([
                        MathPlus._oppositeNumber(piOver2).re,
                        lnTerm.re
                    ]);
                }
            }

            // --- 路径 2: 输入为复数 ---
            // 使用通用公式: arcsin(z) = -i * ln(iz + sqrt(1 - z²))
            const i = new ComplexNumber([[0, 0n, acc], [0, 1n, acc]]);
            const negI = new ComplexNumber([[0, 0n, acc], [0, -1n, acc]]);
            const one = new ComplexNumber([0, 1n, acc]);

            return MathPlus.times(
                negI,
                MathPlus.ln(MathPlus.plus(
                    MathPlus.times(i, input), // iz
                    MathPlus.sqrt(MathPlus.minus(one, MathPlus.times(input, input))) // sqrt(1 - z²)
                ))
            );
        }

        /**
         * @static
         * @method cos
         * @description 计算 x 的余弦 (cos(x))。
         * - 对于实数，使用范围缩减和泰勒级数进行高精度计算，并返回主值。
         * - 对于复数 z，使用欧拉公式 cos(z) = (e^(iz) + e^(-iz)) / 2 进行计算。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入的角度（弧度）。
         * @returns {ComplexNumber} 代表 cos(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果内部计算未能收敛。
         */
        static cos(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                // --- 步骤 1: 范围缩减 ---
                // 目标: 将任意实数 x 映射到 [0, π/4] 区间内，以保证泰勒级数快速收敛。
                let [re, sign] = MathPlus._toLessThanHalfPi(input.re, 'cos');

                // 特殊情况，如果缩减后为 0，直接返回 1 或 -1。
                if (re.mantissa === 0n) {
                    return new ComplexNumber([0, sign, acc]);
                }

                // 利用四倍角公式进一步将 re 缩减到更小的范围，
                // 以极大地加速泰勒级数收敛。这里我们将 re 反复除以 4，直到其足够小。
                let divideBy4 = 0;
                for (; MathPlus.plus(re, [-1, -1n, acc]).re.mantissa >= 0n && divideBy4 < 3; divideBy4++) {
                    re = MathPlus.divide(re, [0, 4n, acc]).re;
                }
                if (divideBy4 === 3) {
                    // 这是一个安全检查，防止因意外输入导致无法收敛。
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: cos. Input: ${input.toString()}`);
                }

                // --- 步骤 2: 泰勒级数计算 ---
                // cos(x) = 1 - x²/2! + x⁴/4! - x⁶/6! + ...
                const squareOfRe = MathPlus.times(re, re);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1; // 收敛阈值
                let mid = new ComplexNumber([0, 1n, acc]); // 第一项: 1
                let result = new ComplexNumber([0, 0n, acc]);
                let i = 0;

                for (; mid.re.power > minPower && mid.re.mantissa !== 0n && i < max; i++) {
                    // 根据项的索引，交替进行加减。
                    result = MathPlus[i % 2 === 0 ? 'plus' : 'minus'](result, mid);
                    // 计算下一项: term_new = term_old * (-x²) / ((2i+1)*(2i+2))
                    mid = MathPlus.divide(
                        MathPlus.times(mid, squareOfRe),
                        (2 * i + 1) * (2 * i + 2)
                    );
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: cos. Input: ${input.toString()}`);
                }

                // --- 步骤 3: 重建结果 ---
                // 通过反复应用四倍角公式 cos(4θ) = 8cos²(θ)*(cos²(θ) - 1) + 1 来从缩减后的角度还原原始结果。
                for (; divideBy4 !== 0; divideBy4--) {
                    const squareOfResult = MathPlus.times(result, result);
                    result = MathPlus.plus(
                        MathPlus.times(
                            MathPlus.plus(squareOfResult, [0, -1n, acc]),
                            MathPlus.times([0, 8n, acc], squareOfResult)
                        ),
                        [0, 1n, acc]
                    );
                }

                // --- 步骤 4: 应用最终符号 ---
                return new ComplexNumber([result.re.power, sign * result.re.mantissa, acc]);
            }

            // --- 路径 2: 输入为复数 ---
            // 步骤 1: 计算 e^(iz)。
            // 首先，我们需要计算指数部分 iz。
            // 如果 z = a + bi, 那么 iz = i(a + bi) = ia - b = -b + ia。
            // 在我们的代码中:
            // - input.re 是 a (一个 BigNumber)
            // - input.im 是 b (一个 BigNumber)
            // - MathPlus._oppositeNumber(input.im) 是 -b (一个 BigNumber)
            // - 因此，数组 [ -b, a ] 被 ComplexNumber 构造函数正确地解释为复数 -b + ia。
            const mid = MathPlus.exp([MathPlus._oppositeNumber(input.im), input.re]);

            // 步骤 2: 组合最终结果。
            // 此时，mid 变量存储了 e^(iz) 的值。
            // 根据公式，我们需要计算 (mid + 1/mid) / 2。
            return MathPlus.divide(
                // 计算分子部分: e^(iz) + e^(-iz)
                // 其中 e^(-iz) 等于 1 / e^(iz)，即 1 / mid。
                // [0, 1n, acc] 是 BigNumber 1 的内部表示。
                MathPlus.plus(mid, MathPlus.divide([0, 1n, acc], mid)),
                // 将分子除以 2。
                // [0, 2n, acc] 是 BigNumber 2 的内部表示。
                [0, 2n, acc]
            );
        }

        /**
         * @static
         * @method arccos
         * @description 计算 x 的反余弦 (arccos(x))。
         * - 该方法利用了核心三角恒等式 arccos(x) = π/2 - arcsin(x)，并返回主值。
         * - 它将计算完全委托给已经实现且功能完备的 `arcsin` 方法，
         * 这种方式不仅代码简洁，而且能自动继承 `arcsin` 对实数和复数输入的处理能力。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 arccos(x) 结果的 ComplexNumber 实例。
         */
        static arccos(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // 直接应用公式 arccos(x) = π/2 - arcsin(x)
            return MathPlus.minus(
                // 计算 π/2
                MathPlus.divide(CalcConfig.constants.pi, [0, 2n, acc]),
                // 计算 arcsin(x)
                MathPlus.arcsin(input)
            );
        }

        /**
         * @static
         * @method tan
         * @description 计算 x 的正切 (tan(x))。
         * - 该方法通过基本三角恒等式 tan(x) = sin(x) / cos(x) 进行计算，并返回主值。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入的角度（弧度）。
         * @returns {ComplexNumber} 代表 tan(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果 cos(x) 为 0（此时 tan(x) 在数学上是未定义的），
         * 底层的 `divide` 方法将抛出一个“除以零”的错误。
         */
        static tan(x) {
            const input = new ComplexNumber(x);
            // 首先计算 cos(x)、sin(x)，并将其结果存储起来。
            const cosAngle = Public.zeroCorrect(MathPlus.cos(input));
            const sinAngle = MathPlus.sin(input);

            // 然后将 sin(x) 的结果除以 cos(x) 的结果。
            return MathPlus.divide(sinAngle, cosAngle);
        }

        /**
         * @static
         * @method arctan
         * @description 计算 x 的反正切 (arctan(x))。
         * - 算法核心：
         * 1. (对称性) 利用 `arctan(-x) = -arctan(x)` 处理负数。
         * 2. (范围缩减) 利用 `arctan(x) = π/2 - arctan(1/x)` 将参数 `x` 缩减到 `[0, 1]` 区间。
         * 3. (范围缩减) 反复利用半角公式 `arctan(x) = 2 * arctan(x / (1 + sqrt(1+x²)))` 将参数进一步缩减到接近 0 的范围，以加速收敛。
         * 4. (泰勒级数) 对缩减后的极小参数使用泰勒级数 `arctan(x) = x - x³/3 + x⁵/5 - ...` 进行计算。
         * 5. (结果重建) 将级数计算结果根据范围缩减的步骤反向转换，得到最终值。
         * - 复数 arctan(z) 通过 `(i/2) * ln((i+z)/(i-z))` 计算。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 arctan(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果内部计算未能收敛。
         */
        static arctan(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                let re = input.re;
                let isNegative = false;

                // 步骤 1: 利用对称性 arctan(-x) = -arctan(x) 处理负数输入。
                if (re.mantissa < 0n) {
                    re = MathPlus._oppositeNumber(re);
                    isNegative = true;
                }

                // 步骤 2: 范围缩减。如果 x > 1, 使用 arctan(x) = π/2 - arctan(1/x)。
                let reciprocal = false;
                if (MathPlus.plus(re, [0, -1n, acc]).re.mantissa > 0n) { // 检查 re 是否大于 1
                    re = MathPlus.divide([0, 1n, acc], re).re;// 计算 1/re
                    reciprocal = true; // 标记以便最后重建结果
                }

                // 步骤 3: 进一步范围缩减。反复使用半角公式将参数减小到接近 0。
                let j = 0;
                // 当 re > 0.1 时，循环应用半角公式。0.1 是一个经验值，用于平衡缩减次数和泰勒级数计算量。
                for (; MathPlus.plus(re, [-1, -1n, acc]).re.mantissa > 0n && j < 4; j++) {
                    re = MathPlus.divide(
                        re,
                        MathPlus.plus(
                            [0, 1n, acc],
                            MathPlus.sqrt(MathPlus.plus([0, 1n, acc], MathPlus.times(re, re)))
                        )
                    ).re;
                }
                if (j === 4) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: arctan. Input: ${input.toString()}`);
                }

                // 步骤 4: 对缩减后的参数 re 使用泰勒级数进行计算。
                // arctan(x) = x - x³/3 + x⁵/5 - ...
                let [mid, mid_pow] = [re, re]; // 级数的第一项 (x) 和 用于计算下一项的分子部分 (x, x³, x⁵, ...)
                const squareOfRe = MathPlus.times(re, re); // 预计算 re² 以提高效率
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1; // 收敛阈值
                let result = new ComplexNumber([0, 0n, acc]);
                let i = 0;

                for (; mid.power > minPower && mid.mantissa !== 0n && i < max; i++) {
                    // 根据项的索引，交替进行加减。
                    result = MathPlus[i % 2 === 0 ? 'plus' : 'minus'](result, mid);

                    // 计算下一项的分子
                    mid_pow = MathPlus.times(mid_pow, squareOfRe);
                    // 计算下一项: (分子) / (2*i + 3)
                    mid = MathPlus.divide(
                        mid_pow,
                        2 * i + 3
                    ).re;
                }
                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: arctan. Input: ${input.toString()}`);
                }

                // 步骤 5: 结果重建
                // 5a: 将级数结果乘以 2^j 来补偿半角公式的应用。
                result = MathPlus.times([0, 2n ** BigInt(j), acc], result);

                // 5b: 如果初始 x > 1，应用 arctan(x) = π/2 - arctan(1/x)。
                result = reciprocal ? MathPlus.minus(MathPlus.divide(CalcConfig.constants.pi, [0, 2n, acc]), result) : result;

                // 5c: 如果初始 x < 0，应用 arctan(-x) = -arctan(x)。
                if (isNegative) {
                    return MathPlus._oppositeNumber(result);
                }
                return result;
            }

            // --- 路径 2: 输入为复数 ---
            // 使用反正切的对数定义: arctan(z) = (-i/2) * ln((1 + iz) / (1 - iz))
            // 该公式可以通过恒等式变形为: arctan(z) = (-i/2) * ln((i - z) / (i + z))
            // 步骤 1: 计算对数函数的参数部分。
            // 计算分子 (i - z)
            const mid = MathPlus.minus(
                [[0, 0n, acc], [0, 1n, acc]], // 复数 i
                input
            );
            // 计算分母 (i + z)
            const mid_pow = MathPlus.plus(
                [[0, 0n, acc], [0, 1n, acc]], // 复数 i
                input
            );

            // 步骤 2: 检查定义域。
            // 如果 z = i 或 z = -i，对数的参数会是无穷大或零，导致计算失败。
            // mid === 0 表示 i - z = 0, 即 z = i.
            // mid_pow === 0 表示 i + z = 0, 即 z = -i.
            if (
                (mid.re.mantissa === 0n && mid.im.mantissa === 0n) ||
                (mid_pow.re.mantissa === 0n && mid_pow.im.mantissa === 0n)
            ) {
                throw new Error(`[MathPlus] mathematical error: Unable to calculate arctan, input cannot be ${input.toString()}.`);
            }

            // 步骤 3: 应用完整公式。
            return MathPlus.times(
                // 乘以系数 (-i/2)
                // [[0, 0n, acc], [-1, -5n, acc]] 代表 0 - 0.5i
                [[0, 0n, acc], [-1, -5n, acc]],
                // 计算 ln((i - z) / (i + z))
                MathPlus.ln(
                    MathPlus.divide(mid, mid_pow)
                )
            );
        }

        /**
         * @static
         * @method sh
         * @description 计算 x 的双曲正弦 (sinh(x))。
         * - 该方法基于双曲正弦的指数定义：sinh(x) = (e^x - e^-x) / 2。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 sinh(x) 结果的 ComplexNumber 实例。
         * @example
         * // sinh(0) -> 0
         * MathPlus.sh(0);
         *
         * // sinh(1) ≈ 1.1752
         * MathPlus.sh(1);
         */
        static sh(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度
            // 预计算 e^x，这是公式中的核心部分
            const mid = MathPlus.exp(input);

            // 应用公式 (mid - 1/mid) / 2
            return MathPlus.divide(
                // 计算分子: e^x - e^-x，其中 e^-x = 1 / e^x = 1 / mid
                MathPlus.minus(mid, MathPlus.divide([0, 1n, acc], mid)),
                // 除以 2
                [0, 2n, acc]
            );
        }

        /**
         * @static
         * @method arsh
         * @description 计算 x 的反双曲正弦 (arsinh(x))。
         * - 该方法基于反双曲正弦的对数定义：arsinh(x) = ln(x + sqrt(x² + 1))。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 arsinh(x) 结果的 ComplexNumber 实例。
         * @example
         * // arsinh(0) -> 0
         * MathPlus.arsh(0);
         *
         * // arsinh(1.1752) ≈ 1
         * MathPlus.arsh(1.17520119364);
         */
        static arsh(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // 应用公式 ln(x + sqrt(x² + 1))
            return MathPlus.ln(
                MathPlus.plus(
                    input,
                    MathPlus.sqrt(
                        // 计算 x² + 1
                        MathPlus.plus(MathPlus.times(input, input), [0, 1n, acc])
                    )
                )
            );
        }

        /**
         * @static
         * @method ch
         * @description 计算 x 的双曲余弦 (cosh(x))。
         * - 该方法基于双曲余弦的指数定义：cosh(x) = (e^x + e^-x) / 2。
         * - 能够自动处理实数和复数输入。
         * @alias cosh
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 cosh(x) 结果的 ComplexNumber 实例。
         * @example
         * // cosh(0) -> 1
         * MathPlus.ch(0);
         *
         * // cosh(1) ≈ 1.543
         * MathPlus.ch(1);
         */
        static ch(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度
            // 预计算 e^x，这是公式中的核心部分
            const mid = MathPlus.exp(input);

            // 应用公式 (mid + 1/mid) / 2
            return MathPlus.divide(
                // 计算分子: e^x + e^-x，其中 e^-x = 1 / e^x = 1 / mid
                MathPlus.plus(mid, MathPlus.divide([0, 1n, acc], mid)),
                // 除以 2
                [0, 2n, acc]
            );
        }

        /**
         * @static
         * @method arch
         * @description 计算 x 的反双曲余弦 (arcosh(x))。
         * @alias arcosh - 该方法基于反双曲余弦的对数定义：arcosh(x) = ln(x + sqrt(x² - 1))。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 arcosh(x) 结果的 ComplexNumber 实例。
         * @example
         * // arcosh(1) -> 0
         * MathPlus.arch(1);
         *
         * // arcosh(1.543) ≈ 1
         * MathPlus.arch(1.54308063482);
         */
        static arch(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // 应用公式 ln(x + sqrt(x² - 1))
            return MathPlus.ln(
                MathPlus.plus(
                    input,
                    MathPlus.sqrt(
                        // 计算 x² - 1
                        MathPlus.plus(MathPlus.times(input, input), [0, -1n, acc])
                    )
                )
            );
        }

        /**
         * @static
         * @method th
         * @alias tanh
         * @description 计算 x 的双曲正切 (tanh(x))。
         * - 该方法基于双曲正切的指数定义：tanh(x) = (e^(2x) - 1) / (e^(2x) + 1)。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 tanh(x) 结果的 ComplexNumber 实例。
         * @example
         * // tanh(0) -> 0
         * MathPlus.th(0);
         *
         * // tanh(1) ≈ 0.7616
         * MathPlus.th(1);
         */
        static th(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度

            // 预计算 e^(2x)
            const mid = MathPlus.exp(MathPlus.times([0, 2n, acc], input));
            // 应用公式 (e^(2x) - 1) / (e^(2x) + 1)
            return MathPlus.divide(
                // 计算分子: e^(2x) - 1
                MathPlus.plus(mid, [0, -1n, acc]),
                // 计算分母: e^(2x) + 1
                Public.zeroCorrect(MathPlus.plus(mid, [0, 1n, acc]))
            );
        }

        /**
         * @static
         * @method arth
         * @alias artanh
         * @description 计算 x 的反双曲正切 (artanh(x))。
         * - 该方法基于反双曲正切的对数定义：artanh(x) = 0.5 * ln((1 + x) / (1 - x))。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 artanh(x) 结果的 ComplexNumber 实例。
         * @example
         * // artanh(0) -> 0
         * MathPlus.arth(0);
         *
         * // artanh(0.7616) ≈ 1
         * MathPlus.arth(0.76159415595);
         */
        static arth(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc; // 存储精度
            const one = new ComplexNumber([0, 1n, acc]);

            // 应用公式 0.5 * ln((1 + x) / (1 - x))
            return MathPlus.divide(
                // 计算 ln(...) 部分
                MathPlus.ln(
                    // 计算 (1 + x) / (1 - x)
                    MathPlus.divide(
                        MathPlus.plus(one, input),
                        Public.zeroCorrect(MathPlus.minus(one, input))
                    )
                ),
                // 除以 2
                [0, 2n, acc]
            );
        }

        /**
         * @static
         * @method fact
         * @description 计算一个数的阶乘 (x!)。
         * - 对于非负整数 n, n! = 1 * 2 * ... * n，并返回主值。
         * - 对于非整数、负数和复数，此函数计算伽玛函数 Γ(x + 1)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 x! 结果的 ComplexNumber 实例。
         * @throws {Error} 如果输入为负整数，因为其阶乘未定义。
         */
        static fact(x) {
            /**
             * 使用分治法（二分求积）高效计算一个非负整数的阶乘。
             * 这种方法对于计算极大的数（如 1000! 或更高）有显著的性能优势。
             *
             * @param {bigint | number} num - 需要计算阶乘的非负整数。
             * @returns {bigint} n 的阶乘。
             * @throws {TypeError} 如果 n 不是一个非负整数。
             */
            function factorialOptimized(num) {
                if (num === 0n || num === 1n) {
                    return 1n;
                }

                /**
                 * 递归的辅助函数，使用分治策略（Divide and Conquer）计算一个数字范围内的所有整数的乘积。
                 * 这个函数专门为处理 BigInt 类型设计，适用于计算大数的阶乘等场景。
                 * @param {bigint} start 范围的起始数字（包含）。
                 * @param {bigint} end 范围的结束数字（包含）。
                 * @returns {bigint} 从 start 到 end 的所有整数的乘积。
                 */
                function rangeProduct(start, end) {
                    // 递归基：范围内没有或只有一个数字
                    if (start > end) {
                        return 1n;
                    }
                    if (start === end) {
                        return start;
                    }

                    // 当范围很小时，直接计算，避免过多递归开销
                    if (end - start < 10n) { // 这个阈值可以根据实际情况微调
                        let res = 1n;
                        for (let i = start; i <= end; i++) {
                            res *= i;
                        }
                        return res;
                    }
                    if (end - start > 9999999n) {
                        throw new Error('[MathPlus] mathematical error: The factorial exceeds the range limit.');
                    }

                    // 分治：将范围一分为二
                    const mid = start + (end - start) / 2n;
                    const leftProduct = rangeProduct(start, mid);
                    const rightProduct = rangeProduct(mid + 1n, end);

                    return leftProduct * rightProduct;
                }

                return rangeProduct(1n, num);
            }

            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc;

            // --- 路径 1: 输入为整数 ---
            // 这是一个优化路径，使用专门为整数设计的、更快的 `factorialOptimized` 算法。
            if (input.onlyReal && input.re.power >= 0) {
                const re = input.re;

                // 负整数的阶乘是未定义的。
                if (re.mantissa < 0n) {
                    throw new Error('[MathPlus] mathematical error: Negative integer factorial undefined.');
                }

                // 将 BigNumber 转换为 BigInt 以进行计算。
                const realNumber = re.mantissa * (10n ** BigInt(re.power));
                return new ComplexNumber(factorialOptimized(realNumber), {
                    acc: acc
                });
            }

            // --- 路径 2: 输入为非整数、负数或复数 ---
            // 在这种情况下，阶乘被推广为伽玛函数 Γ(x+1)。
            // 我们使用兰佐斯近似（Lanczos Approximation）来高精度计算伽玛函数。

            // 步骤 1: 根据目标精度，选择合适的兰佐斯系数集。
            // 精度越高，需要越多的系数项来保证结果的准确性。
            let option;
            if (acc <= 40) {
                option = 'lanczos_n20';
            } else if (acc <= 75) {
                option = 'lanczos_n40';
            } else if (acc <= 155) {
                option = 'lanczos_n82';
            } else {
                option = 'lanczos_n164';
            }
            if (acc > CalcConfig.MAX_GLOBAL_CALC_ACCURACY) {
                console.warn(`[MathPlus] The required accuracy(${acc}) is too high. Input: ${x.toString()}`);
            }

            const calcAcc = CalcConfig.constants[option].acc;
            const g = CalcConfig.constants[option].g;
            const p = CalcConfig.constants[option].p;

            // 使用选定的精度来创建一个用于计算的 ComplexNumber 实例。
            let calcNum = new ComplexNumber(input, {
                acc: calcAcc
            });

            // 步骤 2: 处理负数输入。
            // 兰佐斯近似主要对 Re(z) > 0.5 的数有效。对于负数，我们使用伽玛函数的反射公式：
            // Γ(z)Γ(1-z) = π/sin(πz)。
            // 这里先将输入取反，计算其正数部分的伽玛函数，最后再应用反射公式。
            let reflection = false;
            if (calcNum.re.mantissa < 0n) {
                calcNum = MathPlus._oppositeNumber(calcNum);
                reflection = true;
            }

            // 步骤 3: 计算兰佐斯近似中的级数部分 A(z)。
            // A(z) = p₀ + p₁/(z+1) + p₂/(z+2) + ...
            let mid = p[0];
            for (let i = 1; i < p.length; i++) {
                mid = MathPlus.plus(
                    mid,
                    MathPlus.divide(p[i], MathPlus.plus(calcNum, new ComplexNumber(i, {
                        acc: calcAcc
                    })))
                );
            }

            // 步骤 4: 应用完整的兰佐斯公式。
            // Γ(z+1) = sqrt(2π) * (z + g + 1/2)^(z + 1/2) * e^-(z + g + 1/2) * A(z)
            // 这里已经将 sqrt(2π) 因子包含在了系数 p 中。
            let result = mid;
            mid = MathPlus.plus(calcNum, [-1, 5n, acc]);
            result = MathPlus.times(
                result,
                MathPlus.pow(
                    // 计算 (z + g + 0.5) / e
                    MathPlus.divide(MathPlus.plus(mid, g), CalcConfig.constants.e),
                    mid // 指数为 (z + 0.5)
                )
            );

            // 步骤 5: 如果需要，应用反射公式来获得最终结果。
            if (reflection) {
                mid = MathPlus.times(input, CalcConfig.constants.pi);
                result = MathPlus.divide(
                    mid,
                    MathPlus.times(MathPlus.sin(mid), result)
                );
            }

            // 返回结果，并确保其精度与最初地输入值一致。
            return new ComplexNumber(result, {
                acc: acc
            });
        }

        /**
         * @static
         * @method gamma
         * @description 计算 x 的伽玛函数 (Γ(x))。
         * - 伽玛函数是阶乘函数向复数和实数的推广，并返回主值。
         * - 该实现利用了核心关系 Γ(x) = (x-1)!。
         * - 它将计算委托给库中已经实现的、能够处理复数和非整数的 `fact` 方法。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 Γ(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果输入为 0 或负整数，此时伽玛函数未定义。
         * @example
         * // Γ(5) = 4! = 24
         * MathPlus.gamma(5);
         *
         * // Γ(1.5) = sqrt(π)/2 ≈ 0.886
         * MathPlus.gamma(1.5);
         */
        static gamma(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc;

            // 应用公式 Γ(x) = (x-1)!，通过调用 fact(x-1) 来实现。
            // [0, -1n, acc] 是 BigNumber -1 的内部表示。
            return MathPlus.fact(MathPlus.plus(input, [0, -1n, acc]));
        }

        /**
         * @static
         * @method floor
         * @description 计算一个数的向下取整 (floor)。
         * - 对于实数 x，返回不大于 x 的最大整数。
         * - 对于复数 a + bi，返回 floor(a) + floor(b)i。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表向下取整结果的 ComplexNumber 实例。
         * @example
         * // 实数: floor(3.7) -> 3; floor(-3.1) -> -4
         * MathPlus.floor(3.7);
         * MathPlus.floor(-3.1);
         *
         * // 复数: floor(3.7 - 2.2i) -> 3 - 3i
         * MathPlus.floor('3.7-2.2i');
         */
        static floor(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                const re = input.re;
                const acc = re.acc; // 存储精度

                // 如果 power >= 0，说明该数本身就是整数 (没有小数部分)，其 floor 就是自身。
                if (re.power >= 0) {
                    return input;
                }

                // --- 核心逻辑: 处理带小数的实数 ---
                let result = re.mantissa / (10n ** BigInt(-re.power));

                // 根据 floor 函数的定义调整结果。
                // - 对于正数，floor(x) 等于 trunc(x)。
                // - 对于负数，如果存在小数部分，floor(x) = trunc(x) - 1。
                if (result < 0n || (result === 0n && re.mantissa < 0n)) {
                    result -= 1n;
                }
                return new ComplexNumber(result, {acc: acc});
            }

            // --- 路径 2: 输入为复数 ---
            // 对于复数 a + bi，floor(a + bi) 定义为 floor(a) + floor(b)i。
            // 我们通过递归调用 floor 分别处理实部和虚部。
            // 注意：MathPlus.floor() 返回的是 ComplexNumber，我们需要提取其 .re 属性 (一个 BigNumber)
            // 来构造最终结果的实部和虚部。
            return new ComplexNumber([
                MathPlus.floor(input.re).re,
                MathPlus.floor(input.im).re
            ]);
        }

        /**
         * @static
         * @method ceil
         * @description 计算一个数的向上取整 (ceiling)。
         * - 对于实数 x，返回不小于 x 的最小整数。
         * - 对于复数 a + bi，遵循分部计算的原则，返回 ceil(a) + ceil(b)i。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 需要计算向上取整的输入值。
         * @returns {ComplexNumber} 代表向上取整结果的 ComplexNumber 实例。
         * @example
         * // 实数: ceil(3.1) -> 4; ceil(-3.7) -> -3
         * MathPlus.ceil(3.1);
         * MathPlus.ceil(-3.7);
         *
         * // 复数: ceil(1.2 - 3.8i) -> 2 - 3i
         * MathPlus.ceil('1.2 - 3.8i');
         */
        static ceil(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);

            // --- 路径 1: 输入为纯实数 ---
            if (input.onlyReal) {
                const re = input.re;
                const acc = re.acc; // 存储精度

                // 如果 power >= 0，说明该数本身就是整数 (没有小数部分)，其 ceil 就是自身。
                if (re.power >= 0) {
                    return input;
                }

                // --- 核心逻辑: 处理带小数的实数 ---
                // 通过整数除法计算截断后（向零取整）的整数部分。
                // 例如，对于 3.1 (mantissa=31, power=-1), result = 31n / 10n = 3n。
                // 对于 -3.7 (mantissa=-37, power=-1), result = -37n / 10n = -3n。
                let result = re.mantissa / (10n ** BigInt(-re.power));

                // 根据当前逻辑，如果截断后的结果大于等于 0，则加 1。
                // 这意味着对于所有正数，都会执行向上取整操作。
                // 例如，对于 3.1，result 是 3n，满足 >= 0n，变为 4n。
                // 对于 -3.7，result 是 -3n，不满足 >= 0n，保持 -3n，这恰好是 ceil(-3.7) 的结果。
                if (result > 0n || (result === 0n && re.mantissa > 0n)) {
                    result += 1n;
                }
                // 使用计算出的整数构造一个新的、纯实数的 ComplexNumber。
                return new ComplexNumber(result, {acc: acc});
            }

            // --- 路径 2: 输入为复数 ---
            // 对于复数 a + bi，ceil(a + bi) 定义为 ceil(a) + ceil(b)i。
            // 我们通过递归调用 ceil 分别处理实部和虚部。
            // 注意：MathPlus.ceil() 返回的是 ComplexNumber，我们需要提取其 .re 属性 (一个 BigNumber)
            // 来构造最终结果的实部和虚部。
            return new ComplexNumber([
                MathPlus.ceil(input.re).re,
                MathPlus.ceil(input.im).re
            ]);
        }

        /**
         * @static
         * @method abs
         * @description 计算一个数的绝对值（或模）。
         * - 对于实数 x, |x| 是其到 0 的距离。
         * - 对于复数 z = a + bi, |z| 是其在复平面上到原点的距离，即 sqrt(a² + b²)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 一个纯实数的 ComplexNumber 实例，代表输入值的绝对值。
         * @example
         * // |-5| -> 5
         * MathPlus.abs(-5);
         *
         * // |3 - 4i| -> sqrt(3² + (-4)²) -> 5
         * MathPlus.abs('3-4i');
         */
        static abs(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const re = input.re, im = input.im;

            // --- 路径 1: 输入为纯实数 ---
            // 优化：直接返回其绝对值，避免开方运算。
            if (input.onlyReal) {
                // 如果实部为负，返回其相反数；否则返回其自身。
                // _oppositeNumber(re) 会返回一个 BigNumber，需要用它构造一个新的 ComplexNumber。
                return re.mantissa < 0n ? new ComplexNumber(MathPlus._oppositeNumber(re)) : input;
            }

            // --- 路径 2: 输入为纯虚数 ---
            // 优化：直接返回其虚部的绝对值，避免开方运算。
            if (input.re.mantissa === 0n) {
                // 如果虚部为负，返回其相反数；否则返回其自身。
                // 结果是一个纯实数。
                return im.mantissa < 0n ? new ComplexNumber(MathPlus._oppositeNumber(im)) : new ComplexNumber(im);
            }

            // --- 路径 3: 一般复数 ---
            // 应用公式 |a + bi| = sqrt(a² + b²)。
            // MathPlus.times 和 MathPlus.plus 的结果都是 ComplexNumber，
            // MathPlus.sqrt 的结果也是 ComplexNumber，因此返回值类型是统一的。
            return MathPlus.sqrt(MathPlus.plus(MathPlus.times(re, re), MathPlus.times(im, im)));
        }

        /**
         * @static
         * @method sgn
         * @description 计算一个数的符号函数 (signum function)。
         * - 对于实数 x：如果 x>0, 返回 1; 如果 x<0, 返回 -1; 如果 x=0, 返回 0。
         * - 对于复数 z (z≠0): 返回 z / |z|，这是一个模为 1 的复数，指向 z 的方向。
         * - 对于复数 z=0: 返回 0。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。
         * @returns {ComplexNumber} 代表 sgn(x) 结果的 ComplexNumber 实例。
         * @example
         * // sgn(10) -> 1
         * MathPlus.sgn(10);
         *
         * // sgn(-0.5) -> -1
         * MathPlus.sgn(-0.5);
         *
         * // sgn(3 + 4i) -> 0.6 + 0.8i
         * MathPlus.sgn('3+4i');
         */
        static sgn(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc;

            // 首先处理通用情况：sgn(0) = 0
            if (input.re.mantissa === 0n && input.im.mantissa === 0n) {
                return new ComplexNumber([0, 0n, acc]);
            }

            // 优化路径：如果输入是纯实数
            if (input.onlyReal) {
                // 根据实部符号返回 1 或 -1
                const result = input.re.mantissa > 0n ? [0, 1n, acc] : [0, -1n, acc];
                return new ComplexNumber(result);
            }
            // 优化路径：如果输入是纯虚数
            if (input.re.mantissa === 0n) {
                // 根据虚部符号返回 i 或 -i
                const result = input.im.mantissa > 0n ? [0, 1n, acc] : [0, -1n, acc];
                return new ComplexNumber([[0, 0n, acc], result]);
            }
            // 对于非零复数，应用公式 sgn(z) = z / |z|
            return MathPlus.divide(input, MathPlus.abs(input));
        }

        /**
         * @static
         * @method degree
         * @description 将角度从度 (degree) 转换为弧度 (radian)。
         * - 计算公式为：radians = degrees * π / 180。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 以度为单位的输入角度。
         * @returns {ComplexNumber} 代表转换后弧度值的 ComplexNumber 实例。
         * @example
         * // 180° -> π ≈ 3.14159
         * MathPlus.degree(180);
         */
        static degree(x) {
            // 将输入统一转换为 ComplexNumber 实例，以便统一处理。
            const input = new ComplexNumber(x);
            const acc = input.acc;

            // 应用转换公式: (input / 180) * π
            return MathPlus.times(
                // [1, 18n, acc] 是 BigNumber 180 的内部表示 (18 * 10^1)
                MathPlus.divide(input, [1, 18n, acc]),
                CalcConfig.constants.pi
            );
        }

        /**
         * @static
         * @method calc
         * @description 解析并计算一个字符串形式的数学表达式。
         * 这是一个强大的解析器，支持高精度实数、复数、变量以及大量数学函数。
         * 它使用了调度场算法（Shunting-yard algorithm）的变体来处理运算符优先级和结合性。
         * @param {string|number|BigInt|ComplexNumber|BigNumber} expr - 要计算的数学表达式字符串。
         * @param {object} [options={}] - 可选参数对象。
         * @param {string|number|BigInt|ComplexNumber|BigNumber} [options.unknown] - 变量 'x' 的值。
         * @param {string} [options.f] - 自定义函数 'f(x)' 的表达式字符串。
         * @param {string} [options.g] - 自定义函数 'g(x)' 的表达式字符串。
         * @param {string} [options.mode='calc'] - 操作模式。
         * - 'calc': (默认) 解析并计算表达式，返回数值结果。
         * - 'syntaxCheck': 仅解析和格式化表达式以检查语法，不执行计算。这对于快速验证表达式有效性很有用。
         * @returns {Array<ComplexNumber|string|number|BigInt|ComplexNumber|BigNumber>} 一个包含两个元素的数组：
         * - [0]: 计算结果。在 'calc' 模式下，这是一个 ComplexNumber 实例；在 'syntaxCheck' 模式下，这是一个代表 0 的 ComplexNumber 实例。
         * - [1]: 格式化和美化后的表达式字符串或原始输入。
         * @throws {Error} 如果表达式包含语法错误、非法字符或计算错误（如除以零）。
         */
        static calc(expr, {unknown, f, g, mode = 'calc', acc = CalcConfig.globalCalcAccuracy} = {}) {
            /**
             * @private
             * @function listIncludesStr
             * @description (内部辅助函数) 检查一个字符串数组中是否至少有一个元素包含指定的子字符串。
             * @param {string[]} list - 要检查的字符串数组。
             * @param {string} str - 要搜索的子字符串。
             * @returns {boolean} 如果找到任何包含该子字符串的元素，则返回 true；否则返回 false。
             */
            function listIncludesStr(list, str) {
                for (let i = 0; i < list.length; i++) {
                    if (list[i].includes(str)) {
                        return true;
                    }
                }
                return false;
            }

            /**
             * @private
             * @function symbolConversion
             * @description (内部辅助函数) 将一个词法单元（token）转换为其内部表示或可执行的等价物。
             * 这是连接词法分析和计算执行的关键步骤。它将运算符、函数名、常量和变量等字符串
             * 映射到实际的 MathPlus 方法名、预计算的常量值或变量的当前值。
             * @param {string} str - 要转换的词法单元字符串，例如 "+", "sin", "pi", "x"。
             * @returns {string|ComplexNumber|BigNumber|Array|number}
             *   - 对于运算符和函数，返回对应的 MathPlus 方法名（例如，"+" -> "plus"）。
             *   - 对于常量（如 'pi', 'e', 'i'），返回其预计算的高精度数值。
             *   - 对于变量 'x'，返回其在当前计算上下文中被赋予的值。
             *   - 对于数字字符串，原样返回，由后续步骤处理。
             */
            function symbolConversion(str) {
                // 使用 switch 语句高效地处理不同 token 的映射。
                switch (str) {
                    // --- 映射二元运算符为其方法名 ---
                    case '+':
                        return 'plus'; // 将加法符号 '+' 映射为 'plus' 方法。
                    case '-':
                        return 'minus'; // 将减法符号 '-' 映射为 'minus' 方法。
                    case '*':
                    case '&': // 将显式的 '*' 和隐式的 '&' 都映射为乘法。
                        return 'times';
                    case '/':
                        return 'divide'; // 将除法符号 '/' 映射为 'divide' 方法。
                    case '^':
                        return 'pow'; // 将幂运算 '^' 映射为 'pow' 方法。
                    case 'E': // 代表科学记数法 (例如, 3E6)。
                        return 'exponential';

                    // --- 映射一元运算符为其方法名 ---
                    case '!': // 将阶乘符号 '!' 映射为 'fact' 方法。
                        return 'fact';
                    case '|':
                        return 'abs';
                    case 'N': // 'N' 是内部使用的、代表一元负号（取反）的 token。
                        return '_oppositeNumber';
                    case 'A': // 'A' 是内部使用的、代表绝对值的 token。
                        return 'abs';

                    // --- 映射函数为其方法名 ---
                    case 'f':
                    case 'g':
                        return '_customFunc';

                    // --- 获取预定义的常量和对象 ---
                    case '[pi]':
                        // 从配置对象中返回圆周率 Pi 的数值。
                        return new ComplexNumber(CalcConfig.constants.pi, {acc: acc});
                    case '[e]':
                        // 从配置对象中返回自然常数 e 的数值。
                        return new ComplexNumber(CalcConfig.constants.e, {acc: acc});
                    case '[i]':
                        // 创建并返回一个代表虚数单位 i 的新复数对象。
                        return new ComplexNumber([[0, 0n, acc], [0, 1n, acc]]);
                    case '[x]':
                        if (mode === 'calc') {
                            // 返回变量 'x' 的占位符，该占位符将在求值时被实际数值替换。
                            if (unknown === undefined) {
                                throw new Error('[MathPlus] input error: x is undefined.');
                            }
                            return new ComplexNumber(unknown, {acc: acc});
                        } else {
                            return new ComplexNumber([0, 0n, acc]);
                        }

                    // --- 默认回退情况 ---
                    default:
                        // 删除标识 CSS 的中括号
                        return str.replace(/[\[\]]/g, '');
                }
            }

            /**
             * @private
             * @function evaluationRPN
             * @description (内部辅助函数) 在调度场算法的求值阶段，处理并执行一个从操作符栈中弹出的词法单元（运算符或函数）。
             * 该函数从 `valueStack` 中弹出所需的操作数，执行计算，然后将结果压回 `valueStack`。
             * 它是逆波兰表示法 (RPN) 的核心执行引擎。
             * @param {string} token - 要执行的运算符或函数词法单元，例如 "+", "sin", "N"。
             * @returns {void} 此函数不返回值，它通过修改 `valueStack` 来产生副作用。
             * @throws {Error} 如果 `valueStack` 中的操作数不足以满足 `token` 所需的参数数量。
             * @throws {Error} 如果尝试调用一个未定义的自定义函数 'f' 或 'g'。
             */
            function evaluationRPN(token) {
                let tokenInfo = Public.getTokenInfo(token);

                // --- 规则 1: 处理一元运算符（前缀或后缀） ---
                if (tokenInfo.parameters === 1) {
                    // 健壮性检查：确保栈中至少有一个操作数。
                    if (valueStack.length < 1) {
                        throw new Error(`[MathPlus] syntax error: Insufficient parameters for function ${token}.`);
                    }

                    // 如果是计算模式
                    if (mode === 'calc') {
                        // 必须先从栈中弹出操作数。
                        const operand = valueStack.pop();
                        // 调用相应的MathPlus方法进行计算。
                        let value;
                        if (['f', 'g'].includes(token)) {
                            const context = {f, g};
                            // 健壮性检查：确认所需函数已经定义。
                            if (context[token] === undefined) {
                                throw new Error(`[MathPlus] input error: Function ${token} is undefined or cyclically called.`);
                            }
                            value = MathPlus._customFunc(token, context, operand, acc);
                        } else {
                            value = MathPlus[symbolConversion(tokenInfo.token)](operand);
                        }
                        // 将计算结果压回栈中。
                        valueStack.push(value);
                    }
                }

                // --- 规则 2: 处理二元运算符和双参数函数 ---
                else if (tokenInfo.parameters === 2) {
                    // 健壮性检查：确保栈中至少有两个操作数。
                    if (valueStack.length < 2) {
                        throw new Error(`[MathPlus] syntax error: Insufficient parameters for function ${token}.`);
                    }
                    // 必须先从栈中弹出两个操作数。
                    // 注意弹出的顺序：第二个操作数（b）先弹出，然后是第一个操作数（a）。
                    const b = valueStack.pop();
                    // 如果是计算模式
                    if (mode === 'calc') {
                        const a = valueStack.pop();
                        // 调用相应的MathPlus方法进行计算，保持 (a, b) 的正确顺序。
                        const value = MathPlus[symbolConversion(tokenInfo.token)](a, b);
                        // 将计算结果压回栈中。
                        valueStack.push(value);
                    }
                }
            }

            // 类型检查
            const inputType = Public.typeOf(expr);
            if (['number', 'bigint', 'complexnumber', 'bignumber'].includes(inputType)) {
                return [new ComplexNumber(expr), expr];
            }
            if (inputType !== 'string') {
                throw new Error('[MathPlus] Disallowed input type.');
            }

            // --- 初始验证和准备 --- //
            if (expr === '') { // 输入为空则抛出错误。
                throw new Error('[MathPlus] syntax error: Input is empty.');
            }

            // 标准化字符串。
            expr = expr.replaceAll('[cdot]', '').replaceAll('**', '^').replace(/\s/g, '');

            // 对字符串进行分词。
            let [output, input] = [[], Public.tokenizer(expr, {baseNumberMode: 'together'})];
            if (input[0] === 'error') {
                throw new Error(`[MathPlus] syntax error: Illegal input (${input[1]}).`);
            }

            // --- 第一轮解析循环 --- //
            // 其主要工作是：
            // 1. 插入隐式乘法运算符 ('&')。
            // 2. 将一元 +/- 转换成 'N' (负号)。
            // 3. 通过在内部将绝对值符号转换为 'A(...)'。
            // 4. 跟踪括号嵌套，补全缺失的括号。
            // 5. 添加括号消除表达式歧义，如 2/3pi -> 2/(3&pi)。
            let lastTokenInfo = {}; // 上一个 token 的信息。
            let kh = 0, minKh = 0, addKh = 0; // kh 记录全局括号，minKh 记录需要添加左括号的个数，addKh 为内层循环的括号记录。
            const orderOfTimes = Public.getTokenInfo('*').priority; // 显式乘号的优先级。
            const orderOfInvisibleTimes = Public.getTokenInfo('&').priority; // 隐式乘号的优先级。
            const absKhStack = []; // 用于跟踪绝对值符号 '|' 嵌套层级的栈。

            for (let i = 0; i < input.length; i++) {
                // --- 获取 token 信息 ---
                const currentToken = input[i];
                const tokenInfo = Public.getTokenInfo(currentToken);
                let currentPush = currentToken;

                // --- 语法验证 ---
                if (tokenInfo.isPrivate) {
                    // 输入值出现内部表示
                    let position = 0;
                    for (let j = 0; j < i; j++) { // 获取当前字符的索引
                        position += input[j].length;
                    }
                    throw new Error(`[MathPlus] syntax error: Illegal input (${position}).`);
                }
                if (lastTokenInfo.parameters === 2 && lastTokenInfo.funcPlace === 'front' && currentPush !== '(') {
                    // 错误：像 'log' 这样的二元前缀函数后面必须跟 '('。
                    let position = 0;
                    for (let j = 0; j < i; j++) { // 获取当前字符的索引
                        position += input[j].length;
                    }
                    throw new Error(`[MathPlus] syntax error: A prefix binary function must be followed by a left parenthesis (${position}).`);
                }

                // --- 括号信息记录 ---
                if (currentPush === '(') {
                    // 出现 '(' 则把 kh 的值加一
                    kh += 1;
                    if (absKhStack.length > 0) {
                        absKhStack[absKhStack.length - 1] += 1; // 跟踪绝对值内的括号。
                    }
                } else if (currentPush === ')') {
                    // 出现 ')' 则把 kh 的值减一
                    kh -= 1;
                    if (absKhStack.length > 0) {
                        absKhStack[absKhStack.length - 1] -= 1;
                        if (absKhStack[absKhStack.length - 1] < 0) {
                            // 错误：绝对值内 ')' 不匹配。
                            let position = 0;
                            for (let j = 0; j < i; j++) { // 获取当前字符的索引
                                position += input[j].length;
                            }
                            throw new Error(`[MathPlus] syntax error: Absolute value internal parentheses do not match (${position}).`);
                        }
                    }
                    if (kh < minKh) {
                        minKh = kh; // 计算在 '(' 之前的 ')' 的个数。
                    }
                }

                // --- 隐式乘法插入 ---
                // 在特定上下文中插入隐式乘法运算符 '&'。
                if (lastTokenInfo.class === 'number' && tokenInfo.class === 'number') {
                    // 上一个 token 和这一个 token 均为数字，如 '3pi'。
                    output.push('&');
                } else if (
                    tokenInfo.funcPlace === 'front' &&
                    (lastTokenInfo.class === 'number' || lastTokenInfo.funcPlace === 'back')
                ) {
                    // 上一个 token 为数字或后缀运算符，这一个 token 为前缀运算符，如 '2sin'、'!sin'。
                    output.push('&');
                } else if (lastTokenInfo.funcPlace === 'back' && tokenInfo.class === 'number') {
                    // 上一个 token 为后缀运算符，这一个 token 为数字，如 '!4'
                    output.push('&');
                } else if (
                    currentPush === '(' &&
                    (lastTokenInfo.class === 'number' || lastTokenInfo.funcPlace === 'back' || lastTokenInfo.token === ')')
                ) {
                    // 上一个 token 为后缀运算符、')'、数字，这一个 token 为 '('。
                    // 如 '!('、'pi('、')('
                    output.push('&');
                } else if (
                    lastTokenInfo.token === ')' &&
                    (tokenInfo.class === 'number' || tokenInfo.funcPlace === 'front')
                ) {
                    // 上一个 token 为 ')'，这一个 token 为前缀运算符或数字。
                    // 如 ')sin'、')e'
                    output.push('&');
                }

                // --- 处理正负号 ---
                if (
                    ['+', '-'].includes(currentPush) &&
                    !(
                        lastTokenInfo.class === 'number' ||
                        lastTokenInfo.funcPlace === 'back' ||
                        lastTokenInfo.token === ')'
                    )
                ) {
                    currentPush = currentPush === '-' ? 'N' : ''; // 一元正号被忽略。
                }

                // --- 处理绝对值 ---
                // 此逻辑将 |...| 转换为内部的 A(...) 表示。
                if (currentPush === '|') {
                    // 默认此处表示绝对值的开始。
                    currentPush = '(';
                    if (
                        absKhStack.length !== 0 &&
                        absKhStack[absKhStack.length - 1] === 0 &&
                        !['front', 'middle'].includes(lastTokenInfo.funcPlace) &&
                        !['(', ','].includes(lastTokenInfo.token)
                    ) {
                        // 绝对值闭合的情况。
                        output.push('|'); // 为第二轮处理循环添加一个标记。
                        currentPush = ')';
                        kh -= 1;
                        absKhStack.pop(); // 括号记录从绝对值堆栈中弹出，表示闭合了一个绝对值。
                    }
                    // 其余情况将 '|' 视为绝对值的开始
                    else if (
                        lastTokenInfo.class === 'number' ||
                        lastTokenInfo.token === ')' ||
                        lastTokenInfo.funcPlace === 'back'
                    ) {
                        // 在开头的竖线前进行隐式乘法，例如 5|x| -> 5*|x|
                        output.push('&');
                    }
                    // 如果是绝对值的开始，则插入 'A'（插入 A 而不是 abs 是为了和输入区分）
                    if (currentPush === '(') {
                        absKhStack.push(0); // 推入绝对值堆栈，标记一个新的绝对值起始。
                        kh += 1;
                        output.push('A'); // 'A' 是 'abs' 的内部函数。
                    }
                }

                // --- 隐式乘法添加括号逻辑 ---
                // 为了消除歧义。例如，`1/2x` 应该是 `1/(2&x)`。
                if (
                    (output[output.length - 1] === '&' || (output[output.length - 1] === 'A' && output[output.length - 2] === '&')) && // 如果添加了隐式乘法符号
                    !output.includes('[') // 如果这个隐式乘法前面没有未处理的隐式乘法。
                ) {
                    addKh = 0; // 临时括号记录。
                    // 小循环
                    for (let j = output.length - (output[output.length - 1] === '&' ? 2 : 3); j >= 0; j--) {
                        // --- 获取 token 信息 ---
                        const currentTokenJ = output[j];
                        const tokenInfoJ = Public.getTokenInfo(currentTokenJ);

                        // --- 括号信息记录 ---
                        if (currentTokenJ === '(') {
                            addKh += 1;
                        } else if (currentTokenJ === ')') {
                            addKh -= 1;
                        }

                        if (
                            tokenInfoJ.class === 'func' &&
                            tokenInfoJ.priority > orderOfInvisibleTimes && // 优先级低于隐式乘法，隐式乘法作用范围到此结束。
                            addKh === 0 // 确保没有括号干扰优先级。
                        ) {
                            if (tokenInfoJ.priority <= orderOfTimes && currentTokenJ !== '*') {
                                // 如果这个运算符优先级高于或等于显式乘法（不是显式乘法），则插入括号。
                                output.splice(j + 1, 0, '[');
                            }
                            break;
                        }
                    }
                    // 记录此时的 kh
                    addKh = currentPush === '(' ? kh - 1 : kh;
                }

                if ( // 解决为隐式乘法添加的另一半括号
                    output.includes('[') && (
                        ( // 判断依据同理小循环
                            tokenInfo.class === 'func' &&
                            tokenInfo.priority > orderOfInvisibleTimes &&
                            kh === addKh
                        ) ||
                        // 避免循环末尾需要在循环结束后重新处理
                        i + 1 === input.length
                    )
                ) {
                    if (tokenInfo.priority >= orderOfTimes) {
                        // 目前 token 优先级低于显式乘法，需要添加括号
                        output = output.map(item => item === '[' ? '(' : item);
                        if (i + 1 === input.length) {
                            output.push(currentPush);
                            currentPush = ')';
                        } else {
                            output.push(')');
                        }
                    } else {
                        // 否则不需要添加括号
                        output = output.filter(item => item !== '[');
                    }
                }

                // 向 output 添加 token 和 为下一次循环记录上一个 token
                if (i + 1 !== input.length) {
                    lastTokenInfo = Public.getTokenInfo(currentPush);
                } else {
                    // 初始化 lastTokenInfo。
                    lastTokenInfo = {};
                }
                output.push(currentPush);
            }

            // 第一轮循环之后...
            // 添加缺失的左括号
            while (minKh < 0) {
                output = ['(', ...output];
                minKh += 1;
                kh += 1;
            }
            // 关闭任何未闭合的绝对值符号 以及 绝对值内部未闭合的括号。
            for (let i = absKhStack.length - 1; i >= 0; i--) {
                for (let j = 0; j < absKhStack[i]; j++) {
                    output.push(')');
                }
                output = [...output, '|', ')'];
                kh -= absKhStack[i] + 1;
            }
            // 关闭剩余未闭合的常规括号。
            while (kh > 0) {
                output.push(')');
                kh -= 1;
            }

            // --- 第二轮解析循环 --- //
            // 其主要工作是为需要它的函数和运算符（如 `sin` 和 `^`）处理括号插入，
            // 以确保正确的运算顺序，特别是当用户省略括号时，以进一步消除歧义。
            // 例如 `sin x + 1` -> `sin(x) + 1`，而不是 `sin(x+1)`。
            // 它使用一个临时标记系统：
            // - `#kh#`（一级条件）：未发现完整括号的未闭合一元前缀函数，如：sin2 -> sin(2)
            // - `#kh@`（二级条件）：发现完整括号的未闭合一元前缀函数，如：sin(2)A(5) -> sin((2)A(5))，假设二元中缀运算符 'A' 的优先级比 'sin' 高。
            // - `:kh#`（一级条件）：未发现完整括号的未闭合 '^'。
            // - `:kh@`（二级条件）：发现完整括号的未闭合 '^'。
            [output, input] = [[], output]; // 为第二轮交换 `input` 和 `output`。
            let absAdd = false; // 跳过绝对值标记。
            const orderOfSin = Public.getTokenInfo('sin').priority;
            const orderOfPow = Public.getTokenInfo('^').priority;

            for (let i = 0; i < input.length; i++) {
                // --- 获取 token 信息 ---
                const currentToken = input[i];
                const tokenInfo = Public.getTokenInfo(currentToken);

                if (currentToken === '|') {
                    absAdd = true; // 标记绝对值标记。
                    continue;
                }

                // 左括号记录
                if (currentToken === '(') {
                    kh += 1;
                }

                // 简化判断
                const funcCheck = tokenInfo.class === 'func' && tokenInfo.funcPlace !== 'front';
                const tokenCheck = [',', ')'].includes(currentToken);

                if (
                    (
                        ((funcCheck && tokenInfo.priority > orderOfSin) || tokenCheck) && // for 'func_01_1'
                        listIncludesStr(output, '#' + kh + '@') // 含有二级条件
                    ) ||
                    (
                        ((funcCheck && tokenInfo.priority > orderOfPow) || tokenCheck) && // for '^'
                        listIncludesStr(output, ':' + kh + '@') // 含有二级条件
                    )
                ) { // 进入此条件一定会添加括号
                    if (listIncludesStr(output, ':' + kh + '@')) {
                        // 去除最后一个为 '^' 准备的标记，因为 2^3^4 -> 2^(3^4) 而不是 2^(3^(4))
                        const pattern = new RegExp(`:${kh}[@#]`);
                        for (let j = output.length - 1; j > -1; j--) {
                            if (pattern.test(output[j])) {
                                output[j] = output[j].replace(pattern, '');
                                break;
                            }
                        }
                    }
                    // 替换每个标记并添加括号。
                    const pattern = new RegExp(`[#:]${kh}[@#]`);
                    for (let j = 0; j < output.length; j++) {
                        if (pattern.test(output[j])) {
                            output[j] = output[j].replace(pattern, '');
                            output.splice(j + 1, 0, '(');
                            output.push(')');
                        }
                    }
                }

                if (
                    (funcCheck || tokenCheck) &&
                    (listIncludesStr(output, '#' + kh + '#') || listIncludesStr(output, ':' + kh + '#')) // 含有一级条件
                ) { // 进入此条件不一定会添加括号
                    // for 'func_01_1'
                    if (listIncludesStr(output, '#' + kh + '#')) {
                        if (tokenInfo.priority > orderOfSin) {
                            // 该 token 作用域到此结束，添加括号。
                            for (let j = 0; j < output.length; j++) {
                                if (output[j].includes('#' + kh + '#')) {
                                    // 判断原始表达式是否自带括号。
                                    const needKh = !(output[j + 1] === '(' && output[output.length - 1] === ')');
                                    output[j] = output[j].replace('#' + kh + '#', '');
                                    if (needKh) {
                                        output.splice(j + 1, 0, '(');
                                        output.push(')');
                                    }
                                }
                            }
                        } else if (tokenInfo.priority < orderOfSin) {
                            // 该 token 作用域未结束，转换为二级条件。
                            for (let j = 0; j < output.length; j++) {
                                output[j] = output[j].replace('#' + kh + '#', '#' + kh + '@');
                            }
                        }
                    }

                    // for '^'，除特殊标注外逻辑同理 for 'func_01_1'
                    if (listIncludesStr(output, ':' + kh + '#')) {
                        if (tokenInfo.priority > orderOfPow) {
                            // 可能出现两级条件混杂情况。
                            const pattern = new RegExp(`:${kh}[@#]`);
                            // 最后一个 '^' 不用添加括号。
                            let theLast = true;
                            for (let j = output.length - 1; j > -1; j--) {
                                if (pattern.test(output[j])) {
                                    const needKh = !(output[j + 1] === '(' && output[output.length - 1] === ')');
                                    output[j] = output[j].replace(pattern, '');
                                    if (needKh && !theLast) { // 最后一个 '^' 不用添加括号。
                                        output.splice(j + 1, 0, '(');
                                        output.push(')');
                                    }
                                    theLast = false;
                                }
                            }
                        } else if (tokenInfo.priority < orderOfPow) {
                            for (let j = 0; j < output.length; j++) {
                                output[j] = output[j].replace(':' + kh + '#', ':' + kh + '@');
                            }
                        }
                    }
                }

                // 右括号记录，移到后面防止干扰括号判断。
                if (currentToken === ')') {
                    kh -= 1;
                }

                // 为需要添加括号的运算符添加标记
                if (lastTokenInfo.needKh) {
                    output[output.length - 1] += (lastTokenInfo.token === '^' ? ':' : '#') + (currentToken === '(' ? kh - 1 : kh) + '#';
                }

                if (absAdd) { // 跳过的绝对值标记。
                    absAdd = false;
                    output.push('|'); // 重新插入绝对值标记。
                }

                // 向 output 添加 token 和 为下一次循环记录上一个 token
                lastTokenInfo = tokenInfo;
                output.push(currentToken);
            }

            // 第二轮循环之后...
            let theLast = true;
            const powPattern = /:\d+[@#]/;
            const patternNotSure = /[#:]\d+#/; // 不一定需要添加括号
            const patternSure = /[#:]\d+@/; // 一定需要添加括号

            for (let i = output.length - 1; i > -1; i--) {
                if (powPattern.test(output[i]) && theLast) {
                    // 跳过最后一个 '^' 的标记
                    output[i] = output[i].replace(powPattern, '');
                    theLast = false;
                }
                if (patternNotSure.test(output[i])) {
                    // 判断是否需要添加括号。
                    const needKh = !(output[i + 1] === '(' && output[output.length - 1] === ')');
                    output[i] = output[i].replace(patternNotSure, '');
                    if (needKh) {
                        output.splice(i + 1, 0, '(');
                        output.push(')');
                    }
                }
                if (patternSure.test(output[i])) {
                    output[i] = output[i].replace(patternSure, '');
                    output.splice(i + 1, 0, '(');
                    output.push(')');
                }
            }

            // 将 input 指向处理后的 output。
            input = output;

            // 合成最终的 'output'，还原内部标记
            output = output.join('');
            output = output.replaceAll('A(', '|').replaceAll('|)', '|').replaceAll('&', '[cdot]').replaceAll('N', '-');

            // --- 第三轮解析循环 --- //
            // 生成 RPN（逆波兰表示法） 和 RPN求值循环
            const valueStack = []; // 求值栈
            const operatorStack = []; // 操作符栈

            for (let i = 0; i < input.length; i++) {
                // --- 获取 token 信息 ---
                const currentToken = input[i];
                const tokenInfo = Public.getTokenInfo(currentToken);

                // --- 生成 RPN（逆波兰表示法）---
                if (tokenInfo.class === 'number') {
                    // --- 规则 1: 处理数字和常量 ---
                    // 如果是数字或常量，通过 symbolConversion 转换（例如将 'pi' 转换为 3.14...），然后压入值栈。
                    if (mode === 'calc') {
                        const pushNum = symbolConversion(currentToken);
                        if (Public.typeOf(pushNum) === 'complexnumber') {
                            valueStack.push(pushNum);
                        } else {
                            valueStack.push(new ComplexNumber(pushNum, {acc: acc}));
                        }
                    } else {
                        // 语法检查模式占位符
                        valueStack.push(new ComplexNumber([0, 0n, acc]));
                    }
                } else if (tokenInfo.class === 'func') {
                    // --- 规则 2: 处理一元运算符（前缀或后缀） ---
                    // 如果当前 token 是一个函数或运算符。
                    // 栈顶元素通过 operatorStack[operatorStack.length - 1] 获取。
                    let topOfStack = operatorStack[operatorStack.length - 1];
                    let topOfStackInfo = {};
                    if (topOfStack !== undefined) {
                        topOfStack = topOfStack.replace('~', '');
                        topOfStackInfo = Public.getTokenInfo(topOfStack);
                    }
                    // 循环条件：当操作符栈不为空，栈顶不是左括号，且满足以下任一条件时，就将栈顶运算符弹出：
                    // 1. 栈顶运算符的优先级高于当前运算符。
                    // 2. 优先级相同，且当前运算符是左结合的。
                    while (
                        topOfStack !== undefined && (
                            topOfStackInfo.priority < tokenInfo.priority || // 栈顶优先级更高
                            (topOfStackInfo.priority === tokenInfo.priority && tokenInfo.associativity === 'left') // 优先级相同且为左结合
                        ) && tokenInfo.funcPlace !== 'front' // 防止提前出栈
                        ) {
                        // 使用 pop() 从栈顶弹出一个运算符，并用 evaluationRPN 更新求值栈的值。
                        evaluationRPN(operatorStack.pop().replace('~', ''));
                        // 更新栈顶元素以供下一次循环判断。
                        topOfStack = operatorStack[operatorStack.length - 1];
                        if (topOfStack !== undefined) {
                            topOfStack = topOfStack.replace('~', '');
                            topOfStackInfo = Public.getTokenInfo(topOfStack);
                        }
                    }
                    // 将当前运算符压入操作符栈的顶端。
                    operatorStack.push(currentToken);
                } else if (currentToken === '(') {
                    // 左括号直接入栈。
                    operatorStack.push(currentToken);
                } else if (currentToken === ')') {
                    // 遇到右括号则循环地将操作符栈顶的元素弹出，直到遇到左括号。
                    while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                        evaluationRPN(operatorStack.pop().replace('~', ''));
                    }
                    //  健壮性检查：如果循环结束时栈为空，说明没有找到匹配的左括号。
                    if (operatorStack.length === 0) {
                        throw new Error('[MathPlus] syntax error: The parentheses do not match.');
                    }
                    // 使用 pop() 弹出并丢弃左括号 '('。
                    operatorStack.pop();
                } else if (currentToken === ',') {
                    // 循环地将操作符栈顶的元素弹出，直到遇到左括号。
                    while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                        evaluationRPN(operatorStack.pop().replace('~', ''));
                    }
                    // 为健壮性检查做准备
                    const subTopOfStack = Public.getTokenInfo(operatorStack[operatorStack.length - 2]);
                    //  健壮性检查：如果此时栈长度小于2 或 栈顶不是 `二元函数 + (` 的组合，说明逗号不在函数括号内，位置错误。
                    if (operatorStack.length < 2 || !(subTopOfStack.funcPlace === 'front' && subTopOfStack.parameters === 2)) {
                        throw new Error('[MathPlus] syntax error: Commas mismatch or incorrect position.');
                    }
                    // 标记这个函数已经被一个逗号匹配。
                    operatorStack[operatorStack.length - 2] += '~';
                }
            }

            // 第三轮循环之后...
            // 清空操作符栈。
            while (operatorStack.length > 0) {
                // 使用 pop() 从栈顶弹出。
                const operator = operatorStack.pop().replace('~', '');

                // 健壮性检查：如果此时弹出的运算符是左括号，说明括号不匹配。
                if (operator === '(') {
                    throw new Error('[MathPlus] syntax error: The parentheses do not match.');
                }

                // 用 evaluationRPN 更新求值栈的值。
                evaluationRPN(operator);
            }

            // 遍历完所有token后，求值栈中应该且只应该剩下一个值。
            if (valueStack.length !== 1) {
                // 如果栈中值的数量不是1，说明原始表达式存在语法错误（例如，操作数过多或运算符不足）。
                throw new Error('[MathPlus] syntax error: The final stack should have exactly one value.');
            }

            // 返回计算结果和优化后的字符串
            const result = new ComplexNumber(mode === 'calc' ? valueStack[0] : [0, 0n, acc]);
            return [result, output];
        }
    }

    /**
     * @class StatisticsTools
     * @description 一个静态工具类，实现统计计算和回归分析功能。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class StatisticsTools {
        /**
         * @constructor
         * @description StatisticsTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 StatisticsTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[StatisticsTools] StatisticsTools is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _averageAndSum
         * @description 计算一个数值列表的总和与平均值。
         * @param {Array<ComplexNumber|string|number>} list - 需要计算的数值数组。数组中的元素可以是任何可以被 ComplexNumber 构造函数接受的类型。
         * @returns {{sum: ComplexNumber, average: ComplexNumber}} 一个包含总和 (`sum`) 与平均值 (`average`) 的对象，两者均为 ComplexNumber 实例。
         */
        static _averageAndSum(list) {
            // 初始化一个 ComplexNumber 实例作为累加器。
            let sum = new ComplexNumber(0);
            // 遍历列表，将每个元素累加到 sum 中。
            for (let i = 0; i < list.length; i++) {
                sum = MathPlus.plus(list[i], sum);
            }
            // 返回一个包含总和与平均值的对象。
            // 平均值通过将总和除以列表长度得到。
            return {
                sum: sum,
                average: MathPlus.divide(sum, list.length)
            };
        }

        /**
         * @private
         * @static
         * @method _variance (内部辅助方法)
         * @description 计算一个数值列表的总体方差 (population variance)。
         * 方差是每个数据点与平均值之差的平方的平均值。
         * @param {Array<ComplexNumber|string|number>} list - 需要计算方差的数值数组。
         * @param {{sum: ComplexNumber, average: ComplexNumber}|null} [averageAndSum] - 数据的平均值与和。
         * @returns {[ComplexNumber, ComplexNumber|string]} 列表的总体方差和样本方差，以 ComplexNumber 实例形式返回。
         * - [0]: 列表的总体方差。
         * - [1]: 列表的样本方差。
         */
        static _variance(list, averageAndSum = null) {
            const n = list.length;
            if (n === 1) {
                return [new ComplexNumber(0), 'error'];
            }
            // 首先，计算列表的平均值。
            const average = (averageAndSum === null ? StatisticsTools._averageAndSum(list) : averageAndSum).average;
            // 初始化一个累加器，用于计算差值的平方和。
            let sum = new ComplexNumber(0);
            // 遍历列表中的每个元素。
            for (let i = 0; i < n; i++) {
                // 计算当前元素与平均值的差值。
                const mid = MathPlus.minus(list[i], average);
                // 将差值的平方累加到 sum 中。
                sum = MathPlus.plus(MathPlus.times(mid, mid), sum);
            }
            return [MathPlus.divide(sum, n), MathPlus.divide(sum, n - 1)];
        }

        /**
         * @private
         * @static
         * @method _covariance
         * @description (内部辅助方法) 计算两个数值列表协方差 (covariance)。
         * 协方差衡量两个变量总体误差的期望。
         * - 公式: Cov(X, Y) = Σ(xᵢ - x̄)(yᵢ - ȳ) / n；s = Σ(xᵢ - x̄)(yᵢ - ȳ) / (n - 1)
         * @param {Array<ComplexNumber|string|number>} listA - 第一个数值数组 (X)。
         * @param {Array<ComplexNumber|string|number>} listB - 第二个数值数组 (Y)。
         * @param {object} [options={}] - 可选参数。
         * @param {ComplexNumber} [options.averageA=null] - listA 的平均值。如果未提供，将自动计算。
         * @param {ComplexNumber} [options.averageB=null] - listB 的平均值。如果未提供，将自动计算。
         * @returns {[ComplexNumber, ComplexNumber|string]} 列表的总体方差和样本协方差，以 ComplexNumber 实例形式返回。
         * - [0]: 列表的总体协方差。
         * - [1]: 列表的样本协方差。
         */
        static _covariance(listA, listB, {averageA = null, averageB = null} = {}) {
            const n = listA.length;
            // 样本协方差的分母是 n-1，如果 n=1，则无法计算。
            if (n === 1) {
                return [new ComplexNumber(0), 'error'];
            }
            // 如果未提供平均值，则先计算平均值。
            averageA = averageA === null ? this._averageAndSum(listA) : averageA;
            averageB = averageB === null ? this._averageAndSum(listB) : averageB;
            // 初始化协方差累加器。
            let cov = new ComplexNumber(0);
            // 遍历列表，计算 (xᵢ - x̄)(yᵢ - ȳ) 的总和。
            for (let i = 0; i < n; i++) {
                // 累加：(listA[i] - averageA) * (listB[i] - averageB)
                cov = MathPlus.plus(
                    MathPlus.times(
                        MathPlus.minus(listA[i], averageA),
                        MathPlus.minus(listB[i], averageB)
                    ),
                    cov
                );
            }
            // 返回结果：总和除以 (n)。
            return [MathPlus.divide(cov, n), MathPlus.divide(cov, n - 1)];
        }

        /**
         * @private
         * @static
         * @method _covariance
         * @description (内部辅助方法) 计算两个数值列表的相关系数。
         * @param {Array<ComplexNumber|string|number>} listA - 第一个数值数组 (X)。
         * @param {Array<ComplexNumber|string|number>} listB - 第二个数值数组 (Y)。
         * @param {object} [options={}] - 可选参数。
         * @param {Array<ComplexNumber|string>} [options.varianceA=null] - listA 的方差（样本方差和总体方差）。如果未提供，将自动计算。
         * @param {Array<ComplexNumber|string>} [options.varianceB=null] - listB 的方差（样本方差和总体方差）。如果未提供，将自动计算。
         * @param {Array<ComplexNumber|string>} [options.covariance=null] - 样本的协方差（样本协方差和总体协方差）。如果未提供，将自动计算。
         * @returns {ComplexNumber|string} 列表的相关系数，以 ComplexNumber 实例形式返回。
         */
        static _correlationCoefficient(listA, listB, {
            varianceA = null,
            varianceB = null,
            covariance = null
        } = {}) {
            let result;
            varianceA = varianceA === null ? this._variance(listA) : varianceA;
            varianceB = varianceB === null ? this._variance(listB) : varianceB;
            covariance = covariance === null ? this._covariance(listA, listB) : covariance;
            try {
                result = MathPlus.divide(
                    covariance[0],
                    MathPlus.sqrt(MathPlus.times(varianceA[0], varianceB[0]))
                );
            } catch {
                result = 'error';
            }
            return result;
        }

        /**
         * @private
         * @static
         * @method _dotProduct
         * @description (内部辅助方法) 计算两个数值向量（列表）的点积（内积）。
         * 点积的计算方式为对应元素相乘后再求和。
         * @param {Array<ComplexNumber|string|number>} listA - 第一个向量。
         * @param {Array<ComplexNumber|string|number>} listB - 第二个向量。假定其长度与 listA 相同。
         * @returns {ComplexNumber} 两个向量的点积，以 ComplexNumber 实例形式返回。
         */
        static _dotProduct(listA, listB) {
            // 初始化一个 ComplexNumber 实例作为累加器，用于存储点积的总和。
            let sum = new ComplexNumber(0);
            // 遍历向量中的每个元素。假定 listA 和 listB 长度相同。
            for (let i = 0; i < listA.length; i++) {
                // 将当前对应元素的乘积累加到总和中。
                sum = MathPlus.plus(MathPlus.times(listA[i], listB[i]), sum);
            }
            // 返回最终计算出的点积。
            return sum;
        }

        /**
         * @private
         * @static
         * @method _changeInner (内部辅助方法)
         * @description 对一个数值列表中的每个元素应用一个指定的回调函数。
         * 此方法的功能类似于数组的 `map` 方法，但确保结果是 ComplexNumber 实例的数组。
         * @param {Array<ComplexNumber|string|number>} list - 需要进行变换的数值数组。
         * @param {function(any): ComplexNumber} func - 一个回调函数，它接收列表中的单个元素作为参数，并返回一个变换后的 ComplexNumber 实例。
         * @returns {Array<ComplexNumber>} 一个包含变换后结果的新数组，其中每个元素都是 ComplexNumber 实例。
         */
        static _changeInner(list, func) {
            // 初始化一个空数组，用于存储计算结果。
            const result = [];
            // 遍历输入列表中的每个元素。
            for (let i = 0; i < list.length; i++) {
                // 计算每一项新的值
                result.push(func(list[i]));
            }
            // 返回包含所有计算结果的新数组。
            return result;
        }

        /**
         * @private
         * @static
         * @method _getMaxAndMin
         * @description 在一个数值列表中查找最大值和最小值。
         * 注意：此方法主要基于数值的实部进行比较。对于复数，其虚部在比较中被忽略。
         * @param {Array<ComplexNumber|string|number>} list - 需要进行查找的数值数组。
         * @returns {{max: ComplexNumber, min: ComplexNumber}} 一个包含最大值 (`max`) 和最小值 (`min`) 的对象，两者均为 ComplexNumber 实例。
         */
        static _getMaxAndMin(list) {
            // 初始化一个空对象来存储结果。
            const result = {};
            // 假设列表中的第一个元素既是当前的最大值也是最小值。
            result.max = new ComplexNumber(list[0]);
            result.min = new ComplexNumber(list[0]);
            // 从列表的第二个元素开始遍历。
            for (let i = 1; i < list.length; i++) {
                const currentI = new ComplexNumber(list[i]);
                // 比较当前最大值与列表中的当前元素。
                // 如果 `list[i] > result.max`，则 `result.max - list[i]` 的结果为负。
                if (MathPlus.minus(result.max, currentI).re.mantissa < 0n) {
                    // 如果当前元素更大，则更新最大值。
                    result.max = currentI;
                    // 否则，比较当前最小值与列表中的当前元素。
                    // 如果 `list[i] < result.min`，则 `list[i] - result.min` 的结果为负。
                } else if (MathPlus.minus(currentI, result.min).re.mantissa < 0n) {
                    // 如果当前元素更小，则更新最小值。
                    result.min = currentI;
                }
            }
            // 返回包含最终最大值和最小值的对象。
            return result;
        }

        /**
         * @private
         * @static
         * @method _getAbsList (内部辅助方法)
         * @description 计算一个数值列表中每个元素的绝对值（模）。
         * 此方法的功能类似于 `list.map(item => MathPlus.abs(item))`。
         * @param {Array<ComplexNumber|string|number>} list - 需要计算绝对值的数值数组。
         * @returns {Array<ComplexNumber>} 一个新的数组，其中包含原始列表中每个元素的绝对值。
         */
        static _getAbsList(list) {
            // 初始化一个空数组，用于存储计算结果。
            const result = [];
            // 遍历输入列表中的每个元素。
            for (let i = 0; i < list.length; i++) {
                // 计算当前元素的绝对值并将其推入结果数组。
                result.push(MathPlus.abs(list[i]));
            }
            // 返回包含所有绝对值的新数组。
            return result;
        }

        /**
         * @private
         * @static
         * @method _getListInfo
         * @description 检查一个数值列表，以确定其中是否包含正数、负数或零值。
         * 此方法仅检查数值的实部来判断其符号。它用于快速了解数据集的符号构成，
         * 例如，在对数回归中，所有自变量都必须为正。
         * @param {Array<ComplexNumber|string|number>} list - 需要检查的数值数组。
         * @returns {{positive: boolean, zero: boolean, negative: boolean}} 一个对象，
         * 其属性 (`positive`, `zero`, `negative`) 指示是否在列表中找到了相应类型的数值。
         * 如果找到了，对应属性为 `true` ，否则为 `false`。
         */
        static _getListInfo(list) {
            const result = {
                positive: false,
                zero: false,
                negative: false
            }; // 初始化对象，用于存储检查结果。

            // 遍历列表中的每个元素。
            for (let i = 0; i < list.length; i++) {
                // 确保每个被检查的元素都是一个 ComplexNumber 实例。
                const currentCheck = new ComplexNumber(list[i]);
                // 检查当前数值实部的符号。
                if (currentCheck.re.mantissa > 0n) {
                    // 如果找到一个正数，则在结果对象中标记 'positive' 为 true。
                    result.positive = true;
                } else if (currentCheck.re.mantissa === 0n) {
                    // 如果找到一个零，则在结果对象中标记 'zero' 为 true。
                    result.zero = true;
                } else { // currentCheck.re.mantissa < 0n
                    // 如果找到一个负数，则在结果对象中标记 'negative' 为 true。
                    result.negative = true;
                }
            }
            // 返回包含符号构成信息的对象。
            return result;
        }

        /**
         * @private
         * @static
         * @method _solveLinearEquation
         * @description 使用高斯-若尔当消元法 (Gauss-Jordan Elimination) 求解 n 元一次方程组 (Ax = b)。
         * 该算法通过一系列的行变换将增广矩阵 [A|b] 转换为简化行阶梯形式 [I|x]，其中 I 是单位矩阵，x 便是方程组的唯一解。
         * @param {Array<Array<ComplexNumber|string|number>>} coefficients - (A) 方程组的系数矩阵，一个 n x n 的二维数组。
         * @param {Array<ComplexNumber|string|number>} constants - (b) 方程组右侧的常数项向量，一个包含 n 个元素的一维数组。
         * @returns {Array<ComplexNumber>} (x) 方程组的唯一解向量，一个包含 n 个元素的一维数组。
         * @throws {Error} 当系数矩阵不是方阵 (n x n) 或矩阵为奇异矩阵（即方程组无唯一解或有无穷多解）时抛出。
         */
        static _solveLinearEquation(coefficients, constants) {
            // 获取方程组的阶数（未知数的数量）
            const n = coefficients.length;

            // --- 步骤 1: 创建增广矩阵 ---
            // 增广矩阵是将系数矩阵和常数项向量合并在一起的矩阵。
            // 所有的行变换操作都在这个增广矩阵上进行。
            // 例如: [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]]
            const augmentedMatrix = [];
            for (let i = 0; i < n; i++) {
                // 检查输入是否合法，确保系数矩阵是方阵
                if (coefficients[i].length !== n) {
                    throw new Error('[StatisticsTools] The coefficient matrix must be a square matrix.');
                }
                const newRow = [];
                // 在新行中创建 ComplexNumber 实例，不修改原始 coefficients
                for (let j = 0; j < n; j++) {
                    newRow.push(new ComplexNumber(coefficients[i][j]));
                }
                // 推入常数项
                newRow.push(new ComplexNumber(constants[i]));
                augmentedMatrix.push(newRow);
            }

            // --- 步骤 2: 前向消元与部分主元法 (将系数矩阵部分转换为上三角矩阵，然后转换为单位矩阵) ---
            // 这个循环遍历每一列（也是每一个主元）
            for (let i = 0; i < n; i++) {
                // --- 部分主元法 (Partial Pivoting) ---
                // 为了提高数值稳定性，避免除以一个过小或为零的数，
                // 我们在当前列 (i) 中找到从当前行 (i) 到最后一行中绝对值最大的元素。
                let maxRow = i;
                for (let k = i + 1; k < n; k++) {
                    if (MathPlus.minus(MathPlus.abs(augmentedMatrix[k][i]), MathPlus.abs(augmentedMatrix[maxRow][i])).re.mantissa > 0n) {
                        maxRow = k;
                    }
                }

                // 将找到的主元所在行 (maxRow) 与当前行 (i) 进行交换。
                // 这样可以确保我们用来消元的“主元”是该列中（下方元素里）最大的。
                [augmentedMatrix[i], augmentedMatrix[maxRow]] = [augmentedMatrix[maxRow], augmentedMatrix[i]];

                // 获取当前行的主元（对角线上的元素 A[i][i]）
                const pivot = augmentedMatrix[i][i];

                // --- 检查奇异矩阵 ---
                // 如果主元为 0，说明该矩阵的行列式为 0，即矩阵是奇异的。
                // 奇异矩阵意味着方程组没有唯一解（可能无解或有无穷多解）。
                // 在这种情况下，我们无法继续计算，因此抛出错误。
                if (pivot.re.mantissa === 0n) {
                    throw new Error('[StatisticsTools] The system of equations has no unique solution.');
                }

                // --- 归一化当前行 ---
                // 将当前主元所在行的所有元素都除以主元 pivot 的值。
                // 这样做之后，当前行的主元 A[i][i] 就变成了 1。
                // 我们从 i 开始除，因为 i 前面的元素都已经是 0 了。
                for (let j = i; j < n + 1; j++) {
                    augmentedMatrix[i][j] = MathPlus.divide(augmentedMatrix[i][j], pivot);
                }

                // --- 消去当前列的其他元素 ---
                // 遍历所有行，将除了当前主元所在行之外的所有行中，
                // 第 i 列的元素都消为 0。
                for (let k = 0; k < n; k++) {
                    // 跳过主元所在的当前行 (k !== i)
                    if (k !== i) {
                        // 获取要消去的行 (k) 在第 i 列的元素值，这就是我们要消元的倍数。
                        const factor = augmentedMatrix[k][i];

                        // 用第 k 行的每个元素减去 (第 i 行的对应元素 * factor)。
                        // 因为第 i 行的第 i 个元素是 1，所以 A[k][i] - factor * A[i][i] = factor - factor * 1 = 0。
                        // 这就实现了将 A[k][i] 消为 0 的目的。
                        for (let j = i; j < n + 1; j++) {
                            augmentedMatrix[k][j] = MathPlus.minus(
                                augmentedMatrix[k][j],
                                MathPlus.times(factor, augmentedMatrix[i][j])
                            );
                        }
                    }
                }
            }

            // --- 步骤 3: 提取解 ---
            // 当循环结束后，增广矩阵的左侧部分已经变成了单位矩阵 (对角线为1，其他为0)。
            // 此时，增广矩阵的最后一列就是方程组的解。
            // 例如:
            // [ 1, 0, 0,  2 ]  => x = 2
            // [ 0, 1, 0,  3 ]  => y = 3
            // [ 0, 0, 1, -1 ]  => z = -1
            const solution = new Array(n);
            for (let i = 0; i < n; i++) {
                solution[i] = augmentedMatrix[i][n];
            }

            return solution;
        }

        /**
         * @private
         * @static
         * @method _regressionAnalysis
         * @description 使用最小二乘法执行多项式回归分析，以找到给定阶数的最优拟合多项式。
         * 该方法通过构建并求解正规方程组来确定多项式的系数。
         * @param {Array<ComplexNumber|string|number>} listA - 自变量数据 (x 值) 的数组。
         * @param {Array<ComplexNumber|string|number>} listB - 因变量数据 (y 值) 的数组。
         * @param {number} power - 要拟合的多项式的阶数。
         * @returns {Array<ComplexNumber>} 一个包含最优拟合多项式系数的数组，从常数项 (a₀) 到最高次项 (a_power) 排列。
         * @throws {Error} 如果数据点数量不足以确定指定阶数的多项式。
         * @throws {Error} 如果 x 和 y 数据集的长度不匹配。
         */
        static _regressionAnalysis(listA, listB, power) {
            // 验证：确保数据点的数量至少比多项式阶数多一个，否则无法唯一确定系数。
            if (listA.length <= power) {
                throw new Error('[StatisticsTools] Insufficient number of parameters.');
            }
            // 验证：确保 x 和 y 数据集的长度相同。
            if (listA.length !== listB.length) {
                throw new Error('[StatisticsTools] Data mismatch.');
            }
            // n 是数据点的数量。
            const n = listA.length;
            // 'constants' 数组将构成正规方程组 Ax = b 中的向量 b。
            // b_i = Σ(x^i * y)
            const constants = [StatisticsTools._averageAndSum(listB).sum];
            // 'coefficientsList' 预先计算所有需要的 Σ(x^k) 的值。
            const coefficientsList = [new ComplexNumber(n)];
            // 'coefficients' 矩阵将构成正规方程组中的矩阵 A。
            // A_ij = Σ(x^(i+j))
            const coefficients = [];
            // 计算 b_i = Σ(x^i * y) for i = 1 to power
            for (let i = 1; i < power + 1; i++) {
                const changedListA = StatisticsTools._changeInner(listA, x => MathPlus.pow(x, i));
                constants.push(StatisticsTools._dotProduct(changedListA, listB));
            }
            // 计算 Σ(x^k) for k = 1 to 2*power
            for (let i = 1; i < 2 * power + 1; i++) {
                const changedListA = StatisticsTools._changeInner(listA, x => MathPlus.pow(x, i));
                coefficientsList.push(StatisticsTools._averageAndSum(changedListA).sum);
            }
            // 构建系数矩阵 A
            for (let i = 0; i < power + 1; i++) {
                const rowList = [];
                const endNum = i + power + 1;
                // A_ij = Σ(x^(i+j))，从预计算的列表中获取值
                for (let j = i; j < endNum; j++) {
                    rowList.push(coefficientsList[j]);
                }
                coefficients.push(rowList);
            }
            // 求解线性方程组 Ax = b 以找到多项式系数。
            return StatisticsTools._solveLinearEquation(coefficients, constants);
        }

        /**
         * @private
         * @static
         * @method _calcR2 (内部辅助方法)
         * @description 计算决定系数 (R²)，这是一个统计量，用于衡量回归模型对数据的拟合优度。
         * R² 的值介于 0 和 1 之间，越接近 1 表示模型的解释能力越强。
         * - 公式: R² = 1 - (SS_res / SS_tot)
         *   - SS_res (残差平方和): Σ(yᵢ - f(xᵢ))²
         *   - SS_tot (总平方和): Σ(yᵢ - ȳ)²
         * @param {Array<ComplexNumber|string|number>} listA - 自变量数据 (x 值) 的数组。
         * @param {Array<ComplexNumber|string|number>} listB - 因变量的实际观测数据 (y 值) 的数组。
         * @param {function(ComplexNumber|string|number): ComplexNumber} func - 回归模型函数，接收一个 x 值并返回预测的 y 值。
         * @returns {ComplexNumber} 决定系数 R²，一个表示拟合优度的 ComplexNumber 实例。
         */
        static _calcR2(listA, listB, func) {
            // n 是数据点的数量。
            let n = listA.length;
            // 计算因变量 (listB) 的平均值 ȳ。
            const averageB = StatisticsTools._averageAndSum(listB).average;
            // 初始化总平方和 (SS_tot) 的累加器。
            let denominator = new ComplexNumber(0);
            // 初始化残差平方和 (SS_res) 的累加器。
            let numerator = new ComplexNumber(0);
            // 遍历所有数据点以计算 SS_tot 和 SS_res。
            for (let i = 0; i < n; i++) {
                // --- 计算总平方和 (SS_tot) ---
                // 计算当前 y 值与平均值之差 (yᵢ - ȳ)。
                const addDenominator = MathPlus.minus(listB[i], averageB);
                // 将差值的平方累加到 SS_tot 中。
                denominator = MathPlus.plus(
                    denominator,
                    MathPlus.times(addDenominator, addDenominator)
                );
                // --- 计算残差平方和 (SS_res) ---
                // 计算残差 (yᵢ - f(xᵢ))，即实际值与模型预测值之差。
                const addNumerator = MathPlus.minus(listB[i], func(listA[i]));
                // 将残差的平方累加到 SS_res 中。
                numerator = MathPlus.plus(
                    numerator,
                    MathPlus.times(addNumerator, addNumerator)
                );
            }
            // 根据公式 R² = 1 - (SS_res / SS_tot) 计算并返回决定系数。
            return MathPlus.minus(1, MathPlus.divide(numerator, denominator));
        }

        /**
         * @private
         * @static
         * @method _getStatisticsInfo
         * @description (内部辅助方法) 计算一个数值列表的一系列基本统计信息。
         * 此方法作为一个便捷的封装，一次性计算出总和、平均值、平方和、方差、最大值和最小值，
         * 以供其他更复杂的统计函数（如 `statisticsCalc`）复用，从而避免重复计算。
         * @param {Array<ComplexNumber|string|number>} list - 需要计算统计信息的数值数组。
         * @param {{sum: ComplexNumber, average: ComplexNumber}|null} [averageAndSum] - 数据的平均值与和。
         * @param {{sum: ComplexNumber, average: ComplexNumber}|null} [varianceList] - 数据的方差。
         * @returns {{statisticsResult: {}, squareList: Array<ComplexNumber>}}
         * 一个包含两部分结果的对象：
         * - `statisticsResult`: 一个包含各种统计指标的对象。
         * - `squareList`: 一个新的数组，其中包含原始列表中每个元素的平方。
         */
        static _getStatisticsInfo(list, {averageAndSum = null, varianceList = null} = {}) {
            // 初始化一个空对象，用于存储所有计算出的统计结果。
            const statisticsResult = {};
            // 一次性计算列表的总和与平均值，以提高效率。
            averageAndSum = averageAndSum === null ? StatisticsTools._averageAndSum(list) : averageAndSum;
            statisticsResult.average = Public.idealizationToString(averageAndSum.average);
            statisticsResult.sum = Public.idealizationToString(averageAndSum.sum);
            // 计算列表中每个元素的平方，得到一个新的列表 [x₁², x₂², ...]。
            const list2 = StatisticsTools._changeInner(list, x => MathPlus.times(x, x));
            // 计算平方和 (Σx²)。
            statisticsResult.sum2 = Public.idealizationToString(StatisticsTools._averageAndSum(list2).sum);
            // 计算方差。
            const variance = varianceList === null ? StatisticsTools._variance(list, averageAndSum) : varianceList;
            statisticsResult.totalVariance = Public.idealizationToString(MathPlus.sqrt(variance[0]));
            statisticsResult.sampleVariance = Public.idealizationToString(variance[1] === 'error' ? 'error' : MathPlus.sqrt(variance[1]));
            // 查找列表中的最大值和最小值。
            const maxAndMin = StatisticsTools._getMaxAndMin(list);
            statisticsResult.max = Public.idealizationToString(maxAndMin.max);
            statisticsResult.min = Public.idealizationToString(maxAndMin.min);
            // 返回一个包含统计结果和平方列表的对象，以便调用者可以复用这些计算。
            return {statisticsResult: statisticsResult, squareList: list2};
        }

        /**
         * @private
         * @static
         * @method _getRegressionInfo (内部辅助方法)
         * @description 执行一个完整的回归分析，计算指定模型的参数（系数）和拟合优度（R²）。
         * 此方法封装了系数求解和 R² 计算的核心逻辑，并通过 `try...catch` 块来优雅地处理潜在的计算错误，
         * 确保即使在数学上不可解的情况下也能返回一个表示错误状态的结构化结果。
         * @param {Array<ComplexNumber|string|number>} listA - 自变量数据 (x 值) 的数组。
         * @param {Array<ComplexNumber|string|number>} listB - 因变量数据 (y 值) 的数组。对于某些模型（如对数），这可能是经过变换的 y 值。
         * @param {number} power - 要拟合的多项式的阶数。
         * @param {Array<ComplexNumber|string|number>} originalListB - 原始的、未经变换的因变量数据 (y 值) 数组，专门用于计算 R²。
         * @param {function(ComplexNumber|string|number, Array<ComplexNumber|string|number>): ComplexNumber} func - 回归模型函数。它接收一个 x 值和计算出的系数数组，并返回预测的 y 值。
         * @returns {{parameter: Array<ComplexNumber|string>, R2: ComplexNumber|string}} 一个包含回归分析结果的对象：
         * - `parameter`: 一个字符串数组，包含从常数项到最高次项的最优拟合多项式系数。如果计算失败，数组元素将为 'error'。
         * - `R2`: 决定系数 R²，或在出错时返回 'error'。
         */
        static _getRegressionInfo(listA, listB, power, originalListB, func) {
            // 初始化一个空对象，用于存储回归分析的结果。
            const result = {};

            // --- 步骤 1: 求解回归系数 ---
            // 尝试使用最小二乘法计算回归模型的系数。
            try {
                // 调用 _regressionAnalysis 来求解正规方程组，得到多项式系数。
                result.parameter = StatisticsTools._regressionAnalysis(listA, listB, power);
            } catch {
                // 如果在计算过程中发生错误（例如，数据点不足或矩阵奇异），
                // 则捕获异常，并将参数设置为一个表示错误的数组，其长度与预期系数数量相同。
                result.parameter = Array.from({length: power + 1}, () => 'error');
            }

            // --- 步骤 2: 计算拟合优度 (R²) ---
            // 仅当成功计算出系数时，才继续计算 R²。
            try {
                // 调用 _calcR2 方法来计算决定系数，以评估模型的拟合优度。
                // 注意：这里使用原始的 y 值 (originalListB) 来确保 R² 的计算是基于未变换的数据。
                result.R2 = StatisticsTools._calcR2(listA, originalListB,
                    // 传入一个匿名函数，该函数使用已计算出的系数来预测 y 值。
                    x => func(x, result.parameter)
                );
            } catch {
                // 如果在计算 R² 时发生错误（例如，除以零），
                // 则捕获异常并将 R² 设置为 'error'。
                result.R2 = 'error';
            }

            // 返回包含参数和 R² 的结果对象。
            return result;
        }

        /**
         * @private
         * @static
         * @method _findBestModel
         * @description (内部辅助方法) 比较当前回归模型与已知的最佳模型，并根据决定系数 (R²) 确定新的最佳模型。
         * R² 值越高，表示模型的拟合优度越好。
         * @param {object} result - 一个包含所有回归分析结果的对象。该对象应包含一个 `bestModel` 属性，
         * 其值为当前最佳模型的键名，以及以模型键名作为属性的子对象，每个子对象都包含一个 `R2` 属性。
         * @param {string} current - 当前需要进行比较的新模型的键名 (例如, 'linear', 'square')。
         * @returns {string} 更新后的最佳模型的键名。
         */
        static _findBestModel(result, current) {
            // 获取在本次比较之前被认为是最佳的模型的名称。
            const bestBefore = result.bestModel;
            // 检查当前正在评估的模型是否成功计算出了 R² 值。
            if (result[current].R2 !== 'error') {
                // 如果之前的最佳模型没有一个有效的 R² 值（例如，它是第一个被评估的模型或计算失败），
                // 那么当前模型自动成为新的最佳模型。
                if (result[bestBefore].R2 === 'error') {
                    return current;
                }
                // 如果两个模型都有有效的 R² 值，则进行比较。
                // MathPlus.minus(a, b).re.mantissa < 0n 等价于 a < b。
                // 因此，如果之前最佳模型的 R² 小于当前模型的 R²，则更新最佳模型。
                if (MathPlus.minus(result[bestBefore].R2, result[current].R2).re.mantissa < 0n) {
                    return current;
                }
            }
            // 如果当前模型没有有效的 R² 值，或者其 R² 不高于之前的最佳模型，则保持原有的最佳模型不变。
            return bestBefore;
        }

        /**
         * @static
         * @method statisticsCalc
         * @description 对两个数据集（自变量和因变量）执行全面的统计分析和多模型回归。
         * 该方法计算每个数据集的基本统计数据，它们之间的相关性，并拟合多种回归模型
         * （线性、二次、对数、幂、指数、反比例），为每个模型提供其参数和决定系数 (R²)。
         * 最后，它会根据 R² 值确定最佳拟合模型。
         * @param {Array<ComplexNumber|string|number>} listA - 自变量数据集 (x-values)。数组中的每个元素都将被转换为 ComplexNumber。
         * @param {Array<ComplexNumber|string|number>} listB - 因变量数据集 (y-values)。数组中的每个元素都将被转换为 ComplexNumber。
         * @returns {object} 一个包含详细统计和回归分析结果的对象。
         * @property {string} n - 基数。
         * @property {string} averageA - 数据集 A 的平均值。
         * @property {string} sumA - 数据集 A 的总和。
         * @property {string} sum2A - 数据集 A 的平方和 (Σx²)。
         * @property {string} totalVarianceA - 数据集 A 的总体标准差。
         * @property {string} sampleVarianceA - 数据集 A 的样本标准差。
         * @property {string} maxA - 数据集 A 的最大值。
         * @property {string} minA - 数据集 A 的最小值。
         * @property {string} averageB - 数据集 B 的平均值。
         * @property {string} sumB - 数据集 B 的总和。
         * @property {string} sum2B - 数据集 B 的平方和 (Σy²)。
         * @property {string} totalVarianceB - 数据集 B 的总体标准差。
         * @property {string} sampleVarianceB - 数据集 B 的样本标准差。
         * @property {string} maxB - 数据集 B 的最大值。
         * @property {string} minB - 数据集 B 的最小值。
         * @property {string} dotAB - A 和 B 的点积 (Σxy)。
         * @property {string} dotA2B - A² 和 B 的点积 (Σx²y)。
         * @property {string} totalCovariance - 总体协方差。
         * @property {string} sampleCovariance - 样本协方差。
         * @property {string} r - 皮尔逊相关系数 (r)，或在无法计算时为 'error'。
         * @property {string} bestModel - 拟合度最佳的回归模型的名称（基于最高的 R² 值）。
         * @property {object} linear - 线性回归 (y = a₁x + a₀) 的结果。
         * @property {string} linear.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} linear.parameter - 系数数组 [a₀, a₁]。
         * @property {string} linear.R2 - 决定系数 R²。
         * @property {object} square - 二次回归 (y = a₂x² + a₁x + a₀) 的结果。
         * @property {string} square.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} square.parameter - 系数数组 [a₀, a₁, a₂]。
         * @property {string} square.R2 - 决定系数 R²。
         * @property {object} ln - 对数回归 (y = a₁ln(x) + a₀) 的结果。
         * @property {string} ln.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} ln.parameter - 系数数组 [a₀, a₁]。
         * @property {string} ln.R2 - 决定系数 R²。
         * @property {object} axb - 幂回归 (y = a₀ * x^a₁) 的结果。
         * @property {string} axb.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} axb.parameter - 系数数组 [a₀, a₁]。
         * @property {string} axb.R2 - 决定系数 R²。
         * @property {object} exp - 指数回归 (y = a₀ * e^(a₁x)) 的结果。
         * @property {string} exp.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} exp.parameter - 系数数组 [a₀, a₁]。
         * @property {string} exp.R2 - 决定系数 R²。
         * @property {object} abx - 指数回归 (y = a₀ * b^x) 的结果。
         * @property {string} abx.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} abx.parameter - 系数数组 [a₀, b]。
         * @property {string} abx.R2 - 决定系数 R²。
         * @property {object} reciprocal - 倒数回归 (y = a₁/x + a₀) 的结果。
         * @property {string} reciprocal.regressionEquation - 格式化后的回归方程字符串。
         * @property {Array<string>} reciprocal.parameter - 系数数组 [a₀, a₁]。
         * @property {string} reciprocal.R2 - 决定系数 R²。
         * @throws {Error} 如果数据集长度不匹配，数据集中出现复数，或数据点不足以进行特定阶数的回归。
         * @example
         * const xData = [1, 2, 3, 4, 5];
         * const yData = [2.1, 3.9, 6.1, 8.2, 9.9];
         * const results = StatisticsTools.statisticsCalc(xData, yData);
         * console.log(results.linear.regressionEquation); // "2.02x+0.04"
         * console.log(results.linear.R2); // "0.998..."
         */
        static statisticsCalc(listA, listB) {
            // 验证：确保 x 和 y 数据集的长度相同。
            if (listA.length !== listB.length) {
                throw new Error('[StatisticsTools] Data mismatch.');
            }
            for (let i = 0; i < listA.length; i++) {
                if (typeof listA[i] === 'string') {
                    listA[i] = MathPlus.calc(listA[i])[0];
                }
                if (typeof listB[i] === 'string') {
                    listB[i] = MathPlus.calc(listB[i])[0];
                }
            }
            // 验证：确保 x 和 y 数据集都是实数集
            for (let i = 0; i < listA.length; i++) {
                // 消除误差
                listA[i] = Public.zeroCorrect(listA[i]);
                listB[i] = Public.zeroCorrect(listB[i]);

                // 确保输入为实数
                if (!listA[i].onlyReal) {
                    throw new Error('[StatisticsTools] Complex number appear in the inputA.');
                }
                if (!listB[i].onlyReal) {
                    throw new Error('[StatisticsTools] Complex number appear in the inputB.');
                }
            }

            // --- 步骤 1: 计算每个数据集的基本统计信息 ---
            const result = {};
            result.n = listA.length.toString();
            const averageAndSumA = this._averageAndSum(listA);
            const averageAndSumB = this._averageAndSum(listB);
            const varianceA = this._variance(listA);
            const varianceB = this._variance(listB);

            // _getStatisticsInfo 是一个辅助函数，它一次性计算出总和、平均值、平方和、标准差、最大值和最小值，
            // 以避免重复计算，并返回一个包含这些统计数据和平方列表的对象。
            const statisticsInfoA = this._getStatisticsInfo(listA, {
                averageAndSum: averageAndSumA,
                variance: varianceA
            });
            const statisticsInfoB = this._getStatisticsInfo(listB, {
                averageAndSum: averageAndSumB,
                variance: varianceB
            });
            // 将计算出的统计信息填充到最终的 result 对象中，并用 'A' 和 'B' 后缀来区分。
            for (let key in statisticsInfoA.statisticsResult) {
                result[key + 'A'] = statisticsInfoA.statisticsResult[key];
                result[key + 'B'] = statisticsInfoB.statisticsResult[key];
            }
            // --- 步骤 2: 计算关系度量 ---
            // 计算点积 Σ(x*y) 和 Σ(x²*y)，这些值在某些回归计算中可能会用到。
            const covariance = this._covariance(listA, listB, {
                averageA: averageAndSumA.average,
                averageB: averageAndSumB.average
            });
            const correlationCoefficient = this._correlationCoefficient(listA, listB, {
                varianceA: varianceA,
                varianceB: varianceB,
                covariance: covariance
            });

            result.dotAB = Public.idealizationToString(this._dotProduct(listA, listB));
            result.dotA2B = Public.idealizationToString(this._dotProduct(statisticsInfoA.squareList, listB));
            result.totalCovariance = Public.idealizationToString(covariance[0]);
            result.sampleCovariance = Public.idealizationToString(covariance[1]);
            result.r = Public.idealizationToString(correlationCoefficient);

            // --- 步骤 3: 为回归分析准备数据和状态 ---
            result.bestModel = 'linear';
            // 检查每个数据集中是否存在正、负或零值，因为某些回归模型（如对数、幂）对输入值的域有要求。
            const statesA = this._getListInfo(listA);
            const statesB = this._getListInfo(listB);
            // 预先计算 listB 的绝对值，因为某些模型（如 y=a*b^x）在 y<0 时需要对 |y| 进行回归。
            const absListB = this._getAbsList(listB);
            // 预先计算 listA 的自然对数，供对数和幂回归模型使用。
            let lnListA;
            if (!statesA.zero && !statesA.negative) {
                lnListA = this._changeInner(listA, x => MathPlus.ln(x));
            }
            // 预先计算 listB 的自然对数（或其绝对值的对数），供幂和指数回归模型使用。
            let lnListB;
            if (!statesB.zero && !(statesB.positive && statesB.negative)) {
                lnListB = this._changeInner(absListB, x => MathPlus.ln(x));
            }
            // 定义一个标准的错误对象，用于当回归模型不适用或计算失败时返回。
            const errorWith2parameter = {
                parameter: ['error', 'error'],
                regressionEquation: 'error',
                R2: 'error'
            };

            // --- 步骤 4: 处理回归的边缘情况 ---
            // 如果所有 x 值都为零，则大多数回归模型都无法定义。
            const twoParamModels = ['linear', 'ln', 'axb', 'exp', 'abx', 'reciprocal'];
            if ((!statesA.positive && !statesA.negative && statesA.zero) || listA.length === 1) {
                twoParamModels.forEach(key => {
                    result[key] = {
                        parameter: ['error', 'error'],
                        regressionEquation: 'error',
                        R2: 'error',
                        model: key // 在创建时直接赋值 model
                    };
                });

                // 单独处理需要 3 个参数的 square
                result.square = {
                    parameter: ['error', 'error', 'error'],
                    regressionEquation: 'error',
                    R2: 'error',
                    model: 'square'
                };

                return result;
            }
            // 如果所有 y 值都为零，则所有模型的最佳拟合都是 y=0。
            if (!statesB.positive && !statesB.negative && statesB.zero) {
                // 遍历赋值
                twoParamModels.forEach(key => {
                    result[key] = {
                        parameter: ['0', '0'],
                        regressionEquation: '0',
                        R2: 'error',
                        model: key
                    };
                });

                // 单独处理 3 参数的模型
                result.square = {
                    parameter: ['0', '0', '0'],
                    regressionEquation: '0',
                    R2: 'error',
                    model: 'square'
                };

                return result;
            }

            // --- 步骤 5: 执行多种回归分析 ---
            // 1. 线性回归: y = a₁x + a₀
            result.linear = this._getRegressionInfo(listA, listB, 1, listB,
                (x, coefficient) => MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
            );

            // 2. 二次回归: y = a₂x² + a₁x + a₀
            result.square = this._getRegressionInfo(listA, listB, 2, listB,
                (x, coefficient) => MathPlus.plus(
                    MathPlus.times(coefficient[2], MathPlus.times(x, x)),
                    MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
                )
            );
            result.bestModel = this._findBestModel(result, 'square');

            // 3. 对数回归: y = a₁ln(x) + a₀
            // 仅当所有 x > 0 时适用。
            if (statesA.negative || statesA.zero) {
                result.ln = structuredClone(errorWith2parameter);
            } else {
                result.ln = this._getRegressionInfo(lnListA, listB, 1, listB,
                    (x, coefficient) => MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
                );
            }
            result.bestModel = this._findBestModel(result, 'ln');

            // 4. 幂回归: y = a₀ * x^a₁ (线性化为 ln(y) = ln(a₀) + a₁*ln(x))
            // 仅当所有 x > 0 且所有 y 同号且不为零时适用。
            if (statesA.negative || statesA.zero || statesB.zero || (statesB.positive && statesB.negative)) {
                result.axb = structuredClone(errorWith2parameter);
            } else {
                result.axb = this._getRegressionInfo(lnListA, lnListB, 1, listB,
                    (x, coefficient) => {
                        // 从线性化模型反向计算预测值
                        const mid = MathPlus.exp(MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0]));
                        // 如果原始 y 值为负，则将结果取反。
                        return statesB.negative ? MathPlus.minus(0, mid) : mid;
                    }
                );
                const mid = MathPlus.exp(result.axb.parameter[0]);
                result.axb.parameter[0] = statesB.negative ? MathPlus.minus(0, mid) : mid;
            }
            result.bestModel = this._findBestModel(result, 'axb');

            // 5. 指数回归 (y = a₀ * e^(a₁x)) 和 (y = a₀ * b^x)
            // 仅当所有 y 同号且不为零时适用。
            if (statesB.zero || (statesB.positive && statesB.negative)) {
                // 如果 y 包含零或正负混合，则指数回归无定义。
                result.exp = structuredClone(errorWith2parameter);
                result.abx = structuredClone(errorWith2parameter);
            } else {
                // 指数回归 y = a₀ * e^(a₁x) (线性化为 ln(y) = ln(a₀) + a₁x)
                // 对 x 和 ln(|y|) 进行线性回归。
                result.exp = this._getRegressionInfo(listA, lnListB, 1, listB,
                    (x, coefficient) => {
                        // 从线性化模型反向计算预测值。
                        const mid = MathPlus.exp(MathPlus.plus(
                            MathPlus.times(coefficient[1], x),
                            coefficient[0]
                        ));
                        // 如果原始 y 值为负，则将结果取反。
                        return statesB.negative ? MathPlus.minus(0, mid) : mid;
                    }
                );
                // 将线性化后的截距 ln(a₀) 转换回 a₀。
                const midExp = MathPlus.exp(result.exp.parameter[0]);
                result.exp.parameter[0] = statesB.negative ? MathPlus.minus(0, midExp) : midExp;

                // 指数回归 y = a * b^x
                // 这个模型可以通过 y = a₀ * e^(a₁x) 转换得到，其中 a = a₀, b = e^a₁。
                // R² 值与 y = a₀ * e^(a₁x) 模型相同。
                const midABX = MathPlus.exp(result.exp.parameter[1]);
                result.abx = {
                    parameter: [result.exp.parameter[0], midABX], // 计算 b = e^a₁
                    R2: result.exp.R2
                };
            }
            result.bestModel = this._findBestModel(result, 'exp');
            result.bestModel = this._findBestModel(result, 'abx');

            // 6. 倒数回归: y = a₁/x + a₀
            // 仅当所有 x 不为零时适用。
            if (statesA.zero) {
                result.reciprocal = structuredClone(errorWith2parameter);
            } else {
                // 创建一个 x 的倒数列表 (1/x)。
                const reciprocalListA = this._changeInner(listA, x => MathPlus.divide(1, x));
                // 对 1/x 和 y 进行线性回归。
                result.reciprocal = this._getRegressionInfo(reciprocalListA, listB, 1, listB,
                    (x, coefficient) => MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
                );
            }
            result.bestModel = this._findBestModel(result, 'reciprocal');

            // --- 步骤 6: 格式化所有回归模型的输出 ---
            // 遍历所有计算出的结果。
            for (let key in result) {
                if (Public.typeOf(result[key]) === 'object') {
                    result[key].regressionEquation = Public.funcToString(
                        result[key].parameter,
                        // 根据回归类型选择不同的格式化函数。
                        ['linear', 'square'].includes(key) ? 'powerFunc' : `${key}Func`
                    );
                    result[key].R2 = Public.idealizationToString(result[key].R2);
                    result[key].parameter = Public.idealizationToString(result[key].parameter);
                    result[key].model = key;
                }
            }
            // 返回包含所有统计数据和格式化后的回归模型信息的对象。
            return result;
        }
    }

    /**
     * @class PowerFunctionTools
     * @description 一个静态工具类，用于对最高为四次的多项式实函数进行全面的分析。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class PowerFunctionTools {
        /**
         * @constructor
         * @description PowerFunctionTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 PowerFunctionTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[PowerFunctionTools] PowerFunctionTools is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _sort
         * @description 对一个包含数值（或可转换为数值的对象）的数组进行原地升序排序。
         * 注意：此排序主要基于数值的实部进行比较。
         * @param {Array<ComplexNumber|string|number>} list - 需要排序的数组。该数组将被直接修改。
         * @returns {Array} 返回排序后的数组。
         */
        static _sort(list) {
            // 使用自定义比较函数对列表进行原地升序排序。
            list.sort((a, b) => {
                // 使用高精度减法计算 a 和 b 的差值。
                // 注意：这里的比较只基于数字的实部。
                const diff = MathPlus.minus(a, b).re.mantissa;
                // 如果 a > b，差值为正。
                if (diff > 0n) {
                    return 1;
                }
                // 如果 a < b，差值为负。
                if (diff < 0n) {
                    return -1;
                }
                // 如果 a == b，差值为零。
                return 0;
            });
            return list;
        }

        /**
         * @private
         * @static
         * @method _getPowerFunctionValue
         * @description 使用霍纳方法（Horner's method）高效地计算一个多项式在给定点 `x` 的值。
         * 霍纳方法通过减少乘法次数来优化多项式求值，对于高次多项式尤其有效。
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 多项式的系数数组，
         * 从最高次项到常数项排列。例如，对于多项式 `ax² + bx + c`，输入应为 `[a, b, c]`。
         * @param {string|number|bigint|BigNumber|ComplexNumber} x - 需要代入多项式进行计算的值。
         * @returns {ComplexNumber} 多项式在点 `x` 的计算结果，以 ComplexNumber 实例形式返回。
         */
        static _getPowerFunctionValue(list, x) {
            // 使用霍纳方法（Horner's method）计算多项式。
            // 该方法通过嵌套乘法来减少运算次数： a_n*x^n + ... + a_0 = ((...((a_n * x + a_{n-1}) * x) ... ) * x) + a_0
            // list[0] 是最高次项的系数 a_n。
            let result = new ComplexNumber(list[0]);
            const input = new ComplexNumber(x);

            // 从第二项系数开始迭代。
            for (let i = 1; i < list.length; i++) {
                // result = result * x + a_i
                result = MathPlus.plus(
                    MathPlus.times(result, input),
                    list[i]
                );
            }
            return result;
        }

        /**
         * @private
         * @static
         * @method _differentiate
         * @description 计算一个多项式的导数。
         * 该方法接收一个系数数组，并根据幂法则（(c*x^k)' = c*k*x^(k-1)）计算出导数多项式的新系数数组。
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 多项式的系数数组，
         * 从最高次项到常数项排列。例如，对于 `ax² + bx + c`，输入应为 `[a, b, c]`。
         * @returns {Array<ComplexNumber>} 一个新的数组，包含导数多项式的系数。
         * @example
         * // (2x³ - 6x² + 2x - 1)' = 6x² - 12x + 2
         * // 输入: [2, -6, 2, -1]
         * // 输出: [6, -12, 2]
         * PowerFunctionTools._differentiate([2, -6, 2, -1]);
         */
        static _differentiate(list) {
            // 初始化一个空数组，用于存储导数多项式的新系数。
            const result = [];
            // 获取原始多项式的系数数量。对于一个 n 次多项式，长度为 n+1。
            const len = list.length;
            // 遍历系数数组，从最高次项 (i=0) 到一次项 (i=len-2)。
            // 常数项 (i=len-1) 的导数为零，因此循环在 len-1 处停止。
            for (let i = 0; i < len - 1; i++) {
                // 应用幂法则：新系数 = 原系数 * 原指数。
                // 对于系数 list[i]，其对应的项是 list[i] * x^(len-1-i)。
                // 因此，原指数为 (len - 1 - i)。
                result.push(MathPlus.times(list[i], len - i - 1));
            }
            // 返回包含导数系数的新数组。
            return result;
        }

        /**
         * @private
         * @static
         * @method _solveX1
         * @description 求解一次方程 ax + b = 0。
         * @param {Array<ComplexNumber|string|number>} list - 包含两个系数 [a, b] 的数组。
         * @returns {Array<ComplexNumber>} 一个包含方程唯一解的数组。
         */
        static _solveX1(list) {
            // 从列表中提取系数 a, b。
            const a = list[0], b = list[1];
            // 根据公式 x = -b / a 计算解。
            // MathPlus.minus(0, b) 计算 -b。
            // MathPlus.divide(...) 计算 (-b) / a。
            const root = MathPlus.divide(MathPlus.minus(0, b), a);
            // 以数组形式返回解，以保持与其他求解函数（如 _solveX2）的返回格式一致。
            return [root];
        }

        /**
         * @private
         * @static
         * @method _solveX2
         * @description 使用二次公式 `x = [-b ± sqrt(b² - 4ac)] / 2a` 求解二次方程 `ax² + bx + c = 0`。
         * 该方法通过分析判别式 `Δ = b² - 4ac` 的值来处理实数根和复数根的情况。
         * @param {Array<ComplexNumber|string|number>} list - 一个包含二次方程系数 `[a, b, c]` 的数组。
         * @returns {Array<ComplexNumber|null>} 一个包含方程根的数组，其格式根据根的性质而变化：
         * - 如果 `Δ = 0` (一个重实根): 返回 `[root]`。
         * - 如果 `Δ > 0` (两个不等实根): 返回一个升序排序后的数组 `[root1, root2]`。
         * - 如果 `Δ < 0` (一对共轭复数根): 返回 `[complexRoot1, complexRoot2, null]`。
         *   数组末尾的 `null` 是一个特殊的标志，用于向调用者指示根是复数。
         */
        static _solveX2(list) {
            // 从列表中提取系数 a, b, c。
            const a = list[0], b = list[1], c = list[2];

            // 计算判别式 delta = b² - 4ac。
            // 使用 zeroCorrect 修正潜在的浮点计算误差，以确保对 delta 是否为零的判断准确无误。
            const delta = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(b, b),
                MathPlus.times(MathPlus.times(a, c), 4)
            )).re;
            // 获取判别式的符号，用于后续的分支判断。
            const deltaSign = delta.mantissa;

            // 将二次公式分解为两部分以便计算：
            // mid1 对应 -b / 2a
            const mid1 = MathPlus.divide(
                b,
                MathPlus.times(-2, a)
            );
            // mid2 对应 ±sqrt(delta) / 2a
            const mid2 = MathPlus.divide(
                MathPlus.sqrt(delta),
                MathPlus.times(2, a)
            );

            // 情况 1: delta = 0，方程有一个重实根。
            if (deltaSign === 0n) {
                // 此时 mid2 为 0，根为 -b / 2a。
                return [mid1];
            }

            // 计算两个根：root1 = (-b + sqrt(delta)) / 2a, root2 = (-b - sqrt(delta)) / 2a
            const roots = [
                MathPlus.plus(mid1, mid2),
                MathPlus.minus(mid1, mid2)
            ];
            // 情况 2: delta > 0，方程有两个不相等的实数根。
            if (deltaSign > 0n) {
                // 对实数根进行排序后返回。
                return PowerFunctionTools._sort(roots);
            }

            // 情况 3: delta < 0，方程有两个共轭复数根。
            // 在结果数组的末尾添加一个 null，作为这对根是复数的标志。
            // 这是一种特殊的返回约定，用于通知调用者根的类型。
            roots.push(null);
            return roots;
        }

        /**
         * @private
         * @static
         * @method _solveX3
         * @description 使用盛金公式（Sheng Jin's Formulas）解析求解三次方程 ax³ + bx² + cx + d = 0。
         * 该方法能够精确处理所有情况，包括三个不等实根、一个实根和一对共轭复根，以及各种重根情况。
         * @param {Array<ComplexNumber|string|number>} list - 包含四个系数 [a, b, c, d] 的数组，分别对应 x³, x², x, 和常数项。
         * @returns {Array<ComplexNumber|null>} 一个包含方程根的数组。
         * - **三个不等实根**: 返回一个包含三个已排序实根的数组 `[root1, root2, root3]`。
         * - **一个实根和一对共轭复根**: 返回 `[realRoot, complexRoot1, complexRoot2, null]`。数组末尾的 `null` 是一个特殊的标志，用于向调用者指示存在复数根。
         * - **三重实根**: 返回一个只包含一个元素的数组 `[tripleRoot]`。
         * - **一个二重实根和一个单实根**: 返回一个包含两个元素的数组 `[doubleRoot, singleRoot]`。
         */
        static _solveX3(list) {
            // 从列表中提取系数 a, b, c, d。
            const a = list[0], b = list[1], c = list[2], d = list[3];

            // 根据盛金公式，计算中间判别式 A, B, C。
            // A = b² - 3ac
            const A = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(b, b),
                MathPlus.times(MathPlus.times(a, c), 3)
            )).re;

            // B = bc - 9ad
            const B = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(b, c),
                MathPlus.times(MathPlus.times(a, d), 9)
            )).re;

            // C = c² - 3bd
            const C = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(c, c),
                MathPlus.times(MathPlus.times(b, d), 3)
            )).re;

            // 计算总判别式 Δ = B² - 4AC。
            // Δ 的符号决定了根的性质。
            const delta = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(B, B),
                MathPlus.times(MathPlus.times(A, C), 4)
            )).re;

            // --- 特殊情况: A = B = 0 ---
            // 这意味着方程有三个相等的实数根 (三重根)。
            if (A.mantissa === 0n && B.mantissa === 0n) {
                // x1 = x2 = x3 = -b / 3a
                return [MathPlus.divide(
                    b,
                    MathPlus.times(a, -3)
                )];
            }

            // --- 情况 1: Δ > 0 ---
            // 方程有一个实数根和一对共轭复数根。
            if (delta.mantissa > 0n) {
                // 根据盛金公式计算中间变量 Y1 和 Y2。
                // Y1,2 = Ab + 3a(-B ± sqrt(B²-4AC))/2
                const mid1 = MathPlus.times(a, '1.5');
                const mid2 = MathPlus.minus(
                    MathPlus.times(A, b),
                    MathPlus.times(mid1, B)
                );
                const mid3 = MathPlus.times(mid1, MathPlus.sqrt(delta));
                // w1, w2 分别是 Y1 和 Y2 的立方根。
                const w1 = MathPlus.cbrt(MathPlus.plus(mid2, mid3));
                const w2 = MathPlus.cbrt(MathPlus.minus(mid2, mid3));

                // 计算复数根的实部和虚部。
                const re = MathPlus.divide(
                    MathPlus.minus(MathPlus.divide(MathPlus.plus(w1, w2), 2), b),
                    MathPlus.times(a, 3)
                ).re;
                const im = MathPlus.divide(
                    MathPlus.times(MathPlus.minus(w1, w2), MathPlus.sqrt(3)),
                    MathPlus.times(a, 6)
                ).re;

                // 组合根并返回。
                return [
                    // 实数根 x1 = (-b - (w1 + w2)) / 3a
                    MathPlus.divide(
                        MathPlus.minus(0, MathPlus.plus(MathPlus.plus(w1, w2), b)),
                        MathPlus.times(a, 3)
                    ),
                    // 两个共轭复数根。
                    new ComplexNumber([re, im]),
                    new ComplexNumber([re, MathPlus.minus(0, im).re]),
                    // 添加 null 作为复数根的标志。
                    null
                ];
            }

            // --- 情况 2: Δ = 0 ---
            // 方程有三个实数根，其中至少有两个相等（重根）。
            if (delta.mantissa === 0n) {
                // K = B/A
                const k = MathPlus.divide(B, A);
                // x1 = -b/a + K
                const root1 = MathPlus.minus(k, MathPlus.divide(b, a));
                // x2 = x3 = -K/2
                const root2 = MathPlus.divide(k, -2);

                // 通过检查函数在 root1 和 root2 中点两侧的符号来判断哪个是二重根。
                // 这是为了正确地返回 [二重根, 单根] 的形式。
                const mid = MathPlus.divide(MathPlus.plus(root1, root2), 2);
                const func1 = PowerFunctionTools._getPowerFunctionValue(list, MathPlus.plus(root1, mid));
                const func2 = PowerFunctionTools._getPowerFunctionValue(list, MathPlus.minus(root1, mid));
                const sign = MathPlus.times(func1, func2).re.mantissa;
                // 如果符号相同，说明极值点在 root1，则 root2 是二重根。
                if (sign > 0n) {
                    return [root2, root1];
                }
                // 否则 root1 是二重根。
                return [root1, root2];
            }

            // --- 情况 3: Δ < 0 ---
            // 方程有三个不相等的实数根。这是不可约情况。
            // 此时必须使用三角函数解法。
            const absA = MathPlus.abs(A);
            // 计算 T = (2Ab - 3aB) / (2*sqrt(A³))
            const T = MathPlus.divide(
                MathPlus.minus(
                    MathPlus.times(MathPlus.times(absA, b), 2),
                    MathPlus.times(MathPlus.times(a, B), 3)
                ),
                MathPlus.times(MathPlus.pow(absA, '1.5'), 2)
            );
            // 计算 θ = arccos(T)
            let ct;
            // 修正 T 的值，确保其在 arccos 的定义域 [-1, 1] 内，防止浮点误差。
            if (MathPlus.plus(MathPlus.abs(T), -1).re.mantissa <= 0n) {
                ct = MathPlus.divide(MathPlus.arccos(T), 3);
            } else {
                ct = MathPlus.divide(MathPlus.arccos(T.re.mantissa > 0n ? 1 : -1), 3);
            }
            // 根据三角形式的解公式计算三个实数根。
            // x_k = (-b + 2*sqrt(A)*cos(θ/3 + 2kπ/3)) / 3a, for k = 0, 1, 2
            const cosCT = MathPlus.cos(ct);
            const sinCT = MathPlus.sin(ct);
            const mid1 = MathPlus.divide(
                MathPlus.minus(
                    MathPlus.times(MathPlus.sqrt(absA), cosCT),
                    b
                ),
                MathPlus.times(a, 3)
            );
            const mid2 = MathPlus.divide(
                MathPlus.times(
                    MathPlus.sqrt(MathPlus.times(absA, 3)),
                    sinCT
                ),
                MathPlus.times(a, 3)
            );
            const root1 = MathPlus.plus(mid1, mid2);
            const root2 = MathPlus.minus(mid1, mid2);
            const root3 = MathPlus.divide(
                MathPlus.plus(
                    b,
                    MathPlus.times(cosCT, MathPlus.times(2, MathPlus.sqrt(absA)))
                ),
                MathPlus.times(a, -3)
            );
            // 对三个实数根进行升序排序后返回。
            return PowerFunctionTools._sort([root1, root2, root3]);
        }

        /**
         * @private
         * @static
         * @method _solveX4 (内部辅助方法)
         * @description 使用天珩公式解析求解四次方程 ax⁴ + bx³ + cx² + dx + e = 0。
         * 该方法通过引入一个预解三次方程来降次，能够处理所有情况，包括四个实数根、两对共轭复数根、一对共轭复数根和两个实数根，以及各种重根的情况。
         * @param {Array<ComplexNumber|string|number>} list - 包含五个系数 [a, b, c, d, e] 的数组。这些系数可以是数字或与 MathPlus 库兼容的对象。
         * @returns {Array<ComplexNumber>} 一个包含方程四个根的数组。根是 ComplexNumber 的实例。
         */
        static _solveX4(list) {
            // 从列表中提取系数 a, b, c, d, e。
            const a = list[0], b = list[1], c = list[2], d = list[3], e = list[4];

            // D = 3b² - 8ac
            const D = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(MathPlus.times(b, b), 3),
                MathPlus.times(MathPlus.times(a, c), 8)
            )).re;

            // E = 4abc - 8a²d - b³
            const E = Public.zeroCorrect(MathPlus.minus(
                MathPlus.minus(
                    MathPlus.times(MathPlus.times(MathPlus.times(a, b), c), 4),
                    MathPlus.times(MathPlus.times(MathPlus.times(a, a), d), 8)
                ),
                MathPlus.times(MathPlus.times(b, b), b)
            )).re;

            // F = 3b⁴ + 16(ac)² - 16(a²bd - b²ac) - 64a³e
            const f1 = MathPlus.plus(
                MathPlus.times(
                    MathPlus.pow(MathPlus.times(b, b), 2),
                    3
                ),
                MathPlus.times(
                    MathPlus.pow(MathPlus.times(a, c), 2),
                    16
                )
            );
            const f2 = MathPlus.times(MathPlus.minus(
                MathPlus.times(
                    MathPlus.times(a, a),
                    MathPlus.times(b, d)
                ),
                MathPlus.times(
                    MathPlus.times(b, b),
                    MathPlus.times(a, c)
                )
            ), 16);
            const F = Public.zeroCorrect(MathPlus.minus(
                MathPlus.plus(f1, f2),
                MathPlus.times(
                    MathPlus.times(MathPlus.times(a, a), MathPlus.times(a, e)),
                    64
                )
            )).re;

            // A = D² - 3F
            const A = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(D, D),
                MathPlus.times(3, F)
            )).re;

            // B = DF - 9E²
            const B = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(D, F),
                MathPlus.times(MathPlus.times(E, E), 9)
            )).re;

            // C = F² - 3DE²
            const C = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(F, F),
                MathPlus.times(MathPlus.times(D, MathPlus.times(E, E)), 3)
            )).re;

            // 计算总判别式 Δ = B² - 4AC。
            const delta = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(B, B),
                MathPlus.times(MathPlus.times(A, C), 4)
            )).re;

            // 当D=E=F=0时，方程有一个四重实根
            if (D.mantissa === 0n && E.mantissa === 0n && F.mantissa === 0n) {
                return [MathPlus.divide(b, MathPlus.times(a, -4))];
            }

            // 当DEF≠0，A=B=C=0时，方程有四个实根，其中有一个三重根
            if (
                D.mantissa !== 0n && E.mantissa !== 0n && F.mantissa !== 0n &&
                A.mantissa === 0n && B.mantissa === 0n && C.mantissa === 0n
            ) {
                const mid0 = MathPlus.times(MathPlus.times(a, D), -4);
                const mid1 = MathPlus.divide(
                    MathPlus.times(b, D),
                    mid0
                );
                return [
                    MathPlus.minus(
                        mid1,
                        MathPlus.divide(MathPlus.times(E, 9), mid0)
                    ),
                    MathPlus.plus(
                        mid1,
                        MathPlus.divide(MathPlus.times(E, 3), mid0)
                    )
                ];
            }

            // 当E=F=0，D≠0时，方程有两对二重根；若D＞0，根为实数；若D＜0，根为虚数
            if (D.mantissa !== 0n && E.mantissa === 0n && F.mantissa === 0n) {
                const mid0 = MathPlus.times(a, -4);
                const mid1 = MathPlus.divide(b, mid0);
                const mid2 = MathPlus.divide(MathPlus.sqrt(D), mid0);
                return [
                    MathPlus.plus(mid1, mid2),
                    MathPlus.minus(mid1, mid2)
                ];
            }

            // 当ABC≠0，Δ=0时，方程有一对二重实根；若AB＞0，则其余两根为不等实根；若AB＜0，则其余两根为共轭虚根
            if (
                A.mantissa !== 0n && B.mantissa !== 0n && C.mantissa !== 0n &&
                delta.mantissa === 0n
            ) {
                const mid0 = MathPlus.divide(
                    b,
                    MathPlus.times(a, -4)
                );
                const mid1 = MathPlus.divide(
                    MathPlus.divide(MathPlus.times(MathPlus.times(A, E), 2), B),
                    MathPlus.times(a, -4)
                );
                const root1 = MathPlus.plus(mid0, mid1);
                const mid2 = MathPlus.minus(mid0, mid1);
                const mid3 = MathPlus.divide(
                    MathPlus.sqrt(MathPlus.divide(
                        MathPlus.times(B, 2),
                        A
                    )),
                    MathPlus.times(a, -4)
                );
                return [root1, MathPlus.plus(mid2, mid3), MathPlus.minus(mid2, mid3)];
            }

            // 当Δ>0时，方程有两个不等实根和一对共轭虚根
            if (delta.mantissa > 0n) {
                const mid1 = MathPlus.minus(
                    MathPlus.times(A, D),
                    MathPlus.times(B, '1.5')
                );
                const mid2 = MathPlus.times('1.5', MathPlus.sqrt(delta));
                const z1 = MathPlus.cbrt(MathPlus.plus(mid1, mid2));
                const z2 = MathPlus.cbrt(MathPlus.minus(mid1, mid2));
                const midZ = MathPlus.plus(z1, z2);
                const z = MathPlus.sqrt(MathPlus.plus(
                    MathPlus.minus(MathPlus.times(D, D), MathPlus.times(A, 3)),
                    MathPlus.minus(MathPlus.times(midZ, midZ), MathPlus.times(D, midZ))
                ));
                const mid4 = MathPlus.divide(b, MathPlus.times(a, -4));
                const mid5 = MathPlus.divide(
                    MathPlus.times(
                        MathPlus.sgn(E),
                        MathPlus.sqrt(MathPlus.divide(
                            MathPlus.plus(D, midZ),
                            3
                        ))
                    ),
                    MathPlus.times(a, 4)
                );
                const mid6 = MathPlus.divide(
                    MathPlus.sqrt(
                        MathPlus.divide(
                            MathPlus.minus(
                                MathPlus.times(
                                    MathPlus.plus(z, D),
                                    2
                                ),
                                midZ
                            ),
                            3
                        )
                    ),
                    MathPlus.times(a, 4)
                );
                const root1 = MathPlus.plus(MathPlus.plus(mid4, mid5), mid6);
                const root2 = MathPlus.minus(MathPlus.plus(mid4, mid5), mid6);
                const im = MathPlus.divide(
                    MathPlus.sqrt(
                        MathPlus.divide(
                            MathPlus.plus(
                                MathPlus.times(
                                    MathPlus.minus(z, D),
                                    2
                                ),
                                midZ
                            ),
                            3
                        )
                    ),
                    MathPlus.times(a, 4)
                ).re;
                const re = MathPlus.minus(mid4, mid5).re;
                const root3 = new ComplexNumber([re, im]);
                const root4 = new ComplexNumber([re, MathPlus.minus(0, im).re]);
                return [root1, root2, root3, root4];
            }

            // 当Δ＜0时，若D与F均为正数，则方程有四个不等实根；否则方程有两对不等共轭虚根
            // E=0,D＞0,F＞0 和 E=0,D<0,F>0
            if (E.mantissa === 0n && F.mantissa > 0n && D.mantissa !== 0n) {
                const mid0 = MathPlus.times(MathPlus.sqrt(F), 2);
                const mid1 = MathPlus.sqrt(MathPlus.plus(D, mid0));
                const mid2 = MathPlus.sqrt(MathPlus.minus(D, mid0));
                const mid3 = MathPlus.times(a, -4);
                const root1 = MathPlus.divide(
                    MathPlus.minus(b, mid1),
                    mid3
                );
                const root2 = MathPlus.divide(
                    MathPlus.plus(b, mid1),
                    mid3
                );
                const root3 = MathPlus.divide(
                    MathPlus.minus(b, mid2),
                    mid3
                );
                const root4 = MathPlus.divide(
                    MathPlus.plus(b, mid2),
                    mid3
                );
                return [root1, root2, root3, root4];
            }

            // 若E=0,F＜0
            if (E.mantissa === 0n && F.mantissa < 0n) {
                const mid0 = MathPlus.divide(
                    b,
                    MathPlus.times(a, -4)
                );
                const mid1 = MathPlus.divide(
                    MathPlus.sqrt(MathPlus.times(
                        MathPlus.plus(
                            MathPlus.sqrt(MathPlus.minus(A, F)),
                            D
                        ),
                        2
                    )),
                    MathPlus.times(a, 8)
                );
                const re1 = MathPlus.plus(mid0, mid1).re;
                const re2 = MathPlus.minus(mid0, mid1).re;
                const im = MathPlus.divide(
                    MathPlus.sqrt(MathPlus.times(
                        MathPlus.minus(
                            MathPlus.sqrt(MathPlus.minus(A, F)),
                            D
                        ),
                        2
                    )),
                    MathPlus.times(a, 8)
                ).re;
                const root1 = new ComplexNumber([re1, im]);
                const root2 = new ComplexNumber([re1, MathPlus.minus(0, im).re]);
                const root3 = new ComplexNumber([re2, im]);
                const root4 = new ComplexNumber([re2, MathPlus.minus(0, im).re]);
                return [root1, root2, root3, root4];
            }

            // 若E≠0
            const mid0 = MathPlus.sqrt(A);
            const T = MathPlus.divide(
                MathPlus.minus(
                    MathPlus.times(B, 3),
                    MathPlus.times(MathPlus.times(A, D), 2)
                ),
                MathPlus.times(MathPlus.times(A, mid0), 2)
            );
            let ct;
            if (MathPlus.plus(MathPlus.abs(T), -1).re.mantissa <= 0n) {
                ct = MathPlus.divide(MathPlus.arccos(T), 3);
            } else {
                ct = MathPlus.divide(MathPlus.arccos(T.re.mantissa > 0n ? 1 : -1), 3);
            }
            const cosCT = MathPlus.cos(ct);
            const sinCT = MathPlus.times(MathPlus.sin(ct), MathPlus.sqrt(3));
            const y1 = MathPlus.sqrt(MathPlus.divide(
                MathPlus.minus(
                    D,
                    MathPlus.times(MathPlus.times(mid0, cosCT), 2)
                ),
                3
            ));
            const y2 = MathPlus.sqrt(MathPlus.divide(
                MathPlus.plus(
                    D,
                    MathPlus.times(mid0, MathPlus.plus(cosCT, sinCT))
                ),
                3
            ));
            const y3 = MathPlus.sqrt(MathPlus.divide(
                MathPlus.plus(
                    D,
                    MathPlus.times(mid0, MathPlus.minus(cosCT, sinCT))
                ),
                3
            ));

            // 当D与F均为正时，有四个实数根
            if (E.mantissa !== 0n && F.mantissa > 0n && D.mantissa > 0n) {
                const mid1 = MathPlus.plus(y2, y3);
                const mid2 = MathPlus.minus(y2, y3);
                const mid3 = MathPlus.minus(
                    MathPlus.times(y1, MathPlus.sgn(E)),
                    b
                );
                const mid4 = MathPlus.minus(0, MathPlus.plus(
                    MathPlus.times(y1, MathPlus.sgn(E)),
                    b
                ));
                const numerator1 = MathPlus.plus(mid3, mid1);
                const numerator2 = MathPlus.minus(mid3, mid1);
                const numerator3 = MathPlus.plus(mid4, mid2);
                const numerator4 = MathPlus.minus(mid4, mid2);
                const denominator = MathPlus.times(a, 4);
                return [
                    MathPlus.divide(numerator1, denominator),
                    MathPlus.divide(numerator2, denominator),
                    MathPlus.divide(numerator3, denominator),
                    MathPlus.divide(numerator4, denominator)
                ];
            }

            // 当D或F中有非正值时，有四个虚根
            const mid1 = MathPlus.plus(
                MathPlus.times(MathPlus.sgn(E), y1),
                y3
            );
            const mid2 = MathPlus.minus(
                MathPlus.times(MathPlus.sgn(E), y1),
                y3
            );
            const mid3 = MathPlus.minus(0, MathPlus.plus(y2, b));
            const mid4 = MathPlus.minus(y2, b);
            const numerator1 = MathPlus.plus(mid3, mid1);
            const numerator2 = MathPlus.minus(mid3, mid1);
            const numerator3 = MathPlus.plus(mid4, mid2);
            const numerator4 = MathPlus.minus(mid4, mid2);
            const denominator = MathPlus.times(a, 4);
            return [
                MathPlus.divide(numerator1, denominator),
                MathPlus.divide(numerator2, denominator),
                MathPlus.divide(numerator3, denominator),
                MathPlus.divide(numerator4, denominator)
            ];
        }

        /**
         * @static
         * @method powerFunctionAnalysis
         * @description 分析一个最高为四次的多项式实函数，确定其关键属性。
         * 该方法通过微积分（导数）来确定函数的单调性、极值、凹凸性和拐点，并求解其根。
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 多项式的系数数组，从最高次项到常数项排列。
         * 例如，对于函数 f(x) = ax⁴ + bx³ + cx² + dx + e, 输入应为 `[a, b, c, d, e]`。
         * 该函数能处理 0 到 4 次多项式。
         * @returns {object} 一个包含函数分析结果的对象，其属性包括：
         * - `equation`: `string` 格式化后的函数方程字符串。
         * - `range`: `[string, string]` 函数的值域。
         * - `increasingInterval`: `Array<[string, string]>` 函数的单调递增区间。
         * - `decreasingInterval`: `Array<[string, string]>` 函数的单调递减区间。
         * - `maximumPoint`: `Array<[string, string]>` 局部极大值点 `[x, y]`。
         * - `minimumPoint`: `Array<[string, string]>` 局部极小值点 `[x, y]`。
         * - `convexInterval`: `Array<[string, string]>` 函数的凸区间（凹向上）。
         * - `concaveInterval`: `Array<[string, string]>` 函数的凹区间（凹向下）。
         * - `inflectionPoint`: `Array<[string, string]>` 拐点 `[x, y]`。
         * - `roots`: `Array<string>` 函数的实数根和复数根。
         * @throws {Error} 如果数据集中出现复数。
         */
        static powerFunctionAnalysis(list) {
            const result = {};
            // 从列表中提取多项式系数 a, b, c, d, e，并确保它们是 BigNumber 实例的实部。
            const
                inputA = Public.zeroCorrect(MathPlus.calc(list[0])[0]),
                inputB = Public.zeroCorrect(MathPlus.calc(list[1])[0]),
                inputC = Public.zeroCorrect(MathPlus.calc(list[2])[0]),
                inputD = Public.zeroCorrect(MathPlus.calc(list[3])[0]),
                inputE = Public.zeroCorrect(MathPlus.calc(list[4])[0]);
            if (!inputA.onlyReal || !inputB.onlyReal || !inputC.onlyReal || !inputD.onlyReal || !inputE.onlyReal) {
                throw new Error('[PowerFunctionTools] Complex number appear in the input.');
            }
            const
                a = inputA.re,
                b = inputB.re,
                c = inputC.re,
                d = inputD.re,
                e = inputE.re;
            // 整合输入
            result.equation = Public.funcToString([e, d, c, b, a], 'powerFunc');

            // --- 情况 1: 四次函数 (a ≠ 0) ---
            if (a.mantissa !== 0n) {
                list = [a, b, c, d, e];
                // 计算一阶和二阶导数及其根。
                const diff1 = PowerFunctionTools._differentiate(list);
                const diff1Roots = PowerFunctionTools._solveX3(diff1);
                const diff2 = PowerFunctionTools._differentiate(diff1);
                const diff2Roots = PowerFunctionTools._solveX2(diff2);

                // --- 分析单调性和极值 (基于一阶导数) ---
                if ([1, 2, 4].includes(diff1Roots.length)) {
                    const minMax = Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]));
                    const point = Public.idealizationToString(diff1Roots[0]);
                    result.range = a.mantissa > 0n ? [minMax, '+inf'] : ['-inf', minMax];
                    result[a.mantissa > 0n ? 'increasingInterval' : 'decreasingInterval'] = [[point, '+inf']];
                    result[a.mantissa > 0n ? 'decreasingInterval' : 'increasingInterval'] = [['-inf', point]];
                    result[a.mantissa > 0n ? 'maximumPoint' : 'minimumPoint'] = [['null', 'null']];
                    result[a.mantissa > 0n ? 'minimumPoint' : 'maximumPoint'] = [[point, minMax]];
                } else if (diff1Roots.length === 3) {
                    const minMax1 = PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]);
                    const minMax2 = PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[1]);
                    const minMax3 = PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[2]);
                    const minMaxList = PowerFunctionTools._sort([minMax1, minMax2, minMax3]);
                    const realMinMax = Public.idealizationToString(a.mantissa > 0n ? minMaxList[0] : minMaxList[2]);
                    result.range = a.mantissa > 0n ? [realMinMax, '+inf'] : ['-inf', realMinMax];
                    const point1 = Public.idealizationToString(diff1Roots[0]),
                        point2 = Public.idealizationToString(diff1Roots[1]),
                        point3 = Public.idealizationToString(diff1Roots[2]);
                    result[a.mantissa > 0n ? 'increasingInterval' : 'decreasingInterval'] = [[point1, point2], [point3, '+inf']];
                    result[a.mantissa > 0n ? 'decreasingInterval' : 'increasingInterval'] = [['-inf', point1], [point2, point3]];
                    result[a.mantissa > 0n ? 'maximumPoint' : 'minimumPoint'] = [[point2, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[1]))]];
                    result[a.mantissa > 0n ? 'minimumPoint' : 'maximumPoint'] = [
                        [point1, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]))],
                        [point3, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[2]))]
                    ];
                }

                // --- 分析凹凸性和拐点 (基于二阶导数) ---
                if ([1, 3].includes(diff2Roots.length)) {
                    result[a.mantissa > 0n ? 'convexInterval' : 'concaveInterval'] = [['null', 'null']];
                    result[a.mantissa > 0n ? 'concaveInterval' : 'convexInterval'] = [['-inf', '+inf']];
                    result.inflectionPoint = [['null', 'null']];
                } else if (diff2Roots.length === 2) {
                    const point1 = Public.idealizationToString(diff2Roots[0]),
                        point2 = Public.idealizationToString(diff2Roots[1]);
                    result[a.mantissa > 0n ? 'convexInterval' : 'concaveInterval'] = [[point1, point2]];
                    result[a.mantissa > 0n ? 'concaveInterval' : 'convexInterval'] = [['-inf', point1], [point2, '+inf']];
                    result.inflectionPoint = [
                        [point1, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff2Roots[0]))],
                        [point2, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff2Roots[1]))]
                    ];
                }

                // --- 求解方程的根 ---
                const roots = [];
                const originalRoots = PowerFunctionTools._solveX4(list);
                for (let i = 0; i < Math.min(4, originalRoots.length); i++) {
                    roots.push(Public.idealizationToString(originalRoots[i]));
                }
                result.roots = roots;
                return result;
            }

            if (b.mantissa !== 0n) {
                // --- 情况 2: 三次函数 (a = 0, b ≠ 0) ---
                list = [b, c, d, e];
                // 计算一阶和二阶导数及其根。
                const diff1 = PowerFunctionTools._differentiate(list);
                const diff1Roots = PowerFunctionTools._solveX2(diff1);
                const diff2 = PowerFunctionTools._differentiate(diff1);
                const diff2Roots = PowerFunctionTools._solveX1(diff2);
                result.range = ['-inf', '+inf'];

                // --- 分析单调性和极值 ---
                if ([1, 3].includes(diff1Roots.length)) {
                    result[b.mantissa > 0n ? 'increasingInterval' : 'decreasingInterval'] = [['-inf', '+inf']];
                    result[b.mantissa > 0n ? 'decreasingInterval' : 'increasingInterval'] = [['null', 'null']];
                    result.maximumPoint = [['null', 'null']];
                    result.minimumPoint = [['null', 'null']];
                } else {
                    const point1 = Public.idealizationToString(diff1Roots[0]),
                        point2 = Public.idealizationToString(diff1Roots[1]);
                    result[b.mantissa > 0n ? 'increasingInterval' : 'decreasingInterval'] = [['-inf', point1], [point2, '+inf']];
                    result[b.mantissa > 0n ? 'decreasingInterval' : 'increasingInterval'] = [[point1, point2]];
                    result[b.mantissa > 0n ? 'maximumPoint' : 'minimumPoint'] = [[point1, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]))]];
                    result[b.mantissa > 0n ? 'minimumPoint' : 'maximumPoint'] = [[point2, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[1]))]];
                }

                // --- 分析凹凸性和拐点 ---
                const point = Public.idealizationToString(diff2Roots[0]);
                result[b.mantissa > 0n ? 'convexInterval' : 'concaveInterval'] = [['-inf', point]];
                result[b.mantissa > 0n ? 'concaveInterval' : 'convexInterval'] = [[point, '+inf']];
                result.inflectionPoint = [[point, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff2Roots[0]))]];

                // --- 求解方程的根 ---
                const roots = [];
                const originalRoots = PowerFunctionTools._solveX3(list);
                for (let i = 0; i < Math.min(3, originalRoots.length); i++) {
                    roots.push(Public.idealizationToString(originalRoots[i]));
                }
                result.roots = roots;
                return result;
            }

            if (c.mantissa !== 0n) {
                list = [c, d, e];
                // --- 情况 3: 二次函数 (a = b = 0, c ≠ 0) ---
                const diff1 = PowerFunctionTools._differentiate(list);
                const diff1Roots = PowerFunctionTools._solveX1(diff1);
                const point = Public.idealizationToString(diff1Roots[0]);
                const minMax = Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]));
                result.range = c.mantissa > 0n ? [minMax, '+inf'] : ['-inf', minMax];
                result[c.mantissa > 0n ? 'increasingInterval' : 'decreasingInterval'] = [[point, '+inf']];
                result[c.mantissa > 0n ? 'decreasingInterval' : 'increasingInterval'] = [['-inf', point]];
                result[c.mantissa > 0n ? 'maximumPoint' : 'minimumPoint'] = [['null', 'null']];
                result[c.mantissa > 0n ? 'minimumPoint' : 'maximumPoint'] = [[point, minMax]];
                result[c.mantissa > 0n ? 'convexInterval' : 'concaveInterval'] = [['null', 'null']];
                result[c.mantissa > 0n ? 'concaveInterval' : 'convexInterval'] = [['-inf', '+inf']];
                result.inflectionPoint = [['null', 'null']];

                // --- 求解方程的根 ---
                const roots = [];
                const originalRoots = PowerFunctionTools._solveX2(list);
                for (let i = 0; i < Math.min(2, originalRoots.length); i++) {
                    roots.push(Public.idealizationToString(originalRoots[i]));
                }
                result.roots = roots;
                return result;
            }

            if (d.mantissa !== 0n) {
                list = [d, e];
                // --- 情况 4: 一次函数 (a = b = c = 0, d ≠ 0) ---
                result.range = ['-inf', '+inf'];
                result[d.mantissa > 0n ? 'increasingInterval' : 'decreasingInterval'] = [['-inf', '+inf']];
                result[d.mantissa > 0n ? 'decreasingInterval' : 'increasingInterval'] = [['null', 'null']];
                result.maximumPoint = [['null', 'null']];
                result.minimumPoint = [['null', 'null']];
                result.convexInterval = [['null', 'null']];
                result.concaveInterval = [['null', 'null']];
                result.inflectionPoint = [['null', 'null']];
                result.roots = Public.idealizationToString(PowerFunctionTools._solveX1(list));
                return result;
            }

            // --- 情况 5: 常数函数 (a = b = c = d = 0) ---
            const num = Public.idealizationToString(e);
            result.range = [num, num];
            result.increasingInterval = [['null', 'null']];
            result.decreasingInterval = [['null', 'null']];
            result.maximumPoint = [['null', 'null']];
            result.minimumPoint = [['null', 'null']];
            result.convexInterval = [['null', 'null']];
            result.concaveInterval = [['null', 'null']];
            result.inflectionPoint = [['null', 'null']];
            result.roots = [e.mantissa === 0n ? 'anyRealNumber' : 'null'];
            return result;
        }
    }

    /**
     * @class RadicalFunctionTools
     * @description 一个静态工具类，提供求复数n次方根的功能。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class RadicalFunctionTools {
        /**
         * @constructor
         * @description RadicalFunctionTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 RadicalFunctionTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[RadicalFunctionTools] RadicalFunctionTools is a static class and should not be instantiated.');
        }

        /**
         * @private
         * @static
         * @method _generalFormula (内部辅助方法)
         * @description 计算复数 z 的 n 次方根的通项公式。
         * 基于复数的极坐标形式 z = r(cosθ + isinθ)，其 n 次方根为：
         * w_k = r^(1/n) * [cos((θ + 2kπ)/n) + i*sin((θ + 2kπ)/n)]，其中 k = 0, 1, ..., n-1。
         * 此方法返回一个表示该公式的字符串，以及一个用于计算特定 k 值根的函数。
         * @param {ComplexNumber|string|number} z - 需要开方的复数（被开方数）。
         * @param {ComplexNumber|string|number} n - 根指数。
         * @returns {[string, function(ComplexNumber|string|number): ComplexNumber]} 一个包含两个元素的数组：
         * - [0]: 格式化后的通项公式字符串，例如 "2toPolar(π/6 + k*π/3)"。
         * - [1]: 一个函数，接收整数 k 作为参数，并返回第 k 个根的 ComplexNumber 实例。
         */
        static _generalFormula(z, n) {
            // 将输入统一转换为 ComplexNumber 实例。
            z = new ComplexNumber(z);
            n = new ComplexNumber(n);

            // 计算 1/n，这是根的指数。
            const realPow = MathPlus.divide(1, n);
            // 计算 z 的模 r = |z|。
            const r = MathPlus.abs(z);
            // 计算 z 的辐角 θ = arg(z)。
            const arg = MathPlus.arg(z);
            // 计算新模，即 r^(1/n)。
            const length = MathPlus.pow(r, realPow);
            // 计算新辐角的常数部分：θ/n。
            const argumentConstant = MathPlus.times(realPow, arg);
            // 计算新辐角中随 k 变化的部分：2kπ/n。
            const argumentConstantK = MathPlus.times(
                MathPlus.times(2, CalcConfig.constants.pi),
                realPow
            );
            // 将模和辐角部分格式化为字符串，以便显示。
            const lengthPart = Public.idealizationToString(length);
            const argumentPart = Public.funcToString([argumentConstant, argumentConstantK], 'powerFunc', '[k]');

            // 格式化的通项公式字符串。
            let formula;
            if (lengthPart.includes('E')) {
                formula = `(${lengthPart})`;
            } else {
                formula = lengthPart;
            }
            formula += `[toPolar](${argumentPart})`;

            // 返回一个包含公式字符串和计算函数的数组。
            return [
                formula,
                // 一个函数，用于根据 k 的值计算具体的根。
                x => MathPlus.toPolar(
                    length,
                    MathPlus.plus(argumentConstant, MathPlus.times(x, argumentConstantK))
                )
            ];
        }

        /**
         * @static
         * @method radicalFunctionAnalysis
         * @description 计算复数 z 的 n 次方根，并以结构化的对象形式返回结果。
         * 结果包括通项公式、k 的取值范围以及前几个数值解。
         * @param {ComplexNumber|string|number} z - 需要开方的复数（被开方数）。
         * @param {ComplexNumber|string|number} n - 根指数，必须是一个正整数。
         * @returns {{z:string, n:string, formula: string, kRange: [string, string], numericalResults: Array<string>, overflow:boolean}}
         * 一个包含分析结果的对象：
         * - `z`: 输入的 z。
         * - `n`: 输入的 n。
         * - `formula`: 根的通项公式字符串。
         * - `kRange`: 整数 k 的取值范围，格式为 `['0', 'n-1']`。
         * - `numericalResults`: 一个字符串数组，包含从 k=0 开始的数值解，最多显示 `RADICAL_FUNCTION_MAX_SHOW_RESULTS` 个。
         * - `overflow`: 结果数是否超出允许范围。
         * @throws {Error} 如果根指数 n 不是一个正整数。
         */
        static radicalFunctionAnalysis(z, n) {
            // 将 z,n 转换为 ComplexNumber 实例。
            z = Public.zeroCorrect(MathPlus.calc(z)[0]);
            n = Public.integerCorrect(Public.zeroCorrect(MathPlus.calc(n)[0]));
            // 验证 n 是否为正整数。
            if (!n.onlyReal || n.re.power < 0 || n.re.mantissa <= 0n) {
                throw new Error('[radicalFunctionTools] n can only be a positive integer.');
            }

            // 初始化结果对象。
            const result = {};
            result.z = Public.idealizationToString(z);
            result.n = Public.idealizationToString(n);
            // 调用内部方法获取通项公式和计算函数。
            const innerResult = RadicalFunctionTools._generalFormula(z, n);
            result.formula = innerResult[0];
            // 计算 k 的最大值 (n-1)。
            result.kRange = ['0', MathPlus.minus(n, 1).toString()];
            // 确定要显示的数值解的数量。
            let count;
            // 如果 n 大于预设的最大显示数量，则只显示 RADICAL_FUNCTION_MAX_SHOW_RESULTS 个。
            if (MathPlus.minus(n, CalcConfig.RADICAL_FUNCTION_MAX_SHOW_RESULTS).re.mantissa > 0n) {
                count = CalcConfig.RADICAL_FUNCTION_MAX_SHOW_RESULTS;
                result.overflow = true;
            } else {
                // 否则，显示所有 n 个解。
                count = n;
                result.overflow = false;
            }
            // 使用 functionValueList 计算从 k=0 到 count-1 的所有根的数值。
            result.numericalResults = Public.idealizationToString(
                Public.functionValueList(innerResult[1], 0, 1, MathPlus.minus(count, 1))
            );
            // 返回最终的结构化结果。
            return result;
        }
    }

    /**
     * @class FuncValueListTools
     * @description 一个静态工具类，用于在指定范围内为两个函数 f(x) 和 g(x) 生成数值列表。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class FuncValueListTools {
        /**
         * @constructor
         * @description FuncValueListTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 FuncValueListTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[FuncValueListTools] FuncValueListTools is a static class and should not be instantiated.');
        }

        /**
         * @static
         * @method valueList
         * @description 在指定的实数范围内，以固定的步长为两个可能相互依赖的函数 f(x) 和 g(x) 生成数值列表。
         * 此方法的核心功能是利用 `MathPlus.calc` 解析器，它允许 f(x) 的表达式中调用 g(x)，反之亦然，从而支持联立或递归的函数求值。
         * @param {string} f - 第一个函数的表达式字符串。表达式中可以使用 'x' 作为变量，并可以通过 `g(x)` 的形式调用第二个函数。
         * @param {string} g - 第二个函数的表达式字符串。表达式中可以使用 'x' 作为变量，并可以通过 `f(x)` 的形式调用第一个函数。
         * @param {string|number|BigNumber|ComplexNumber|Array} start - 区间的起始值。必须为实数。
         * @param {string|number|BigNumber|ComplexNumber|Array} step - 区间内每一步的增量。必须为正实数。
         * @param {string|number|BigNumber|ComplexNumber|Array} end - 区间的结束值。必须为实数，且不小于起始值。
         * @returns {{varList: Array<string>, f: Array<string>, g: Array<string>}} 一个包含三个数组的对象：
         * - `varList`: 在指定范围内生成的所有自变量 `x` 的值列表。
         * - `f`: 函数 f(x) 在每个自变量点上的计算结果列表。
         * - `g`: 函数 g(x) 在每个自变量点上的计算结果列表。
         * 如果某个点的计算失败，对应的数组元素将是字符串 'error'。
         * @throws {Error} 如果 `start`, `step`, 或 `end` 不是实数。
         * @throws {Error} 如果 `start` > `end`。
         * @throws {Error} 如果 `step` <= 0。
         * @example
         * // 计算 f(x) = x^2 和 g(x) = f(x) - 1 在 x 从 1 到 3，步长为 1 时的值
         * FuncValueListTools.valueList('x^2', 'f(x)-1', 1, 1, 3);
         * // 返回: { varList: ['1', '2', '3'], f: ['1', '4', '9'], g: ['0', '3', '8'] }
         */
        static valueList(f, g, start, step, end) {
            // 步骤 1: 将区间的起始、步长和结束值转换为高精度的 ComplexNumber 实例，并修正潜在的浮点误差。
            start = Public.zeroCorrect(MathPlus.calc(start)[0]);
            step = Public.zeroCorrect(MathPlus.calc(step)[0]);
            end = Public.zeroCorrect(MathPlus.calc(end)[0]);

            // 步骤 2: 验证输入参数的有效性。
            // 确保区间的定义（起始、步长、结束）都是实数。
            if (!start.onlyReal || !step.onlyReal || !end.onlyReal) {
                throw new Error('[FuncValueListTools] Complex number appear in the input.');
            }
            // 确保区间的起始值不大于结束值。
            if (MathPlus.minus(start, end).re.mantissa > 0n) {
                throw new Error('[FuncValueListTools] The initial value is greater than the termination value.');
            }
            // 确保步长为正数，以防止无限循环。
            if (step.re.mantissa <= 0n) {
                throw new Error('[FuncValueListTools] Step size less than or equal to 0.');
            }

            // 步骤 3: 生成自变量 'x' 的值列表。
            // 这个列表将用于函数求值，并作为结果的一部分返回。
            const varList = [];
            for (let i = start; MathPlus.minus(i, end).re.mantissa <= 0n; i = MathPlus.plus(i, step)) {
                varList.push(Public.idealizationToString(i));
            }

            // 步骤 4: 计算并返回结果。
            return {
                varList: varList,
                // 为函数 f(x) 生成值列表。
                // Public.functionValueList 会遍历从 start 到 end 的范围。
                // 对于范围内的每个值 x，它会调用传入的匿名函数。
                // 该匿名函数使用 MathPlus.calc 来计算 f 的表达式。
                // 关键点：在调用 calc 时，将函数 g 的表达式作为依赖传入，
                // 这样在 f 的表达式中就可以通过 'g(x)' 来调用它。
                f: Public.idealizationToString(Public.functionValueList(
                    x => MathPlus.calc(f, {g: g, unknown: x})[0],
                    start, step, end
                )),
                // 为函数 g(x) 生成值列表。
                // 逻辑与 f(x) 相同，但这次将 f 的表达式作为依赖传入，
                // 这样在 g 的表达式中就可以通过 'f(x)' 来调用它。
                g: Public.idealizationToString(Public.functionValueList(
                    x => MathPlus.calc(g, {f: f, unknown: x})[0],
                    start, step, end
                ))
            };
        }
    }

    /**
     * @class CalcTools
     * @description 一个静态工具类，提供了一个便捷的执行计算的接口。
     * 它封装了 `MathPlus.calc` 的调用，并允许在执行计算时临时设置计算和输出精度，
     * 确保计算完成后恢复原始设置，从而避免影响全局配置。
     * 它不应该被实例化，其所有方法都应静态访问。
     */
    class CalcTools {
        /**
         * @constructor
         * @description CalcTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 CalcTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[CalcTools] CalcTools is a static class and should not be instantiated.');
        }

        /**
         * @static
         * @method exec
         * @description 执行数学表达式的计算。这是一个安全的封装器，它会为单次计算临时设定精度，
         * 并在计算完成后（无论成功或失败）通过 `finally` 块确保恢复原始的全局精度设置。
         *
         * @param {string} expr - 要计算的数学表达式字符串。
         * @param {object} [options={}] - 可选的配置对象。
         * @param {string} [options.printMode=CalcConfig.globalPrintMode] - 本次计算的输出形式。
         *   - 'algebra': 代数式。
         *   - 'polar': 极坐标式。
         * @param {number} [options.calcAcc=CalcConfig.globalCalcAccuracy] - 本次计算所使用的内部计算精度。如果未提供，则使用当前的全局计算精度。
         * @param {number} [options.outputAcc=CalcConfig.outputAccuracy] - 本次计算结果输出时使用的精度。如果未提供，则使用当前的全局输出精度。
         * @param {string} [options.calcMode='calc'] - 控制 `MathPlus.calc` 的行为模式。
         *   - 'calc': (默认) 解析并计算表达式。
         *   - 'syntaxCheck': 仅检查语法并格式化表达式，不执行计算。
         * @param {string} [options.outputMode='output'] - 控制返回结果中 `result` 字段的格式。
         *   - 'output': (默认) 返回一个理想化的、用户友好的字符串。
         *   - 'mid': 返回 `ComplexNumber` 的内部数组表示 `[[power, mantissa, acc], [power, mantissa, acc]]`，用于进一步的计算或序列化。
         * @param {string} [options.f] - 自定义函数 'f(x)' 的表达式字符串。
         * @param {string} [options.g] - 自定义函数 'g(x)' 的表达式字符串。
         * @returns {{result: string|Array, expr: string}} 一个包含两部分结果的对象：
         * - `result`: 计算结果。根据 `outputMode` 的设置，可以是格式化的字符串或内部数组表示。
         * - `expr`: `MathPlus.calc` 返回的格式化后的表达式字符串。
         * @throws {Error} 如果表达式解析或计算过程中发生错误，则将异常向上抛出。
         */
        static exec(expr, {
            printMode = CalcConfig.globalPrintMode,
            calcAcc = CalcConfig.globalCalcAccuracy,
            outputAcc = CalcConfig.outputAccuracy,
            calcMode = 'calc',
            outputMode = 'output',
            f,
            g
        } = {}) {
            // 验证并修正 outputAcc (保持原有逻辑的一致性，虽然 idealizationToString 也会处理)
            // 如果 outputAcc 是绝对值且大于内部计算精度，则限制它，避免输出虚假精度
            let effectiveOutputAcc = outputAcc;
            if (effectiveOutputAcc > 1 && effectiveOutputAcc > calcAcc) {
                effectiveOutputAcc = calcAcc;
            }

            // 调用核心计算引擎，显式传入 acc
            const calcResult = MathPlus.calc(expr, {
                f: f,
                g: g,
                mode: calcMode,
                acc: calcAcc // <--- 注入局部精度
            });

            // 根据 outputMode 格式化并返回结果
            return {
                result: outputMode === 'output' ?
                        Public.idealizationToString(calcResult[0], {
                            acc: effectiveOutputAcc, // 使用修正后的输出精度
                            printMode: printMode
                        }) :
                        calcResult[0].valueOf(),
                expr: calcResult[1]
            };
        }
    }

    // 导出对象
    window.BigNumber = BigNumber;
    window.ComplexNumber = ComplexNumber;
    window.MathPlus = MathPlus;
    window.StatisticsTools = StatisticsTools;
    window.PowerFunctionTools = PowerFunctionTools;
    window.RadicalFunctionTools = RadicalFunctionTools;
    window.FuncValueListTools = FuncValueListTools;
    window.CalcTools = CalcTools;
})();