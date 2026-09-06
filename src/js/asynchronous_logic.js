/** 初始化并导出 Worker 调度工具。 */
        (function () {
            "use strict";

            /** 封装动态 Worker 的创建、调用、取消与资源清理。 */
            class SyncWorker {
                /**
                 * 底层的 Web Worker 实例。
                 * @type {Worker|null}
                 * @private
                 */
                _worker = null;

                /**
                 * Worker Blob 的临时 URL。
                 * @type {string|null}
                 * @private
                 */
                _workerUrl = null;

                /**
                 * 按任务 ID 记录待处理 Promise 及其超时计时器。
                 * @type {Map<bigint, {resolve: Function, reject: Function, timeoutId: number|null}>}
                 * @private
                 */
                _taskQueue = new Map();

                /**
                 * 下一个任务 ID。
                 * 使用 BigInt 避免长时间运行后超过 Number 安全整数范围而复用 ID。
                 * @type {bigint}
                 * @private
                 */
                _nextTaskId = 0n;

                /**
                 * 用于重启 Worker 的原始配置。
                 * @type {object|null}
                 * @private
                 */
                _config = null;

                /**
                 * 首次初始化后缓存的 Worker 脚本。
                 * @type {string|null}
                 * @private
                 */
                _workerCode = null;

                /**
                 * 创建并初始化 Worker。
                 * @param {object} config - 创建脚本所需的完整配置；构造器会保存它以供 `restart()` 重用，
                 *   因此调用后不应再原地修改其中的函数表或依赖数组。
                 * @param {Object<string, Function>} config.callableFunctions - 暴露给主线程调用的函数映射；键是
                 *   `exec()` 使用的公开名称，值必须是可序列化的函数。Worker 会在原位置参数末尾追加
                 *   `{isCancelled:function():boolean, throwIfCancelled:function():void}`：前者查询任务取消状态，
                 *   后者在已取消时抛出 `CancellationError`，长循环可在安全检查点主动调用。
                 * @param {Array<{name: string, value: *}>} [config.dependencies=[]] - 按顺序注入 Worker 顶层作用域的
                 *   依赖；`name` 必须是合法且不冲突的 JavaScript 标识符，`value` 可为受支持的类、函数、
                 *   BigInt、数组或普通对象，但不能包含循环引用、DOM 节点或闭包捕获的外部状态。
                 * @throws {Error} 配置或函数定义无效时抛出。
                 */
                constructor(config) {
                    if (!config || typeof config !== 'object' || Array.isArray(config)) {
                        throw new Error('[SyncWorker] config must be a non-null object.');
                    }
                    if (!config.callableFunctions || typeof config.callableFunctions !== 'object' || Array.isArray(config.callableFunctions) || Object.keys(config.callableFunctions).length === 0) {
                        throw new Error('[SyncWorker] callableFunctions must be a non-empty object.');
                    }
                    for (const [name, func] of Object.entries(config.callableFunctions)) {
                        if (typeof func !== 'function') {
                            throw new Error(`[SyncWorker] callableFunctions['${name}'] must be a function.`);
                        }
                    }
                    this._config = config;
                    // 保存原始配置，使同一实例可以在终止后重新生成等价 Worker。
                    this._init();
                }

                /**
                 * 返回实例的类型标签。
                 *
                 * @readonly
                 * @type {string}
                 */
                get [Symbol.toStringTag]() {
                    return 'SyncWorker';
                }

                /**
                 * 判断 Worker 是否已终止。
                 *
                 * @readonly
                 * @type {boolean}
                 */
                get isTerminated() {
                    return this._worker === null;
                }

                /**
                 * 初始化或重新初始化 Web Worker。
                 *
                 * @private
                 * @returns {void}
                 */
                _init() {
                    const {callableFunctions, dependencies = []} = this._config;
                    if (!Array.isArray(dependencies)) {
                        throw new Error('[SyncWorker] dependencies must be an array.');
                    }

                    // 缓存脚本，避免重启时受外部配置变更影响。
                    const workerCode = this._workerCode ??= this._generateWorkerCode(callableFunctions, dependencies);
                    // Blob URL 把动态生成的源码交给 Worker；创建失败或终止时必须撤销 URL。
                    const blob = new Blob([workerCode], {type: 'application/javascript'});
                    const workerUrl = URL.createObjectURL(blob);

                    try {
                        const worker = new Worker(workerUrl);
                        this._workerUrl = workerUrl;
                        this._worker = worker;
                        this._setupMessageListeners();
                    } catch (error) {
                        URL.revokeObjectURL(workerUrl);
                        throw error;
                    }
                }

                /**
                 * 注册 Worker 的消息与错误处理器。
                 *
                 * @private
                 */
                _setupMessageListeners() {
                    if (!this._worker) {
                        return;
                    }

                    const worker = this._worker;

                    /**
                     * 处理 Worker 返回的任务结果。
                     *
                     * @param {MessageEvent} event - Worker 返回的消息事件；`event.data.id` 必须对应待处理任务，
                     *   `result` 是可结构化克隆的返回值，`error` 则是已序列化的名称、消息和堆栈。
                     */
                    worker.onmessage = (event) => {
                        // 重启后旧 Worker 仍可能排出迟到消息；实例校验防止它污染新 Worker 的任务队列。
                        if (this._worker !== worker) {
                            return;
                        }

                        const {id, result, error} = event.data;
                        // 任务 ID 将乱序返回的消息关联到对应 Promise；已取消或超时的迟到消息会被忽略。
                        if (!this._taskQueue.has(id)) {
                            return; // 任务可能已被取消或超时，直接忽略。
                        }

                        const {resolve, reject, timeoutId} = this._taskQueue.get(id);
                        if (timeoutId !== null) {
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
                     * 处理 Worker 的致命运行错误。
                     *
                     * @param {ErrorEvent} err - 无法归属到单个任务的 Worker 运行错误；其消息用于拒绝全部
                     *   待处理 Promise，随后实例进入已终止状态。
                     */
                    worker.onerror = (err) => {
                        if (this._worker !== worker) {
                            return;
                        }

                        const fatalError = new Error(`[SyncWorker] Worker encountered a fatal error: ${err.message} at ${err.filename}:${err.lineno}.`);
                        this._rejectAllTasks(fatalError);
                        this.terminate();
                    };

                    /**
                     * 处理 Worker 消息的反序列化错误。
                     */
                    worker.onmessageerror = () => {
                        if (this._worker !== worker) {
                            return;
                        }

                        const messageError = new Error('[SyncWorker] Failed to deserialize a message from the Worker.');
                        messageError.name = 'MessageError';
                        this._rejectAllTasks(messageError);
                        this.terminate();
                    };
                }

                /**
                 * 拒绝并清空所有待处理任务。
                 *
                 * @param {Error} error - 同一个拒绝原因会传给当前全部待处理 Promise；方法同时清除每个任务的
                 *   超时计时器和登记项，但不会自行终止 Worker。
                 * @private
                 */
                _rejectAllTasks(error) {
                    /** 拒绝当前待处理任务并清除其超时计时器。 */
                    this._taskQueue.forEach(({reject, timeoutId}) => {
                        if (timeoutId !== null) {
                            clearTimeout(timeoutId);
                        }
                        reject(error);
                    });
                    this._taskQueue.clear();
                }

                /**
                 * 将函数和依赖项序列化为 Worker 脚本。
                 *
                 * @param {Object<string, Function>} funcs - 名称到函数实现的映射；名称成为 Worker 消息协议中的
                 *   `functionName`，实现会被转换为源码，不能依赖未列入 `deps` 的词法闭包。
                 * @param {Array<{name: string, value: *}>} deps - 顶层依赖声明，按数组顺序生成源码；后项可引用
                 *   已生成的前项。名称重复、非法或值不可序列化时应在创建 Worker 前失败。
                 * @returns {string} 可执行的 Worker 脚本。
                 * @private
                 */
                _generateWorkerCode(funcs, deps) {
                    /**
                     * 将支持的值序列化为 JavaScript 源码。
                     *
                     * @param {*} value - 要嵌入脚本的依赖值；支持原始值、BigInt、普通数组/对象、函数和类。
                     *   `undefined`、`NaN`、无穷值等需生成等价源码；平台对象和不可还原的原型实例不受支持。
                     * @param {WeakSet<object>} [seen] - 当前递归路径上的对象集合；内部调用传递同一集合以检测
                     *   真正的循环引用，调用入口可省略，方法不会把它暴露到生成脚本中。
                     * @returns {string} 序列化结果。
                     */
                    const serializeValue = (value, seen = new WeakSet()) => {
                        // 序列化目标是可执行 JavaScript 源码，而非 JSON；需保留函数、BigInt、NaN、Infinity 和 -0。
                        if (typeof value === 'function') {
                            return serializeFunction(value);
                        }

                        if (value === undefined) {
                            return 'undefined';
                        }

                        if (typeof value === 'number') {
                            if (Number.isNaN(value)) {
                                return 'NaN';
                            }
                            if (!Number.isFinite(value)) {
                                return value > 0 ? 'Infinity' : '-Infinity';
                            }
                            if (Object.is(value, -0)) {
                                return '-0';
                            }
                            return value.toString();
                        }

                        if (typeof value === 'bigint') {
                            return `${value.toString()}n`;
                        }

                        if (typeof value === 'string') {
                            return JSON.stringify(value);
                        }

                        if (typeof value === 'symbol') {
                            throw new TypeError('Symbol values are not supported.');
                        }

                        if (Array.isArray(value)) {
                            // WeakSet 仅跟踪当前递归路径，既能拒绝循环引用，也允许不同位置复用同一对象。
                            if (seen.has(value)) {
                                throw new TypeError('Circular references are not supported.');
                            }
                            seen.add(value);
                            try {
                                const elements = [];
                                for (let i = 0; i < value.length; i++) {
                                    elements.push(Object.prototype.hasOwnProperty.call(value, i)
                                                  ? serializeValue(value[i], seen)
                                                  : '');
                                }
                                const trailingComma = value.length > 0 && !Object.prototype.hasOwnProperty.call(value, value.length - 1)
                                                      ? ','
                                                      : '';
                                return `[${elements.join(',')}${trailingComma}]`;
                            } finally {
                                seen.delete(value);
                            }
                        }

                        if (typeof value === 'object' && value !== null) {
                            const prototype = Object.getPrototypeOf(value);
                            const isPlainObject = prototype === null || (
                                Object.prototype.toString.call(value) === '[object Object]' &&
                                typeof prototype?.constructor === 'function' &&
                                prototype.constructor.name === 'Object'
                            );
                            if (!isPlainObject) {
                                throw new TypeError(`Unsupported object type '${value.constructor?.name || 'Object'}'.`);
                            }
                            if (seen.has(value)) {
                                throw new TypeError('Circular references are not supported.');
                            }

                            seen.add(value);
                            try {
                                const props = [];
                                for (const key of Object.keys(value)) {
                                    const descriptor = Object.getOwnPropertyDescriptor(value, key);
                                    // 只读取数据描述符，避免序列化过程意外执行 getter 及其副作用。
                                    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                                        throw new TypeError(`Accessor property '${key}' is not supported.`);
                                    }
                                    // 计算属性名可避免 __proto__ 被解释为原型设置器。
                                    props.push(`[${JSON.stringify(key)}]: ${serializeValue(descriptor.value, seen)}`);
                                }
                                return `{${props.join(',')}}`;
                            } finally {
                                seen.delete(value);
                            }
                        }

                        return JSON.stringify(value);
                    };

                    /**
                     * 将函数转换为可嵌入 Worker 的表达式。
                     *
                     * @param {Function} func - 要转换为独立表达式源码的函数或类；其源码必须能在 Worker 的
                     *   严格模式下重新求值，原函数对象和闭包环境都不会被传输。
                     * @param {boolean} [allowClass=true] - 是否接受 `class` 声明；序列化普通可调用函数时可设为
                     *   `false`，从而避免把类误当作能直接调用的任务函数。
                     * @returns {string} 函数表达式源码。
                     */
                    const serializeFunction = (func, allowClass = true) => {
                        const source = Function.prototype.toString.call(func).trim();
                        if (source.includes('[native code]')) {
                            throw new TypeError('Native or bound functions are not supported.');
                        }
                        if (/^(?:get|set)\s/.test(source)) {
                            throw new TypeError('Getter and setter functions are not supported.');
                        }

                        const isFunctionExpression = /^(?:async\s+)?function(?:\s*\*)?\b/.test(source);
                        const isArrowFunction = /^(?:async\s+)?(?:\([\s\S]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(source);
                        const isClass = /^class\b/.test(source);

                        if (isClass && !allowClass) {
                            throw new TypeError('Class constructors cannot be registered as callable functions.');
                        }
                        if (isFunctionExpression || isArrowFunction || isClass) {
                            return `(${source})`;
                        }

                        // 对象方法源码缺少 `function` 前缀，借助临时对象字面量把它还原为函数值。
                        return `(Object.values({${source}})[0])`;
                    };

                    const reservedDependencyNames = new Set([
                        'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
                        'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export',
                        'extends', 'false', 'finally', 'for', 'function', 'if', 'implements',
                        'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
                        'package', 'private', 'protected', 'public', 'return', 'static',
                        'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var',
                        'void', 'while', 'with', 'yield', 'eval', 'arguments',
                        'self', 'availableFunctions', 'runningTasks', 'normalizeError',
                        'Object', 'Map', 'Error', 'String'
                    ]);
                    const dependencyNames = new Set();

                    // 生成的脚本依次注入依赖、注册可调用函数，并安装基于消息的执行/取消协议。
                    let code = `
/* Dynamically Generated Worker Code. */
(() => {
    "use strict";
    
    /* -- Dependency Injection -- */
    /* Inject dependencies as constants into an isolated scope of the Worker. */
`;
                    for (const dep of deps) {
                        if (!dep || typeof dep !== 'object' || Array.isArray(dep)) {
                            throw new Error('[SyncWorker] Every dependency must be an object.');
                        }

                        const {name, value} = dep;

                        if (typeof name !== 'string' || !/^[$_\p{ID_Start}][$\u200C\u200D_\p{ID_Continue}]*$/u.test(name)) {
                            throw new Error(`[SyncWorker] Invalid dependency name '${String(name)}'.`);
                        }
                        if (reservedDependencyNames.has(name)) {
                            throw new Error(`[SyncWorker] Dependency name '${name}' is reserved.`);
                        }
                        if (dependencyNames.has(name)) {
                            throw new Error(`[SyncWorker] Duplicate dependency name '${name}'.`);
                        }
                        dependencyNames.add(name);

                        try {
                            code += `    const ${name} = ${serializeValue(value)};\n`;
                        } catch (e) {
                            throw new Error(`[SyncWorker] Dependency '${name}' could not be serialized: ${e.message}.`);
                        }
                    }

                    code += `
    /* -- Function registration -- */
    /* Store all callable functions in an object inside the Worker for searching by name. */
    const availableFunctions = Object.create(null);
`;
                    for (const [key, func] of Object.entries(funcs)) {
                        try {
                            code += `    availableFunctions[${JSON.stringify(key)}] = ${serializeFunction(func, false)};\n`;
                        } catch (e) {
                            throw new Error(`[SyncWorker] Function '${key}' could not be serialized: ${e.message}.`);
                        }
                    }
                    code += `
    /* -- Worker internal status -- */
    /* A Map used to track running tasks and their cancellation status. */
    const runningTasks = new Map();
    
    /* Normalize any thrown JavaScript value into a serializable error object. */
    const normalizeError = (error) => {
        let name = 'Error';
        let message;
        let stack = '';
    
        try {
            if (typeof error?.name === 'string') {
                name = error.name;
            }
        } catch {
            // 忽略异常属性访问，继续使用默认错误名称。
        }
    
        try {
            if (typeof error?.message === 'string') {
                message = error.message;
            }
        } catch {
            // 忽略异常属性访问，稍后使用安全的字符串回退值。
        }
    
        if (message === undefined) {
            try {
                message = String(error);
            } catch {
                message = 'Unknown error';
            }
        }
    
        try {
            if (typeof error?.stack === 'string') {
                stack = error.stack;
            }
        } catch {
            // 忽略异常属性访问，继续使用空堆栈。
        }
    
        return {name, message, stack};
    };
    
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
    
        const func = Object.prototype.hasOwnProperty.call(availableFunctions, functionName)
            ? availableFunctions[functionName]
            : null;
    
        if (typeof func === 'function') {
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
                    self.postMessage({ id, error: normalizeError(e) });
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
})();
`;

                    return code;
                }

                /**
                 * 按 ID 取消单个任务。
                 *
                 * @param {bigint} taskId - `_pendingTasks` 中的精确任务键；未知或已经完成的 ID 会被忽略，
                 *   避免重复拒绝 Promise。
                 * @param {string} [errorName='CancellationError'] - 创建拒绝错误时写入 `Error.name` 的稳定名称；
                 *   超时调用使用 `TimeoutError`，主动取消使用默认名称，便于调用方分类处理。
                 * @param {string} [errorMessage='Task was cancelled.'] - 面向调用方的错误消息；只用于本地 Promise，
                 *   Worker 端收到的取消消息仍通过同一 `taskId` 关联正在运行的任务。
                 * @private
                 */
                _cancelTaskById(taskId, errorName = 'CancellationError', errorMessage = 'Task was cancelled.') {
                    if (this._taskQueue.has(taskId)) {
                        const task = this._taskQueue.get(taskId);
                        if (task.timeoutId !== null) {
                            clearTimeout(task.timeoutId);
                        }

                        const error = new Error(errorMessage);
                        error.name = errorName;
                        task.reject(error);

                        this._taskQueue.delete(taskId);
                        if (this._worker) {
                            // 取消是协作式的：主线程立即拒绝 Promise，Worker 只能在重新获得事件循环后读取取消消息。
                            try {
                                this._worker.postMessage({type: 'cancel', id: taskId});
                            } catch {
                                // 本地状态已清理，无需传播消息发送失败。
                            }
                        }
                    }
                }

                /**
                 * 使用原始配置重启 Worker。
                 *
                 * @returns {void}
                 */
                restart() {
                    this.terminate(); // 清理旧资源。
                    this._init();     // 使用保存的配置重新初始化。
                }

                /**
                 * 异步调用已注册的 Worker 函数。
                 *
                 * @template T
                 * @param {string} functionName - `config.callableFunctions` 中注册的精确键名；名称在发送前校验，
                 *   不允许借此访问 Worker 全局作用域中的其他函数。
                 * @param {object} [options={}] - 单次任务的消息、所有权转移和截止时间配置；不会改变后续任务。
                 * @param {Array} [options.args=[]] - 按原顺序传给目标函数的位置参数；每项必须可由结构化克隆
                 *   算法处理。取消信号由 Worker 在末尾自动追加，不应由调用方放入该数组。
                 * @param {Array<Transferable>} [options.transfer=[]] - 转移所有权的对象；发送后主线程中的对应资源会被分离。
                 * @param {number} [options.timeout=0] - 从消息成功发出起计算的有限毫秒数；正数到期后拒绝
                 *   Promise 并通知 Worker 取消该任务，`0` 或负数表示不建立计时器。
                 * @returns {Promise<T>} 以目标函数的可结构化克隆返回值兑现；`undefined`、数组、普通对象和
                 *   可克隆平台对象保持自身结构。Worker 抛出的错误会重建
                 *   `name`、`message`、`stack` 后拒绝，主动取消和超时分别使用可区分的错误名称。
                 * @throws {Error} Worker 不可用或选项无效时抛出。
                 */
                exec(functionName, {args = [], transfer = [], timeout = 0} = {}) {
                    if (!this._worker) {
                        throw new Error('[SyncWorker] Cannot execute task: the worker has been terminated.');
                    }
                    if (typeof functionName !== 'string' || functionName.length === 0) {
                        throw new Error('[SyncWorker] functionName must be a non-empty string.');
                    }
                    if (!Array.isArray(args)) {
                        throw new Error('[SyncWorker] options.args must be an array.');
                    }
                    if (!Array.isArray(transfer)) {
                        throw new Error('[SyncWorker] options.transfer must be an array.');
                    }
                    if (typeof timeout !== 'number' || !Number.isFinite(timeout)) {
                        throw new Error('[SyncWorker] options.timeout must be a finite number.');
                    }

                    const id = this._nextTaskId++;
                    /** 创建并登记一次 Worker 调用。 */
                    return new Promise((resolve, reject) => {
                        let timeoutId = null;

                        if (timeout > 0) {
                            /** 在截止时间到达时取消任务。 */
                            timeoutId = setTimeout(() => {
                                this._cancelTaskById(id, 'TimeoutError', `Task '${functionName}' timed out after ${timeout}ms.`);
                            }, timeout);
                        }

                        // 先登记队列再发送消息，避免 Worker 极快返回时查不到对应 Promise。
                        this._taskQueue.set(id, {resolve, reject, timeoutId});
                        try {
                            this._worker.postMessage({type: 'exec', id, functionName, args}, transfer);
                        } catch (error) {
                            if (timeoutId !== null) {
                                clearTimeout(timeoutId);
                            }
                            this._taskQueue.delete(id);
                            reject(error);
                        }
                    });
                }

                /**
                 * 取消全部待处理任务，但保留 Worker 实例。
                 */
                cancel() {
                    if (!this._worker || this._taskQueue.size === 0) {
                        return;
                    }

                    const cancellationError = new Error('[SyncWorker] All pending tasks were cancelled by a global cancel call.');
                    cancellationError.name = 'CancellationError';

                    /** 取消当前待处理任务。 */
                    this._taskQueue.forEach((task, id) => {
                        if (task.timeoutId !== null) {
                            clearTimeout(task.timeoutId);
                        }
                        task.reject(cancellationError);
                        // 即使同步密集任务暂时无法响应，稍后返回的结果也会因队列已清空而被丢弃。
                        try {
                            this._worker.postMessage({type: 'cancel', id});
                        } catch {
                            // 本地状态已清理，无需传播消息发送失败。
                        }
                    });

                    this._taskQueue.clear();
                }

                /**
                 * 终止 Worker、拒绝待处理任务并释放 Blob URL。
                 */
                terminate() {
                    if (this._worker) {
                        this._worker.terminate();
                        this._worker = null;
                    }

                    if (this._taskQueue.size > 0) {
                        const terminationError = new Error('[SyncWorker] The worker has been terminated.');
                        terminationError.name = 'TerminationError';
                        this._rejectAllTasks(terminationError);
                    }

                    if (this._workerUrl) {
                        URL.revokeObjectURL(this._workerUrl);
                        this._workerUrl = null;
                    }
                }
            }

            /** 提供数学 Worker 的静态调用接口。 */
            class WorkerTools {
                /**
                 * 执行耗时数学计算的 Worker。
                 *
                 * @type {SyncWorker}
                 */
                static _mathWorker = new SyncWorker({
                    callableFunctions: {
                        /** 设置 Worker 的计算精度。 */
                        setCalcAccuracy: (acc) => CalcConfig.globalCalcAccuracy = acc,
                        /** 获取 Worker 的计算精度。 */
                        getCalcAccuracy: () => CalcConfig.globalCalcAccuracy,
                        /** 设置 Worker 的输出精度。 */
                        setOutputAccuracy: (acc) => CalcConfig.outputAccuracy = acc,
                        /** 获取 Worker 的输出精度。 */
                        getOutputAccuracy: () => CalcConfig.outputAccuracy,
                        /** 设置 Worker 的输出模式。 */
                        setPrintMode: (mode) => CalcConfig.globalPrintMode = mode,
                        /** 获取 Worker 的输出模式。 */
                        getPrintMode: () => CalcConfig.globalPrintMode,
                        /** 初始化 Worker 计算环境。 */
                        initEnv: ({calcAcc, outputAcc, printMode}) => {
                            CalcConfig.globalCalcAccuracy = calcAcc;
                            CalcConfig.outputAccuracy = outputAcc;
                            CalcConfig.globalPrintMode = printMode;
                        },
                        /** 分析多项式函数。 */
                        powerFunctionAnalysis: (list) => PowerFunctionTools.powerFunctionAnalysis(list),
                        /** 计算统计结果。 */
                        statisticsCalc: (listA, listB) => StatisticsTools.statisticsCalc(listA, listB),
                        /** 分析复数根式。 */
                        radicalFunctionAnalysis: (z, n) => RadicalFunctionTools.radicalFunctionAnalysis(z, n),
                        /** 生成函数值列表。 */
                        valueList: (f, g, start, step, end) => FuncValueListTools.valueList(f, g, start, step, end),
                        /** 执行表达式计算。 */
                        exec: (expr, {calcAcc, outputAcc, calcMode, outputMode, f, g} = {}) => CalcTools.exec(expr, {
                            calcAcc: calcAcc,
                            outputAcc: outputAcc,
                            calcMode: calcMode,
                            outputMode: outputMode,
                            f: f,
                            g: g
                        })
                    },
                    dependencies: [
                        {name: 'TokenConfig', value: TokenConfig},
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
                 * Worker 任务的默认超时时间（毫秒）。
                 *
                 * @private
                 * @type {number}
                 */
                static _WORKER_TIMEOUT = 60000;

                /**
                 * Worker 是否处于重启状态。
                 *
                 * @private
                 * @type {boolean}
                 */
                static _isRestarting = false;

                /**
                 * 阻止实例化静态工具类。
                 *
                 * @throws {Error} 始终抛出。
                 */
                constructor() {
                    throw new Error('[WorkerTools] WorkerTools is a static class and should not be instantiated.');
                }

                /**
                 * 判断 Worker 是否可用。
                 *
                 * @readonly
                 * @type {boolean}
                 */
                static get isReady() {
                    return this._mathWorker !== null && !this._mathWorker.isTerminated;
                }

                /**
                 * 分发 Worker 任务，并在意外失败后恢复 Worker 状态。
                 *
                 * @private
                 * @template T
                 * @param {string} funcName - 数学 Worker 已注册的公开函数名；意外崩溃重启后会以同一名称重试。
                 * @param {Array} args - 可结构化克隆的位置参数；本方法会整体传给 `SyncWorker.exec`，不会改动
                 *   数组内容。每次分发统一使用 `_WORKER_TIMEOUT` 作为最长执行时间。
                 * @returns {Promise<T>} 目标 Worker 方法的原始结果；仅 Worker 意外终止类故障会触发重启，
                 *   业务计算错误、取消和超时保持原拒绝原因，不被包装成成功值。
                 */
                static async _dispatch(funcName, args = []) {
                    try {
                        return await this._mathWorker.exec(funcName, {
                            args,
                            timeout: this._WORKER_TIMEOUT
                        });
                    } catch (e) {
                        // 主动终止或取消不触发自动恢复。
                        if (e.name === 'TerminationError' || e.name === 'CancellationError') {
                            throw e;
                        }

                        if (WorkerTools._isRestarting) {
                            const err = new Error('[WorkerTools] Worker is restarting, request aborted.');
                            err.name = 'TerminationError';
                            throw err;
                        }

                        WorkerTools._isRestarting = true;
                        try {
                            // 意外错误会重建 Worker 并恢复配置；失败的当前请求不自动重放，防止副作用重复。
                            if (this._mathWorker) {
                                this._mathWorker.terminate();
                                this._mathWorker.restart();
                            }
                            await WorkerTools._restoreState();
                        } finally {
                            WorkerTools._isRestarting = false;
                        }

                        // 恢复 Worker 后仍向调用方报告本次失败。
                        throw e;
                    }
                }

                /**
                 * 将主线程配置恢复到重启后的 Worker。
                 *
                 * @private
                 * @returns {Promise<void>}
                 */
                static async _restoreState() {
                    // 直接调用 Worker，避免恢复失败再次触发重启。
                    await this._mathWorker.exec('initEnv', {
                        args: [{
                            calcAcc: CalcConfig.globalCalcAccuracy,
                            outputAcc: CalcConfig.outputAccuracy,
                            printMode: CalcConfig.globalPrintMode
                        }]
                    });
                }

                /**
                 * 重启 Worker 并恢复配置。
                 *
                 * @returns {Promise<void>}
                 */
                static async restart() {
                    if (this._mathWorker) {
                        WorkerTools.cancelWorker();
                        this._mathWorker.restart();
                        await WorkerTools._restoreState();
                    }
                }

                /**
                 * 取消所有正在执行或排队的任务。
                 *
                 * @returns {void}
                 */
                static cancelWorker() {
                    if (!this._mathWorker || this._mathWorker.isTerminated) {
                        return;
                    }

                    this._mathWorker.cancel();
                }

                /**
                 * 设置 Worker 的默认计算精度。
                 *
                 * @param {number} [acc] - 1 到 Worker 支持上限之间的正整数有效位数；省略时由 Worker 端恢复
                 *   预设计算精度。设置会保留到 Worker 重启后的状态恢复流程中。
                 * @returns {Promise<number>} Worker 校验后实际保存的正整数计算精度；省略参数时返回预设值。
                 */
                static setCalcAccuracy(acc) {
                    return this._dispatch('setCalcAccuracy', [acc]);
                }

                /**
                 * 获取 Worker 的默认计算精度。
                 *
                 * @returns {Promise<number>} Worker 当前上下文中的正整数有效位数，不读取主线程缓存。
                 */
                static getCalcAccuracy() {
                    return this._dispatch('getCalcAccuracy');
                }

                /**
                 * 设置 Worker 的默认输出精度。
                 *
                 * @param {number} [acc] - 输出精度策略：大于等于 1 表示绝对有效位数，`(0, 1)` 表示相对
                 *   计算精度的比例，非正值表示保留计算精度；省略时由 Worker 端采用其预设值。
                 * @returns {Promise<number>} Worker 规范化并保存的输出精度策略值；绝对位数可能受计算精度限制。
                 */
                static setOutputAccuracy(acc) {
                    return this._dispatch('setOutputAccuracy', [acc]);
                }

                /**
                 * 获取 Worker 的默认输出精度。
                 *
                 * @returns {Promise<number>} Worker 当前输出精度策略的原始数值，可能是绝对位数、比例或非正值。
                 */
                static getOutputAccuracy() {
                    return this._dispatch('getOutputAccuracy');
                }

                /**
                 * 设置 Worker 的复数输出模式。
                 *
                 * @param {'algebra'|'polar'} mode - 后续格式化任务采用的复数形式；`algebra` 输出实部/虚部，
                 *   `polar` 输出模/辐角。无效值由 Worker 的 `CalcConfig` 校验并拒绝。
                 * @returns {Promise<'algebra'|'polar'>} Worker 校验后实际保存的复数输出模式。
                 */
                static setPrintMode(mode) {
                    return this._dispatch('setPrintMode', [mode]);
                }

                /**
                 * 获取 Worker 的复数输出模式。
                 *
                 * @returns {Promise<'algebra'|'polar'>} Worker 当前复数输出模式，不读取主线程缓存。
                 */
                static getPrintMode() {
                    return this._dispatch('getPrintMode');
                }

                /**
                 * 分析四次及以下多项式的区间、极值、拐点和根。
                 *
                 * @param {Array<string|number|bigint|BigNumber|ComplexNumber|Array>} list - 最多五个、按降幂排列的
                 *   实系数；参数通过结构化克隆传入 Worker，调用期间不会修改主线程数组。
                 * @returns {Promise<PowerFunctionAnalysisResult>} 与同步分析器完全同构的结果；区间、点和根均已
                 *   格式化为字符串，哨兵值的含义见 `PowerFunctionAnalysisResult`。
                 */
                static powerFunctionAnalysis(list) {
                    return this._dispatch('powerFunctionAnalysis', [list]);
                }

                /**
                 * 计算两组数据的统计指标与回归模型。
                 *
                 * @param {Array<ComplexNumber|string|number>} listA - 非空实数自变量样本；必须和 `listB` 等长，
                 *   相同索引组成一个观测点。
                 * @param {Array<ComplexNumber|string|number>} listB - 非空实数因变量样本；样本数量决定可拟合的
                 *   回归阶数，传输后主线程中的数组仍保持可用。
                 * @returns {Promise<StatisticsAnalysisResult>} 与同步统计器完全同构的固定字段对象；所有七种
                 *   回归模型即使不可计算也保留各自的 `RegressionModelResult` 占位结构。
                 */
                static statisticsCalc(listA, listB) {
                    return this._dispatch('statisticsCalc', [listA, listB]);
                }

                /**
                 * 计算复数的 n 次方根。
                 *
                 * @param {ComplexNumber|string|number|bigint|BigNumber|Array} z - 任意可解析的实数或复数被开方数。
                 * @param {ComplexNumber|string|number|bigint|BigNumber|Array} n - 经精度修正后必须为纯实正整数；
                 *   过大的 `n` 仍计算通式，但数值解只返回配置允许的前若干项。
                 * @returns {Promise<{z:string,n:string,formula:string,kRange:[string,string],numericalResults:Array<string>,overflow:boolean}>}
                 *   规范化输入、含 `[k]` 的根通式、完整序号范围、受展示上限约束的数值根以及截断标记。
                 */
                static radicalFunctionAnalysis(z, n) {
                    return this._dispatch('radicalFunctionAnalysis', [z, n]);
                }

                /**
                 * 按范围和步长生成 f(x)、g(x) 的函数值列表。
                 *
                 * @param {string} f - 内部词元格式的 `f(x)` 表达式；可以引用 `g(x)`，逐点错误单独返回。
                 * @param {string} g - 内部词元格式的 `g(x)` 表达式；可以引用 `f(x)`，与 `f` 共享自变量区间。
                 * @param {string|number|BigNumber|ComplexNumber|Array} start - 纯实闭区间起点，必须不大于 `end`。
                 * @param {string|number|BigNumber|ComplexNumber|Array} step - 严格为正的纯实增量；不会为命中终点而调整。
                 * @param {string|number|BigNumber|ComplexNumber|Array} end - 纯实闭区间终点；结果数超过上限时截断并标记省略。
                 * @returns {Promise<{varList:Array<string>,f:Array<string>,g:Array<string>}>} 三个索引对齐的数组；
                 *   单点错误和超出展示上限时使用的尾部哨兵与同步 `FuncValueListTools.valueList` 一致。
                 */
                static valueList(f, g, start, step, end) {
                    return this._dispatch('valueList', [f, g, start, step, end]);
                }

                /**
                 * 在 Worker 中计算数学表达式。
                 *
                 * @param {string} expr - 内部数学词元表达式；在 Worker 中解析，返回值包含其规范化形式。
                 * @param {object} [options={}] - 仅覆盖本任务的计算上下文；省略字段时使用 Worker 当前默认配置。
                 * @param {number} [options.calcAcc] - 本任务及其嵌套函数调用使用的正整数有效位数；不持久化。
                 * @param {number} [options.outputAcc] - 本任务的最终显示精度，可用绝对位数、比例或非正跟随值。
                 * @param {'calc'|'syntaxCheck'} [options.calcMode='calc'] - 计算或语法检查模式。
                 * @param {'output'|'mid'} [options.outputMode='output'] - `output` 返回显示字符串，`mid` 保留可继续
                 *   计算的内部表示；后者的结果类型不能按普通字符串消费。
                 * @param {string} [options.f] - 本任务中 `[f]` 对应的函数体，可引用 `[x]`、`[g]`。
                 * @param {string} [options.g] - 本任务中 `[g]` 对应的函数体，可引用 `[x]`、`[f]`。
                 * @returns {Promise<{result:string|[[number,bigint,number],[number,bigint,number]],expr:string}>}
                 *   `result` 的形态由 `outputMode` 决定：显示字符串或复数内部二元组；`expr` 始终为规范化表达式。
                 */
                static exec(expr, {calcAcc, outputAcc, calcMode, outputMode, f, g} = {}) {
                    return this._dispatch('exec', [expr, {calcAcc, outputAcc, calcMode, outputMode, f, g}]);
                }
            }

            window.SyncWorker = SyncWorker;
            window.WorkerTools = WorkerTools;
        })();