/** 初始化并导出高精度计算、分析和数据处理工具。 */
(function () {
    "use strict";

    /**
     * 代表一个不可变的、任意精度的十进制数。
     * 内部表示为 `[power, mantissa]`，即 `mantissa * 10^power`。
     *
     * @class BigNumber
     */
    class BigNumber {
        /**
         * 从数值、字符串、同类对象或内部元组创建高精度十进制数。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array|object} x - 要转换为高精度十进制数的值。
         *   字符串可使用普通或科学记数法；`number` 会先按其可见十进制值解析；`bigint` 保持整数精度。
         *   `BigNumber` 会按目标精度复制；纯实 `ComplexNumber` 取其实部，非零虚部会被拒绝。
         *   数组/对象应提供内部 `[power, mantissa, acc?]` 信息，其中尾数必须是整数且指数必须安全可表示。
         * @param {{
         *   acc?: number,
         *   pow?: number
         * }} [options={}] - 构造选项。
         * @param {number} [options.acc=CalcConfig.globalCalcAccuracy] - 结果保留的有效数字位数；必须为正整数，
         *   省略时取当前全局计算精度。输入精度更低时不会凭空补充有效信息。
         * @param {number} [options.pow=0] - 在解析后的十进制指数上额外增加的安全整数，等价于将输入
         *   整体乘以 `10 ** pow`；它不改变 `acc`，常用于构造科学记数法的中间值。
         * @throws {Error} 输入格式、长度、数值范围或指数无效时抛出。
         */
        constructor(x, {acc, pow = 0} = {}) {
            const type = Public.typeOf(x);
            switch (type) {
                case 'array': {
                    const len = x.length;
                    if (![2, 3].includes(len)) {
                        throw new Error('[BigNumber] Input error: Array length must be 2 or 3.');
                    }

                    let mantissa = x[1];
                    let power = x[0];

                    const arrayAcc = (len === 3 && x[2] > 0) ? x[2] : undefined;
                    const finalAcc = acc ?? arrayAcc ?? CalcConfig.globalCalcAccuracy;

                    if (arrayAcc !== undefined || acc !== undefined) {
                        const rounded = BigNumber._roundAndNormalize(mantissa, power, finalAcc);
                        mantissa = rounded.mantissa;
                        power = rounded.power;
                    }

                    const finalPow = power + pow;
                    if (finalPow > Number.MAX_SAFE_INTEGER || finalPow < Number.MIN_SAFE_INTEGER) {
                        throw new Error('[BigNumber] Input error: Power too large or too small');
                    }
                    this.power = mantissa === 0n ? 0 : finalPow;
                    this.mantissa = mantissa;
                    this.acc = finalAcc;
                    return;
                }

                case 'bignumber':
                case 'object': {
                    if ([x.power, x.mantissa, x.acc].includes(undefined) && type === 'object') {
                        throw new Error('[BigNumber] Unsupported input type or invalid number format.');
                    }

                    const finalAcc = acc ?? x.acc;
                    let realNum;

                    if (finalAcc === x.acc) {
                        realNum = {mantissa: x.mantissa, power: x.power};
                    } else {
                        realNum = BigNumber._roundAndNormalize(x.mantissa, x.power, finalAcc);
                    }

                    const finalPow = realNum.power + pow;
                    if (finalPow > Number.MAX_SAFE_INTEGER || finalPow < Number.MIN_SAFE_INTEGER) {
                        throw new Error('[BigNumber] Input error: Power too large or too small');
                    }
                    this.power = realNum.mantissa === 0n ? 0 : finalPow;
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

                    this.power = mantissaFromBigInt === 0n ? 0 : powerFromBigInt + pow;
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

                        this.power = mantissaFromBigInt === 0n ? 0 : powerFromBigInt + pow;
                        this.mantissa = mantissaFromBigInt;
                        this.acc = acc;
                        return;
                    }
                    x = x.toExponential();
                    break;
                }

                case 'string':
                    if (x.length > CalcConfig.MAX_INPUT_STRING_LENGTH) {
                        throw new Error(`[BigNumber] Input string length exceeds maximum allowed length of ${CalcConfig.MAX_INPUT_STRING_LENGTH}.`);
                    }
                    break;

                default:
                    throw new Error('[BigNumber] Unsupported input type or invalid number format.');
            }
            acc = acc ?? CalcConfig.globalCalcAccuracy;

            let mantissaStr = x.replace(/[\s_]/g, '').toLowerCase();

            if (mantissaStr.includes('e')) {
                const parts = mantissaStr.split('e');
                if (parts.length !== 2 || BigNumber._isInvalidNumericString(parts[1])) {
                    throw new Error('[BigNumber] Unsupported input type or invalid number format.');
                }
                const exponent = Number(parts[1]);
                if (!Number.isFinite(exponent)) {
                    throw new Error('[BigNumber] Input error: Exponent is too large and results in Infinity.');
                }
                if (!Number.isInteger(exponent)) {
                    throw new Error('[BigNumber] Input error: Exponent must be an integer.');
                }
                pow += exponent;
                mantissaStr = parts[0];
            }

            if (BigNumber._isInvalidNumericString(mantissaStr)) {
                throw new Error('[BigNumber] Unsupported input type or invalid number format.');
            }

            const [rawPower, rawMantissa] = BigNumber._parseNumericString(mantissaStr);

            const {
                mantissa: finalMantissa,
                power: middlePower
            } = BigNumber._roundAndNormalize(rawMantissa, rawPower, acc);

            const finalPower = middlePower + pow;

            // 过小的数按零处理，避免指数下溢。
            if (finalMantissa === 0n || finalPower + CalcConfig.globalCalcAccuracy < CalcConfig.MIN_INPUT_EXPONENT) {
                this.power = 0;
                this.mantissa = 0n;
                this.acc = acc;
                return;
            } else if (finalPower > CalcConfig.MAX_INPUT_EXPONENT) { // 过大的指数按溢出处理。
                throw new Error('[BigNumber] Range error: Input number too large.');
            }

            this.power = finalPower;
            this.mantissa = finalMantissa;
            this.acc = acc;
        }

        /**
         * 自定义 `Object.prototype.toString.call()` 的返回值。
         * 这使得 `Public.typeOf(new BigNumber())` 能够返回 'bignumber'。
         *
         * @readonly
         * @type {string}
         */
        get [Symbol.toStringTag]() {
            return 'BigNumber';
        }

        /**
         * 获取 10 的指定非负整数次幂，并使用缓存避免重复计算。
         * 该方法返回 `10 ** exp` 的 `BigInt` 结果，用于高精度整数运算中的位数判断、
         * 舍入除数计算等场景。内部会按需扩展 `_pow10Cache`，因此多次调用相同或较小指数时
         * 可以直接复用已有结果。
         *
         * @private
         * @param {number} exp - 10 的指数；必须是可安全循环处理的非负整数。结果缓存按该整数键复用，
         *   小数、负数和非有限值会在任何 BigInt 幂运算前被拒绝。
         * @returns {bigint} `10 ** exp` 的 BigInt 结果。
         * @throws {Error} 如果 `exp` 不是非负整数。
         */
        static _pow10(exp) {
            if (!Number.isInteger(exp) || exp < 0) {
                throw new Error('[BigNumber] Input error: exponent for pow10 must be a non-negative integer.');
            }

            // 首次调用时初始化 `10^i` 缓存。
            if (BigNumber._pow10Cache === undefined) {
                BigNumber._pow10Cache = [1n];
            }

            const cache = BigNumber._pow10Cache;

            // 按需扩展缓存，避免重复计算十的幂。
            while (cache.length <= exp) {
                cache.push(cache[cache.length - 1] * 10n);
            }

            return cache[exp];
        }

        /**
         * 计算一个 BigInt 的十进制位数。
         * 该方法通过比较 `n` 与 10 的幂来确定其十进制长度：若
         * `10^(d - 1) <= n < 10^d`，则 `d` 即为十进制位数。
         * 内部使用指数扩张寻找上界，再通过二分查找确定精确位数。
         *
         * @private
         * @param {bigint} n - 要统计的整数；符号位不计入十进制位数，`0n` 特判为一位。
         * @returns {number} `n` 的十进制位数；对于 `0n` 返回 `1`。
         */
        static _decimalLengthBigInt(n) {
            if (n < 0n) {
                n = -n;
            }

            if (n < 10n) {
                return 1;
            }

            let lo = 1;
            let hi = 2;

            while (n >= BigNumber._pow10(hi)) {
                lo = hi + 1;
                hi *= 2;
            }

            // 二分查找满足 n < 10^d 的最小 d。
            while (lo < hi) {
                const mid = Math.floor((lo + hi) / 2);

                if (n < BigNumber._pow10(mid)) {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }

            return lo;
        }

        /**
         * 检查一个字符串是否是无效的数字格式。
         *
         * @private
         * @param {string} input - 待验证的完整数值字面量；允许符号、小数和科学记数法，但不接受
         *   前后空白、单位、复数部分或仅含指数标记的不完整形式。
         * @returns {boolean} 如果字符串不是有效的数字格式，则返回 true，否则返回 false。
         */
        static _isInvalidNumericString(input) {
            // 此正则表达式匹配一个可选的[+/-]符号，后跟数字。
            // 它可以正确处理像 ".1" 和 "1." 这样的格式。
            const regex = /^([-+])?((\d+(\.\d*)?)|(\.\d+))$/;
            return ['', '.', '+', '-'].includes(input) || !regex.test(input);
        }

        /**
         * 将尾数舍入（银行家舍入）到指定精度，并通过调整指数来进行规范化。
         * 此函数使用高效的 BigInt 算术运算来处理大数。
         *
         * @private
         * @param {bigint|number} mantissa - 带符号整数尾数；`number` 仅用于能无损转为 BigInt 的整数，
         *   零值会规范化为统一的零表示。
         * @param {number} power - 与尾数配套的十进制安全整数指数；舍入移除的位数会补偿到该指数。
         * @param {number} acc - 舍入后最多保留的正整数有效位数；半舍情形按当前整数规则进位，
         *   末尾十进制零随后继续并入 `power`。
         * @returns {{mantissa:bigint,power:number}} 规范化结果；`mantissa` 是舍入到 `acc` 位并移除
         *   十进制尾随零后的带符号整数，`power` 是补偿舍入位数和尾随零后对应的十进制指数。
         *   输入尾数为零时返回统一的 `{mantissa:0n,power:0}`。
         */
        static _roundAndNormalize(mantissa, power, acc) {
            if (typeof mantissa === 'number') {
                mantissa = BigInt(mantissa);
            }

            if (mantissa === 0n) {
                return {mantissa: 0n, power: 0};
            }

            const sign = mantissa < 0n ? -1n : 1n;
            let absMantissa = sign < 0n ? -mantissa : mantissa;
            let finalPower = power;

            // 构造精度阈值：10^acc
            // 当 absMantissa 大于该值时，说明尾数很可能超过目标有效位数，需要进一步计算实际位数
            const threshold = BigNumber._pow10(acc);

            if (absMantissa > threshold) {
                const mantissaLength = BigNumber._decimalLengthBigInt(absMantissa);
                const digitsToShift = mantissaLength - acc;

                if (digitsToShift > 0) {
                    const divisor = BigNumber._pow10(digitsToShift);

                    // 截断得到基础部分
                    let roundedMantissa = absMantissa / divisor;

                    // 获取被舍弃的余数部分
                    const remainder = absMantissa % divisor;

                    // 计算阈值：除数的一半
                    const halfDivisor = divisor / 2n;

                    if (remainder > halfDivisor) {
                        roundedMantissa++;
                    } else if (remainder === halfDivisor) {
                        // 恰好位于中点时使用向偶数舍入。
                        if ((roundedMantissa & 1n) === 1n) {
                            roundedMantissa++;
                        }
                    }

                    absMantissa = roundedMantissa;
                    finalPower += digitsToShift;
                }
            }

            if (absMantissa === 0n) {
                return {mantissa: 0n, power: 0};
            }

            // 移除尾数末尾的零并补偿指数，使同一个数尽量只有一种内部表示，便于比较和后续运算。
            while (absMantissa % 10n === 0n) {
                absMantissa /= 10n;
                finalPower++;
            }

            return {mantissa: absMantissa * sign, power: finalPower};
        }

        /**
         * 解析一个数字字符串，并将其分解为指数和带符号的尾数。
         * 例如，"-123.45" 将被解析为 [-2, -12345n]。
         *
         * 逻辑解释:
         *   1. 找到第一个非零数字 (firstNonZero) 、最后一个非零数字 (lastNonZero) 和小数点 (decimalIndex) 的位置。
         *   2. 从 firstNonZero 到 lastNonZero 提取所有数字（忽略小数点）作为尾数 (mantissaStr)。
         *   3. 计算科学记数法的指数。这表示小数点需要移动多少位才能放到第一个有效数字的后面。
         *      例如 "123.45" 的 scientificExponent 是 2，
         *      而 "0.0123" 的 scientificExponent 是 -2。
         *   4. 最终的 power 是 scientificExponent 减去尾数的小数部分长度。
         *      例如 "123.45", mantissa="12345", scientificExponent=2.
         *      power = 2 - (5 - 1) = -2. 最终表示为 12345 * 10^-2.
         *
         * @private
         * @param {string} numStr - 已通过格式校验的普通或科学记数法字符串；方法提取符号、小数位和
         *   显式指数，返回规范化前的十进制指数与整数尾数，不负责最终精度舍入。
         * @returns {[number, bigint]} 解析后的 `[power, mantissa]`；第 0 项已合并小数位数与科学计数
         *   指数，第 1 项是移除小数点后的带符号整数尾数。此阶段不附加精度，也不删除尾随零。
         */
        static _parseNumericString(numStr) {
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

            if (firstNonZero === -1) {
                return [0, 0n];
            }

            // 通过提取第一个和最后一个非零数字之间的所有数字（并移除小数点）来构建尾数。
            const mantissaStr = (decimalIndex > firstNonZero && decimalIndex < lastNonZero)
                                ? numStr.slice(firstNonZero, decimalIndex) + numStr.slice(decimalIndex + 1, lastNonZero + 1)
                                : numStr.slice(firstNonZero, lastNonZero + 1);

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
         * 判断当前 BigNumber 实例的值是否等于零。
         * 该方法通过检查内部的尾数是否为 `0n` 来实现。
         * 在高精度计算中，这是判断数值是否为绝对零的最快方式。
         * @returns {boolean} 如果值为零返回 `true`，否则返回 `false`。
         */
        isZero() {
            return this.mantissa === 0n;
        }

        /**
         * 判断当前 BigNumber 实例的值是否大于零。
         * 注意：此方法仅在值严格大于零时返回 `true`。
         * 如果实例的值为零或负数，将返回 `false`。
         * @returns {boolean} 如果值为正数返回 `true`，否则返回 `false`。
         */
        isPositive() {
            return this.mantissa > 0n;
        }

        /**
         * 判断当前 BigNumber 实例的值是否小于零。
         * 该方法用于检测数值的符号位。
         * 值得注意的是，对于某些科学记数法实现，零通常被视为既非正也非负。
         * @returns {boolean} 如果值为负数返回 `true`，否则返回 `false`。
         */
        isNegative() {
            return this.mantissa < 0n;
        }

        /**
         * 返回 BigNumber 实例的内部数组表示。
         * 值得注意的是，由于它返回一个数组（一个对象）而非一个原始类型（如 number 或 string），
         * 因此它不会像原生 Number 类型那样在标准的算术运算中触发自动类型转换。
         * 例如，`new BigNumber(2) + new BigNumber(3)` 不会因为此方法而直接得到一个数字结果，
         * 而是会触发默认的对象到字符串的转换行为。
         * @returns {[number, bigint, number]} 当前值的 `[power, mantissa, acc]` 快照；三项分别表示
         *   十进制指数、带符号整数尾数和有效位数。返回新数组，但其中均为原始值，可安全传给新构造器。
         */
        valueOf() {
            return [this.power, this.mantissa, this.acc];
        }

        /**
         * 将 BigNumber 实例转换为其标准的十进制字符串表示形式。
         * @param {object} [options={}] - 只影响返回字符串的格式化选项，不改变当前不可变实例。
         * @param {number} [options.acc=this.acc] - 要显示的正整数有效位数；最多使用实例已有精度，
         *   较小值会按有效数字舍入，省略时完整使用 `this.acc`。
         * @param {'auto'|'normal'|'scientific'} [options.mode='auto'] - `normal` 强制普通十进制，
         *   `scientific` 强制科学记数法，`auto` 根据指数和最大字符串长度选择更紧凑的形式。
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

            switch (mode) {
                case 'normal':
                    if (finalMantissa === 0n) {
                        return '0';
                    }

                    if (finalPower >= 0) {
                        if (mantissaLength + finalPower > CalcConfig.MAX_TO_STRING_LENGTH) {
                            throw new Error('[BigNumber] Range error: Number is too large to be represented as a string.');
                        }
                        resultString = mantissaStr + '0'.repeat(finalPower);
                    } else {
                        const absPower = -finalPower;
                        if (mantissaLength > absPower) {
                            // 小数点位于尾数内部
                            if (mantissaLength > CalcConfig.MAX_TO_STRING_LENGTH) {
                                throw new Error('[BigNumber] Range error: Number is too large to be represented as a string.');
                            }
                            const decimalPosition = mantissaLength - absPower;
                            resultString = mantissaStr.slice(0, decimalPosition) + '.' + mantissaStr.slice(decimalPosition);
                        } else {
                            // 数字小于 1；前置 "0." 和引导零
                            const leadingZeros = absPower - mantissaLength;
                            if (2 + leadingZeros + mantissaLength > CalcConfig.MAX_TO_STRING_LENGTH) {
                                throw new Error('[BigNumber] Range error: Number is too small to be represented as a string.');
                            }
                            resultString = '0.' + '0'.repeat(leadingZeros) + mantissaStr;
                        }
                    }

                    if (isNegative) {
                        return '-' + resultString;
                    }
                    return resultString;

                case 'scientific': {
                    if (finalMantissa === 0n) {
                        return '0E+0';
                    }

                    const midString = mantissaStr.slice(1);
                    const midLength = midString.length;
                    const scientificPower = BigInt(midLength === 0 ? finalPower : (finalPower + midLength)).toString();
                    if (midLength === 0) {
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
    }

    /**
     * 以两个不可变 `BigNumber` 表示的任意精度复数。
     *
     * @class ComplexNumber
     */
    class ComplexNumber {
        /**
         * 从代数字符串、实数、同类对象或内部数组创建复数。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array|object} x - 要转换的实数或复数。
         *   字符串支持代数形式 `a+bi`；二元数组表示 `[real, imag]`，三元数值数组表示
         *   `[power, mantissa, acc]`；已有实例按指定精度复制。含歧义或多个虚数单位的字符串会被拒绝。
         * @param {object} [options={}] - 构造精度与缩放选项；对象本身不会被修改。
         * @param {number} [options.acc=CalcConfig.getAccuracy()] - 实部和虚部共同采用的正整数计算精度；
         *   省略时读取当前计算上下文精度，而不是固定的类常量。
         * @param {number} [options.pow=0] - 同时施加于实部、虚部的十进制指数偏移，等价于整体乘以
         *   `10 ** pow`；必须满足底层 `BigNumber` 的安全指数约束。
         * @throws {Error} 输入类型或格式无效时抛出。
         */
        constructor(x, {acc, pow = 0} = {}) {
            switch (Public.typeOf(x)) {
                case 'array': {
                    // 长度为 2: [real, imag]
                    // 长度为 3: [power, mantissa, acc] (一个 BigNumber 序列化数组。若 acc 小于等于0，则按照默认精度构造)
                    const len = x.length;
                    if (![2, 3].includes(len)) {
                        throw new Error('[ComplexNumber] Input error: Array length must be 2 or 3.');
                    }
                    if (len === 2) {
                        let r = new BigNumber(x[0], {acc: acc});
                        let i = new BigNumber(x[1], {acc: acc});

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
                    } else {
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

            this.onlyReal = this.im.mantissa === 0n;
            this.acc = Math.min(this.re.acc, this.im.acc);
        }

        /**
         * 自定义 `Object.prototype.toString.call()` 的返回值。
         * 这使得 `Public.typeOf(new ComplexNumber())` 能够返回 'complexnumber'。
         *
         * @readonly
         * @type {string}
         */
        get [Symbol.toStringTag]() {
            return 'ComplexNumber';
        }

        /**
         * 一个健壮的复数解析器，能从字符串中提取实部和虚部。
         * 此方法设计用于处理多种常见的复数格式，包括：
         *   - 标准代数形式: "a+bi", "a-bi", "a + bi"
         *   - 纯实数或纯虚数: "a", "bi", "-bi"
         *   - 科学记数法: "-1.23e-4 + 5.67e+8i"
         *   - J/j 作为虚数单位: "3+4j"
         *   - 乘号和顺序变化: "3+i*4", "i*4+3"
         *   - 隐式系数为 1: "a+i", "a-i", "i", "-i"
         *
         * @private
         *
         * @param {string} complexString - 代数形式的完整复数字符串；支持实数、纯虚数、`a±bi` 及
         *   科学记数法分量。正负号只有在不属于指数时才分隔实部和虚部，多个 `i` 或空分量会抛错。
         * @returns {{re:string,im:string}} 已分离但尚未构造高精度数的两个十进制分量；`re` 不含
         *   虚数单位，`im` 去除末尾 `i` 并保留正负号。纯实数补 `im:'0'`，纯虚数补 `re:'0'`，
         *   裸 `i`/`-i` 分别把虚部规范化为 `1`/`-1`。
         * @throws {Error} 如果输入字符串的格式无效或不明确。
         */
        static _parseComplex(complexString) {
            // 预处理和规范化输入字符串：
            //   - 移除所有空白字符和下划线
            //   - 将所有虚数单位 (I, j, J) 统一转换为小写的 'i'
            let sanitizedStr = complexString.replace(/[\s_]/g, '').replace(/[JjI]/g, 'i').replace(/\[i]/g, 'i');

            // 标准化虚部格式，处理数字在 'i' 之后的情况：
            //   例如，将 "i*2.5" 或 "i2.5" 转换为标准的 "2.5i"。
            //   这使得后续的正则表达式可以基于 'i' 在末尾的假设进行匹配。
            const numPatternForSwap = /i[*]?((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
            sanitizedStr = sanitizedStr.replace(numPatternForSwap, '$1i');

            if (sanitizedStr === '') {
                throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
            }

            // 使用正则表达式匹配所有可能的实部和虚部项。
            // 这个正则表达式由两部分组成，用 OR (|) 连接：
            //   1. `([+-]?(...)?i)`: 匹配一个完整的虚部项。它能捕获可选的符号、可选的数字（包括科学记数法）、可选的乘号 '*'，并以 'i' 结尾。
            //   2. `([+-]?(...))`: 匹配一个完整的实部项（一个数字，包括科学记数法）。
            const termRegex = /([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)?[*]?i)|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
            const allMatches = [...sanitizedStr.matchAll(termRegex)];
            /** 保留非空的正则匹配项。 */
            const validTerms = allMatches.filter((match) => match[0] !== '');

            // 验证匹配结果的完整性和合法性：
            //   检查所有匹配到的项的长度之和是否等于净化后字符串的总长度。
            //   如果不相等，说明字符串中包含无法识别的字符（如 "3+4i+j"）。
            const totalMatchedLength = validTerms.reduce((acc, term) => acc + term[0].length, 0);
            if (totalMatchedLength !== sanitizedStr.length) {
                throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
            }
            if (validTerms.length === 0 || validTerms.length > 2) {
                throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
            }

            // 分离并存储实部和虚部。
            let realPart = '0', hasReal = false;
            let imagPart = '0', hasImag = false;

            for (const match of validTerms) {
                const term = match[0];
                if (term.endsWith('i')) {
                    if (hasImag) {
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
                    if (hasReal) {
                        throw new Error(`[ComplexNumber] Invalid complex number format: '${complexString}'.`);
                    }
                    hasReal = true;
                    realPart = term;
                }
            }
            return {re: realPart, im: imagPart};
        }

        /**
         * 判断当前 ComplexNumber 实例的值是否等于零。
         * 该方法要求此示例实部和虚部都必须为 0。
         * 在高精度计算中，这是判断数值是否为绝对零的最快方式。
         * @returns {boolean} 如果值为零返回 `true`，否则返回 `false`。
         */
        isZero() {
            return this.re.mantissa === 0n && this.im.mantissa === 0n;
        }

        /**
         * 返回 ComplexNumber 实例的内部嵌套数组表示。
         * 它通过递归调用其 `re` 和 `im` 组件（它们是 BigNumber 实例）的 `valueOf` 方法来工作。
         * @returns {[[number,bigint,number], [number,bigint,number]]} `[realTuple, imagTuple]` 快照；
         *   两个三元组都采用 `BigNumber.valueOf()` 的 `[power, mantissa, acc]` 顺序。外层和内层均为新数组，
         *   可直接构造等值 `ComplexNumber` 而不会共享可变容器。
         */
        valueOf() {
            return [this.re.valueOf(), this.im.valueOf()];
        }

        /**
         * 将 ComplexNumber 实例转换为其标准的字符串表示形式。
         * @param {object} [options={}] - 仅作用于此次字符串转换的选项，不会改变复数的实部、虚部或精度。
         * @param {number} [options.acc=this.acc] - 实部、虚部以及极坐标分量共用的正整数有效位数；
         *   不能超过实例精度，省略时使用实部与虚部中的较低精度。
         * @param {'algebra'|'polar'} [options.printMode='algebra'] - `algebra` 输出 `a+bi`，并省略零分量；
         *   `polar` 输出模和主辐角。该选项只选择复数表示法，不选择数值记数法。
         * @param {'auto'|'normal'|'scientific'} [options.mode='auto'] - 传给两个 `BigNumber` 分量的记数法；
         *   `auto` 可分别为分量选择普通或科学记数法。
         * @returns {string} - 复数的标准代数形式字符串 (a + bi) 或极坐标形式 (r∠θ)。
         */
        toString({acc = this.acc, printMode = CalcConfig.globalPrintMode, mode = 'auto'} = {}) {
            if (this.onlyReal) {
                return this.re.toString({acc: acc, mode: mode});
            }

            switch (printMode) {
                case 'algebra': {
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

                    if (this.im.isNegative()) {
                        if (['-1', '-1E+0'].includes(imStr)) {
                            return `${reStr}-[i]`;
                        }
                        return `${reStr}${imStr}[i]`;
                    } else {
                        if (['1', '1E+0'].includes(imStr)) {
                            return `${reStr}+[i]`;
                        }
                        return `${reStr}+${imStr}[i]`;
                    }
                }

                case 'polar': {
                    // 计算模长和辐角
                    const modulus = MathPlus.abs(this).re.toString({acc: acc, mode: mode});
                    let argument = MathPlus.arg(this).re.toString({acc: acc, mode: mode});
                    if (argument.includes('E')) {
                        argument = `(${argument})`;
                    }

                    if (['0', '0E+0'].includes(argument)) {
                        return modulus;
                    }
                    return `${modulus}[toPolar]${argument}`;
                }
            }
        }
    }

    /**
     * 提供基于 `BigNumber` 和 `ComplexNumber` 的数学运算。
     *
     * @class MathPlus
     */
    class MathPlus {
        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[MathPlus] MathPlus is a static class and should not be instantiated.');
        }

        /**
         * (内部辅助方法) 计算一个 BigNumber 或 ComplexNumber 的相反数。
         *
         * @private
         * @param {BigNumber|ComplexNumber|string|number} x - 需要取反的值；`BigNumber` 返回同类型新实例，
         *   其余可转换输入统一返回 `ComplexNumber`，传入对象本身不会被修改。
         * @returns {BigNumber|ComplexNumber} 输入值的相反数。
         */
        static _oppositeNumber(x) {
            switch (Public.typeOf(x)) {
                case 'bignumber':
                    return new BigNumber([x.power, -x.mantissa, x.acc]);

                case 'complexnumber':
                    return new ComplexNumber([MathPlus._oppositeNumber(x.re), MathPlus._oppositeNumber(x.im)]);

                default: {
                    const input = new ComplexNumber(x);
                    return MathPlus._oppositeNumber(input);
                }
            }
        }

        /**
         * 计算用户定义的 f(x) 或 g(x)，并保留相互引用的上下文。
         *
         * @private
         * @param {'f'|'g'} token - 本次要进入的自定义函数名；用于选择表达式并保留另一函数的引用。
         * @param {{f: string, g: string}} funcs - `f`、`g` 的内部表达式字符串；被调用函数可引用另一项，
         *   缺失当前 `token` 对应表达式时视为未定义函数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} unknown - 代入表达式中 `[x]` 的值；
         *   复数和高精度表示原样进入递归计算上下文。
         * @param {number} acc - 递归求值使用的正整数有效位数；沿用外层计算精度，避免嵌套调用降精度。
         * @returns {ComplexNumber} 函数值。
         */
        static _customFunc(token, funcs, unknown, acc) {
            const another = token === 'f' ? 'g' : 'f';
            return MathPlus.calc(funcs[token], {
                [another]: funcs[another],
                unknown: unknown,
                acc: acc
            })[0];
        }

        /**
         * 利用周期和对称性将角度归约到 [0, π/2]，同时记录符号。
         *
         * @private
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} angle - 以弧度表示的纯实角度；
         *   会转换为 `ComplexNumber` 并利用周期归约，非零虚部不适用于此实数快速路径。
         * @param {'sin'|'cos'} name - 选择需要保留的象限符号规则；只接受 `sin` 或 `cos`。
         * @returns {[BigNumber, 1n|-1n]} 二元组：第 0 项是落在 `[0, π/2]` 的纯实弧度值，
         *   第 1 项是依据原角度象限和 `name` 得到的符号乘子；调用方将级数结果乘以该因子复原。
         * @throws {Error} 角度过大而无法保证精度时抛出。
         */
        static _toLessThanHalfPi(angle, name) {
            angle = new ComplexNumber(angle).re;
            const acc = angle.acc;

            const typeFactor = name === 'sin' ? 1n : -1n;
            let changeSign = 1n;

            if (angle.isNegative()) {
                angle = MathPlus._oppositeNumber(angle);

                // sin(-x) = -sin(x) -> 变号 (1 * -1)
                // cos(-x) =  cos(x) -> 不变 (-1 * -1 = 1)
                changeSign = -typeFactor;
            }

            const highPrecisionAcc = -CalcConfig.constants.invTwoPi[0];
            if (!MathPlus.minus(angle, [highPrecisionAcc >> 1, 1n, acc]).re.isNegative()) {
                if (!MathPlus.minus(angle, [highPrecisionAcc, 1n, acc]).re.isNegative()) {
                    throw new Error(`[MathPlus] Input value (${angle.toString()}) is too large.`);
                }
                console.warn('[MathPlus] Unexpected loss of precision occurred in trigonometric calculations.');
            }
            const highPrecisionRe = new ComplexNumber(angle, {acc: highPrecisionAcc});
            const n = MathPlus.floor(MathPlus.times(highPrecisionRe, CalcConfig.constants.invTwoPi));
            angle = MathPlus.minus(highPrecisionRe, MathPlus.divide(n, CalcConfig.constants.invTwoPi)).re;

            // 利用 cos(x) = cos(2π - x)，将 re 从 (π, 2π) 映射到 (0, π)
            if (MathPlus.minus(angle, CalcConfig.constants.pi).re.isPositive()) {
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
            if (!MathPlus.minus(MathPlus.times(angle, [0, 2n, acc]), CalcConfig.constants.pi).re.isNegative()) {
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
         * 提取复数的实部。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 可由 `ComplexNumber` 构造的输入；
         *   返回值复制其实部并将虚部置零，不修改原实例。
         * @returns {ComplexNumber} 以纯实数表示的实部。
         */
        static re(x) {
            const input = new ComplexNumber(x);
            return new ComplexNumber(input.re);
        }

        /**
         * 提取复数的虚部。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 可由 `ComplexNumber` 构造的输入；
         *   返回值把原虚部作为纯实数保存，而不是返回带虚数单位的分量。
         * @returns {ComplexNumber} 以纯实数表示的虚部。
         */
        static im(x) {
            const input = new ComplexNumber(x);
            return new ComplexNumber(input.im);
        }

        /**
         * 计算复数在 (-π, π] 内的辐角，等价于 atan2(im, re)。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 非零实数或复数；结果采用
         *   `(-π, π]` 内的主辐角。零值没有唯一辐角，调用方不应依赖其结果。
         * @returns {ComplexNumber} 以弧度表示的辐角。
         */
        static arg(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;
            const zero = new ComplexNumber([0, 0n, acc]);

            if (input.re.isZero()) {
                if (input.onlyReal) {
                    throw new Error('[MathPlus] The argument of 0 is undefined.');
                }
                return MathPlus.divide(
                    CalcConfig.constants.pi,
                    [0, input.im.isNegative() ? -2n : 2n, acc]
                );
            }
            if (input.onlyReal) {
                return input.re.isPositive() ? zero : new ComplexNumber(CalcConfig.constants.pi, {acc: acc});
            }

            // 按实部符号修正 arctan(im/re) 的象限。
            const result = MathPlus.arctan(MathPlus.divide(input.im, input.re));

            if (input.re.isNegative()) {
                return MathPlus[input.im.isNegative() ? 'minus' : 'plus'](result, CalcConfig.constants.pi);
            }

            return result;
        }

        /**
         * 计算一个复数的共轭复数。
         * 共轭复数的实部与原数相同，虚部符号相反 (a + bi → a - bi)。
         * 这个实现通过复用 _oppositeNumber 辅助方法来提高代码的抽象性和可读性。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 输入值。可以是表示复数或实数的任何受支持的类型。
         * @returns {ComplexNumber} 一个新的 ComplexNumber 实例，代表输入值的共轭复数。
         */
        static conj(x) {
            const input = new ComplexNumber(x);

            return new ComplexNumber([input.re, MathPlus._oppositeNumber(input.im)]);
        }

        /**
         * 将极坐标 (r, θ) 转换为笛卡尔坐标下的复数 (x + yi)。
         * - 计算公式为：r * (cos(θ) + i * sin(θ))。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 极坐标模长 `r`；应为非负实数，
         *   其精度参与最终实部、虚部的有效位数计算。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 以弧度表示的辐角 `θ`；应为实数，
         *   可超出一个周期，三角函数会自行归约。
         * @returns {ComplexNumber} 代表转换后笛卡尔坐标的 ComplexNumber 实例。
         */
        static toPolar(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const acc = Math.min(inputA.acc, inputB.acc);
            const cosTheta = MathPlus.cos(inputB);
            const sinTheta = MathPlus.sin(inputB);
            const complexExponential = MathPlus.plus(
                cosTheta,
                [MathPlus._oppositeNumber(sinTheta.im), sinTheta.re]
            );
            const result = MathPlus.times(inputA, complexExponential);
            return new ComplexNumber(result, {acc: acc});
        }

        /**
         * 计算两个数的和。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 第一个加数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 第二个加数。
         * @returns {ComplexNumber} 代表两个数之和的 ComplexNumber 实例。
         */
        static plus(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            if (inputA.onlyReal && inputB.onlyReal) {
                // 纯实数直接在 BigNumber 的尾数上运算；复数分支则分别合并实部和虚部。
                const reA = inputA.re;
                const reB = inputB.re;

                const resultAcc = Math.min(reA.acc, reB.acc);
                let mantissaA = reA.mantissa;
                let mantissaB = reB.mantissa;
                const powerDifference = reB.power - reA.power;

                /**
                 * 返回 `bigint` 的绝对值。
                 *
                 * @param {bigint} num - 输入值。
                 * @returns {bigint} 绝对值。
                 */
                const bigIntAbs = (num) => num < 0n ? -num : num;

                const guardAcc = resultAcc + 5;
                // 数量级差超过有效精度与保护位时，较小的加数不会影响舍入结果，可直接返回较大值。
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

                if (powerDifference < 0) {
                    // 对齐到较小的十进制指数后再相加尾数，保持 `mantissa * 10^power` 表示一致。
                    mantissaA *= 10n ** BigInt(-powerDifference);
                } else if (powerDifference > 0) {
                    mantissaB *= 10n ** BigInt(powerDifference);
                }

                const resultMantissa = mantissaA + mantissaB;
                const resultPower = Math.min(reA.power, reB.power);

                return new ComplexNumber(resultMantissa, {pow: resultPower, acc: resultAcc});
            }

            const resultRe = MathPlus.plus(inputA.re, inputB.re);
            const resultIm = MathPlus.plus(inputA.im, inputB.im);

            return new ComplexNumber([resultRe.re, resultIm.re]);
        }

        /**
         * 计算两个数的差 (a - b)。
         * 该实现通过将减法转换为加法 (a + (-b)) 来复用现有的 `plus` 和 `_oppositeNumber` 方法，
         * 展现了优秀的代码抽象。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被减数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 减数。
         * @returns {ComplexNumber} 代表两个数之差的 ComplexNumber 实例。
         */
        static minus(a, b) {
            return MathPlus.plus(a, MathPlus._oppositeNumber(b));
        }

        /**
         * 计算两个数的乘积。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 第一个乘数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 第二个乘数。
         * @returns {ComplexNumber} 代表两个数乘积的 ComplexNumber 实例。
         */
        static times(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            if (inputA.onlyReal && inputB.onlyReal) {
                // (m1 * 10^p1)(m2 * 10^p2) = (m1m2) * 10^(p1+p2)。
                const reA = inputA.re;
                const reB = inputB.re;

                const resultMantissa = reA.mantissa * reB.mantissa;
                const resultPower = reA.power + reB.power;
                const resultAcc = Math.min(reA.acc, reB.acc);

                return new ComplexNumber(resultMantissa, {pow: resultPower, acc: resultAcc});
            }

            const ac = MathPlus.times(inputA.re, inputB.re);
            const bd = MathPlus.times(inputA.im, inputB.im);
            const ad = MathPlus.times(inputA.re, inputB.im);
            const bc = MathPlus.times(inputA.im, inputB.re);

            // (a+bi)(c+di) = (ac-bd) + (ad+bc)i。
            const realPart = MathPlus.minus(ac, bd);
            const imagPart = MathPlus.plus(ad, bc);

            return new ComplexNumber([realPart.re, imagPart.re]);
        }

        /**
         * 计算两个数的商 (a / b)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被除数，可为实数或复数；
         *   结果精度由两个操作数的可用精度共同限制。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 非零除数；复数分支通过共轭有理化，
         *   实数零和复数零都会在执行除法前被拒绝。
         * @returns {ComplexNumber} 代表两个数之商的 ComplexNumber 实例。
         * @throws {Error} 如果除数为零。
         */
        static divide(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            if (inputB.isZero()) {
                throw new Error('[MathPlus] mathematical error: Division by zero.');
            }

            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re;
                const reB = inputB.re;

                const resultAcc = Math.min(reA.acc, reB.acc);

                const lenA = (reA.isNegative() ? -reA.mantissa : reA.mantissa).toString().length;
                const lenB = (reB.isNegative() ? -reB.mantissa : reB.mantissa).toString().length;

                // BigInt 除法会截断，因此先按目标精度、尾数位数差和保护位放大被除数。
                const scalingDigits = resultAcc + lenB - lenA + 4;
                const finalScalingDigits = Math.max(0, scalingDigits);
                const scaledMantissaA = reA.mantissa * (10n ** BigInt(finalScalingDigits));
                const resultMantissa = scaledMantissaA / reB.mantissa;
                const resultPower = reA.power - reB.power - finalScalingDigits;

                return new ComplexNumber(resultMantissa, {pow: resultPower, acc: resultAcc});
            }

            const conjB = MathPlus.conj(inputB);
            // 复数除法乘以分母的共轭：a/b = a·conj(b)/|b|²，使分母化为实数。
            const numerator = MathPlus.times(inputA, conjB);
            const denominator = MathPlus.times(inputB, conjB);

            const resultRe = MathPlus.divide(numerator.re, denominator.re);
            const resultIm = MathPlus.divide(numerator.im, denominator.re);

            return new ComplexNumber([resultRe.re, resultIm.re]);
        }

        /**
         * 按 `a - b * floor(a / b)` 计算实数或复数取模。
         *
         * 实数分支提取公共十进制指数，以便在 BigInt 范围内完成运算。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被取模值；实数分支精确对齐十进制
         *   指数，复数分支按统一定义计算，因此返回值不保证与 JavaScript `%` 的负数符号规则相同。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 非零模数；其符号参与
         *   `floor(a / b)`，传入零值会在任何余数计算前抛错。
         * @returns {ComplexNumber} a mod b。
         * @throws {Error} b 为零时抛出。
         */
        static mod(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);

            if (inputB.isZero()) {
                throw new Error("[MathPlus] Modulo by zero error.");
            }

            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re;
                const reB = inputB.re;

                const resultAcc = Math.min(reA.acc, reB.acc);
                // 提取公共指数 m，把取模转换为整数尾数上的运算，最后再乘回 10^m。
                const m = Math.min(reA.power, reB.power);

                const isNegativeA = reA.mantissa < 0;
                const isNegativeB = reB.mantissa < 0;
                let calcA = isNegativeA ? -reA.mantissa : reA.mantissa;
                let calcB = isNegativeB ? -reB.mantissa : reB.mantissa;

                let modResult;
                const powOfA = reA.power - m;
                const powOfB = reB.power - m;
                if (powOfA > CalcConfig.MAX_INPUT_EXPONENT) {
                    // 指数过大时用平方-乘模计算 10^powOfA mod calcB，避免构造巨型 BigInt。
                    const modAB = calcA % calcB;

                    // 快速幂算法
                    let modOfPow = 1n;
                    let base = 10n % calcB;
                    let exp = powOfA;
                    while (exp > 0) {
                        if (exp % 2 !== 0) {
                            modOfPow = (modOfPow * base) % calcB;
                        }
                        base = (base ** 2n) % calcB;
                        exp = Math.floor(exp / 2);
                    }

                    const leftMod = modAB * modOfPow;
                    modResult = leftMod % calcB;
                } else if (powOfB > CalcConfig.MAX_INPUT_EXPONENT) {
                    if (reA.acc < CalcConfig.MAX_INPUT_EXPONENT) {
                        modResult = calcA;

                        // 此处可能存在性能问题，因此需要判断是否会在后续触发 calcB 参与修正计算
                        if (isNegativeA !== isNegativeB) {
                            calcB = calcB * (10n ** BigInt(powOfB));
                        }
                    } else {
                        calcB = calcB * (10n ** BigInt(powOfB));
                        modResult = calcA % calcB;
                    }
                } else {
                    calcA = powOfA === 0 ? calcA : calcA * (10n ** BigInt(powOfA));
                    calcB = powOfB === 0 ? calcB : calcB * (10n ** BigInt(powOfB));
                    modResult = calcA % calcB;
                }

                // 只有当余数不为 0 时，才进行符号调整补齐
                if (modResult !== 0n) {
                    // 按 `a - b * floor(a / b)` 的定义修正不同符号组合，而非沿用 `%` 的截断语义。
                    if (isNegativeA && isNegativeB) {
                        modResult = -modResult;
                    } else if (isNegativeA && !isNegativeB) {
                        modResult = calcB - modResult;
                    } else if (!isNegativeA && isNegativeB) {
                        modResult = modResult - calcB;
                    }
                }

                return new ComplexNumber(modResult, {
                    acc: resultAcc,
                    pow: m
                });
            }

            return MathPlus.minus(
                inputA,
                MathPlus.times(
                    MathPlus.floor(MathPlus.divide(inputA, inputB)),
                    inputB
                )
            );
        }

        /**
         * 计算 a 的 b 次方 (a^b)。
         * - 该函数能够处理实数和复数作为底数和指数。
         * - 核心原理：a^b = exp(b * ln(a))。
         * - 对于复数 z = r(cosθ + isinθ), z^b = r^b * (cos(bθ) + isin(bθ))。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 实数或复数底数；负实数配非整数
         *   指数时按复对数主值求幂，零底数仅允许正指数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 实数或复数指数；整数指数优先走
         *   精确的快速幂路径，其他情况按 `exp(b * ln(a))` 返回主值。
         * @returns {ComplexNumber} 代表 a^b 结果的 ComplexNumber 实例。
         * @throws {Error} 如果出现数学上未定义的情况 (例如 0^0)。
         * @throws {Error} 如果结果的位数估算值过大，可能导致内存溢出。
         * @throws {Error} 如果底数为零且指数为负。
         */
        static pow(a, b) {
            /**
             * (内部辅助函数) 估算 a^b 结果的十进制位数，其中 a 和 b 都是 BigInt。
             * 用于在执行昂贵的乘方运算前进行溢出检查。
             *
             * 核心原理：
             * 一个正整数 n 的位数约等于 `floor(log10(n)) + 1`。
             * 因此，(a^b) 的位数约等于 `floor(log10(a^b)) + 1` = `floor(b * log10(a)) + 1`。
             * 由于 `BigInt` 没有 `log10` 方法，我们通过其字符串长度来近似计算 `log10(a)`。
             * 为了提高精度，我们取 `a` 的前 15 位数字计算 `log10`，然后加上位数的偏移量。
             *
             * @private
             *
             * @param {bigint} a - 底数，一个 BigInt。
             * @param {bigint} b - 指数，一个正的 BigInt。
             * @returns {number} a^b 结果位数的估算值。
             */
            function estimateDigitCount(a, b) {
                if (a < 0n) {
                    a = -a;
                }
                if (a === 0n) {
                    return 1;
                }
                if (a === 1n) {
                    return 1;
                }
                if (b === 0n) {
                    return 1;
                }

                const aStr = a.toString();
                const numDigitsInA = aStr.length;

                const precision = 15;
                const aHeadStr = aStr.slice(0, precision);
                const aHeadNum = Number(aHeadStr);

                const log10a = Math.log10(aHeadNum) + (numDigitsInA - aHeadStr.length);
                const bAsNumber = Number(b);
                const log10Result = bAsNumber * log10a;

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
                if (exponent === 0n) {
                    return new ComplexNumber([0, 1n, CalcConfig.globalCalcAccuracy]);
                }

                // 连续平方会累积舍入误差，额外 10 位仅作为中间保护位，最终结果仍按调用精度截断。
                let b = new ComplexNumber(base, {acc: currentAcc + 10});
                const acc = b.acc;
                let result = new ComplexNumber([0, 1n, acc]);

                // 二进制平方-乘：指数每次减半，只在当前二进制位为 1 时乘入结果。
                while (exponent > 0n) {
                    if ((exponent & 1n) === 1n) {
                        result = MathPlus.times(result, b);
                    }

                    if (exponent > 1n) {
                        b = MathPlus.times(b, b);
                    }

                    exponent >>= 1n;
                }

                return result;
            }

            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const resultAcc = Math.min(inputA.acc, inputB.acc);

            if (
                !inputB.onlyReal &&
                inputA.onlyReal &&
                /** 判断实部是否等于常量 e。 */
                inputA.re.valueOf().every((val, index) => val === CalcConfig.constants.e[index])
            ) {
                // e 的复数幂由 exp 专用实现计算，避免经通用 ln/pow 路径损失精度。
                return MathPlus.exp(inputB);
            }

            if (inputA.onlyReal && inputB.onlyReal) {
                const reA = inputA.re;
                const reB = inputB.re;

                if (reB.isZero()) {
                    if (reA.isZero()) {
                        throw new Error('[MathPlus] mathematical error: 0^0 is undefined.');
                    }
                    return new ComplexNumber([0, 1n, resultAcc]);
                }

                if (reA.isZero()) {
                    if (reB.isNegative()) {
                        throw new Error('[MathPlus] mathematical error: 0 to a negative power is undefined.');
                    }
                    return new ComplexNumber([0, 0n, resultAcc]);
                }

                if (reA.mantissa === 1n && reA.power === 0) {
                    return new ComplexNumber([0, 1n, resultAcc]);
                }

                // --- 路径 1.1: 指数 b 是整数 ---
                if (reB.power >= 0) {
                    // 整数指数使用原生 BigInt 幂或平方-乘快速幂；负指数在末尾取倒数。
                    let isExponentNegative = false;
                    let absB = reB;
                    if (reB.isNegative()) {
                        isExponentNegative = true;
                        absB = MathPlus._oppositeNumber(reB);
                    }

                    const realMantissa = absB.mantissa * (10n ** BigInt(absB.power));

                    const orderOfMagnitude = estimateDigitCount(reA.mantissa, realMantissa);
                    if (orderOfMagnitude >= Number.MAX_SAFE_INTEGER) {
                        if (isExponentNegative) {
                            return new ComplexNumber([0, 0n, resultAcc]);
                        }
                        throw new Error('[MathPlus] mathematical error: Result of power is too large to compute safely.');
                    }

                    let resultMantissa;
                    if (orderOfMagnitude < CalcConfig.CRITICAL_MAGNITUDE_FAST_EXP) {
                        resultMantissa = reA.mantissa ** realMantissa;
                    } else {
                        resultMantissa = fastPow(reA.mantissa, realMantissa);
                    }
                    const resultPower = BigInt(reA.power) * realMantissa;
                    let result = new ComplexNumber(resultMantissa, {
                        pow: Number(resultPower),
                        acc: resultAcc
                    });

                    if (isExponentNegative) {
                        result = MathPlus.divide([0, 1n, resultAcc], result);
                    }
                    return result;
                }

                // --- 路径 1.2: 底数 a > 0, 指数 b 是小数 ---
                if (reA.isPositive()) {
                    // 正底数小数幂采用 a^b = exp(b·ln(a))，平方根走专用牛顿迭代。
                    if (reB.power === -1 && reB.mantissa === 5n) {
                        return MathPlus.sqrt(reA);
                    }
                    return MathPlus.exp(
                        MathPlus.times(MathPlus.ln(reA), reB)
                    );
                }

                // --- 路径 1.3: 底数 a < 0, 指数 b 是小数 ---
                let isExponentNegative = false;
                let absB = reB;
                if (reB.isNegative()) {
                    isExponentNegative = true;
                    absB = MathPlus._oppositeNumber(reB);
                }

                let result = MathPlus.pow(MathPlus._oppositeNumber(inputA), absB);
                // 负底数小数幂按 (-a)^b = |a|^b(cos(bπ)+i·sin(bπ)) 选择实根或主值。
                if (absB.power === -1 && absB.mantissa === 5n) {
                    // 如果 b=0.5 (开平方根), 结果为 i * sqrt(|a|)
                    const zero = new BigNumber([0, 0n, resultAcc]);
                    result = new ComplexNumber([zero, result.re]);
                } else {
                    const mid = Public.integerCorrect(
                        MathPlus.divide([0, 1n, resultAcc], absB)
                    ).re;
                    // 判断是否有实数解
                    if (mid.power === 0 && mid.mantissa % 2n !== 0n) {
                        // 有实数解
                        result = MathPlus._oppositeNumber(result);
                    } else {
                        // 无实数解
                        const angle = MathPlus.times(absB, CalcConfig.constants.pi);
                        const cosAngle = MathPlus.cos(angle);
                        const sinAngle = MathPlus.sin(angle);

                        result = new ComplexNumber([
                            MathPlus.times(result, cosAngle).re,
                            MathPlus.times(result, sinAngle).re
                        ]);
                    }
                }

                if (isExponentNegative) {
                    result = MathPlus.divide([0, 1n, resultAcc], result);
                }
                return result;
            }

            // --- 分支 2: 底数是复数, 指数是纯实数 ---
            if (inputB.onlyReal) {
                // 复底数、实指数：z^b = |z|^b(cos(b·arg z)+i·sin(b·arg z))。
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
            // 通用复数幂由 exp(b·Log(a)) 展开；模为 r^c·e^(-dθ)，辐角为 d·ln(r)+cθ。
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
         * 计算 a 乘以 10 的 b 次方 (a * 10^b)。这常用于处理科学记数法。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被缩放的实数或复数系数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 以 10 为底的缩放指数；必须能
         *   修正为纯实整数，否则无法作为内部十进制 `power` 使用。
         * @returns {ComplexNumber} 代表 a * 10^b 结果的 ComplexNumber 实例。
         * @example
         * // 1.23 * 10³ -> 1230
         * MathPlus.exponential(1.23, 3);
         */
        static exponential(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const acc = Math.min(inputA.acc, inputB.acc);
            return MathPlus.times(
                inputA,
                MathPlus.pow([1, 1n, acc], inputB)
            );
        }

        /**
         * 计算 x 的平方根 (√x)，并返回主值。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 被开方数；非负实数走牛顿迭代，
         *   负实数及一般复数按主辐角返回主平方根，输入零精确返回零。
         * @returns {ComplexNumber} 代表 √x 结果的 ComplexNumber 实例。
         */
        static sqrt(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal) {
                const re = input.re;
                let useAlternative = false;
                let result;

                if (re.isZero()) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                let isBaseNegative = false;
                let absInput = re;
                if (re.isNegative()) {
                    isBaseNegative = true;
                    absInput = MathPlus._oppositeNumber(re);
                }

                // 牛顿迭代 x_(n+1) = (x_n + N/x_n)/2；收敛过慢时回退到 exp(ln(N)/2)。
                // 原生 Math.sqrt 只生成牛顿法初值；后续高精度迭代决定最终有效数字。
                const lowAccuracyRe = new BigNumber(absInput, {acc: 15});
                const numberRe = Number(lowAccuracyRe.mantissa) * (10 ** lowAccuracyRe.power);

                if (!Number.isFinite(numberRe)) {
                    useAlternative = true;
                }

                if (!useAlternative) {
                    result = new ComplexNumber(Math.sqrt(numberRe), {acc: acc});

                    let i = 0;
                    const max = CalcConfig.globalCalcAccuracy + 5;
                    const minPower = -2 * acc - 1;
                    const const_2 = new ComplexNumber([0, 2n, acc]);
                    let difference, mid;

                    // 进行迭代
                    do {
                        mid = result;
                        result = MathPlus.divide(
                            MathPlus.plus(mid, MathPlus.divide(absInput, mid)),
                            const_2
                        );

                        difference = MathPlus.minus(mid, result).re;
                        i++;
                    } while (difference.power > minPower && !difference.isZero() && i < max);

                    if (i === max) {
                        console.warn(`[MathPlus] Square root (${x.toString()}) calculation takes too long.`);
                        useAlternative = true;
                    }
                }

                // 如果牛顿法收敛过慢，则使用 ln/exp 方法作为备用。
                // 公式: √x = x^0.5 = e^(0.5 * ln(x))
                if (useAlternative) {
                    result = MathPlus.exp(
                        MathPlus.times(MathPlus.ln(absInput), new ComplexNumber([-1, 5n, acc]))
                    );
                }

                if (isBaseNegative) {
                    return new ComplexNumber([[0, 0n, acc], result.re]);
                }
                return result;
            }

            return MathPlus.pow(input, [-1, 5n, acc]);
        }

        /**
         * 计算主立方根；实数使用牛顿迭代，复数使用幂运算。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 被开方数；纯实数返回保持实数符号的
         *   实立方根，一般复数返回主立方根，二者在负实数上的分支约定不同。
         * @returns {ComplexNumber} 主立方根。
         */
        static cbrt(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal) {
                const re = input.re;
                let useAlternative = false;
                let result;

                if (re.isZero()) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                // 原生 Math.cbrt 只生成牛顿法初值；后续运算仍全部使用高精度类型。
                const lowAccuracyRe = new BigNumber(re, {acc: 15});
                const numberRe = Number(lowAccuracyRe.mantissa) * (10 ** lowAccuracyRe.power);

                if (!Number.isFinite(numberRe)) {
                    useAlternative = true;
                }

                if (!useAlternative) {
                    result = new ComplexNumber(Math.cbrt(numberRe), {acc: acc});

                    // 立方根的牛顿迭代：x_(n+1) = (2x_n + N/x_n²)/3。
                    let i = 0;
                    const max = CalcConfig.globalCalcAccuracy + 5;
                    const minPower = -2 * acc - 1;
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

                        difference = MathPlus.minus(mid, result).re;
                        i++;
                    } while (difference.power > minPower && !difference.isZero() && i < max);

                    if (i === max) {
                        console.warn(`[MathPlus] Cube root (${x.toString()}) calculation takes too long.`);
                        useAlternative = true;
                    }
                }

                // 如果迭代法收敛过慢，则使用 pow(x, 1/3) 作为备用方法。
                if (useAlternative) {
                    return MathPlus.pow(re, MathPlus.divide([0, 1n, acc], [0, 3n, acc]));
                }

                return result;
            }

            return MathPlus.pow(input, MathPlus.divide([0, 1n, acc], [0, 3n, acc]));
        }

        /**
         * 计算 a 的 b 次方根 (ᵇ√a)。
         * - 该方法通过计算 a 的 1/b 次方来实现，即 `a^(1/b)`。
         * - 它能够自动处理实数和复数作为底数和根指数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 被开方数；可为实数或复数，
         *   方法只返回由 `a ** (1 / b)` 确定的一个主值，不枚举全部复根。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 非零根指数；可为复数，
         *   但零会使倒数不存在。需要全部正整数次根时应使用 `RadicalFunctionTools`。
         * @returns {ComplexNumber} 代表 a 的 b 次方根主值的结果。
         */
        static nroot(a, b) {
            const inputA = new ComplexNumber(a);
            const inputB = new ComplexNumber(b);
            const acc = Math.min(inputA.acc, inputB.acc);
            const oneOverB = MathPlus.divide([0, 1n, acc], inputB);
            return MathPlus.pow(inputA, oneOverB);
        }

        /**
         * 计算 e 的 x 次方 (e^x)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数指数；实部控制模长、
         *   虚部控制旋转。过大的实部可能触发结果规模保护，迭代精度取自输入计算上下文。
         * @returns {ComplexNumber} 代表 e^x 结果的 ComplexNumber 实例。
         * @throws {Error} 如果泰勒级数未能收敛。
         */
        static exp(x) {
            const input = new ComplexNumber(x);

            if (input.onlyReal) {
                const re = input.re;
                const acc = re.acc;

                if (re.isZero()) {
                    return new ComplexNumber([0, 1n, acc]);
                }

                if (re.power >= 0) {
                    return MathPlus.pow(CalcConfig.constants.e, input);
                }

                // 将 x 拆为整数和小数部分：e^x = e^floor(x) · e^(x-floor(x))。
                let resultMid, iterationMantissa;
                const pow = -re.power;
                if (re.acc < pow) {
                    resultMid = new ComplexNumber([0, 1n, acc]);
                    iterationMantissa = re.mantissa;
                } else {
                    const realPower = 10n ** BigInt(-re.power);
                    const intPart = re.mantissa / realPower;
                    resultMid = MathPlus.pow(new BigNumber(CalcConfig.constants.e), intPart);
                    iterationMantissa = re.mantissa - intPart * realPower;
                }

                // 先计算更小参数的泰勒级数 e^t = Σ(t^n/n!)，随后取十次幂还原小数部分。
                const iteration = new ComplexNumber([re.power - 1, iterationMantissa, acc]);

                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1;

                let mid = new ComplexNumber([0, 1n, acc]);
                let result = new ComplexNumber([0, 0n, acc]);
                let i = 1;

                for (; mid.re.power > minPower && !mid.isZero() && i < max; i++) {
                    result = MathPlus.plus(result, mid);
                    mid = MathPlus.divide(
                        MathPlus.times(iteration, mid),
                        i
                    );
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: exp. Input: ${input.toString()}`);
                }

                // 组合最终结果：e^x = e^i * e^f
                return MathPlus.times(
                    MathPlus.pow(result, [1, 1n, acc]),
                    resultMid
                );
            }

            const module = MathPlus.exp(input.re);

            // 欧拉公式：e^(a+bi) = e^a(cos b + i·sin b)。
            const cosAngle = MathPlus.cos(input.im);
            const sinAngle = MathPlus.sin(input.im);

            return new ComplexNumber([
                MathPlus.times(module, cosAngle).re,
                MathPlus.times(module, sinAngle).re
            ]);
        }

        /**
         * 计算 x 的自然对数 (ln(x))。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 非零实数或复数；正实数返回实对数，
         *   负实数与一般复数按主辐角返回主值，零因对数发散而抛错。
         * @returns {ComplexNumber} 代表 ln(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果输入为 0，或者内部计算未能收敛。
         */
        static ln(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal && !input.re.isNegative()) {
                const re = input.re;

                if (re.isZero()) {
                    throw new Error('[MathPlus] mathematical error: ln(0) is undefined.');
                }
                if (re.power === 0 && re.mantissa === 1n) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                // 先用 10 和 1.2 缩放到 0.9～1.1，再计算 y=(x-1)/(x+1)。
                // ln(x) = 2·(y + y³/3 + y⁵/5 + ...)，最后补回缩放产生的 ln(10) 与 ln(1.2)。
                // 将 x 标准化到 (0, 1] 范围内
                const mantissaLen = re.mantissa.toString().length;
                const mantissaChangedBy10 = mantissaLen + re.power;
                let mid = new ComplexNumber([re.power - mantissaChangedBy10, re.mantissa, acc]);

                // 将 x 进一步标准化到 [0.9, 1.1) 范围内
                const const_1_2 = new ComplexNumber([-1, 12n, acc]);
                const const_1_1 = new ComplexNumber([-1, 11n, acc]);
                const const_0_9 = new ComplexNumber([-1, 9n, acc]);
                let mantissaChangedBy1_2 = 0;
                let j = 0;
                for (; !(MathPlus.minus(mid, const_1_1).re.isNegative() && MathPlus.minus(mid, const_0_9).re.isPositive()) && j < 14; j++) {
                    mid = MathPlus.times(mid, const_1_2);
                    mantissaChangedBy1_2 -= 1;
                }

                if (j === 14) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: ln. Input: ${input.toString()}`);
                }

                mid = MathPlus.plus(
                    [0, 1n, acc],
                    MathPlus.divide(
                        [0, -2n, acc],
                        MathPlus.plus([0, 1n, acc], mid)
                    )
                );

                const squareOfMid = MathPlus.times(mid, mid);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1;

                let result = new ComplexNumber([0, 0n, acc]);
                let i = 1;

                for (; mid.re.power > minPower && !mid.isZero() && i < max; i += 2) {
                    result = MathPlus.plus(result, mid);
                    mid = MathPlus.times(
                        MathPlus.times(squareOfMid, mid),
                        MathPlus.divide(i, i + 2)
                    );
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: ln. Input: ${input.toString()}`);
                }

                // 组合所有部分得到最终结果
                result = MathPlus.times([0, 2n, acc], result);
                result = MathPlus.plus(result, MathPlus.times(CalcConfig.constants.ln_10, mantissaChangedBy10));
                result = MathPlus.plus(result, MathPlus.times(CalcConfig.constants.ln_1_2, mantissaChangedBy1_2));

                return result;
            }

            // 复对数主值：Log(z) = ln|z| + i·arg(z)。
            const absValue = MathPlus.abs(input);
            const lnAbsValue = MathPlus.ln(absValue);
            const argValue = MathPlus.arg(input);
            return new ComplexNumber([lnAbsValue.re, argValue.re]);
        }

        /**
         * 计算 x 的常用对数（以 10 为底的对数，log₁₀(x)）。
         * - 该方法基于对数换底公式：lg(x) = ln(x) / ln(10)。
         * - 它能够自动处理实数和复数输入，因为其依赖的 `ln` 和 `divide` 方法已经具备此能力。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 非零实数或复数；按
         *   `ln(x) / ln(10)` 返回主值，因此负实数的结果包含由主辐角产生的虚部。
         * @returns {ComplexNumber} 代表 lg(x) 结果的 ComplexNumber 实例。
         */
        static lg(x) {
            return MathPlus.divide(MathPlus.ln(x), CalcConfig.constants.ln_10);
        }

        /**
         * 计算以 a 为底，b 的对数 (logₐ(b))。
         * - 该方法基于对数换底公式：logₐ(b) = ln(b) / ln(a)。
         * - 它能够自动处理实数和复数作为底数和真数。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} a - 非零且不为一的对数底；允许复数，
         *   因此结果遵循主复对数的换底分支，而不局限于实数对数域。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} b - 非零真数；允许负实数或复数，
         *   这类输入返回复数主值，零会在计算 `ln(b)` 时抛错。
         * @returns {ComplexNumber} 代表 logₐ(b) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果 a=1，或者 a,b 的某些组合导致 ln(a) 或 ln(b) 未定义（例如 ln(0)）。
         */
        static log(a, b) {
            const lnA = Public.zeroCorrect(MathPlus.ln(a));
            return MathPlus.divide(MathPlus.ln(b), lnA);
        }

        /**
         * 计算一个数的正弦。
         * - 该方法能够处理实数和复数输入，并返回主值。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 以弧度表示的实数或复数角；
         *   实数先按周期与象限归约以保持精度，复数按指数恒等式计算。
         * @returns {ComplexNumber} 代表 sin(x) 结果的 ComplexNumber 实例。
         */
        static sin(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal) {
                // 将实数参数归约到 [0, π/4]，再用三倍角继续缩减。
                let [re, sign] = MathPlus._toLessThanHalfPi(input.re, 'sin');

                if (re.isZero()) {
                    return new ComplexNumber([0, 0n, acc]);
                }

                let divideBy3 = 0;
                // 继续除以 3 可加快级数收敛，计算后用 sin(3x)=3sin(x)-4sin³(x) 逐层还原。
                for (; !MathPlus.plus(re, [-1, -1n, acc]).re.isNegative() && divideBy3 < 4; divideBy3++) {
                    re = MathPlus.divide(re, [0, 3n, acc]).re;
                }
                if (divideBy3 === 4) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: sin. Input: ${input.toString()}`);
                }

                const squareOfRe = MathPlus.times(re, re);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1;
                let mid = new ComplexNumber(re);
                let result = mid;
                let i = 1;

                // sin(x)=x-x³/3!+x⁵/5!-...，相邻项递推可避免重复计算幂和阶乘。
                for (; mid.re.power > minPower && !mid.isZero() && i < max; i++) {
                    mid = MathPlus.divide(
                        MathPlus.times(mid, squareOfRe),
                        2 * i * (2 * i + 1)
                    );
                    result = MathPlus[i % 2 === 0 ? 'plus' : 'minus'](result, mid);
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: cos. Input: ${input.toString()}`);
                }

                // 反复应用三倍角公式 sin(3x) = 3sin(x) - 4sin³(x) 来还原结果
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

                return new ComplexNumber([result.re.power, sign * result.re.mantissa, acc]);
            }

            // --- 输入为复数 ---
            // sin(z) = (e^(iz) - e^(-iz)) / (2i)
            const mid = MathPlus.exp([MathPlus._oppositeNumber(input.im), input.re]);
            return MathPlus.divide(
                MathPlus.minus(mid, MathPlus.divide([0, 1n, acc], mid)),
                new ComplexNumber([0n, 2n], {acc: acc})
            );
        }

        /**
         * 计算 x 的反正弦。
         * - 该函数能够处理实数和复数输入，并返回主值。
         * - 对于实数 `x` 且 `|x| <= 1`，使用 `arcsin(x) = arg(sqrt(1 - x²) + ix)` 计算，数值稳定性好。
         * - 对于实数 `x` 且 `|x| > 1`，结果为复数，使用基于对数的恒等式计算。
         * - 对于复数 `z`，使用通用公式 `arcsin(z) = -i * ln(iz + sqrt(1 - z²))`。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；实数区间
         *   `[-1, 1]` 返回 `[-π/2, π/2]` 内主值，区间外以及复数输入按主对数分支返回复数。
         * @returns {ComplexNumber} 代表 arcsin(x) 结果的 ComplexNumber 实例。
         */
        static arcsin(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal) {
                const re = input.re;
                const one = new ComplexNumber([0, 1n, acc]);
                const absInput = MathPlus.abs(input);

                // 使用恒等式 arcsin(x) = arg(sqrt(1 - x²) + ix)
                // 该恒等式在 x 接近 ±1 时比泰勒级数稳定。
                if (!MathPlus.minus(absInput, one).re.isPositive()) {
                    return MathPlus.arg([
                        MathPlus.sqrt(MathPlus.minus(one, MathPlus.times(re, re))).re,
                        re
                    ]);
                }

                const term = MathPlus.sqrt(MathPlus.minus(MathPlus.times(re, re), one));
                const piOver2 = MathPlus.divide(CalcConfig.constants.pi, [0, 2n, acc]);

                if (re.isPositive()) { // x > 1
                    // arcsin(x) = π/2 - i * ln(x + sqrt(x² - 1))
                    const lnTerm = MathPlus.ln(MathPlus.plus(re, term));
                    return new ComplexNumber([
                        piOver2.re,
                        MathPlus._oppositeNumber(lnTerm).re
                    ]);
                } else { // x < -1
                    // arcsin(x) = -π/2 + i * ln(-x + sqrt(x² - 1))
                    const lnTerm = MathPlus.ln(MathPlus.plus(MathPlus._oppositeNumber(re), term));
                    return new ComplexNumber([
                        MathPlus._oppositeNumber(piOver2).re,
                        lnTerm.re
                    ]);
                }
            }

            // --- 输入为复数 ---
            // 使用公式: arcsin(z) = -i * ln(iz + sqrt(1 - z²))
            const i = new ComplexNumber([[0, 0n, acc], [0, 1n, acc]]);
            const negI = new ComplexNumber([[0, 0n, acc], [0, -1n, acc]]);
            const one = new ComplexNumber([0, 1n, acc]);

            return MathPlus.times(
                negI,
                MathPlus.ln(MathPlus.plus(
                    MathPlus.times(i, input),
                    MathPlus.sqrt(MathPlus.minus(one, MathPlus.times(input, input)))
                ))
            );
        }

        /**
         * 计算 x 的余弦。
         * - 对于实数，使用范围缩减和泰勒级数进行高精度计算，并返回主值。
         * - 对于复数 z，使用欧拉公式 cos(z) = (e^(iz) + e^(-iz)) / 2 进行计算。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 以弧度表示的实数或复数角；
         *   实数使用范围缩减，复数使用欧拉公式，输入精度决定级数停止阈值。
         * @returns {ComplexNumber} 代表 cos(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果内部计算未能收敛。
         */
        static cos(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal) {
                // 将实数参数归约到 [0, π/4]，再用四倍角继续缩减。
                let [re, sign] = MathPlus._toLessThanHalfPi(input.re, 'cos');

                if (re.isZero()) {
                    return new ComplexNumber([0, sign, acc]);
                }

                let divideBy4 = 0;
                // 继续除以 4 可加快级数收敛，计算后用 cos(4x)=8cos⁴(x)-8cos²(x)+1 还原。
                for (; !MathPlus.plus(re, [-1, -1n, acc]).re.isNegative() && divideBy4 < 3; divideBy4++) {
                    re = MathPlus.divide(re, [0, 4n, acc]).re;
                }
                if (divideBy4 === 3) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: cos. Input: ${input.toString()}`);
                }

                const squareOfRe = MathPlus.times(re, re);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1;
                let mid = new ComplexNumber([0, 1n, acc]);
                let result = new ComplexNumber([0, 0n, acc]);
                let i = 0;

                // cos(x)=1-x²/2!+x⁴/4!-...，使用相邻项递推累计。
                for (; mid.re.power > minPower && !mid.isZero() && i < max; i++) {
                    result = MathPlus[i % 2 === 0 ? 'plus' : 'minus'](result, mid);
                    mid = MathPlus.divide(
                        MathPlus.times(mid, squareOfRe),
                        (2 * i + 1) * (2 * i + 2)
                    );
                }

                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: cos. Input: ${input.toString()}`);
                }

                // 反复应用四倍角公式还原原始结果
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

                return new ComplexNumber([result.re.power, sign * result.re.mantissa, acc]);
            }

            // --- 输入为复数 ---
            // cos(z) = (e^(iz) + e^(-iz)) / 2
            const mid = MathPlus.exp([MathPlus._oppositeNumber(input.im), input.re]);
            return MathPlus.divide(
                MathPlus.plus(mid, MathPlus.divide([0, 1n, acc], mid)),
                [0, 2n, acc]
            );
        }

        /**
         * 计算 x 的反余弦。
         * - 该方法利用了核心三角恒等式 arccos(x) = π/2 - arcsin(x)，并返回主值。
         * - 它将计算完全委托给已经实现且功能完备的 `arcsin` 方法，
         * 这种方式不仅代码简洁，而且能自动继承 `arcsin` 对实数和复数输入的处理能力。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；返回满足主值约定的
         *   `π/2 - arcsin(x)`，实数 `[-1, 1]` 的结果位于 `[0, π]`。
         * @returns {ComplexNumber} 代表 arccos(x) 结果的 ComplexNumber 实例。
         */
        static arccos(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            return MathPlus.minus(
                MathPlus.divide(CalcConfig.constants.pi, [0, 2n, acc]),
                MathPlus.arcsin(input)
            );
        }

        /**
         * 计算 x 的正切。
         * - 该方法通过基本三角恒等式 tan(x) = sin(x) / cos(x) 进行计算，并返回主值。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 以弧度表示的实数或复数角；
         *   通过 `sin(x) / cos(x)` 计算，余弦为零或数值修正后为零时函数未定义。
         * @returns {ComplexNumber} 代表 tan(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果 cos(x) 为 0（此时 tan(x) 在数学上是未定义的），
         * 底层的 `divide` 方法将抛出一个“除以零”的错误。
         */
        static tan(x) {
            const input = new ComplexNumber(x);
            const cosAngle = Public.zeroCorrect(MathPlus.cos(input));
            const sinAngle = MathPlus.sin(input);

            return MathPlus.divide(sinAngle, cosAngle);
        }

        /**
         * 计算 x 的反正切；实数经范围缩减后使用泰勒级数，复数使用对数恒等式。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；实数通过倒数和倍角
         *   归约到稳定区间，复数按主对数恒等式返回主反正切值。
         * @returns {ComplexNumber} arctan(x)。
         * @throws {Error} 迭代未收敛时抛出。
         */
        static arctan(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal) {
                let re = input.re;
                let isNegative = false;

                if (re.isNegative()) {
                    re = MathPlus._oppositeNumber(re);
                    isNegative = true;
                }

                // x > 1 时使用 arctan(x)=π/2-arctan(1/x)。
                let reciprocal = false;
                if (MathPlus.plus(re, [0, -1n, acc]).re.isPositive()) {
                    re = MathPlus.divide([0, 1n, acc], re).re;
                    reciprocal = true;
                }

                // 反复使用 tan(θ/2)=tanθ/(1+sqrt(1+tan²θ))，把参数缩减到 0.1 以内。
                let j = 0;
                for (; MathPlus.plus(re, [-1, -1n, acc]).re.isPositive() && j < 4; j++) {
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

                let [mid, mid_pow] = [re, re];
                const squareOfRe = MathPlus.times(re, re);
                const max = CalcConfig.globalCalcAccuracy + 5;
                const minPower = -2 * acc - 1;
                let result = new ComplexNumber([0, 0n, acc]);
                let i = 0;

                // arctan(x)=x-x³/3+x⁵/5-...；级数结果乘 2^j 后还原半角缩减。
                for (; mid.power > minPower && !mid.isZero() && i < max; i++) {
                    result = MathPlus[i % 2 === 0 ? 'plus' : 'minus'](result, mid);

                    mid_pow = MathPlus.times(mid_pow, squareOfRe);
                    mid = MathPlus.divide(
                        mid_pow,
                        2 * i + 3
                    ).re;
                }
                if (i === max) {
                    throw new Error(`[MathPlus] mathematical error: Unreliable result, error source: arctan. Input: ${input.toString()}`);
                }

                // 将级数结果乘以 2^j 来补偿半角公式的应用。
                result = MathPlus.times([0, 2n ** BigInt(j), acc], result);

                // 如果初始 x > 1，应用 arctan(x) = π/2 - arctan(1/x)。
                result = reciprocal ? MathPlus.minus(MathPlus.divide(CalcConfig.constants.pi, [0, 2n, acc]), result) : result;
                // 如果初始 x < 0，应用 arctan(-x) = -arctan(x)。
                if (isNegative) {
                    return MathPlus._oppositeNumber(result);
                }
                return result;
            }

            // --- 输入为复数 ---
            // arctan(z) = (-i/2) * ln((1 + iz) / (1 - iz))
            const mid = MathPlus.minus(
                [[0, 0n, acc], [0, 1n, acc]],
                input
            );
            const mid_pow = MathPlus.plus(
                [[0, 0n, acc], [0, 1n, acc]],
                input
            );

            if (mid.isZero() || mid_pow.isZero()) {
                throw new Error(`[MathPlus] mathematical error: Unable to calculate arctan, input cannot be ${input.toString()}.`);
            }

            return MathPlus.times(
                [[0, 0n, acc], [-1, -5n, acc]],
                MathPlus.ln(
                    MathPlus.divide(mid, mid_pow)
                )
            );
        }

        /**
         * 计算 x 的双曲正弦。
         * - 该方法基于双曲正弦的指数定义：sinh(x) = (e^x - e^-x) / 2。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数自变量；按
         *   `(exp(x) - exp(-x)) / 2` 计算，较大实部可能触发指数结果规模保护。
         * @returns {ComplexNumber} 代表 sinh(x) 结果的 ComplexNumber 实例。
         */
        static sh(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;
            const mid = MathPlus.exp(input);

            return MathPlus.divide(
                MathPlus.minus(mid, MathPlus.divide([0, 1n, acc], mid)),
                [0, 2n, acc]
            );
        }

        /**
         * 计算 x 的反双曲正弦。
         * - 该方法基于反双曲正弦的对数定义：arsinh(x) = ln(x + sqrt(x² + 1))。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；按
         *   `ln(x + sqrt(x² + 1))` 的主分支计算，实数输入始终得到实数结果。
         * @returns {ComplexNumber} 代表 arsinh(x) 结果的 ComplexNumber 实例。
         */
        static arsh(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            return MathPlus.ln(
                MathPlus.plus(
                    input,
                    MathPlus.sqrt(
                        MathPlus.plus(MathPlus.times(input, input), [0, 1n, acc])
                    )
                )
            );
        }

        /**
         * 计算 x 的双曲余弦。
         * - 该方法基于双曲余弦的指数定义：cosh(x) = (e^x + e^-x) / 2。
         * - 能够自动处理实数和复数输入。
         * @alias cosh
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数自变量；按
         *   `(exp(x) + exp(-x)) / 2` 计算，结果遵循复指数的周期性。
         * @returns {ComplexNumber} 代表 cosh(x) 结果的 ComplexNumber 实例。
         */
        static ch(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;
            const mid = MathPlus.exp(input);

            return MathPlus.divide(
                MathPlus.plus(mid, MathPlus.divide([0, 1n, acc], mid)),
                [0, 2n, acc]
            );
        }

        /**
         * 计算 x 的反双曲余弦。
         * @alias arcosh - 该方法基于反双曲余弦的对数定义：arcosh(x) = ln(x + sqrt(x² - 1))。
         * - 能够自动处理实数和复数输入。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；返回
         *   `ln(x + sqrt(x² - 1))` 的主值。实数 `x >= 1` 时结果为非负实数，其他实数可得到复数。
         * @returns {ComplexNumber} 代表 arcosh(x) 结果的 ComplexNumber 实例。
         */
        static arch(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            return MathPlus.ln(
                MathPlus.plus(
                    input,
                    MathPlus.sqrt(
                        MathPlus.plus(MathPlus.times(input, input), [0, -1n, acc])
                    )
                )
            );
        }

        /**
         * 计算双曲正切。
         * tanh(x) = (e^(2x) - 1) / (e^(2x) + 1)。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数自变量；通过
         *   `sinh(x) / cosh(x)` 计算，分母为零的复数点会被拒绝。
         * @returns {ComplexNumber} tanh(x)。
         * @alias tanh
         */
        static th(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            const mid = MathPlus.exp(MathPlus.times([0, 2n, acc], input));
            return MathPlus.divide(
                MathPlus.plus(mid, [0, -1n, acc]),
                Public.zeroCorrect(MathPlus.plus(mid, [0, 1n, acc]))
            );
        }

        /**
         * 计算反双曲正切。
         *
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；按
         *   `ln((1+x)/(1-x))/2` 返回主值，实数 `x = ±1` 为奇点，`|x| > 1` 返回复数。
         * @returns {ComplexNumber} artanh(x)。
         * @alias artanh
         */
        static arth(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;
            const one = new ComplexNumber([0, 1n, acc]);

            return MathPlus.divide(
                MathPlus.ln(
                    MathPlus.divide(
                        MathPlus.plus(one, input),
                        Public.zeroCorrect(MathPlus.minus(one, input))
                    )
                ),
                [0, 2n, acc]
            );
        }

        /**
         * 计算一个数的阶乘 (x!)。
         * - 对于非负整数 n, n! = 1 * 2 * ... * n，并返回主值。
         * - 对于非整数、负数和复数，此函数计算伽玛函数 Γ(x + 1)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 阶乘参数；非负整数走精确的
         *   BigInt 分治乘积，其他非极点值通过 `Γ(x + 1)` 延拓，负整数因伽玛极点而拒绝。
         * @returns {ComplexNumber} 代表 x! 结果的 ComplexNumber 实例。
         * @throws {Error} 如果输入为负整数，因为其阶乘未定义。
         */
        static fact(x) {
            /**
             * 使用分治法（二分求积）高效计算一个非负整数的阶乘。
             * 这种方法对于计算极大的数（如 1000! 或更高）有显著的性能优势。
             *
             * @param {bigint|number} num - 要精确求阶乘的非负整数；`number` 必须是安全整数并会转换为
             *   BigInt，负数、小数、非有限值和不安全整数均不进入递归乘积。
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
                 * @param {bigint} start - 闭区间起点；递归入口保证非负且不大于 `end`。
                 * @param {bigint} end - 闭区间终点；区间按中点二分，单元素区间直接返回该整数。
                 * @returns {bigint} 从 start 到 end 的所有整数的乘积。
                 */
                function rangeProduct(start, end) {
                    if (start > end) {
                        return 1n;
                    }
                    if (start === end) {
                        return start;
                    }

                    // 当范围很小时，直接计算，避免过多递归开销
                    if (end - start < 13n) {
                        let res = 1n;
                        for (let i = start; i <= end; i++) {
                            res *= i;
                        }
                        return res;
                    }
                    if (end - start > 99999999n) {
                        throw new Error('[MathPlus] mathematical error: The factorial exceeds the range limit.');
                    }

                    // 分治
                    const mid = start + (end - start) / 2n;
                    const leftProduct = rangeProduct(start, mid);
                    const rightProduct = rangeProduct(mid + 1n, end);

                    return leftProduct * rightProduct;
                }

                return rangeProduct(1n, num);
            }

            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.onlyReal && input.re.power >= 0) {
                const re = input.re;

                if (re.isNegative()) {
                    throw new Error('[MathPlus] mathematical error: Negative integer factorial undefined.');
                }

                const realNumber = re.mantissa * (10n ** BigInt(re.power));
                return new ComplexNumber(factorialOptimized(realNumber), {
                    acc: acc
                });
            }

            // 非整数、负数和复数阶乘使用兰佐斯近似计算 Γ(x+1)。
            let option;
            // 按目标精度选择最小够用的 Lanczos 系数集，避免无谓的大精度运算。
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

            let calcNum = new ComplexNumber(input, {
                acc: calcAcc
            });

            // 先在正半平面计算，再由 Γ(z)Γ(1-z)=π/sin(πz) 反射回原参数。
            let reflection = false;
            if (calcNum.re.isNegative()) {
                calcNum = MathPlus._oppositeNumber(calcNum);
                reflection = true;
            }

            let mid = p[0];
            // Lanczos 级数 A_g(z)=p0+Σ(pk/(z+k))。
            for (let i = 1; i < p.length; i++) {
                mid = MathPlus.plus(
                    mid,
                    MathPlus.divide(p[i], MathPlus.plus(calcNum, new ComplexNumber(i, {
                        acc: calcAcc
                    })))
                );
            }

            // 应用完整的兰佐斯公式。
            // Γ(z+1) = sqrt(2π) * (z + g + 1/2)^(z + 1/2) * e^-(z + g + 1/2) * A(z)
            // 这里已经将 sqrt(2π) 因子包含在了系数 p 中。
            let result = mid;
            mid = MathPlus.plus(calcNum, [-1, 5n, acc]);
            result = MathPlus.times(
                result,
                MathPlus.pow(
                    MathPlus.divide(MathPlus.plus(mid, g), CalcConfig.constants.e),
                    mid
                )
            );

            // 如果需要，应用反射公式来获得最终结果。
            if (reflection) {
                mid = MathPlus.times(input, CalcConfig.constants.pi);
                result = MathPlus.divide(
                    mid,
                    MathPlus.times(MathPlus.sin(mid), result)
                );
            }

            return new ComplexNumber(result, {
                acc: acc
            });
        }

        /**
         * 计算 x 的伽玛函数 (Γ(x))。
         * - 伽玛函数是阶乘函数向复数和实数的推广，并返回主值。
         * - 该实现利用了核心关系 Γ(x) = (x-1)!。
         * - 它将计算委托给库中已经实现的、能够处理复数和非整数的 `fact` 方法。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 伽玛函数参数；允许一般复数，
         *   但零和负整数是极点。实部较小时通过反射/递推移入 Lanczos 近似的稳定区域。
         * @returns {ComplexNumber} 代表 Γ(x) 结果的 ComplexNumber 实例。
         * @throws {Error} 如果输入为 0 或负整数，此时伽玛函数未定义。
         */
        static gamma(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            return MathPlus.fact(MathPlus.plus(input, [0, -1n, acc]));
        }

        /**
         * 计算一个数的向下取整 (floor)。
         * - 对于实数 x，返回不大于 x 的最大整数。
         * - 对于复数 a + bi，返回 floor(a) + floor(b)i。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 要向负无穷方向取整的值；
         *   仅定义于纯实数，复数的非零虚部会被拒绝，整数输入保持不变。
         * @returns {ComplexNumber} 代表向下取整结果的 ComplexNumber 实例。
         */
        static floor(x) {
            const input = new ComplexNumber(x);

            if (input.onlyReal) {
                const re = input.re;
                const acc = re.acc;

                if (re.power >= 0) {
                    return input;
                }

                const pow = -re.power;
                let result = re.acc < pow ? 0n : re.mantissa / (10n ** BigInt(pow));

                // 根据 floor 函数的定义调整结果。
                // - 对于正数，floor(x) 等于 trunc(x)。
                // - 对于负数，如果存在小数部分，floor(x) = trunc(x) - 1。
                if (result < 0n || (result === 0n && re.isNegative())) {
                    result -= 1n;
                }
                return new ComplexNumber(result, {acc: acc});
            }

            return new ComplexNumber([
                MathPlus.floor(input.re).re,
                MathPlus.floor(input.im).re
            ]);
        }

        /**
         * 计算一个数的向上取整 (ceiling)。
         * - 对于实数 x，返回不小于 x 的最小整数。
         * - 对于复数 a + bi，遵循分部计算的原则，返回 ceil(a) + ceil(b)i。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 要向正无穷方向取整的值；
         *   仅定义于纯实数，复数的非零虚部会被拒绝，整数输入保持不变。
         * @returns {ComplexNumber} 代表向上取整结果的 ComplexNumber 实例。
         */
        static ceil(x) {
            const input = new ComplexNumber(x);

            if (input.onlyReal) {
                const re = input.re;
                const acc = re.acc;

                if (re.power >= 0) {
                    return input;
                }

                const pow = -re.power;
                let result = re.acc < pow ? 0n : re.mantissa / (10n ** BigInt(pow));

                if (result > 0n || (result === 0n && re.isPositive())) {
                    result += 1n;
                }
                return new ComplexNumber(result, {acc: acc});
            }

            return new ComplexNumber([
                MathPlus.ceil(input.re).re,
                MathPlus.ceil(input.im).re
            ]);
        }

        /**
         * 计算一个数的绝对值（或模）。
         * - 对于实数 x, |x| 是其到 0 的距离。
         * - 对于复数 z = a + bi, |z| 是其在复平面上到原点的距离，即 sqrt(a² + b²)。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；实数返回通常的
         *   非负绝对值，复数返回 `sqrt(re² + im²)` 的非负实数模。
         * @returns {ComplexNumber} 一个纯实数的 ComplexNumber 实例，代表输入值的绝对值。
         */
        static abs(x) {
            const input = new ComplexNumber(x);
            const re = input.re, im = input.im;

            if (input.onlyReal) {
                return re.isNegative() ? new ComplexNumber(MathPlus._oppositeNumber(re)) : input;
            }

            if (input.re.isZero()) {
                return im.isNegative() ? new ComplexNumber(MathPlus._oppositeNumber(im)) : new ComplexNumber(im);
            }

            return MathPlus.sqrt(MathPlus.plus(MathPlus.times(re, re), MathPlus.times(im, im)));
        }

        /**
         * 计算一个数的符号函数 (signum function)。
         * - 对于实数 x：如果 x>0, 返回 1; 如果 x<0, 返回 -1; 如果 x=0, 返回 0。
         * - 对于复数 z (z≠0): 返回 z / |z|，这是一个模为 1 的复数，指向 z 的方向。
         * - 对于复数 z=0: 返回 0。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 实数或复数；零返回零，非零值
         *   返回单位方向 `x / abs(x)`，因此复数结果位于单位圆而不只是 `±1`。
         * @returns {ComplexNumber} 代表 sgn(x) 结果的 ComplexNumber 实例。
         */
        static sgn(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            if (input.isZero()) {
                return new ComplexNumber([0, 0n, acc]);
            }

            if (input.onlyReal) {
                const result = input.re.isPositive() ? [0, 1n, acc] : [0, -1n, acc];
                return new ComplexNumber(result);
            }
            if (input.re.isZero()) {
                const result = input.im.isPositive() ? [0, 1n, acc] : [0, -1n, acc];
                return new ComplexNumber([[0, 0n, acc], result]);
            }
            return MathPlus.divide(input, MathPlus.abs(input));
        }

        /**
         * 将角度从度 (degree) 转换为弧度 (radian)。
         * - 计算公式为：radians = degrees * π / 180。
         * @param {string|number|bigint|BigNumber|ComplexNumber|Array} x - 以角度制表示的实数或复数值；
         *   通过乘以 `π / 180` 转为弧度，返回值精度受输入与圆周率常量共同限制。
         * @returns {ComplexNumber} 代表转换后弧度值的 ComplexNumber 实例。
         */
        static degree(x) {
            const input = new ComplexNumber(x);
            const acc = input.acc;

            return MathPlus.times(
                MathPlus.divide(input, [1, 18n, acc]),
                CalcConfig.constants.pi
            );
        }

        /**
         * 使用调度场算法解析并计算高精度实数或复数表达式。
         *
         * @param {string|number|bigint|ComplexNumber|BigNumber} expr - 要解析的内部数学表达式；非字符串数值
         *   会先转换为等价词元。表达式可包含 `[x]`、`[f]`、`[g]` 以及 `TokenConfig` 注册的函数。
         * @param {object} [options={}] - 本次解析上下文；仅在递归求值中传递，不修改全局函数定义。
         * @param {string|number|bigint|ComplexNumber|BigNumber} [options.unknown] - 代入 `[x]` 的值；
         *   表达式实际引用 `[x]` 而该项缺失时会按未定义变量处理。
         * @param {string} [options.f] - `[f]` 的函数体，可包含 `[x]` 并调用 `[g]`；只提供 `g` 时
         *   `[f]` 仍保持未定义。
         * @param {string} [options.g] - `[g]` 的函数体，可包含 `[x]` 并调用 `[f]`；与 `f` 一同传入时
         *   支持有限的相互引用，由解析器负责检测非法递归路径。
         * @param {'calc'|'syntaxCheck'} [options.mode='calc'] - `calc` 执行运算并返回数值；`syntaxCheck`
         *   只验证和规范化表达式，不应依赖其数值结果。
         * @param {number} [options.acc=CalcConfig.globalCalcAccuracy] - 本次解析及所有嵌套运算使用的正整数
         *   有效位数；不会改写 `CalcConfig.globalCalcAccuracy`。
         * @returns {[ComplexNumber, string]} 二元组：第 0 项是表达式值；`syntaxCheck` 模式下为指定精度
         *   的零占位，不能当作真实计算结果。第 1 项是解析器补全隐式结构后的内部表达式字符串。
         * @throws {Error} 语法、词元或计算无效时抛出。
         */
        static calc(expr, {unknown, f, g, mode = 'calc', acc = CalcConfig.globalCalcAccuracy} = {}) {
            /**
             * (内部辅助函数) 检查一个字符串数组中是否至少有一个元素包含指定的子字符串。
             *
             * @private
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
             * (内部辅助函数) 将一个词法单元（token）转换为其内部表示或可执行的等价物。
             * 这是连接词法分析和计算执行的关键步骤。它将运算符、函数名、常量和变量等字符串
             * 映射到实际的 MathPlus 方法名、预计算的常量值或变量的当前值。
             *
             * @private
             * @param {string} str - 要转换的词法单元字符串，例如 "+", "sin", "pi", "x"。
             * @returns {string|ComplexNumber|BigNumber|Array|number}
             *   - 对于运算符和函数，返回对应的 MathPlus 方法名（例如，"+" -> "plus"）。
             *   - 对于常量（如 'pi', 'e', 'i'），返回其预计算的高精度数值。
             *   - 对于变量 'x'，返回其在当前计算上下文中被赋予的值。
             *   - 对于数字字符串，原样返回，由后续步骤处理。
             */
            function symbolConversion(str) {
                switch (str) {
                    case '+':
                        return 'plus';
                    case '-':
                        return 'minus';
                    case '*':
                    case '&':
                        return 'times';
                    case '/':
                        return 'divide';
                    case '^':
                        return 'pow';
                    case 'E': // E 表示科学记数法。
                        return 'exponential';

                    case '!':
                        return 'fact';
                    case '|':
                        return 'abs';
                    case 'N':
                        return '_oppositeNumber';
                    case 'A':
                        return 'abs';

                    case 'f':
                    case 'g':
                        return '_customFunc';

                    case '[pi]':
                        return new ComplexNumber(CalcConfig.constants.pi, {acc: acc});
                    case '[e]':
                        return new ComplexNumber(CalcConfig.constants.e, {acc: acc});
                    case '[i]':
                        return new ComplexNumber([[0, 0n, acc], [0, 1n, acc]]);
                    case '[x]':
                        if (mode === 'calc') {
                            if (unknown === undefined) {
                                throw new Error('[MathPlus] input error: x is undefined.');
                            }
                            return new ComplexNumber(unknown, {acc: acc});
                        } else {
                            return new ComplexNumber([0, 0n, acc]);
                        }

                    default:
                        return str.replace(/[\[\]]/g, '');
                }
            }

            /**
             * (内部辅助函数) 在调度场算法的求值阶段，处理并执行一个从操作符栈中弹出的词法单元（运算符或函数）。
             * 该函数从 `valueStack` 中弹出所需的操作数，执行计算，然后将结果压回 `valueStack`。
             * 它是逆波兰表示法 (RPN) 的核心执行引擎。
             *
             * @private
             * @param {string} token - 要执行的运算符或函数词法单元，例如 "+", "sin", "N"。
             * @returns {void} 此函数不返回值，它通过修改 `valueStack` 来产生副作用。
             * @throws {Error} 如果 `valueStack` 中的操作数不足以满足 `token` 所需的参数数量。
             * @throws {Error} 如果尝试调用一个未定义的自定义函数 'f' 或 'g'。
             */
            function evaluationRPN(token) {
                let tokenInfo = Public.getTokenInfo(token);

                // --- 处理一元运算符（前缀或后缀） ---
                if (tokenInfo.parameters === 1) {
                    // 确保栈中至少有一个操作数。
                    if (valueStack.length < 1) {
                        throw new Error(`[MathPlus] syntax error: Insufficient parameters for function ${token}.`);
                    }

                    if (mode === 'calc') {
                        // 必须先从栈中弹出操作数。
                        const operand = valueStack.pop();
                        // 调用相应的 MathPlus 方法进行计算。
                        let value;
                        if (['f', 'g'].includes(token)) {
                            const context = {f, g};
                            if (context[token] === undefined) {
                                throw new Error(`[MathPlus] input error: Function ${token} is undefined or cyclically called.`);
                            }
                            value = MathPlus._customFunc(token, context, operand, acc);
                        } else {
                            value = MathPlus[symbolConversion(tokenInfo.token)](operand);
                        }
                        valueStack.push(value);
                    }
                }

                // --- 处理二元运算符和双参数函数 ---
                else if (tokenInfo.parameters === 2) {
                    // 确保栈中至少有两个操作数。
                    if (valueStack.length < 2) {
                        throw new Error(`[MathPlus] syntax error: Insufficient parameters for function ${token}.`);
                    }
                    // 第二个操作数（b）先弹出，然后是第一个操作数（a）。
                    const b = valueStack.pop();
                    if (mode === 'calc') {
                        const a = valueStack.pop();
                        // 调用相应的 MathPlus 方法进行计算，保持 (a, b) 的正确顺序。
                        const value = MathPlus[symbolConversion(tokenInfo.token)](a, b);
                        valueStack.push(value);
                    }
                }
            }

            // 初始验证和准备
            const inputType = Public.typeOf(expr);
            if (['number', 'bigint', 'complexnumber', 'bignumber'].includes(inputType)) {
                return [new ComplexNumber(expr), expr];
            }
            if (inputType !== 'string') {
                throw new Error('[MathPlus] Disallowed input type.');
            }

            if (expr === '') {
                throw new Error('[MathPlus] syntax error: Input is empty.');
            }

            expr = expr.replaceAll('[cdot]', '').replaceAll('**', '^').replace(/\s/g, '');

            // --- 第一轮解析循环 ---
            // 主要工作：
            //   1. 插入隐式乘法运算符 ('&')。
            //   2. 将一元 +/- 转换成 'N' (负号)。
            //   3. 通过在内部将绝对值符号转换为 'A(...)'。
            //   4. 跟踪括号嵌套，补全缺失的括号。
            //   5. 添加括号消除表达式歧义，如 2/3pi -> 2/(3&pi)。
            let [output, input] = [[], Public.tokenizer(expr, {baseNumberMode: 'together'})];
            if (input[0] === 'error') {
                throw new Error(`[MathPlus] syntax error: Illegal input (${input[1]}).`);
            }

            let lastTokenInfo = {};
            // kh 记录全局括号，minKh 记录需要添加左括号的个数，addKh 为内层循环的括号记录。
            let kh = 0, minKh = 0, addKh = 0;
            const orderOfTimes = Public.getTokenInfo('*').priority;
            const orderOfInvisibleTimes = Public.getTokenInfo('&').priority;
            const absKhStack = []; // 栈用于跟踪绝对值符号的嵌套层级。

            for (let i = 0; i < input.length; i++) {
                const currentToken = input[i];
                const tokenInfo = Public.getTokenInfo(currentToken);
                let currentPush = currentToken;

                if (tokenInfo.isPrivate) {
                    // 像 'log' 这样的二元前缀函数后面必须跟 '('。
                    let position = 0;
                    for (let j = 0; j < i; j++) {
                        position += input[j].length;
                    }
                    throw new Error(`[MathPlus] syntax error: Illegal input (${position}).`);
                }
                if (lastTokenInfo.parameters === 2 && lastTokenInfo.funcPlace === 'front' && currentPush !== '(') {
                    let position = 0;
                    for (let j = 0; j < i; j++) {
                        position += input[j].length;
                    }
                    throw new Error(`[MathPlus] syntax error: A prefix binary function must be followed by a left parenthesis (${position}).`);
                }

                // --- 括号信息记录 ---
                if (currentPush === '(') {
                    kh += 1;
                    if (absKhStack.length > 0) {
                        absKhStack[absKhStack.length - 1] += 1;
                    }
                } else if (currentPush === ')') {
                    kh -= 1;
                    if (absKhStack.length > 0) {
                        absKhStack[absKhStack.length - 1] -= 1;
                        if (absKhStack[absKhStack.length - 1] < 0) {
                            let position = 0;
                            for (let j = 0; j < i; j++) {
                                position += input[j].length;
                            }
                            throw new Error(`[MathPlus] syntax error: Absolute value internal parentheses do not match (${position}).`);
                        }
                    }
                    if (kh < minKh) {
                        minKh = kh;
                    }
                }

                // --- 隐式乘法插入 ---
                if (lastTokenInfo.class === 'number' && tokenInfo.class === 'number') {
                    // 数字/常量、后缀函数和括号相邻时插入内部隐式乘法词元 `&`。
                    output.push('&');
                } else if (
                    tokenInfo.funcPlace === 'front' &&
                    (lastTokenInfo.class === 'number' || lastTokenInfo.funcPlace === 'back')
                ) {
                    output.push('&');
                } else if (lastTokenInfo.funcPlace === 'back' && tokenInfo.class === 'number') {
                    output.push('&');
                } else if (
                    currentPush === '(' &&
                    (lastTokenInfo.class === 'number' || lastTokenInfo.funcPlace === 'back' || lastTokenInfo.token === ')')
                ) {
                    output.push('&');
                } else if (
                    lastTokenInfo.token === ')' &&
                    (tokenInfo.class === 'number' || tokenInfo.funcPlace === 'front')
                ) {
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
                    // 缺少左操作数的 `-` 转为内部一元负号 `N`；一元 `+` 可直接忽略。
                    currentPush = currentPush === '-' ? 'N' : '';
                }

                // --- 处理绝对值 ---
                // `|...|` 转换为内部绝对值函数 `A(...)`，栈记录嵌套括号以识别闭合竖线。
                if (currentPush === '|') {
                    // 默认此处表示绝对值的开始。
                    currentPush = '(';
                    if (
                        absKhStack.length !== 0 &&
                        absKhStack[absKhStack.length - 1] === 0 &&
                        !['front', 'middle'].includes(lastTokenInfo.funcPlace) &&
                        !['(', ','].includes(lastTokenInfo.token)
                    ) {
                        output.push('|');
                        currentPush = ')';
                        kh -= 1;
                        absKhStack.pop();
                    }
                    // 其余情况将 '|' 视为绝对值的开始
                    else if (
                        lastTokenInfo.class === 'number' ||
                        lastTokenInfo.token === ')' ||
                        lastTokenInfo.funcPlace === 'back'
                    ) {
                        output.push('&');
                    }
                    if (currentPush === '(') {
                        absKhStack.push(0);
                        kh += 1;
                        output.push('A');
                    }
                }

                // --- 隐式乘法添加括号逻辑 ---
                // 为了消除歧义。例如，`1/2x` 应该是 `1/(2&x)`。
                if (
                    (output[output.length - 1] === '&' || (output[output.length - 1] === 'A' && output[output.length - 2] === '&')) &&
                    !output.includes('[')
                ) {
                    addKh = 0;
                    for (let j = output.length - (output[output.length - 1] === '&' ? 2 : 3); j >= 0; j--) {
                        const currentTokenJ = output[j];
                        const tokenInfoJ = Public.getTokenInfo(currentTokenJ);

                        if (currentTokenJ === '(') {
                            addKh += 1;
                        } else if (currentTokenJ === ')') {
                            addKh -= 1;
                        }

                        if (
                            tokenInfoJ.class === 'func' &&
                            tokenInfoJ.priority > orderOfInvisibleTimes && // 低优先级词元结束隐式乘法的作用范围。
                            addKh === 0
                        ) {
                            if (tokenInfoJ.priority <= orderOfTimes && currentTokenJ !== '*') {
                                output.splice(j + 1, 0, '[');
                            }
                            break;
                        }
                    }
                    addKh = currentPush === '(' ? kh - 1 : kh;
                }

                if ( // 解决为隐式乘法添加的另一半括号
                    output.includes('[') && (
                        (
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
                        /** 将临时左括号标记转换为普通左括号。 */
                        output = output.map((item) => item === '[' ? '(' : item);
                        if (i + 1 === input.length) {
                            output.push(currentPush);
                            currentPush = ')';
                        } else {
                            output.push(')');
                        }
                    } else {
                        /** 移除无需保留的临时左括号标记。 */
                        output = output.filter((item) => item !== '[');
                    }
                }

                if (i + 1 !== input.length) {
                    lastTokenInfo = Public.getTokenInfo(currentPush);
                } else {
                    lastTokenInfo = {};
                }
                output.push(currentPush);
            }

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

            // --- 第二轮解析循环 ---
            // 其主要工作是为需要它的函数和运算符（如 `sin` 和 `^`）处理括号插入，
            // 以确保正确的运算顺序，特别是当用户省略括号时，以进一步消除歧义。
            // 例如 `sin x + 1` -> `sin(x) + 1`，而不是 `sin(x+1)`。
            // 它使用一个临时标记系统：
            //   - `#kh#`（一级条件）：未发现完整括号的未闭合一元前缀函数，如：sin2 -> sin(2)
            //   - `#kh@`（二级条件）：发现完整括号的未闭合一元前缀函数，如：sin(2)A(5) -> sin((2)A(5))，假设二元中缀运算符 'A' 的优先级比 'sin' 高。
            //   - `:kh#`（一级条件）：未发现完整括号的未闭合 '^'。
            //   - `:kh@`（二级条件）：发现完整括号的未闭合 '^'。
            [output, input] = [[], output];
            let absAdd = false; // 跳过绝对值标记。
            const orderOfSin = Public.getTokenInfo('sin').priority;
            const orderOfPow = Public.getTokenInfo('^').priority;

            for (let i = 0; i < input.length; i++) {
                const currentToken = input[i];
                const tokenInfo = Public.getTokenInfo(currentToken);

                if (currentToken === '|') {
                    absAdd = true;
                    continue;
                }

                if (currentToken === '(') {
                    kh += 1;
                }

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
                    (listIncludesStr(output, '#' + kh + '#') || listIncludesStr(output, ':' + kh + '#'))
                ) {
                    // 进入此条件不一定会添加括号
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

                lastTokenInfo = tokenInfo;
                output.push(currentToken);
            }

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

            // --- 第三轮解析循环 ---
            // 生成 RPN（逆波兰表示法） 和 RPN求值循环
            const valueStack = [];
            const operatorStack = [];

            for (let i = 0; i < input.length; i++) {
                const currentToken = input[i];
                const tokenInfo = Public.getTokenInfo(currentToken);

                if (tokenInfo.class === 'number') {
                    if (mode === 'calc') {
                        const pushNum = symbolConversion(currentToken);
                        if (Public.typeOf(pushNum) === 'complexnumber') {
                            valueStack.push(pushNum);
                        } else {
                            valueStack.push(new ComplexNumber(pushNum, {acc: acc}));
                        }
                    } else {
                        valueStack.push(new ComplexNumber([0, 0n, acc]));
                    }
                } else if (tokenInfo.class === 'func') {
                    let topOfStack = operatorStack[operatorStack.length - 1];
                    let topOfStackInfo = {};
                    if (topOfStack !== undefined) {
                        topOfStack = topOfStack.replace('~', '');
                        topOfStackInfo = Public.getTokenInfo(topOfStack);
                    }

                    // 循环条件：当操作符栈不为空，栈顶不是左括号，且满足以下任一条件时，就将栈顶运算符弹出
                    //   1. 栈顶运算符的优先级高于当前运算符。
                    //   2. 优先级相同，且当前运算符是左结合的。
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

                    operatorStack.push(currentToken);
                } else if (currentToken === '(') {
                    operatorStack.push(currentToken);
                } else if (currentToken === ')') {
                    while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                        evaluationRPN(operatorStack.pop().replace('~', ''));
                    }
                    if (operatorStack.length === 0) {
                        throw new Error('[MathPlus] syntax error: The parentheses do not match.');
                    }
                    // 弹出并丢弃左括号 '('。
                    operatorStack.pop();
                } else if (currentToken === ',') {
                    while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                        evaluationRPN(operatorStack.pop().replace('~', ''));
                    }
                    const subTopOfStack = Public.getTokenInfo(operatorStack[operatorStack.length - 2]);
                    if (operatorStack.length < 2 || !(subTopOfStack.funcPlace === 'front' && subTopOfStack.parameters === 2)) {
                        throw new Error('[MathPlus] syntax error: Commas mismatch or incorrect position.');
                    }
                    // 标记这个函数已经被一个逗号匹配。
                    operatorStack[operatorStack.length - 2] += '~';
                }
            }

            while (operatorStack.length > 0) {
                const operator = operatorStack.pop().replace('~', '');
                if (operator === '(') {
                    throw new Error('[MathPlus] syntax error: The parentheses do not match.');
                }
                evaluationRPN(operator);
            }

            if (valueStack.length !== 1) {
                throw new Error('[MathPlus] syntax error: The final stack should have exactly one value.');
            }

            const result = new ComplexNumber(mode === 'calc' ? valueStack[0] : [0, 0n, acc]);
            return [result, output];
        }
    }

    /**
     * 单组样本的描述性统计字段。
     *
     * @typedef {object} StatisticsSummary
     * @property {string} average - 算术平均值的格式化字符串。
     * @property {string} sum - 样本和 `Σxᵢ` 的格式化字符串。
     * @property {string} sum2 - 平方和 `Σxᵢ²` 的格式化字符串。
     * @property {string} totalVariance - 总体标准差 `sqrt(Σ(xᵢ-x̄)²/n)`；字段名沿用既有 UI 协议。
     * @property {string|'error'} sampleVariance - 样本标准差；样本量为 1 时为 `error`。
     * @property {string} max - 按实数大小比较得到的最大值。
     * @property {string} min - 按实数大小比较得到的最小值。
     */

    /**
     * 单个回归模型的输出结构。
     *
     * @typedef {object} RegressionModelResult
     * @property {Array<string|'error'>} parameter - 按模型表达式顺序排列的参数；
     *   二参数模型为 `[a,b]`，二次模型为 `[a,b,c]`。无法求解的参数逐项使用 `error`。
     * @property {string|'error'} regressionEquation - 可直接交给表达式解析器的回归方程字符串。
     * @property {string|'error'} R2 - 在原始因变量量纲上计算并格式化的决定系数。
     * @property {'linear'|'square'|'ln'|'exp'|'abx'|'axb'|'reciprocal'} model - 模型标识，
     *   与统计结果对象中的属性名一致。
     */

    /**
     * 两组配对样本的完整统计与回归结果。
     *
     * @typedef {object} StatisticsAnalysisResult
     * @property {string} n - 样本对数量的十进制整数字符串。
     * @property {string} averageA - A 组均值。
     * @property {string} sumA - A 组样本和。
     * @property {string} sum2A - A 组平方和。
     * @property {string} totalVarianceA - A 组总体标准差。
     * @property {string|'error'} sampleVarianceA - A 组样本标准差。
     * @property {string} maxA - A 组最大值。
     * @property {string} minA - A 组最小值。
     * @property {string} averageB - B 组均值。
     * @property {string} sumB - B 组样本和。
     * @property {string} sum2B - B 组平方和。
     * @property {string} totalVarianceB - B 组总体标准差。
     * @property {string|'error'} sampleVarianceB - B 组样本标准差。
     * @property {string} maxB - B 组最大值。
     * @property {string} minB - B 组最小值。
     * @property {string} dotAB - 点积 `ΣAᵢBᵢ`。
     * @property {string} dotA2B - 加权点积 `ΣAᵢ²Bᵢ`。
     * @property {string} totalCovariance - 总体协方差。
     * @property {string|'error'} sampleCovariance - 样本协方差；样本量为 1 时为 `error`。
     * @property {string|'error'} r - 皮尔逊相关系数；任一组方差为零时为 `error`。
     * @property {'linear'|'square'|'ln'|'exp'|'abx'|'axb'|'reciprocal'} bestModel - 可计算模型中
     *   R² 最大者；全部模型不可比较时保留 `linear` 作为 UI 缺省选择。
     * @property {RegressionModelResult} linear - 线性模型 `y=a+bx`。
     * @property {RegressionModelResult} square - 二次模型 `y=a+bx+cx²`。
     * @property {RegressionModelResult} ln - 对数模型 `y=a+b ln(x)`。
     * @property {RegressionModelResult} exp - 自然指数模型 `y=a exp(bx)`。
     * @property {RegressionModelResult} abx - 一般指数模型 `y=a b^x`。
     * @property {RegressionModelResult} axb - 幂模型 `y=a x^b`。
     * @property {RegressionModelResult} reciprocal - 反比例模型 `y=a+b/x`。
     */

    /**
     * 提供统计计算和回归分析。
     *
     * @class StatisticsTools
     */
    class StatisticsTools {
        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[StatisticsTools] StatisticsTools is a static class and should not be instantiated.');
        }

        /**
         * 计算一个数值列表的总和与平均值。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 非空数值样本；每项会转换为新的
         *   `ComplexNumber` 后累加，原数组及其中的实例均不修改。空数组没有可定义的平均值。
         * @returns {{sum:ComplexNumber,average:ComplexNumber}} 两个高精度值：`sum` 为顺序累加的样本和，
         *   `average` 为 `sum / list.length`；两者是独立的新实例，不引用输入元素。
         */
        static _averageAndSum(list) {
            let sum = new ComplexNumber(0);
            for (let i = 0; i < list.length; i++) {
                sum = MathPlus.plus(list[i], sum);
            }
            return {
                sum: sum,
                average: MathPlus.divide(sum, list.length)
            };
        }

        /**
         * 计算列表的总体方差和样本方差。
         * 总体方差为 `Σ(xᵢ-x̄)²/n`，样本方差使用无偏估计 `Σ(xᵢ-x̄)²/(n-1)`。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 非空总体样本；样本方差要求至少两个元素，
         *   否则其返回位置使用 `error`，复数按当前代数平方规则参与离差计算。
         * @param {{sum: ComplexNumber, average: ComplexNumber}|null} [averageAndSum] - 与同一 `list` 对应的
         *   预计算结果；传 `null` 时内部重新计算。调用方必须保证缓存未过期且没有来自另一数据集。
         * @returns {[ComplexNumber, ComplexNumber|'error']} `[populationVariance, sampleVariance]`；
         *   第 0 项分母为 `n`，第 1 项分母为 `n-1`。只有一个样本时总体方差为零、样本方差为 `error`。
         */
        static _variance(list, averageAndSum = null) {
            const n = list.length;
            if (n === 1) {
                return [new ComplexNumber(0), 'error'];
            }
            const average = (averageAndSum === null ? StatisticsTools._averageAndSum(list) : averageAndSum).average;
            let sum = new ComplexNumber(0);
            for (let i = 0; i < n; i++) {
                const mid = MathPlus.minus(list[i], average);
                sum = MathPlus.plus(MathPlus.times(mid, mid), sum);
            }
            return [MathPlus.divide(sum, n), MathPlus.divide(sum, n - 1)];
        }

        /**
         * 计算两个列表的总体协方差和样本协方差。
         * 两者共享离差积和 `Σ(xᵢ-x̄)(yᵢ-ȳ)`，分母分别为 `n` 和 `n-1`。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} listA - 第一维样本；必须与 `listB` 等长且非空。
         * @param {Array<ComplexNumber|string|number>} listB - 第二维样本；相同索引与 `listA` 组成一个观测对。
         * @param {object} [options={}] - 可选的均值缓存，用于避免统计汇总阶段重复遍历数据。
         * @param {ComplexNumber|null} [options.averageA=null] - 与当前 `listA` 完全对应的算术平均值；
         *   `null` 表示内部计算，数值零不是缺省标记。
         * @param {ComplexNumber|null} [options.averageB=null] - 与当前 `listB` 完全对应的算术平均值；
         *   若只提供一个缓存，另一个仍会独立计算。
         * @returns {[ComplexNumber, ComplexNumber|'error']} `[populationCovariance, sampleCovariance]`；
         *   两项共享同一个离差积和，分母分别为 `n` 与 `n-1`。单个观测对的样本项为 `error`。
         */
        static _covariance(listA, listB, {averageA = null, averageB = null} = {}) {
            const n = listA.length;
            if (n === 1) {
                return [new ComplexNumber(0), 'error'];
            }
            averageA = averageA === null ? this._averageAndSum(listA) : averageA;
            averageB = averageB === null ? this._averageAndSum(listB) : averageB;
            let cov = new ComplexNumber(0);
            for (let i = 0; i < n; i++) {
                cov = MathPlus.plus(
                    MathPlus.times(
                        MathPlus.minus(listA[i], averageA),
                        MathPlus.minus(listB[i], averageB)
                    ),
                    cov
                );
            }
            return [MathPlus.divide(cov, n), MathPlus.divide(cov, n - 1)];
        }

        /**
         * 计算两个列表的皮尔逊相关系数。
         * 使用 `r = Cov(X,Y) / sqrt(Var(X)Var(Y))`；任一方差为零时结果不可定义。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} listA - 第一组等长配对样本；零方差时相关系数不可定义。
         * @param {Array<ComplexNumber|string|number>} listB - 第二组等长配对样本；元素顺序必须与 `listA` 对齐。
         * @param {object} [options={}] - 可复用的统计量缓存；各数组均采用 `[总体值, 样本值]` 顺序。
         * @param {Array<ComplexNumber|string>|null} [options.varianceA=null] - `listA` 的总体/样本方差；
         *   `null` 时从原始列表计算，缓存中的 `error` 会自然传播。
         * @param {Array<ComplexNumber|string>|null} [options.varianceB=null] - `listB` 的总体/样本方差，
         *   必须与 `varianceA` 使用同一种总体或样本口径。
         * @param {Array<ComplexNumber|string>|null} [options.covariance=null] - 两组数据的总体/样本协方差；
         *   传入缓存可避免第三次离差遍历，但调用方负责保证它与两个列表匹配。
         * @returns {ComplexNumber|string} 相关系数；无法计算时为 `error`。
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
         * (内部辅助方法) 计算两个数值向量（列表）的点积（内积）。
         * 点积的计算方式为对应元素相乘后再求和。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} listA - 第一个向量；元素按索引与 `listB` 配对。
         * @param {Array<ComplexNumber|string|number>} listB - 第二个等长向量；本私有方法不补零也不做
         *   长度校验，调用方必须先保证长度一致。
         * @returns {ComplexNumber} 两个向量的点积，以 ComplexNumber 实例形式返回。
         */
        static _dotProduct(listA, listB) {
            let sum = new ComplexNumber(0);
            for (let i = 0; i < listA.length; i++) {
                sum = MathPlus.plus(MathPlus.times(listA[i], listB[i]), sum);
            }
            return sum;
        }

        /**
         * 对一个数值列表中的每个元素应用一个指定的回调函数。
         * 此方法的功能类似于数组的 `map` 方法，但确保结果是 ComplexNumber 实例的数组。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 要遍历的源数组；保持元素顺序且不原地修改。
         * @param {function(ComplexNumber|string|number): ComplexNumber} func - 同步变换函数，对数组中的每个元素使用 func()；
         * @returns {Array<ComplexNumber>} 一个包含变换后结果的新数组，其中每个元素都是 ComplexNumber 实例。
         */
        static _changeInner(list, func) {
            const result = [];
            for (let i = 0; i < list.length; i++) {
                result.push(func(list[i]));
            }
            return result;
        }

        /**
         * 在一个数值列表中查找最大值和最小值。
         * 注意：此方法主要基于数值的实部进行比较。对于复数，其虚部在比较中被忽略。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 需要进行查找的数值数组。
         * @returns {{max:ComplexNumber,min:ComplexNumber}} 按实部比较得到的两个新实例；`max`、`min`
         *   初始都复制首项，实部相等时保留先出现者，虚部不参与大小判断。
         */
        static _getMaxAndMin(list) {
            const result = {};
            result.max = new ComplexNumber(list[0]);
            result.min = new ComplexNumber(list[0]);
            for (let i = 1; i < list.length; i++) {
                const currentI = new ComplexNumber(list[i]);
                if (MathPlus.minus(result.max, currentI).re.isNegative()) {
                    result.max = currentI;
                } else if (MathPlus.minus(currentI, result.min).re.isNegative()) {
                    result.min = currentI;
                }
            }
            return result;
        }

        /**
         * 计算一个数值列表中每个元素的绝对值（模）。
         * 此方法的功能类似于 `list.map((item) => MathPlus.abs(item))`。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 需要计算绝对值的数值数组。
         * @returns {Array<ComplexNumber>} 一个新的数组，其中包含原始列表中每个元素的绝对值。
         */
        static _getAbsList(list) {
            const result = [];
            for (let i = 0; i < list.length; i++) {
                result.push(MathPlus.abs(list[i]));
            }
            return result;
        }

        /**
         * 检查一个数值列表，以确定其中是否包含正数、负数或零值。
         * 此方法仅检查数值的实部来判断其符号。它用于快速了解数据集的符号构成，
         * 例如，在对数回归中，所有自变量都必须为正。
         *
         * @private
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
            };

            for (let i = 0; i < list.length; i++) {
                const currentCheck = new ComplexNumber(list[i]);
                if (currentCheck.re.isPositive()) {
                    result.positive = true;
                } else if (currentCheck.re.isZero()) {
                    result.zero = true;
                } else {
                    result.negative = true;
                }
            }
            return result;
        }

        /**
         * 使用带部分主元的高斯-若尔当消元法求解 Ax=b。
         *
         * @private
         * @param {Array<Array<ComplexNumber|string|number>>} coefficients - 方程左侧的 `n × n` 系数矩阵；
         *   每行必须恰有 `n` 项。算法会构造增广矩阵副本，不会原地消元传入数组。
         * @param {Array<ComplexNumber|string|number>} constants - 方程右侧的长度为 `n` 的常数向量；
         *   与系数矩阵行按索引对应，长度不符或主元为零表示无法得到唯一解。
         * @returns {Array<ComplexNumber>} 长度为 `n` 的唯一解向量；第 `i` 项对应系数矩阵第 `i` 列的
         *   未知量。返回的是消元后增广矩阵最后一列的新数组。
         * @throws {Error} 矩阵不是方阵或不存在唯一解时抛出。
         */
        static _solveLinearEquation(coefficients, constants) {
            const n = coefficients.length;

            const augmentedMatrix = [];
            // 复制系数并附加常数列，构造增广矩阵，避免修改调用方传入的数组。
            for (let i = 0; i < n; i++) {
                if (coefficients[i].length !== n) {
                    throw new Error('[StatisticsTools] The coefficient matrix must be a square matrix.');
                }
                const newRow = [];
                for (let j = 0; j < n; j++) {
                    newRow.push(new ComplexNumber(coefficients[i][j]));
                }
                newRow.push(new ComplexNumber(constants[i]));
                augmentedMatrix.push(newRow);
            }

            for (let i = 0; i < n; i++) {
                // 每列选取绝对值最大的主元并换行，减少除以极小数造成的误差放大。
                let maxRow = i;
                for (let k = i + 1; k < n; k++) {
                    if (MathPlus.minus(MathPlus.abs(augmentedMatrix[k][i]), MathPlus.abs(augmentedMatrix[maxRow][i])).re.isPositive()) {
                        maxRow = k;
                    }
                }

                [augmentedMatrix[i], augmentedMatrix[maxRow]] = [augmentedMatrix[maxRow], augmentedMatrix[i]];

                const pivot = augmentedMatrix[i][i];

                if (pivot.re.isZero()) {
                    // 主元为零表示矩阵奇异，方程组没有唯一解。
                    throw new Error('[StatisticsTools] The system of equations has no unique solution.');
                }

                // 主元行归一化，再消去该列的其他元素；结束时左侧矩阵成为单位矩阵。
                for (let j = i; j < n + 1; j++) {
                    augmentedMatrix[i][j] = MathPlus.divide(augmentedMatrix[i][j], pivot);
                }

                for (let k = 0; k < n; k++) {
                    if (k !== i) {
                        const factor = augmentedMatrix[k][i];

                        for (let j = i; j < n + 1; j++) {
                            augmentedMatrix[k][j] = MathPlus.minus(
                                augmentedMatrix[k][j],
                                MathPlus.times(factor, augmentedMatrix[i][j])
                            );
                        }
                    }
                }
            }

            const solution = new Array(n);
            for (let i = 0; i < n; i++) {
                solution[i] = augmentedMatrix[i][n];
            }

            return solution;
        }

        /**
         * 构造并求解正规方程，得到指定阶数的最小二乘多项式。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} listA - 自变量样本 `xᵢ`；与 `listB` 等长，
         *   至少需要 `power + 1` 个观测点才能建立满秩正规方程。
         * @param {Array<ComplexNumber|string|number>} listB - 与 `xᵢ` 同索引的因变量样本 `yᵢ`。
         * @param {number} power - 非负整数多项式阶数；结果包含 `power + 1` 个从常数项到最高次项的系数。
         * @returns {Array<ComplexNumber>} 长度为 `power + 1` 的最小二乘系数 `[a₀,a₁,…]`，
         *   按常数项到最高次项排列，使预测式为 `a₀ + a₁x + …`。
         * @throws {Error} 数据不足或两组数据长度不一致时抛出。
         */
        static _regressionAnalysis(listA, listB, power) {
            if (listA.length <= power) {
                throw new Error('[StatisticsTools] Insufficient number of parameters.');
            }
            if (listA.length !== listB.length) {
                throw new Error('[StatisticsTools] Data mismatch.');
            }

            const n = listA.length;
            // 正规方程中 b_i=Σ(x^i·y)，A_ij=Σ(x^(i+j))；预先计算各次幂和以复用结果。
            const constants = [StatisticsTools._averageAndSum(listB).sum];
            const coefficientsList = [new ComplexNumber(n)];
            const coefficients = [];
            for (let i = 1; i < power + 1; i++) {
                /** 将自变量转换为当前次数的幂。 */
                const changedListA = StatisticsTools._changeInner(listA, (x) => MathPlus.pow(x, i));
                constants.push(StatisticsTools._dotProduct(changedListA, listB));
            }
            for (let i = 1; i < 2 * power + 1; i++) {
                /** 将自变量转换为当前次数的幂。 */
                const changedListA = StatisticsTools._changeInner(listA, (x) => MathPlus.pow(x, i));
                coefficientsList.push(StatisticsTools._averageAndSum(changedListA).sum);
            }
            for (let i = 0; i < power + 1; i++) {
                const rowList = [];
                const endNum = i + power + 1;
                for (let j = i; j < endNum; j++) {
                    rowList.push(coefficientsList[j]);
                }
                coefficients.push(rowList);
            }
            return StatisticsTools._solveLinearEquation(coefficients, constants);
        }

        /**
         * 按 `1 - SS_res / SS_tot` 计算回归模型的决定系数 R²。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} listA - 传入预测函数的自变量样本。
         * @param {Array<ComplexNumber|string|number>} listB - 与 `listA` 等长的真实观测值，用于计算残差平方和。
         * @param {function(ComplexNumber|string|number): ComplexNumber} func - 同步预测函数；对每个 `xᵢ`
         *   返回对应 `ŷᵢ`。常量数据导致 `SS_tot = 0` 时，R² 不可定义。
         * @returns {ComplexNumber} 决定系数。
         */
        static _calcR2(listA, listB, func) {
            let n = listA.length;
            const averageB = StatisticsTools._averageAndSum(listB).average;
            // 分母为总平方和 SS_tot，分子为残差平方和 SS_res。
            let denominator = new ComplexNumber(0);
            let numerator = new ComplexNumber(0);
            for (let i = 0; i < n; i++) {
                const addDenominator = MathPlus.minus(listB[i], averageB);
                denominator = MathPlus.plus(
                    denominator,
                    MathPlus.times(addDenominator, addDenominator)
                );
                const addNumerator = MathPlus.minus(listB[i], func(listA[i]));
                numerator = MathPlus.plus(
                    numerator,
                    MathPlus.times(addNumerator, addNumerator)
                );
            }
            return MathPlus.minus(1, MathPlus.divide(numerator, denominator));
        }

        /**
         * 汇总列表的均值、总和、平方和、方差及极值。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 要汇总的非空样本；返回结果中的极值按实部比较。
         * @param {{sum: ComplexNumber, average: ComplexNumber}|null} [averageAndSum] - 同一列表的总和与均值缓存；
         *   `null` 时计算，提供时直接信任并复用。
         * @param {Array<ComplexNumber|string>|null} [varianceList] - 同一列表的 `[总体方差, 样本方差]`
         *   缓存；`null` 时基于上面的均值缓存计算。
         * @returns {{statisticsResult: StatisticsSummary, squareList: Array<ComplexNumber>}} 中间汇总结果：
         *   `statisticsResult` 是已格式化的单组描述性统计；`squareList` 与输入等长，第 `i` 项为
         *   `list[i]²` 的高精度值，供 `dotA2B` 复用而无需再次平方。
         */
        static _getStatisticsInfo(list, {averageAndSum = null, varianceList = null} = {}) {
            /** @type {StatisticsSummary} */
            const statisticsResult = {};

            averageAndSum = averageAndSum === null ? StatisticsTools._averageAndSum(list) : averageAndSum;
            statisticsResult.average = Public.idealizationToString(averageAndSum.average);
            statisticsResult.sum = Public.idealizationToString(averageAndSum.sum);

            /** 计算列表元素的平方。 */
            const list2 = StatisticsTools._changeInner(list, (x) => MathPlus.times(x, x));

            statisticsResult.sum2 = Public.idealizationToString(StatisticsTools._averageAndSum(list2).sum);

            const variance = varianceList === null ? StatisticsTools._variance(list, averageAndSum) : varianceList;
            statisticsResult.totalVariance = Public.idealizationToString(MathPlus.sqrt(variance[0]));
            statisticsResult.sampleVariance = Public.idealizationToString(variance[1] === 'error' ? 'error' : MathPlus.sqrt(variance[1]));

            const maxAndMin = StatisticsTools._getMaxAndMin(list);
            statisticsResult.max = Public.idealizationToString(maxAndMin.max);
            statisticsResult.min = Public.idealizationToString(maxAndMin.min);

            return {
                statisticsResult: statisticsResult,
                squareList: list2
            };
        }

        /**
         * 求解指定回归模型的参数和决定系数；失败项以 `error` 表示。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} listA - 送入回归求解器的自变量；可为原值或模型要求的变换值。
         * @param {Array<ComplexNumber|string|number>} listB - 送入正规方程的因变量；对数/指数模型中可能已变换。
         * @param {number} power - 传给多项式回归的非负整数阶数，也决定失败时生成的参数占位数。
         * @param {Array<ComplexNumber|string|number>} originalListB - 未变换的实际因变量；仅用于在原始量纲上计算 R²。
         * @param {function(ComplexNumber|string|number, Array<ComplexNumber|string|number>): ComplexNumber} func -
         *   模型预测函数，参数依次为原始 `x` 和已求得的系数数组；返回值用于和 `originalListB` 比较。
         * @returns {{parameter: Array<ComplexNumber|'error'>, R2: ComplexNumber|'error'}} 尚未格式化的回归结果；
         *   `parameter` 含 `power + 1` 个按升幂排列的系数，求解失败时为等长 `error` 数组；`R2`
         *   使用 `originalListB` 独立计算，因而参数可求而 R² 仍可能为 `error`，反之不会发生。
         */
        static _getRegressionInfo(listA, listB, power, originalListB, func) {
            const result = {};

            try {
                result.parameter = StatisticsTools._regressionAnalysis(listA, listB, power);
            } catch {
                /** 为每个回归参数生成错误占位值。 */
                result.parameter = Array.from({length: power + 1}, () => 'error');
            }

            try {
                // R² 使用未变换的原始 y 值。
                result.R2 = StatisticsTools._calcR2(listA, originalListB,
                    // 使用已求得的参数计算预测值
                    (x) => func(x, result.parameter)
                );
            } catch {
                result.R2 = 'error';
            }

            return result;
        }

        /**
         * (内部辅助方法) 比较当前回归模型与已知的最佳模型，并根据决定系数 (R²) 确定新的最佳模型。
         * R² 值越高，表示模型的拟合优度越好。
         *
         * @private
         * @param {{bestModel:string,[model:string]:{R2:ComplexNumber|'error'}|string}} result - 正在构建的
         *   统计结果；`bestModel` 指向当前胜者，模型同名属性必须含尚未格式化的 `R2` 或 `error`。
         *   方法只读取该对象，不直接写回 `bestModel`。
         * @param {'linear'|'square'|'ln'|'exp'|'abx'|'axb'|'reciprocal'} current - 刚完成计算、准备与
         *   `result.bestModel` 比较的模型键。
         * @returns {'linear'|'square'|'ln'|'exp'|'abx'|'axb'|'reciprocal'} R² 更大的可用模型键；当前模型
         *   为 `error` 或未严格胜出时返回原 `bestModel`，相等时保持先前模型。
         */
        static _findBestModel(result, current) {
            const bestBefore = result.bestModel;
            if (result[current].R2 !== 'error') {
                if (result[bestBefore].R2 === 'error') {
                    return current;
                }
                if (MathPlus.minus(result[bestBefore].R2, result[current].R2).re.isNegative()) {
                    return current;
                }
            }
            return bestBefore;
        }

        /**
         * 计算两组数据的统计指标，并比较多种回归模型的拟合度。
         *
         * @param {Array<ComplexNumber|string|number>} listA - 自变量样本；必须非空、只含实数并与 `listB`
         *   等长。零值或负值会使部分对数/幂回归模型不可用，但不一定使全部统计失败。
         * @param {Array<ComplexNumber|string|number>} listB - 因变量样本；必须非空且只含实数，元素按索引
         *   与 `listA` 配对。样本数不足时高阶模型以 `error` 占位。
         * @returns {StatisticsAnalysisResult} 完整统计结果。所有直接数值字段均已转换为显示字符串；
         *   模型不满足定义域、样本不足或正规方程奇异时，不删除模型字段，而是在对应
         *   `parameter`、`regressionEquation`、`R2` 中保留 `error`，便于 UI 使用固定结构渲染。
         * @throws {Error} 数据长度不一致、包含复数或不足以拟合时抛出。
         */
        static statisticsCalc(listA, listB) {
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
            for (let i = 0; i < listA.length; i++) {
                listA[i] = Public.zeroCorrect(listA[i]);
                listB[i] = Public.zeroCorrect(listB[i]);

                if (!listA[i].onlyReal) {
                    throw new Error('[StatisticsTools] Complex number appear in the inputA.');
                }
                if (!listB[i].onlyReal) {
                    throw new Error('[StatisticsTools] Complex number appear in the inputB.');
                }
            }

            const result = {};
            result.n = listA.length.toString();
            const averageAndSumA = this._averageAndSum(listA);
            const averageAndSumB = this._averageAndSum(listB);
            const varianceA = this._variance(listA);
            const varianceB = this._variance(listB);

            const statisticsInfoA = this._getStatisticsInfo(listA, {
                averageAndSum: averageAndSumA,
                variance: varianceA
            });
            const statisticsInfoB = this._getStatisticsInfo(listB, {
                averageAndSum: averageAndSumB,
                variance: varianceB
            });
            for (let key in statisticsInfoA.statisticsResult) {
                result[key + 'A'] = statisticsInfoA.statisticsResult[key];
                result[key + 'B'] = statisticsInfoB.statisticsResult[key];
            }
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

            result.bestModel = 'linear';
            // 各回归模型有不同定义域；先记录两组数据是否包含正数、负数和零。
            const statesA = this._getListInfo(listA);
            const statesB = this._getListInfo(listB);
            const absListB = this._getAbsList(listB);
            let lnListA;
            if (!statesA.zero && !statesA.negative) {
                /** 对自变量取自然对数。 */
                lnListA = this._changeInner(listA, (x) => MathPlus.ln(x));
            }
            let lnListB;
            if (!statesB.zero && !(statesB.positive && statesB.negative)) {
                /** 对因变量绝对值取自然对数。 */
                lnListB = this._changeInner(absListB, (x) => MathPlus.ln(x));
            }
            const errorWith2parameter = {
                parameter: ['error', 'error'],
                regressionEquation: 'error',
                R2: 'error'
            };

            const twoParamModels = ['linear', 'ln', 'axb', 'exp', 'abx', 'reciprocal'];
            if ((!statesA.positive && !statesA.negative && statesA.zero) || listA.length === 1) {
                /** 将当前双参数模型标记为不可计算。 */
                twoParamModels.forEach((key) => {
                    result[key] = {
                        parameter: ['error', 'error'],
                        regressionEquation: 'error',
                        R2: 'error',
                        model: key
                    };
                });

                result.square = {
                    parameter: ['error', 'error', 'error'],
                    regressionEquation: 'error',
                    R2: 'error',
                    model: 'square'
                };

                return result;
            }
            if (!statesB.positive && !statesB.negative && statesB.zero) {
                /** 为当前双参数模型写入零函数结果。 */
                twoParamModels.forEach((key) => {
                    result[key] = {
                        parameter: ['0', '0'],
                        regressionEquation: '0',
                        R2: 'error',
                        model: key
                    };
                });

                result.square = {
                    parameter: ['0', '0', '0'],
                    regressionEquation: '0',
                    R2: 'error',
                    model: 'square'
                };

                return result;
            }

            result.linear = this._getRegressionInfo(listA, listB, 1, listB,
                (x, coefficient) => MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
            );

            result.square = this._getRegressionInfo(listA, listB, 2, listB,
                (x, coefficient) => MathPlus.plus(
                    MathPlus.times(coefficient[2], MathPlus.times(x, x)),
                    MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
                )
            );
            result.bestModel = this._findBestModel(result, 'square');

            // 对数模型 y=a+b·ln(x) 要求所有 x>0。
            if (statesA.negative || statesA.zero) {
                result.ln = structuredClone(errorWith2parameter);
            } else {
                result.ln = this._getRegressionInfo(lnListA, listB, 1, listB,
                    (x, coefficient) => MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
                );
            }
            result.bestModel = this._findBestModel(result, 'ln');

            // 幂模型 y=a·x^b 线性化为 ln|y|=ln|a|+b·ln(x)，要求 x>0 且 y 非零同号。
            if (statesA.negative || statesA.zero || statesB.zero || (statesB.positive && statesB.negative)) {
                result.axb = structuredClone(errorWith2parameter);
            } else {
                result.axb = this._getRegressionInfo(lnListA, lnListB, 1, listB,
                    (x, coefficient) => {
                        const mid = MathPlus.exp(MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0]));
                        return statesB.negative ? MathPlus.minus(0, mid) : mid;
                    }
                );
                const p0 = result.axb.parameter[0];
                if (p0 !== 'error') {
                    const mid = MathPlus.exp(p0);
                    result.axb.parameter[0] = statesB.negative ? MathPlus.minus(0, mid) : mid;
                }
            }
            result.bestModel = this._findBestModel(result, 'axb');

            // 指数模型 y=a·e^(bx) 同样在 ln|y| 空间拟合，要求 y 非零同号。
            if (statesB.zero || (statesB.positive && statesB.negative)) {
                result.exp = structuredClone(errorWith2parameter);
                result.abx = structuredClone(errorWith2parameter);
            } else {
                result.exp = this._getRegressionInfo(listA, lnListB, 1, listB,
                    (x, coefficient) => {
                        const mid = MathPlus.exp(MathPlus.plus(
                            MathPlus.times(coefficient[1], x),
                            coefficient[0]
                        ));
                        return statesB.negative ? MathPlus.minus(0, mid) : mid;
                    }
                );
                const p0 = result.exp.parameter[0];
                if (p0 !== 'error') {
                    const midExp = MathPlus.exp(p0);
                    result.exp.parameter[0] = statesB.negative ? MathPlus.minus(0, midExp) : midExp;
                }

                const p1 = result.exp.parameter[1];
                if (p1 !== 'error' && p0 !== 'error') {
                    const midABX = MathPlus.exp(p1);
                    result.abx = {
                        parameter: [result.exp.parameter[0], midABX],
                        R2: result.exp.R2
                    };
                } else {
                    result.abx = structuredClone(errorWith2parameter);
                }
            }
            result.bestModel = this._findBestModel(result, 'exp');
            result.bestModel = this._findBestModel(result, 'abx');

            // 倒数模型 y=a+b/x 通过把自变量替换为 1/x 转成线性回归，故 x 不能为零。
            if (statesA.zero) {
                result.reciprocal = structuredClone(errorWith2parameter);
            } else {
                /** 将自变量转换为倒数。 */
                const reciprocalListA = this._changeInner(listA, (x) => MathPlus.divide(1, x));
                result.reciprocal = this._getRegressionInfo(reciprocalListA, listB, 1, listB,
                    (x, coefficient) => MathPlus.plus(MathPlus.times(coefficient[1], x), coefficient[0])
                );
            }
            result.bestModel = this._findBestModel(result, 'reciprocal');

            for (let key in result) {
                if (Public.typeOf(result[key]) === 'object') {
                    result[key].regressionEquation = Public.funcToString(
                        result[key].parameter,
                        ['linear', 'square'].includes(key) ? 'powerFunc' : `${key}Func`
                    );
                    result[key].R2 = Public.idealizationToString(result[key].R2);
                    result[key].parameter = Public.idealizationToString(result[key].parameter);
                    result[key].model = key;
                }
            }
            return result;
        }
    }

    /**
     * 多项式区间与特征点分析结果。
     *
     * @typedef {object} PowerFunctionAnalysisResult
     * @property {string} equation - 按降幂规范化的多项式表达式。
     * @property {[string, string]} range - 值域左右边界；无穷使用 `-inf`/`+inf`。
     * @property {Array<[string, string]>} increasingInterval - 单调递增区间；
     *   不存在时为 `[['null','null']]`，无穷端点使用专用字符串。
     * @property {Array<[string, string]>} decreasingInterval - 与上项采用相同编码的单调递减区间。
     * @property {Array<[string, string]>} maximumPoint - 极大值点 `[x,y]` 列表；不存在时使用空点哨兵。
     * @property {Array<[string, string]>} minimumPoint - 极小值点 `[x,y]` 列表；不存在时使用空点哨兵。
     * @property {Array<[string, string]>} convexInterval - 凸区间列表；端点编码与单调区间一致。
     * @property {Array<[string, string]>} concaveInterval - 凹区间列表；端点编码与单调区间一致。
     * @property {Array<[string, string]>} inflectionPoint - 拐点 `[x,y]` 列表；不存在时使用空点哨兵。
     * @property {Array<string>} roots - 已格式化实根/复根列表；无根为 `['null']`，
     *   恒等于零为 `['anyRealNumber']`。返回数量不超过实际多项式次数。
     */

    /**
     * 分析最高四次的实系数多项式。
     *
     * @class PowerFunctionTools
     */
    class PowerFunctionTools {
        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[PowerFunctionTools] PowerFunctionTools is a static class and should not be instantiated.');
        }

        /**
         * 对一个包含数值（或可转换为数值的对象）的数组进行原地升序排序。
         * 注意：此排序主要基于数值的实部进行比较。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 按元素实部升序排列的数组；此方法直接调用
         *   `Array#sort` 修改并返回同一个数组引用，复数虚部不参与次序比较。
         * @returns {Array<ComplexNumber|string|number>} 与 `list` 相同的数组引用；元素已按实部从小到大
         *   重排，实部相等的项由 JavaScript 稳定排序保留原相对次序。
         */
        static _sort(list) {
            /**
             * 按实部比较两个数值。
             *
             * @param {*} a - 当前比较的左值；必须能由 `ComplexNumber` 构造。
             * @param {*} b - 当前比较的右值；只比较与 `a` 的实部差，虚部差异视为相等。
             * @returns {-1|0|1} 排序结果。
             */
            list.sort((a, b) => {
                const diff = MathPlus.minus(a, b).re.mantissa;
                if (diff > 0n) {
                    return 1;
                }
                if (diff < 0n) {
                    return -1;
                }
                return 0;
            });
            return list;
        }

        /**
         * 使用霍纳法计算多项式在 x 处的值。
         *
         * @private
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 非空、按最高次项到常数项
         *   排列的系数；允许零系数且不要求先去除前导零，方法不会改变该数组。
         * @param {string|number|bigint|BigNumber|ComplexNumber} x - 代入多项式的实数或复数自变量；
         *   霍纳迭代沿用其高精度表示，避免显式构造各次幂。
         * @returns {ComplexNumber} 多项式值。
         */
        static _getPowerFunctionValue(list, x) {
            // 霍纳法把 a_nx^n+...+a_0 改写为 (...(a_nx+a_(n-1))x+...)x+a_0。
            let result = new ComplexNumber(list[0]);
            const input = new ComplexNumber(x);

            for (let i = 1; i < list.length; i++) {
                result = MathPlus.plus(
                    MathPlus.times(result, input),
                    list[i]
                );
            }
            return result;
        }

        /**
         * 按幂法则计算多项式导数。
         *
         * @private
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 按降幂排列的 `n + 1`
         *   个系数；常数多项式返回空导数系数数组，原数组不会被修改。
         * @returns {Array<ComplexNumber>} 仍按降幂排列的导数系数；若输入表示 n 次多项式，返回 n 项，
         *   第 `i` 项为原系数乘以对应幂次。常数项被移除。
         */
        static _differentiate(list) {
            const result = [];
            const len = list.length;
            for (let i = 0; i < len - 1; i++) {
                result.push(MathPlus.times(list[i], len - i - 1));
            }
            return result;
        }

        /**
         * 求解一次方程 ax + b = 0。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 严格按 `[a, b]` 传入 `ax + b = 0` 的系数；
         *   调用方应先消除前导零，`a = 0` 不属于一次方程。
         * @returns {[ComplexNumber]} 仅含 `-b/a` 的单元素数组；使用数组是为了与二、三、四次求根器保持统一调用协议。
         */
        static _solveLinear(list) {
            const a = list[0], b = list[1];

            const root = MathPlus.divide(MathPlus.minus(0, b), a);
            return [root];
        }

        /**
         * 使用求根公式求解二次方程。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 严格按降幂 `[a, b, c]` 传入的系数；
         *   `a` 应非零。返回根会去除精度噪声，共轭复根的标记约定供上层分析使用。
         * @returns {Array<ComplexNumber|null>} 判别式为零时返回一个去重实根；大于零时返回两个按实部升序的实根；
         *    小于零时返回两个共轭复根并在末尾附加 `null`，供只分析实轴的上层识别。
         */
        static _solveQuadratic(list) {
            const
                a = list[0],
                b = list[1],
                c = list[2];

            const delta = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(b, b),
                MathPlus.times(MathPlus.times(a, c), 4)
            )).re;
            // Δ=b²-4ac 的符号分别对应重实根、两个实根或一对共轭复根。
            const deltaSign = delta.mantissa;

            const mid1 = MathPlus.divide(
                b,
                MathPlus.times(-2, a)
            );
            const mid2 = MathPlus.divide(
                MathPlus.sqrt(delta),
                MathPlus.times(2, a)
            );

            if (deltaSign === 0n) {
                return [mid1];
            }

            const roots = [
                MathPlus.plus(mid1, mid2),
                MathPlus.minus(mid1, mid2)
            ];
            if (deltaSign > 0n) {
                return PowerFunctionTools._sort(roots);
            }

            // 末尾的 null 标记一对共轭复根。
            roots.push(null);
            return roots;
        }

        /**
         * 使用盛金公式求解三次方程。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 严格按降幂 `[a, b, c, d]` 传入的系数；
         *   首项 `a` 应非零。重根会按内部近零判定合并，输入数组不被改写。
         * @returns {Array<ComplexNumber|null>} 按精度判定去重后的根：全实根按实部排序；一实根加一对
         *   共轭复根时返回三个根并追加 `null` 哨兵。上层只取次数范围内的真实根项。
         */
        static _solveCubic(list) {
            const
                a = list[0],
                b = list[1],
                c = list[2],
                d = list[3];

            const A = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(b, b),
                MathPlus.times(MathPlus.times(a, c), 3)
            )).re;

            const B = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(b, c),
                MathPlus.times(MathPlus.times(a, d), 9)
            )).re;

            const C = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(c, c),
                MathPlus.times(MathPlus.times(b, d), 3)
            )).re;

            const delta = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(B, B),
                MathPlus.times(MathPlus.times(A, C), 4)
            )).re;

            // 盛金公式以 A=b²-3ac、B=bc-9ad、C=c²-3bd 和 Δ=B²-4AC 分类根的性质。
            if (A.isZero() && B.isZero()) {
                return [MathPlus.divide(
                    b,
                    MathPlus.times(a, -3)
                )];
            }

            if (delta.isPositive()) {
                // Δ>0：一个实根与一对共轭复根。
                const mid1 = MathPlus.times(a, '1.5');
                const mid2 = MathPlus.minus(
                    MathPlus.times(A, b),
                    MathPlus.times(mid1, B)
                );
                const mid3 = MathPlus.times(mid1, MathPlus.sqrt(delta));
                const w1 = MathPlus.cbrt(MathPlus.plus(mid2, mid3));
                const w2 = MathPlus.cbrt(MathPlus.minus(mid2, mid3));

                const re = MathPlus.divide(
                    MathPlus.minus(MathPlus.divide(MathPlus.plus(w1, w2), 2), b),
                    MathPlus.times(a, 3)
                ).re;
                const im = MathPlus.divide(
                    MathPlus.times(MathPlus.minus(w1, w2), MathPlus.sqrt(3)),
                    MathPlus.times(a, 6)
                ).re;

                return [
                    MathPlus.divide(
                        MathPlus.minus(0, MathPlus.plus(MathPlus.plus(w1, w2), b)),
                        MathPlus.times(a, 3)
                    ),
                    new ComplexNumber([re, im]),
                    new ComplexNumber([re, MathPlus.minus(0, im).re]),
                    null
                ];
            }

            if (delta.isZero()) {
                // Δ=0：至少两个实根重合；函数值符号用于维持“重根在前”的返回约定。
                const k = MathPlus.divide(B, A);
                const root1 = MathPlus.minus(k, MathPlus.divide(b, a));
                const root2 = MathPlus.divide(k, -2);

                const mid = MathPlus.divide(MathPlus.plus(root1, root2), 2);
                const func1 = PowerFunctionTools._getPowerFunctionValue(list, MathPlus.plus(root1, mid));
                const func2 = PowerFunctionTools._getPowerFunctionValue(list, MathPlus.minus(root1, mid));
                const sign = MathPlus.times(func1, func2).re.mantissa;
                if (sign > 0n) {
                    return [root2, root1];
                }
                return [root1, root2];
            }

            const absA = MathPlus.abs(A);
            // Δ<0 为不可约情形，使用三角形式得到三个互异实根。
            const T = MathPlus.divide(
                MathPlus.minus(
                    MathPlus.times(MathPlus.times(absA, b), 2),
                    MathPlus.times(MathPlus.times(a, B), 3)
                ),
                MathPlus.times(MathPlus.pow(absA, '1.5'), 2)
            );
            let ct;
            // 将 T 钳制到 arccos 的定义域，吸收浮点误差。
            if (!MathPlus.plus(MathPlus.abs(T), -1).re.isPositive()) {
                ct = MathPlus.divide(MathPlus.arccos(T), 3);
            } else {
                ct = MathPlus.divide(MathPlus.arccos(T.re.isPositive() ? 1 : -1), 3);
            }
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
            return PowerFunctionTools._sort([root1, root2, root3]);
        }

        /**
         * 使用天珩公式解析求解四次方程 ax⁴ + bx³ + cx² + dx + e = 0。
         * 该方法通过引入一个预解三次方程来降次，能够处理所有情况，包括四个实数根、两对共轭复数根、一对共轭复数根和两个实数根，以及各种重根的情况。
         *
         * @private
         * @param {Array<ComplexNumber|string|number>} list - 严格按降幂 `[a, b, c, d, e]` 传入的四次
         *   方程系数；`a` 必须非零，每项均需可转换为 `ComplexNumber`。方法返回解析根但不修改系数数组。
         * @returns {Array<ComplexNumber>} 恰含四个解析根的数组，重根按代数重数保留；元素顺序来自
         *   天珩公式的四个符号组合，不承诺按实部或虚部排序。
         */
        static _solveQuartic(list) {
            const
                a = list[0],
                b = list[1],
                c = list[2],
                d = list[3],
                e = list[4];

            const D = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(MathPlus.times(b, b), 3),
                MathPlus.times(MathPlus.times(a, c), 8)
            )).re;

            const E = Public.zeroCorrect(MathPlus.minus(
                MathPlus.minus(
                    MathPlus.times(MathPlus.times(MathPlus.times(a, b), c), 4),
                    MathPlus.times(MathPlus.times(MathPlus.times(a, a), d), 8)
                ),
                MathPlus.times(MathPlus.times(b, b), b)
            )).re;

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

            const A = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(D, D),
                MathPlus.times(3, F)
            )).re;

            const B = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(D, F),
                MathPlus.times(MathPlus.times(E, E), 9)
            )).re;

            const C = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(F, F),
                MathPlus.times(MathPlus.times(D, MathPlus.times(E, E)), 3)
            )).re;

            const delta = Public.zeroCorrect(MathPlus.minus(
                MathPlus.times(B, B),
                MathPlus.times(MathPlus.times(A, C), 4)
            )).re;

            // 天珩公式以 D、E、F 及其导出判别式 A、B、C、Δ 区分重根和实/复根组合。
            if (D.isZero() && E.isZero() && F.isZero()) {
                // D=E=F=0：四重实根。
                return [MathPlus.divide(b, MathPlus.times(a, -4))];
            }

            if (
                !D.isZero() && !E.isZero() && !F.isZero() &&
                A.isZero() && B.isZero() && C.isZero()
            ) {
                // D、E、F 非零且 A=B=C=0：一个三重实根和一个单实根。
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

            if (!D.isZero() && E.isZero() && F.isZero()) {
                // E=F=0、D≠0：两对二重根，D 的符号决定实根或复根。
                const mid0 = MathPlus.times(a, -4);
                const mid1 = MathPlus.divide(b, mid0);
                const mid2 = MathPlus.divide(MathPlus.sqrt(D), mid0);
                return [
                    MathPlus.plus(mid1, mid2),
                    MathPlus.minus(mid1, mid2)
                ];
            }

            if (
                !A.isZero() && !B.isZero() && !C.isZero() &&
                delta.isZero()
            ) {
                // A、B、C 非零且 Δ=0：一对二重实根，另两根由 A、B 的符号决定。
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

            if (delta.isPositive()) {
                // Δ>0：两个互异实根和一对共轭复根。
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

            if (E.isZero() && F.isPositive() && !D.isZero()) {
                // E=0、F>0：按 D 与 F 的组合直接构造四个根。
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

            if (E.isZero() && F.isNegative()) {
                // E=0、F<0：得到两对共轭复根。
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

            const mid0 = MathPlus.sqrt(A);
            // 其余 Δ<0 情形通过预解三次方程的三角解构造 y1、y2、y3。
            const T = MathPlus.divide(
                MathPlus.minus(
                    MathPlus.times(B, 3),
                    MathPlus.times(MathPlus.times(A, D), 2)
                ),
                MathPlus.times(MathPlus.times(A, mid0), 2)
            );
            let ct;
            if (!MathPlus.plus(MathPlus.abs(T), -1).re.isPositive()) {
                ct = MathPlus.divide(MathPlus.arccos(T), 3);
            } else {
                ct = MathPlus.divide(MathPlus.arccos(T.re.isPositive() ? 1 : -1), 3);
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

            if (!E.isZero() && F.isPositive() && D.isPositive()) {
                // D、F 均为正时四根均为实数；否则下方组合给出两对共轭复根。
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
         * 分析四次及以下实系数多项式的区间、极值、拐点和根。
         *
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 最高五项、按降幂排列的
         *   实系数 `[a, b, c, d, e]`；允许省略高次项但至少应含常数项。前导零会自动降阶，
         *   任一非零虚部都会拒绝整次分析，输入数组不会被排序或改写。
         * @returns {PowerFunctionAnalysisResult} 字段固定的分析结果；低次多项式不适用的区间或点仍以
         *   `[['null','null']]` 保留，避免 UI 按次数猜测缺失字段。所有边界、坐标和根均为显示字符串。
         * @throws {Error} 系数包含复数时抛出。
         */
        static powerFunctionAnalysis(list) {
            const result = {};
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
            result.equation = Public.funcToString([e, d, c, b, a], 'powerFunc');

            if (!a.isZero()) {
                // 四次函数：一阶导数的实根划分单调区间，二阶导数的实根划分凹凸区间。
                list = [a, b, c, d, e];
                const diff1 = PowerFunctionTools._differentiate(list);
                const diff1Roots = PowerFunctionTools._solveCubic(diff1);
                const diff2 = PowerFunctionTools._differentiate(diff1);
                const diff2Roots = PowerFunctionTools._solveQuadratic(diff2);

                if ([1, 2, 4].includes(diff1Roots.length)) {
                    const minMax = Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]));
                    const point = Public.idealizationToString(diff1Roots[0]);
                    result.range = a.isPositive() ? [minMax, '+inf'] : ['-inf', minMax];
                    result[a.isPositive() ? 'increasingInterval' : 'decreasingInterval'] = [[point, '+inf']];
                    result[a.isPositive() ? 'decreasingInterval' : 'increasingInterval'] = [['-inf', point]];
                    result[a.isPositive() ? 'maximumPoint' : 'minimumPoint'] = [['null', 'null']];
                    result[a.isPositive() ? 'minimumPoint' : 'maximumPoint'] = [[point, minMax]];
                } else if (diff1Roots.length === 3) {
                    const minMax1 = PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]);
                    const minMax2 = PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[1]);
                    const minMax3 = PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[2]);
                    const minMaxList = PowerFunctionTools._sort([minMax1, minMax2, minMax3]);
                    const realMinMax = Public.idealizationToString(a.isPositive() ? minMaxList[0] : minMaxList[2]);
                    result.range = a.isPositive() ? [realMinMax, '+inf'] : ['-inf', realMinMax];
                    const point1 = Public.idealizationToString(diff1Roots[0]),
                        point2 = Public.idealizationToString(diff1Roots[1]),
                        point3 = Public.idealizationToString(diff1Roots[2]);
                    result[a.isPositive() ? 'increasingInterval' : 'decreasingInterval'] = [[point1, point2], [point3, '+inf']];
                    result[a.isPositive() ? 'decreasingInterval' : 'increasingInterval'] = [['-inf', point1], [point2, point3]];
                    result[a.isPositive() ? 'maximumPoint' : 'minimumPoint'] = [[point2, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[1]))]];
                    result[a.isPositive() ? 'minimumPoint' : 'maximumPoint'] = [
                        [point1, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]))],
                        [point3, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[2]))]
                    ];
                }

                if ([1, 3].includes(diff2Roots.length)) {
                    result[a.isPositive() ? 'convexInterval' : 'concaveInterval'] = [['null', 'null']];
                    result[a.isPositive() ? 'concaveInterval' : 'convexInterval'] = [['-inf', '+inf']];
                    result.inflectionPoint = [['null', 'null']];
                } else if (diff2Roots.length === 2) {
                    const point1 = Public.idealizationToString(diff2Roots[0]),
                        point2 = Public.idealizationToString(diff2Roots[1]);
                    result[a.isPositive() ? 'convexInterval' : 'concaveInterval'] = [[point1, point2]];
                    result[a.isPositive() ? 'concaveInterval' : 'convexInterval'] = [['-inf', point1], [point2, '+inf']];
                    result.inflectionPoint = [
                        [point1, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff2Roots[0]))],
                        [point2, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff2Roots[1]))]
                    ];
                }

                const roots = [];
                const originalRoots = PowerFunctionTools._solveQuartic(list);
                for (let i = 0; i < Math.min(4, originalRoots.length); i++) {
                    roots.push(Public.idealizationToString(originalRoots[i]));
                }
                result.roots = roots;
                return result;
            }

            if (!b.isZero()) {
                // 三次函数：一阶导数决定极值，唯一的二阶导数根给出拐点。
                list = [b, c, d, e];
                const diff1 = PowerFunctionTools._differentiate(list);
                const diff1Roots = PowerFunctionTools._solveQuadratic(diff1);
                const diff2 = PowerFunctionTools._differentiate(diff1);
                const diff2Roots = PowerFunctionTools._solveLinear(diff2);
                result.range = ['-inf', '+inf'];

                if ([1, 3].includes(diff1Roots.length)) {
                    result[b.isPositive() ? 'increasingInterval' : 'decreasingInterval'] = [['-inf', '+inf']];
                    result[b.isPositive() ? 'decreasingInterval' : 'increasingInterval'] = [['null', 'null']];
                    result.maximumPoint = [['null', 'null']];
                    result.minimumPoint = [['null', 'null']];
                } else {
                    const point1 = Public.idealizationToString(diff1Roots[0]),
                        point2 = Public.idealizationToString(diff1Roots[1]);
                    result[b.isPositive() ? 'increasingInterval' : 'decreasingInterval'] = [['-inf', point1], [point2, '+inf']];
                    result[b.isPositive() ? 'decreasingInterval' : 'increasingInterval'] = [[point1, point2]];
                    result[b.isPositive() ? 'maximumPoint' : 'minimumPoint'] = [[point1, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]))]];
                    result[b.isPositive() ? 'minimumPoint' : 'maximumPoint'] = [[point2, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[1]))]];
                }

                const point = Public.idealizationToString(diff2Roots[0]);
                result[b.isPositive() ? 'convexInterval' : 'concaveInterval'] = [['-inf', point]];
                result[b.isPositive() ? 'concaveInterval' : 'convexInterval'] = [[point, '+inf']];
                result.inflectionPoint = [[point, Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff2Roots[0]))]];

                const roots = [];
                const originalRoots = PowerFunctionTools._solveCubic(list);
                for (let i = 0; i < Math.min(3, originalRoots.length); i++) {
                    roots.push(Public.idealizationToString(originalRoots[i]));
                }
                result.roots = roots;
                return result;
            }

            if (!c.isZero()) {
                // 二次函数：顶点决定值域与单调性，二阶导数符号决定全区间凹凸性。
                list = [c, d, e];
                const diff1 = PowerFunctionTools._differentiate(list);
                const diff1Roots = PowerFunctionTools._solveLinear(diff1);
                const point = Public.idealizationToString(diff1Roots[0]);
                const minMax = Public.idealizationToString(PowerFunctionTools._getPowerFunctionValue(list, diff1Roots[0]));
                result.range = c.isPositive() ? [minMax, '+inf'] : ['-inf', minMax];
                result[c.isPositive() ? 'increasingInterval' : 'decreasingInterval'] = [[point, '+inf']];
                result[c.isPositive() ? 'decreasingInterval' : 'increasingInterval'] = [['-inf', point]];
                result[c.isPositive() ? 'maximumPoint' : 'minimumPoint'] = [['null', 'null']];
                result[c.isPositive() ? 'minimumPoint' : 'maximumPoint'] = [[point, minMax]];
                result[c.isPositive() ? 'convexInterval' : 'concaveInterval'] = [['null', 'null']];
                result[c.isPositive() ? 'concaveInterval' : 'convexInterval'] = [['-inf', '+inf']];
                result.inflectionPoint = [['null', 'null']];

                const roots = [];
                const originalRoots = PowerFunctionTools._solveQuadratic(list);
                for (let i = 0; i < Math.min(2, originalRoots.length); i++) {
                    roots.push(Public.idealizationToString(originalRoots[i]));
                }
                result.roots = roots;
                return result;
            }

            if (!d.isZero()) {
                // 一次函数由斜率符号决定全区间单调性，不存在有限极值或拐点。
                list = [d, e];
                result.range = ['-inf', '+inf'];
                result[d.isPositive() ? 'increasingInterval' : 'decreasingInterval'] = [['-inf', '+inf']];
                result[d.isPositive() ? 'decreasingInterval' : 'increasingInterval'] = [['null', 'null']];
                result.maximumPoint = [['null', 'null']];
                result.minimumPoint = [['null', 'null']];
                result.convexInterval = [['null', 'null']];
                result.concaveInterval = [['null', 'null']];
                result.inflectionPoint = [['null', 'null']];
                result.roots = Public.idealizationToString(PowerFunctionTools._solveLinear(list));
                return result;
            }

            const num = Public.idealizationToString(e);
            result.range = [num, num];
            result.increasingInterval = [['null', 'null']];
            result.decreasingInterval = [['null', 'null']];
            result.maximumPoint = [['null', 'null']];
            result.minimumPoint = [['null', 'null']];
            result.convexInterval = [['null', 'null']];
            result.concaveInterval = [['null', 'null']];
            result.inflectionPoint = [['null', 'null']];
            result.roots = [e.isZero() ? 'anyRealNumber' : 'null'];
            return result;
        }
    }

    /**
     * 计算复数的 n 次方根。
     *
     * @class RadicalFunctionTools
     */
    class RadicalFunctionTools {
        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[RadicalFunctionTools] RadicalFunctionTools is a static class and should not be instantiated.');
        }

        /**
         * 根据极坐标形式生成复数 n 次方根的通式和求值函数。
         *
         * @private
         * @param {ComplexNumber|string|number} z - 任意实数或复数被开方数；转换后使用它的模和主辐角
         *   构造根族，零值会自然得到零模长。
         * @param {ComplexNumber|string|number} n - 已由上层验证的正整数根指数；该私有方法依赖此约束，
         *   用它计算 `1 / n`、根间角距及 `k` 的有效范围。
         * @returns {[string, function(ComplexNumber|string|number): ComplexNumber]} 二元组：第 0 项是包含
         *   `[k]` 和 `[toPolar]` 内部词元的根通式；第 1 项是同步求值函数，接收根序号 `k` 并返回
         *   `r^(1/n) ∠ ((arg(z)+2kπ)/n)`，相差 `n` 的整数序号会得到同一个根。
         */
        static _generalFormula(z, n) {
            z = new ComplexNumber(z);
            n = new ComplexNumber(n);

            // 若 z=r·e^(iθ)，则第 k 个 n 次方根为 r^(1/n)·e^(i(θ+2kπ)/n)。
            const realPow = MathPlus.divide(1, n);
            const r = MathPlus.abs(z);
            const arg = MathPlus.arg(z);
            const length = MathPlus.pow(r, realPow);
            const argumentConstant = MathPlus.times(realPow, arg);
            const argumentConstantK = MathPlus.times(
                MathPlus.times(2, CalcConfig.constants.pi),
                realPow
            );
            const lengthPart = Public.idealizationToString(length);
            const argumentPart = Public.funcToString([argumentConstant, argumentConstantK], 'powerFunc', '[k]');

            let formula;
            if (lengthPart.includes('E')) {
                formula = `(${lengthPart})`;
            } else {
                formula = lengthPart;
            }
            formula += `[toPolar](${argumentPart})`;

            return [
                formula,
                (x) => MathPlus.toPolar(
                    length,
                    MathPlus.plus(argumentConstant, MathPlus.times(x, argumentConstantK))
                )
            ];
        }

        /**
         * 计算复数的 n 次方根通式、索引范围和有限数量的数值解。
         *
         * @param {ComplexNumber|string|number} z - 可解析为实数或复数的被开方数；结果对象同时保留
         *   规范化后的 `z` 字符串、通式以及按 `k` 排列的数值根。
         * @param {ComplexNumber|string|number} n - 必须能在精度修正后成为严格正整数；`n` 个不同根中
         *   最多展示 `CalcConfig.RADICAL_FUNCTION_MAX_SHOW_RESULTS` 个，其余通过 `overflow` 标记。
         * @returns {{z:string, n:string, formula:string, kRange:[string,string], numericalResults:Array<string>, overflow:boolean}}
         *   固定结构的根分析结果：`z`、`n` 是规范化输入；`formula` 是含 `[k]` 的极坐标通式；
         *   `kRange` 恒为 `['0', String(n-1)]`；`numericalResults[i]` 对应 `k=i`；`overflow` 表示
         *   `n` 超过展示上限，未展示根仍可由通式计算。
         * @throws {Error} n 不是正整数时抛出。
         */
        static radicalFunctionAnalysis(z, n) {
            z = Public.zeroCorrect(MathPlus.calc(z)[0]);
            n = Public.integerCorrect(Public.zeroCorrect(MathPlus.calc(n)[0]));
            if (!n.onlyReal || n.re.power < 0 || !n.re.isPositive()) {
                throw new Error('[radicalFunctionTools] n can only be a positive integer.');
            }

            const result = {};
            result.z = Public.idealizationToString(z);
            result.n = Public.idealizationToString(n);
            const innerResult = RadicalFunctionTools._generalFormula(z, n);
            result.formula = innerResult[0];
            result.kRange = ['0', MathPlus.minus(n, 1).toString()];
            let count;
            if (MathPlus.minus(n, CalcConfig.RADICAL_FUNCTION_MAX_SHOW_RESULTS).re.isPositive()) {
                count = CalcConfig.RADICAL_FUNCTION_MAX_SHOW_RESULTS;
                result.overflow = true;
            } else {
                count = n;
                result.overflow = false;
            }
            result.numericalResults = Public.idealizationToString(
                Public.functionValueList(innerResult[1], 0, 1, MathPlus.minus(count, 1))
            );
            return result;
        }
    }

    /**
     * 在指定范围内生成函数 f 和 g 的值列表。
     *
     * @class FuncValueListTools
     */
    class FuncValueListTools {
        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[FuncValueListTools] FuncValueListTools is a static class and should not be instantiated.');
        }

        /**
         * 在实数闭区间内生成可能相互引用的 f(x) 和 g(x) 值列表。
         *
         * @param {string} f - 使用内部词元书写的 `f(x)` 函数体；可通过 `[g]` 调用 `g`，
         *   单点求值失败只在 `f` 结果的同一位置写入 `error`。
         * @param {string} g - 使用内部词元书写的 `g(x)` 函数体；可通过 `[f]` 调用 `f`，
         *   其失败位置与 `f` 独立记录。
         * @param {string|number|BigNumber|ComplexNumber|Array} start - 闭区间实数起点；表达式求值、
         *   近零修正后不得带非零虚部，且不得大于 `end`。
         * @param {string|number|BigNumber|ComplexNumber|Array} step - 严格大于零的纯实步长；决定显示点间距。
         *   达到最大展示数量时停止继续分配，并在结果尾部放置省略标记。
         * @param {string|number|BigNumber|ComplexNumber|Array} end - 闭区间实数终点；
         *   仅计算按步长实际到达且不大于它的点，不会为了包含终点而改变最后一步。
         * @returns {{varList:Array<string>, f:Array<string>, g:Array<string>}} 三个索引对齐的显示数组：
         *   `varList[i]` 是采样自变量，`f[i]`、`g[i]` 是对应函数值或 `error`。超出展示上限时
         *   `varList` 末尾追加 `[print_content_omit]`，两个函数数组同位置追加 `[not_applicable]`。
         * @throws {Error} 边界或步长不是有效实数时抛出。
         */
        static valueList(f, g, start, step, end) {
            let overflow = false;
            start = Public.zeroCorrect(MathPlus.calc(start)[0]);
            step = Public.zeroCorrect(MathPlus.calc(step)[0]);
            end = Public.zeroCorrect(MathPlus.calc(end)[0]);

            if (!start.onlyReal || !step.onlyReal || !end.onlyReal) {
                throw new Error('[FuncValueListTools] Complex number appear in the input.');
            }
            if (MathPlus.minus(start, end).re.isPositive()) {
                throw new Error('[FuncValueListTools] The initial value is greater than the termination value.');
            }
            // 正步长校验可防止无限循环。
            if (!step.re.isPositive()) {
                throw new Error('[FuncValueListTools] Step size less than or equal to 0.');
            }

            const varList = [];
            let i = start;
            for (; !MathPlus.minus(i, end).re.isPositive() && varList.length < CalcConfig.VALUE_LIST_MAX_SHOW_RESULTS; i = MathPlus.plus(i, step)) {
                varList.push(Public.idealizationToString(i));
            }

            if (varList.length === CalcConfig.VALUE_LIST_MAX_SHOW_RESULTS && !MathPlus.minus(i, end).re.isPositive()) {
                // 用半步后的临时终点让两个函数值列表恰好计算到最后一个已显示自变量，
                // 再以专用词元表示仍有结果被省略，避免创建超长数组。
                overflow = true;
                end = MathPlus.minus(i, MathPlus.divide(step, 2n));
                varList.push('[print_content_omit]');
            }

            const resultF = Public.idealizationToString(Public.functionValueList(
                (x) => MathPlus.calc(f, {g: g, unknown: x})[0],
                start, step, end
            ));

            const resultG = Public.idealizationToString(Public.functionValueList(
                (x) => MathPlus.calc(g, {f: f, unknown: x})[0],
                start, step, end
            ));

            return {
                varList: varList,
                f: overflow ? [...resultF, '[not_applicable]'] : resultF,
                g: overflow ? [...resultG, '[not_applicable]'] : resultG
            };
        }
    }

    /**
     * 使用单次调用参数封装计算核心，不修改全局精度配置。
     *
     * @class CalcTools
     */
    class CalcTools {
        /**
         * 阻止实例化静态工具类。
         *
         * @throws {Error} 始终抛出。
         */
        constructor() {
            throw new Error('[CalcTools] CalcTools is a static class and should not be instantiated.');
        }

        /**
         * 使用独立的计算与输出精度计算表达式；这些选项只作用于本次调用。
         *
         * @param {string} expr - 使用内部数学词元书写的表达式；规范化后的表达式会与结果一并返回。
         * @param {object} [options={}] - 只覆盖本次调用的计算、格式化和自定义函数上下文；不会修改
         *   `CalcConfig`，适合并发 Worker 任务使用。
         * @param {'algebra'|'polar'} [options.printMode=CalcConfig.globalPrintMode] - 最终字符串中的复数表示法；
         *   `outputMode='mid'` 返回内部值时不进行这一步格式化。
         * @param {number} [options.calcAcc=CalcConfig.globalCalcAccuracy] - 本次解析和中间运算使用的正整数
         *   有效位数；应不超过配置允许的计算上限。
         * @param {number} [options.outputAcc=CalcConfig.outputAccuracy] - 最终显示精度；支持绝对位数、
         *   `(0, 1)` 比例以及非正的“保持计算精度”语义。
         * @param {'calc'|'syntaxCheck'} [options.calcMode='calc'] - `calc` 计算表达式，`syntaxCheck` 仅执行
         *   词法、语法和规范化流程，用于输入校验。
         * @param {'output'|'mid'} [options.outputMode='output'] - `output` 返回格式化字符串；`mid` 返回
         *   可供后续高精度运算使用的内部结果，调用方不可假定二者类型相同。
         * @param {string} [options.f] - 可供表达式 `[f]` 调用的函数体；可引用 `[x]` 和 `[g]`。
         * @param {string} [options.g] - 可供表达式 `[g]` 调用的函数体；可引用 `[x]` 和 `[f]`。
         * @returns {{result:string|[[number,bigint,number],[number,bigint,number]], expr:string}} 固定二字段对象：
         *   `result` 在 `outputMode='output'` 时是格式化字符串，在 `mid` 时是实部、虚部各自的
         *   `[power,mantissa,acc]` 元组；
         *   `expr` 始终是语法解析后的规范化内部表达式，可用于回显或再次计算。
         */
        static exec(expr, {
            printMode = CalcConfig.globalPrintMode,
            calcAcc = CalcConfig.globalCalcAccuracy,
            outputAcc = CalcConfig.outputAccuracy,
            calcMode = 'calc',
            outputMode = 'output',
            f, g
        } = {}) {
            let effectiveOutputAcc = outputAcc;
            if (effectiveOutputAcc > 1 && effectiveOutputAcc > calcAcc) {
                effectiveOutputAcc = calcAcc;
            }

            const calcResult = MathPlus.calc(expr, {
                f: f,
                g: g,
                mode: calcMode,
                acc: calcAcc
            });

            return {
                result: outputMode === 'output' ?
                        Public.idealizationToString(calcResult[0], {
                            acc: effectiveOutputAcc,
                            printMode: printMode
                        }) :
                        calcResult[0].valueOf(),
                expr: calcResult[1]
            };
        }
    }

    window.BigNumber = BigNumber;
    window.ComplexNumber = ComplexNumber;
    window.MathPlus = MathPlus;
    window.StatisticsTools = StatisticsTools;
    window.PowerFunctionTools = PowerFunctionTools;
    window.RadicalFunctionTools = RadicalFunctionTools;
    window.FuncValueListTools = FuncValueListTools;
    window.CalcTools = CalcTools;
})();