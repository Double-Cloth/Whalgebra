(function () {
    "use strict";

    /**
     * @class SyncWorker
     * @description SyncWorker 类提供了一个高级抽象层，用于简化 Web Worker 的使用。
     * 它允许开发者动态地将一组JavaScript函数及其依赖项注入到一个新的Worker线程中执行，
     * 而无需手动管理Worker文件、消息传递协议或资源清理。
     */
    class SyncWorker {
        /**
         * 底层的 Web Worker 实例。
         * @type {Worker|null}
         * @private
         */
        _worker = null;

        /**
         * 为 Worker Blob 创建的 URL。存储起来以便后续在 terminate 时进行清理。
         * @type {string|null}
         * @private
         */
        _workerUrl = null;

        /**
         * 一个用于追踪从主线程发送到 Worker 的待处理任务的 Map。
         * 键是任务 ID (bigint)，值是一个包含 Promise 的 `resolve` 和 `reject` 函数以及超时计时器ID的对象。
         * @type {Map<bigint, {resolve: Function, reject: Function, timeoutId: number|null}>}
         * @private
         */
        _taskQueue = new Map();

        /**
         * 一个简单的计数器，用于为每个任务生成唯一的 ID。
         * 使用 BigInt 是为了支持极大量的任务，防止因数值溢出导致ID重复。
         * @type {bigint}
         * @private
         */
        _nextTaskId = 0n;

        /**
         * 保存配置用于重启。
         * @type {object|null}
         * @private
         */
        _config = null;

        /**
         * 创建一个 SyncWorker 实例。
         * @param {object} config - Worker 的配置对象。
         * @param {object} config.callableFunctions - 一个对象，其键是函数名，值是对应的函数定义。
         * @param {Array<{name: string, value: *}>} [config.dependencies=[]] - 一个数组，包含需注入的依赖项。每个元素应为 {name: '变量名', value: 变量值}。
         * @throws {Error} 如果 `callableFunctions` 不是一个非空对象，则抛出错误。
         */
        constructor(config) {
            // 验证配置
            if (!config.callableFunctions || typeof config.callableFunctions !== 'object' || Object.keys(config.callableFunctions).length === 0) {
                throw new Error('[SyncWorker] callableFunctions must be a non-empty object.');
            }
            // 保存配置
            this._config = config;
            // 初始化
            this._init();
        }

        /**
         * @readonly
         * @type {string}
         * @description 自定义 `Object.prototype.toString.call()` 的返回值。
         * 这使得 `Public.typeOf(new SyncWorker())` 能够返回 'syncWorker'。
         */
        get [Symbol.toStringTag]() {
            return 'SyncWorker';
        }

        /**
         * @readonly
         * @type {boolean}
         * @description 判断 Worker 是否已终止。
         */
        get isTerminated() {
            return this._worker === null;
        }

        /**
         * @private
         * @method _init
         * @description 初始化或重新初始化 Web Worker。
         * 此方法负责根据提供的函数和依赖项生成 Worker 脚本，
         * 创建一个 Blob URL，实例化 Worker，并设置用于通信的消息监听器。
         * 它由构造函数和 restart 方法调用。
         * @returns {void}
         */
        _init() {
            // 从保存的配置中解构出可调用的函数和依赖项。
            const {callableFunctions, dependencies = []} = this._config;
            // 验证 dependencies 是否为数组
            if (!Array.isArray(dependencies)) {
                throw new Error('[SyncWorker] dependencies must be an array.');
            }

            // 生成包含所有函数和依赖的 Worker 脚本字符串。
            const workerCode = this._generateWorkerCode(callableFunctions, dependencies);
            // 将脚本字符串转换为 Blob 对象，以便可以作为文件处理。
            const blob = new Blob([workerCode], {type: 'application/javascript'});
            // 为 Blob 创建一个唯一的 URL，Worker 将从这个 URL 加载。
            this._workerUrl = URL.createObjectURL(blob);
            // 创建新的 Web Worker 实例。
            this._worker = new Worker(this._workerUrl);
            // 设置消息监听器以处理与 Worker 的双向通信。
            this._setupMessageListeners();
        }

        /**
         * 设置 Worker 的消息和错误监听器。
         * @private
         */
        _setupMessageListeners() {
            if (!this._worker) {
                return;
            }

            /**
             * 消息处理器：用于从 Worker 接收任务成功或失败的结果。
             * @param {MessageEvent} event - 来自 Worker 的事件对象，包含 {id, result?, error?}。
             */
            this._worker.onmessage = (event) => {
                const {id, result, error} = event.data;
                if (!this._taskQueue.has(id)) {
                    return; // 任务可能已被取消或超时，直接忽略。
                }

                const {resolve, reject, timeoutId} = this._taskQueue.get(id);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                if (error) {
                    const workerError = new Error(error.message);
                    workerError.name = error.name || 'WorkerError';
                    workerError.stack = error.stack;
                    reject(workerError);
                } else {
                    resolve(result);
                }
                this._taskQueue.delete(id);
            };

            /**
             * 错误处理器：处理 Worker 内部发生的、无法恢复的严重错误（例如，生成的代码中存在语法错误）。
             * @param {ErrorEvent} err - 错误事件对象。
             */
            this._worker.onerror = (err) => {
                const fatalError = new Error(`[SyncWorker] Worker encountered a fatal error: ${err.message} at ${err.filename}:${err.lineno}.`);
                this._taskQueue.forEach(({reject}) => reject(fatalError));
                this._taskQueue.clear();
                // 一旦发生致命错误，Worker 将不可用，最好直接终止。
                this.terminate();
            };
        }

        /**
         * 根据提供的函数和依赖，将 Worker 的脚本内容生成为字符串。
         * @param {object} funcs - 可调用函数的对象。
         * @param {Array<{name: string, value: *}>} deps - 依赖项的数组。
         * @returns {string}
         * @private
         */
        _generateWorkerCode(funcs, deps) {
            /**
             * 序列化一个值，以便可以将其存储或传输。
             * @param {*} value - 需要被序列化的值。
             * @returns {string} - 序列化后的字符串。
             */
            const serializeValue = (value) => {
                // 1. 处理函数：直接转换为字符串源码
                if (typeof value === 'function') {
                    return value.toString();
                }

                // 2. 处理 undefined
                if (value === undefined) {
                    return 'undefined';
                }

                // 3. 处理数字：保留 NaN 和 Infinity
                if (typeof value === 'number') {
                    if (Number.isNaN(value)) {
                        return 'NaN';
                    }
                    if (!Number.isFinite(value)) {
                        return value > 0 ? 'Infinity' : '-Infinity';
                    }
                    return value.toString();
                }

                // 4. 处理 BigInt：添加 'n' 后缀使其成为有效的 JS BigInt 字面量
                if (typeof value === 'bigint') {
                    return `${value.toString()}n`;
                }

                // 5. 处理字符串：使用 JSON.stringify 安全转义引号等特殊字符
                if (typeof value === 'string') {
                    return JSON.stringify(value);
                }

                // 6. 处理数组：递归序列化每个元素
                if (Array.isArray(value)) {
                    const elements = value.map(v => serializeValue(v));
                    return `[${elements.join(',')}]`;
                }

                // 7. 处理对象：递归序列化每个属性
                if (typeof value === 'object' && value !== null) {
                    // 注意：这里未处理循环引用和 Map/Set 等特殊对象，
                    // 但这对于配置对象和数学常数传递通常足够了。
                    const props = [];
                    for (const key in value) {
                        if (Object.prototype.hasOwnProperty.call(value, key)) {
                            // 键名加引号以防包含特殊字符，键值递归处理
                            props.push(`${JSON.stringify(key)}: ${serializeValue(value[key])}`);
                        }
                    }
                    return `{${props.join(',')}}`;
                }

                // 8. 其他基本类型（null, boolean）：直接使用 JSON 结果
                return JSON.stringify(value);
            };

            let code = `
            /* Dynamically Generated Worker Code. */
            "use strict";

            /* -- Dependency Injection -- */
            /* Inject dependencies as constants into the global scope of the Worker. */
        `;
            for (const dep of deps) {
                // 解构 name 和 value
                const {name, value} = dep;

                if (!name) {
                    throw new Error(`[SyncWorker] A dependency is missing the 'name' property.`);
                }

                try {
                    code += `const ${name} = ${serializeValue(value)};\n`;
                } catch (e) {
                    throw new Error(`[SyncWorker] Dependency '${name}' could not be serialized: ${e.message}.`);
                }
            }

            code += `
            /* -- Function registration -- */
            /* Store all callable functions in an object inside the Worker for searching by name. */
            const availableFunctions = {
        `;
            for (const [key, func] of Object.entries(funcs)) {
                code += `${key}: ${func.toString()},\n`;
            }
            code += `
            };

            /* -- Worker internal status -- */
            /* A Map used to track running tasks and their cancellation status. */
            const runningTasks = new Map();

            /* -- Worker message processor -- */
            /* This is the core logic of Worker, used to listen for and respond to messages from the main thread. */
            self.onmessage = async (event) => {
                const { type, id, functionName, args } = event.data;

                /* Processing messages of type 'cancel'. */
                if (type === 'cancel') {
                    if (runningTasks.has(id)) {
                        /* If the task is running, mark its cancellation status as true. */
                        /* The executing function can respond to this change by checking cancellationSignal.isCancelled(). */
                        runningTasks.get(id).cancelled = true;
                    }
                    return;
                }

                /* Only handle messages of type 'exec'. */
                if (type !== 'exec') {
                    return;
                }

                const func = availableFunctions[functionName];

                if (func) {
                    /* Create and store the cancellation status for new tasks. */
                    const cancellationState = { cancelled: false };
                    runningTasks.set(id, cancellationState);

                    /* Create a cancel signal object that will be passed as the last parameter to the user function. */
                    /* This imitates the pattern of AbortController/AbortSignal, which is a standard asynchronous cancellation pattern. */
                    const cancellationSignal = {
                        isCancelled: () => cancellationState.cancelled,
                        throwIfCancelled: () => {
                            if (cancellationState.cancelled) {
                                const error = new Error('[SyncWorker] Task was cancelled.');
                                error.name = 'CancellationError';
                                throw error;
                            }
                        }
                    };

                    try {
                        /* Execute the function and inject cancellationSignal. 'await' can handle both synchronous and asynchronous functions. */
                        const result = await func(...args, cancellationSignal);

                        /* Check if the task is marked as cancelled after completion. If so, no results will be sent to avoid race conditions. */
                        if (cancellationState.cancelled) {
                            return;
                        }

                        self.postMessage({ id, result });
                    } catch (e) {
                        /* Only send errors when the task has not been canceled to avoid overwriting the CancellationError on the main thread. */
                        if (!cancellationState.cancelled) {
                            /* Send a structured error object while retaining its key attributes. */
                            self.postMessage({ id, error: { name: e.name, message: e.message, stack: e.stack } });
                        }
                    } finally {
                        /* Regardless of success, failure, or cancellation, tasks must be cleared from the running queue to prevent memory leaks. */
                        runningTasks.delete(id);
                    }
                } else {
                    /* If the function cannot be found, send a specific error. */
                    self.postMessage({
                        id,
                        error: {
                            name: 'FunctionNotFoundError',
                            message: \`The function '\${functionName}' is not defined in the Worker.\`,
                            stack: (new Error()).stack
                        }
                    });
                }
            };
        `;
            return code;
        }

        /**
         * 内部方法：用于根据ID取消单个任务。主要由超时逻辑调用。
         * @param {bigint} taskId - 内部任务 ID。
         * @param {string} [errorName='CancellationError'] - 用于拒绝 Promise 的错误类型名称。
         * @param {string} [errorMessage='Task was cancelled.'] - 用于拒绝 Promise 的错误消息。
         * @private
         */
        _cancelTaskById(taskId, errorName = 'CancellationError', errorMessage = 'Task was cancelled.') {
            if (this._taskQueue.has(taskId)) {
                const task = this._taskQueue.get(taskId);
                if (task.timeoutId) {
                    clearTimeout(task.timeoutId);
                }

                const error = new Error(errorMessage);
                error.name = errorName;
                task.reject(error);

                this._taskQueue.delete(taskId);
                if (this._worker) {
                    this._worker.postMessage({type: 'cancel', id: taskId});
                }
            }
        }

        /**
         * @method restart
         * @description 终止当前的 Web Worker 并立即使用原始配置初始化一个新的 Worker。
         * 这个方法对于从一个变得无响应或已崩溃的 Worker 中恢复非常有用，它允许在不创建新的 `SyncWorker` 实例的情况下进行干净的重启。
         * @returns {void}
         */
        restart() {
            this.terminate(); // 清理旧资源
            this._init();     // 使用保存的配置重新初始化
        }

        /**
         * 在 Web Worker 中异步执行一个函数。
         * @param {string} functionName - 要调用的已注册的函数名（在 `callableFunctions` 中定义的键）。
         * @param {object} [options={}] - 一个选项对象。
         * @param {Array} [options.args=[]] - 传递给 Worker 函数的参数数组。这些参数必须是可结构化克隆的。
         * @param {Array<Transferable>} [options.transfer=[]] - 一个对象数组，其所有权需要转移到 Worker（例如 ArrayBuffer）。
         * @param {number} [options.timeout=0] - 任务的超时时间（毫秒）。如果为 0 或负数，则不设置超时。
         * @returns {Promise<any>} 一个Promise，它最终会解析为Worker函数的返回值。
         * @throws {Error} 如果 Worker 已被终止，则抛出错误。
         */
        exec(functionName, {args = [], transfer = [], timeout = 0} = {}) {
            if (!this._worker) {
                throw new Error('[SyncWorker] Cannot execute task: the worker has been terminated.');
            }

            const id = this._nextTaskId++;
            return new Promise((resolve, reject) => {
                let timeoutId = null;

                if (timeout > 0) {
                    timeoutId = setTimeout(() => {
                        // 当超时发生时，调用内部的单个任务取消方法。
                        this._cancelTaskById(id, 'TimeoutError', `Task '${functionName}' timed out after ${timeout}ms.`);
                    }, timeout);
                }

                this._taskQueue.set(id, {resolve, reject, timeoutId});
                this._worker.postMessage({type: 'exec', id, functionName, args}, transfer);
            });
        }

        /**
         * 取消所有正在执行或等待中的任务，但不会终止 Worker 实例。
         * Worker 在此调用后仍然可以继续接收并执行新的任务。
         */
        cancel() {
            if (!this._worker || this._taskQueue.size === 0) {
                return;
            }

            const cancellationError = new Error('[SyncWorker] All pending tasks were cancelled by a global cancel call.');
            cancellationError.name = 'CancellationError';

            this._taskQueue.forEach((task, id) => {
                if (task.timeoutId) {
                    clearTimeout(task.timeoutId);
                }
                task.reject(cancellationError);
                this._worker.postMessage({type: 'cancel', id});
            });

            this._taskQueue.clear();
        }

        /**
         * 立即终止 Worker 并清理所有相关资源。
         * 一旦被终止，该 SyncWorker 实例将无法再使用。任何待处理的任务都将被拒绝。
         * 这是一个破坏性操作，且不可逆。
         */
        terminate() {
            // 1. 尝试终止 Worker 线程（如果存在）
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
            }

            // 2. 拒绝任何仍在等待中的任务（无论 Worker 是否存在，任务队列都应清理）
            if (this._taskQueue.size > 0) {
                const terminationError = new Error('[SyncWorker] The worker has been terminated.');
                terminationError.name = 'TerminationError';
                this._taskQueue.forEach(({reject, timeoutId}) => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    reject(terminationError);
                });
                this._taskQueue.clear();
            }

            // 3. 撤销 URL（独立于 Worker 实例的存在进行清理）
            if (this._workerUrl) {
                URL.revokeObjectURL(this._workerUrl);
                this._workerUrl = null;
            }
        }
    }

    /**
     * @class WorkerTools
     * @description 一个静态类，提供全局配置和方法。
     * 它不应该被实例化，其所有属性和方法都应静态访问。
     */
    class WorkerTools {
        /**
         * @static
         * @property {SyncWorker} _mathWorker
         * @description 管理数学计算的 Web Worker 实例。
         * 这个 Worker 负责处理所有核心的、可能耗时较长的计算任务，从而避免阻塞浏览器的主线程，保证用户界面的流畅响应。
         * 它被配置了特定的可调用函数和必要的依赖项，以在隔离的环境中正确执行计算。
         */
        static _mathWorker = new SyncWorker({
            // 定义需要的函数集
            callableFunctions: {
                setCalcAccuracy: acc => CalcConfig.globalCalcAccuracy = acc,
                getCalcAccuracy: () => CalcConfig.globalCalcAccuracy,
                setOutputAccuracy: acc => CalcConfig.outputAccuracy = acc,
                getOutputAccuracy: () => CalcConfig.outputAccuracy,
                setPrintMode: mode => CalcConfig.globalPrintMode = mode,
                getPrintMode: () => CalcConfig.globalPrintMode,
                initEnv: ({calcAcc, outputAcc, printMode}) => {
                    CalcConfig.globalCalcAccuracy = calcAcc;
                    CalcConfig.outputAccuracy = outputAcc;
                    CalcConfig.globalPrintMode = printMode;
                },
                powerFunctionAnalysis: list => PowerFunctionTools.powerFunctionAnalysis(list),
                statisticsCalc: (listA, listB) => StatisticsTools.statisticsCalc(listA, listB),
                radicalFunctionAnalysis: (z, n) => RadicalFunctionTools.radicalFunctionAnalysis(z, n),
                valueList: (f, g, start, step, end) => FuncValueListTools.valueList(f, g, start, step, end),
                exec: (expr, {calcAcc, outputAcc, calcMode, outputMode, f, g} = {}) => CalcTools.exec(expr, {
                    calcAcc: calcAcc,
                    outputAcc: outputAcc,
                    calcMode: calcMode,
                    outputMode: outputMode,
                    f: f,
                    g: g
                })
            },
            // 提供所需依赖
            dependencies: [
                {name: 'Public', value: Public},
                {name: 'CalcConfig', value: CalcConfig},
                {name: 'BigNumber', value: BigNumber},
                {name: 'ComplexNumber', value: ComplexNumber},
                {name: 'MathPlus', value: MathPlus},
                {name: 'PowerFunctionTools', value: PowerFunctionTools},
                {name: 'StatisticsTools', value: StatisticsTools},
                {name: 'RadicalFunctionTools', value: RadicalFunctionTools},
                {name: 'FuncValueListTools', value: FuncValueListTools},
                {name: 'CalcTools', value: CalcTools}
            ]
        });

        /**
         * @private
         * @static
         * @type {number}
         * @description 存储 Web Worker 任务的默认超时时间（毫秒）。
         * 这是一个私有静态字段。默认值为 0，表示不限制时间（无限等待）。
         */
        static _WORKER_TIMEOUT = 60000;

        /**
         * @private
         * @static
         * @type {boolean}
         * @description Worker 是否处于重启状态。
         */
        static _isRestarting = false;

        /**
         * @constructor
         * @description WorkerTools 的构造函数。
         * 这个类被设计为静态类，不应该被实例化。
         * 如果尝试创建 WorkerTools 的实例，构造函数会抛出一个错误。
         * @throws {Error} 总是抛出错误，以防止实例化。
         */
        constructor() {
            // 抛出错误以明确表示这是一个静态类，不应创建实例。
            // 这是一种常见的实践，用于强制执行静态类的使用模式，防止误用。
            throw new Error('[WorkerTools] WorkerTools is a static class and should not be instantiated.');
        }

        /**
         * @static
         * @property {boolean} isReady
         * @description 判断 Worker 是否处于可用状态。
         * 提供给外部（如 CalcConfig）使用的安全接口，避免直接访问私有属性 _mathWorker。
         */
        static get isReady() {
            // 检查 _mathWorker 实例是否存在
            // 如果将来 SyncWorker 内部增加了 isTerminated 状态，也可以在这里通过 this._mathWorker.isTerminated 来判断
            return this._mathWorker !== null && !this._mathWorker.isTerminated;
        }

        /**
         * @private
         * @static
         * @method _dispatch
         * @description 统一的消息分发器。负责发送任务，并在检测到 Worker 终止时自动重启。
         * @param {string} funcName - Worker 内调用的函数名
         * @param {Array} args - 参数数组
         * @returns {Promise<any>} 结果
         */
        static async _dispatch(funcName, args = []) {
            try {
                // 尝试正常执行任务
                return await this._mathWorker.exec(funcName, {
                    args,
                    timeout: this._WORKER_TIMEOUT
                });
            } catch (e) {
                // 如果错误是因为手动终止或取消引起的，直接向上抛出，不要尝试自动重启
                if (e.name === 'TerminationError' || e.name === 'CancellationError') {
                    throw e;
                }

                if (WorkerTools._isRestarting) {
                    // 如果正在重启，直接抛出错误，不再触发新的重启
                    const err = new Error('[WorkerTools] Worker is restarting, request aborted.');
                    err.name = 'TerminationError';
                    throw err;
                }

                // --- 修复开始 --- //
                // 只有非人为的意外错误（如超时、内部崩溃），才执行自动重启机制
                WorkerTools._isRestarting = true;
                try {
                    if (this._mathWorker) {
                        this._mathWorker.terminate();
                        this._mathWorker.restart();
                    }
                    await WorkerTools._restoreState();
                } finally {
                    WorkerTools._isRestarting = false;
                }
                // --- 修复结束 --- //

                // 抛出错误
                // 这样上层调用者才知道本次任务失败了，尽管 Worker 已经重启准备好处理下一次任务了。
                throw e;
            }
        }

        /**
         * @private
         * @static
         * @method _restoreState
         * @description Worker 重启后，恢复主线程的配置到新 Worker 中。
         * 注意：这里直接使用 _mathWorker.exec 而不是 _dispatch，防止递归死循环。
         */
        static async _restoreState() {
            // 让错误直接冒泡，如果恢复配置失败，整个重启流程应该被视为失败
            await this._mathWorker.exec('initEnv', {
                args: [{
                    calcAcc: CalcConfig.globalCalcAccuracy,
                    outputAcc: CalcConfig.outputAccuracy,
                    printMode: CalcConfig.globalPrintMode
                }]
            });
        }

        /**
         * @static
         * @async
         * @method restart
         * @description 重启 worker。
         * @returns {void} 此方法没有返回值。
         */
        static async restart() {
            if (this._mathWorker) {
                WorkerTools.cancelWorker();
                this._mathWorker.restart();
                await WorkerTools._restoreState();
            }
        }

        /**
         * @static
         * @method cancelWorker
         * @description 立即取消所有正在执行或排队的任务。
         *
         * 此方法执行“软取消”策略，旨在最大化 UI 响应速度并最小化资源消耗：
         * 1. **逻辑取消 (UI 立即响应)**: 调用 `SyncWorker.cancelPrint()`。这会立即清空主线程的任务队列，并以 `CancellationError` 拒绝所有等待中的 Promise。前端 UI 可以立刻停止加载动画，无需等待后台计算实际结束。
         * 2. **消息丢弃 (资源管理)**: 向 Worker 发送取消信号。如果 Worker 正在进行密集的同步计算，它可能无法立即中断，但当它最终完成并返回结果时，主线程的 `SyncWorker` 会因为任务 ID 已被移除而直接丢弃该结果，不会触发回调。
         *
         * @returns {void}
         */
        static cancelWorker() {
            // 1. 检查 Worker 是否存在且可用，避免空指针错误
            if (!this._mathWorker || this._mathWorker.isTerminated) {
                return;
            }

            // 2. 执行取消
            // 这会同步地 reject 所有 Promise 并清理 Map，随后向 Worker 发送 postMessage
            this._mathWorker.cancel();
        }

        /**
         * @static
         * @method setCalcAccuracy
         * @description 在 Web Worker 中异步地为所有新的 BigNumber 和 ComplexNumber 实例设置全局默认计算精度。
         * 此设置将影响所有后续在该 Worker 中执行的计算。
         * @param {number|undefined} [acc] - (可选) 要设置的精度值。如果省略此参数，方法将使用预设的默认精度值。若提供，则必须是 1 到 CalcConfig._maxGlobalAccuracy 之间的整数。
         * @returns {Promise<number>} 一个 Promise，它会解析为在 Worker 中成功设置的新精度值。
         * @throws {Error} 如果输入值无效或 Worker 发生错误，Promise 将被拒绝。
         */
        static setCalcAccuracy(acc) {
            return this._dispatch('setCalcAccuracy', [acc]);
        }

        /**
         * @static
         * @method getCalcAccuracy
         * @description 在 Web Worker 中异步地获取当前的全局默认计算精度。
         * 此精度值用于所有在该 Worker 中新创建的 BigNumber 和 ComplexNumber 实例的内部计算。
         * @returns {Promise<number>} 一个 Promise，它会解析为 Worker 中的当前计算精度值。
         */
        static getCalcAccuracy() {
            return this._dispatch('getCalcAccuracy');
        }

        /**
         * @static
         * @method setOutputAccuracy
         * @description 在 Web Worker 中异步地为所有后续的格式化输出设置全局默认精度。
         * 此设置将影响所有后续在该 Worker 中执行的 `idealizationToString` 等函数的默认行为。
         * 它与 `setCalcAccuracy` 设置的内部计算精度是分开的。
         * @param {number|undefined} [acc] - (可选) 要设置的输出精度。
         *   - 如果省略，将重置为 Worker 中当前的计算精度。
         *   - 如果是大于 1 的整数，它代表绝对的有效数字位数。
         *   - 如果是 (0, 1] 之间的浮点数，它代表输出精度与当前计算精度的比率。
         * @returns {Promise<number>} 一个 Promise，它会解析为在 Worker 中成功设置的新输出精度值。
         * @throws {Error} 如果输入值无效或 Worker 发生错误，Promise 将被拒绝。
         */
        static setOutputAccuracy(acc) {
            return this._dispatch('setOutputAccuracy', [acc]);
        }

        /**
         * @static
         * @method getOutputAccuracy
         * @description 在 Web Worker 中异步地获取用于格式化输出的当前全局默认精度。
         * 此精度值由 `idealizationToString` 等函数在 Worker 内部使用。
         * @returns {Promise<number>} 一个 Promise，它会解析为 Worker 中的当前输出精度值。
         */
        static getOutputAccuracy() {
            return this._dispatch('getOutputAccuracy');
        }

        /**
         * @static
         * @method setPrintMode
         * @description 在 Web Worker 中异步地为复数转换为字符串设置默认打印模式。
         * 此设置将影响所有后续在该 Worker 中执行的 `ComplexNumber.prototype.toString` 的行为。
         * @param {string} mode - 要设置的打印模式。必须是 'algebra' (代数形式, a+bi) 或 'polar' (极坐标形式, r∠θ) 之一。
         * @returns {Promise<string>} 一个 Promise，它会解析为在 Worker 中成功设置的新打印模式字符串。
         * @throws {Error} 如果提供的模式无效或 Worker 发生错误，Promise 将被拒绝。
         * @example
         * WorkerTools.setPrintMode('polar').then(newMode => console.log(`Print mode set to: ${newMode}`));
         */
        static setPrintMode(mode) {
            return this._dispatch('setPrintMode', [mode]);
        }

        /**
         * @static
         * @method getPrintMode
         * @description 在 Web Worker 中异步地获取复数转换为字符串时的默认打印模式。
         * @returns {Promise<string>} 一个 Promise，它会解析为 Worker 中的当前打印模式 ('algebra' 或 'polar')。
         */
        static getPrintMode() {
            return this._dispatch('getPrintMode');
        }

        /**
         * @static
         * @method powerFunctionAnalysis
         * @description 在 Web Worker 中异步地分析一个最高为四次的多项式实函数，确定其关键属性。
         * 该方法通过微积分（导数）来确定函数的单调性、极值、凹凸性和拐点，并求解其根。
         * 将计算移至 Worker 线程可以防止复杂分析阻塞主线程，从而保持用户界面的响应性。
         * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 多项式的系数数组，从最高次项到常数项排列。
         * 例如，对于函数 f(x) = ax⁴ + bx³ + cx² + dx + e, 输入应为 `[a, b, c, d, e]`。
         * 该函数能处理 4、3、2、1 和 0 次多项式。
         * @returns {Promise<object>} 一个 Promise，它会解析为一个包含函数分析结果的对象。该对象的属性包括：
         * - `range`: `[string, string]` 函数的值域。
         * - `increasingInterval`: `Array<[string, string]>` 函数的单调递增区间。
         * - `decreasingInterval`: `Array<[string, string]>` 函数的单调递减区间。
         * - `maximumPoint`: `Array<[string, string]>` 局部极大值点 `[x, y]`。
         * - `minimumPoint`: `Array<[string, string]>` 局部极小值点 `[x, y]`。
         * - `convexInterval`: `Array<[string, string]>` 函数的凸区间（凹向上）。
         * - `concaveInterval`: `Array<[string, string]>` 函数的凹区间（凹向下）。
         * - `inflectionPoint`: `Array<[string, string]>` 拐点 `[x, y]`。
         * - `roots`: `Array<string>` 函数的实数根和复数根。
         * @throws {Error} 如果输入无效或 Worker 发生错误，Promise 将被拒绝。
         */
        static powerFunctionAnalysis(list) {
            return this._dispatch('powerFunctionAnalysis', [list]);
        }

        /**
         * @static
         * @method statisticsCalc
         * @description 在 Web Worker 中异步地对两个数据集（自变量和因变量）执行全面的统计分析和多模型回归。
         * 将此计算密集型任务移至 Worker 线程可以防止阻塞主线程，从而保持用户界面的响应性。
         * 该方法计算每个数据集的基本统计数据，它们之间的相关性，并拟合多种回归模型
         * （线性、二次、对数、幂、指数、反比例），为每个模型提供其参数和决定系数 (R²)。
         * 最后，它会根据 R² 值确定最佳拟合模型。
         * @param {Array<ComplexNumber|string|number>} listA - 自变量数据集 (x-values)。数组中的每个元素都将被转换为 ComplexNumber。
         * @param {Array<ComplexNumber|string|number>} listB - 因变量数据集 (y-values)。数组中的每个元素都将被转换为 ComplexNumber。
         * @returns {Promise<object>} 一个 Promise，它会解析为一个包含详细统计和回归分析结果的对象。
         * @property {string} averageA - 数据集 A 的平均值。
         * @property {string} sumA - 数据集 A 的总和。
         * @property {string} sum2A - 数据集 A 的平方和 (Σx²)。
         * @property {string} varianceA - 数据集 A 的标准差。
         * @property {string} maxA - 数据集 A 的最大值。
         * @property {string} minA - 数据集 A 的最小值。
         * @property {string} averageB - 数据集 B 的平均值。
         * @property {string} sumB - 数据集 B 的总和。
         * @property {string} sum2B - 数据集 B 的平方和 (Σy²)。
         * @property {string} varianceB - 数据集 B 的标准差。
         * @property {string} maxB - 数据集 B 的最大值。
         * @property {string} minB - 数据集 B 的最小值。
         * @property {string} dotAB - A 和 B 的点积 (Σxy)。
         * @property {string} dotA2B - A² 和 B 的点积 (Σx²y)。
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
         * @throws {Error} 如果输入无效或 Worker 发生错误，Promise 将被拒绝。
         */
        static statisticsCalc(listA, listB) {
            return this._dispatch('statisticsCalc', [listA, listB]);
        }

        /**
         * @static
         * @method radicalFunctionAnalysis
         * @description 在 Web Worker 中异步地计算复数 z 的 n 次方根，并以结构化的对象形式返回结果。
         * 将此计算移至 Worker 线程可以防止复杂分析阻塞主线程。
         * 结果包括通项公式、k 的取值范围以及前几个数值解。
         * @param {ComplexNumber|string|number|bigint|BigNumber|Array} z - 需要开方的复数（被开方数）。
         * @param {ComplexNumber|string|number|bigint|BigNumber|Array} n - 根指数，必须是一个正整数。
         * @returns {Promise<object>} 一个 Promise，它会解析为一个包含分析结果的对象，其属性包括：
         * - `formula`: {string} 根的通项公式字符串。
         * - `kRange`: {[string, string]} 整数 k 的取值范围，格式为 `['0', 'n-1']`。
         * - `numericalResults`: {Array<string>} 一个字符串数组，包含从 k=0 开始的数值解。
         * @throws {Error} 如果输入无效或 Worker 发生错误，Promise 将被拒绝。
         */
        static radicalFunctionAnalysis(z, n) {
            return this._dispatch('radicalFunctionAnalysis', [z, n]);
        }

        /**
         * @static
         * @method valueList
         * @description 在 Web Worker 中异步地在指定的实数范围内，以固定的步长为两个可能相互依赖的函数 f(x) 和 g(x) 生成数值列表。
         * 将此计算移至 Worker 线程可以防止复杂计算阻塞主线程。
         * 该方法允许 f(x) 的表达式调用 g(x)，反之亦然，从而支持联立或递归的函数求值。
         * @param {string} f - 第一个函数的表达式字符串。表达式中可以使用 'x' 作为变量，并可以调用 g(x)。
         * @param {string} g - 第二个函数的表达式字符串。表达式中可以使用 'x' 作为变量，并可以调用 f(x)。
         * @param {string|number|BigNumber|ComplexNumber|Array} start - 区间的起始值。
         * @param {string|number|BigNumber|ComplexNumber|Array} step - 区间内每一步的增量。
         * @param {string|number|BigNumber|ComplexNumber|Array} end - 区间的结束值。必须为实数，且不小于起始值。
         * @returns {Promise<object>} 一个 Promise，它会解析为一个包含三个数组的对象：
         * - `varList`: 在指定范围内生成的所有自变量 `x` 的值列表。
         * - `f`: 函数 f(x) 在每个自变量点上的计算结果列表。
         * - `g`: 函数 g(x) 在每个自变量点上的计算结果列表。
         * 如果某个点的计算失败，对应的数组元素将是字符串 'error'。
         * @throws {Error} 如果输入无效或 Worker 发生错误，Promise 将被拒绝。
         * @example
         * // 异步计算 f(x) = x^2 和 g(x) = f(x) - 1 在 x 从 1 到 3，步长为 1 时的值
         * WorkerTools.valueList('x^2', 'f(x)-1', 1, 1, 3)
         *   .then(results => console.log(results));
         * // 异步地返回: { f: ['1', '4', '9'], g: ['0', '3', '8'] }
         */
        static valueList(f, g, start, step, end) {
            return this._dispatch('valueList', [f, g, start, step, end]);
        }

        /**
         * @static
         * @method exec
         * @description 在 Web Worker 中异步地执行一个数学表达式的计算。
         * 此方法将计算任务分派到后台线程，以防止复杂或耗时的计算阻塞主 UI 线程，从而保持用户界面的响应性。
         * 它允许为单次计算临时覆盖 Worker 的全局计算和输出精度，并在计算完成后自动恢复，确保了操作的隔离性。
         *
         * @param {string} expr - 要计算的数学表达式字符串。
         * @param {object} [options={}] - 可选的配置对象，用于控制计算的各个方面。
         * @param {number} [options.calcAcc] - 本次计算使用的内部计算精度。如果未提供，则使用 Worker 中的当前默认值。
         * @param {number} [options.outputAcc] - 本次计算结果输出时使用的精度。如果未提供，则使用 Worker 中的当前默认值。
         * @param {string} [options.calcMode='calc'] - 控制 `MathPlus.calc` 的行为模式。
         *   - 'calc': (默认) 解析并计算表达式。
         *   - 'syntaxCheck': 仅检查语法并格式化表达式，不执行计算。
         * @param {string} [options.outputMode='output'] - 控制返回结果中 `result` 字段的格式。
         *   - 'output': (默认) 返回一个理想化的、用户友好的字符串。
         *   - 'mid': 返回 `ComplexNumber` 的内部数组表示 `[[power, mantissa, acc], [power, mantissa, acc]]`，用于进一步的计算或序列化。
         * @param {string} [options.f] - 自定义函数 'f(x)' 的表达式字符串。
         * @param {string} [options.g] - 自定义函数 'g(x)' 的表达式字符串。
         * @returns {Promise<{result: string|Array, expr: string}>} 一个 Promise，它会解析为一个包含两部分结果的对象：
         * - `result`: {string|Array} 计算结果。根据 `mode[1]` 的设置，可以是格式化的字符串或内部数组表示。
         * - `expr`: {string} `MathPlus.calc` 返回的格式化后的表达式字符串。
         * @throws {Error} 如果表达式解析或计算过程中发生错误，Promise 将被拒绝。
         * @example
         * async function calculate() {
         *   try {
         *     const { result, expr } = await WorkerTools.exec('sin(pi/2)', { outputAcc: 10 });
         *     console.log(`Formatted Expression: ${expr}`); // "sin(pi/2)"
         *     console.log(`Result: ${result}`); // "1"
         *   } catch (error) {
         *     console.error('Calculation failed:', error);
         *   }
         * }
         */
        static exec(expr, {calcAcc, outputAcc, calcMode, outputMode, f, g} = {}) {
            return this._dispatch('exec', [expr, {calcAcc, outputAcc, calcMode, outputMode, f, g}]);
        }
    }

    // 导出对象
    window.SyncWorker = SyncWorker;
    window.WorkerTools = WorkerTools;

})();