const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const output = document.getElementById('output');
const iframe = document.getElementById('logicEngine');
let isAutoScroll = true;

// --- JSON 构建 ---
function createSpan(text, className) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
}

function createJsonTree(data, key = null) {
    if (data === null) {
        return renderPrimitive('null', 'jv-null', key);
    }
    if (data === undefined) {
        return renderPrimitive('undefined', 'jv-null', key);
    }
    if (typeof data === 'boolean') {
        return renderPrimitive(data.toString(), 'jv-boolean', key);
    }
    if (typeof data === 'number') {
        return renderPrimitive(data.toString(), 'jv-number', key);
    }
    if (typeof data === 'string') {
        return renderPrimitive(`"${data}"`, 'jv-string', key);
    }
    if (typeof data !== 'object') {
        return renderPrimitive(String(data), 'jv-string', key);
    }

    const isArray = Array.isArray(data);
    const isEmpty = Object.keys(data).length === 0;
    const openChar = isArray ? '[' : '{';
    const closeChar = isArray ? ']' : '}';

    const container = document.createElement('div');
    container.className = 'jv-node collapsed json-tree'; // 默认折叠

    const header = document.createElement('div');
    header.style.display = 'inline-block';

    if (!isEmpty) {
        const toggle = document.createElement('span');
        toggle.className = 'jv-toggle';
        toggle.textContent = '▼';
        const toggleAction = (e) => {
            e.stopPropagation();
            const isCollapsed = container.classList.contains('collapsed');
            if (isCollapsed) {
                container.classList.remove('collapsed');
                container.classList.add('expanded');
            } else {
                container.classList.remove('expanded');
                container.classList.add('collapsed');
            }
        };
        toggle.onclick = toggleAction;
        header.style.cursor = 'pointer';
        header.onclick = toggleAction;
        header.appendChild(toggle);
    } else {
        const spacer = document.createElement('span');
        spacer.style.width = '14px';
        spacer.style.display = 'inline-block';
        header.appendChild(spacer);
    }

    if (key !== null) {
        header.appendChild(createSpan(`"${key}"`, 'jv-key'));
        header.appendChild(createSpan(': ', 'jv-punct'));
    }

    header.appendChild(createSpan(openChar, 'jv-punct'));

    if (!isEmpty) {
        const count = isArray ? data.length : Object.keys(data).length;
        const info = isArray ? `Array(${count})` : `...`;
        const ellipsis = createSpan(info, 'jv-ellipsis');
        header.appendChild(ellipsis);
    }

    container.appendChild(header);

    if (!isEmpty) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'jv-children';
        for (let k in data) {
            if (Object.prototype.hasOwnProperty.call(data, k)) {
                const itemRow = document.createElement('div');
                itemRow.className = 'jv-item';
                const childNode = createJsonTree(data[k], isArray ? null : k);
                itemRow.appendChild(childNode);
                childrenContainer.appendChild(itemRow);
            }
        }
        container.appendChild(childrenContainer);
    }

    const footer = document.createElement('div');
    footer.className = 'jv-footer';
    footer.appendChild(createSpan(closeChar, 'jv-punct'));
    container.appendChild(footer);

    return container;
}

function renderPrimitive(text, className, key) {
    const wrapper = document.createElement('div');
    wrapper.className = 'json-tree';
    const spacer = document.createElement('span');
    spacer.style.width = '14px';
    spacer.style.display = 'inline-block';
    wrapper.appendChild(spacer);
    if (key !== null) {
        wrapper.appendChild(createSpan(`"${key}"`, 'jv-key'));
        wrapper.appendChild(createSpan(': ', 'jv-punct'));
    }
    wrapper.appendChild(createSpan(text, className));
    return wrapper;
}

// --- 日志系统 ---
function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString('en-GB') + '.' + now.getMilliseconds().toString().padStart(3, '0');
}

function addLogToUI(tag, args, level = "info") {
    const div = document.createElement('div');
    div.className = 'log-row';
    if (level === "error") {
        div.classList.add('log-row-error');
    }

    let tagClass = "tag-info";
    if (level === "error") {
        tagClass = "tag-error";
    } else if (level === "warn") {
        tagClass = "tag-warn";
    } else if (level === "success") {
        tagClass = "tag-success";
    } else if (tag === "SYS") {
        tagClass = "tag-sys";
    }

    const metaDiv = document.createElement('div');
    metaDiv.className = 'log-meta';
    metaDiv.innerHTML = `<span class="log-time">${getTimeString()}</span><span class="log-tag ${tagClass}">[${tag}]</span>`;
    div.appendChild(metaDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'log-content';

    const argList = Array.isArray(args) ? args : [args];
    argList.forEach((arg, index) => {
        if (index > 0) {
            contentDiv.appendChild(createSpan(' ', ''));
        }
        if (typeof arg === 'object' && arg !== null) {
            contentDiv.appendChild(createJsonTree(arg));
        } else {
            const span = document.createElement('span');
            span.style.verticalAlign = 'top';
            span.textContent = String(arg);
            contentDiv.appendChild(span);
        }
    });

    div.appendChild(contentDiv);
    output.appendChild(div);
    if (isAutoScroll) {
        output.scrollTop = output.scrollHeight;
    }
}

function clearLog() {
    output.innerHTML = '';
    addLogToUI("SYS", "已清空", "info");
}

function toggleAutoScroll() {
    isAutoScroll = !isAutoScroll;
    const btn = document.getElementById('btnAutoScroll');
    btn.innerText = isAutoScroll ? "自动滚动: ON" : "自动滚动: OFF";
    btn.style.color = isAutoScroll ? "#FFF" : "#777";
}

// --- 劫持 ---
const originalConsole = {log: console.log, warn: console.warn, error: console.error, info: console.info};

function enableConsoleCapture() {
    console.log = (...args) => {
        addLogToUI("LOG", args, "info");
        originalConsole.log.apply(console, args);
    };
    console.warn = (...args) => {
        addLogToUI("WARN", args, "warn");
        originalConsole.warn.apply(console, args);
    };
    console.error = (...args) => {
        addLogToUI("ERR", args, "error");
        originalConsole.error.apply(console, args);
    };
    console.info = (...args) => {
        addLogToUI("INFO", args, "success");
        originalConsole.info.apply(console, args);
    };
}

function disableConsoleCapture() {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
}

// --- 核心：连接状态检查 ---
// 检查核心是否真正加载，并相应地更新 UI
function updateEngineStatus() {
    let isConnected = false;
    try {
        if (iframe.contentWindow && iframe.contentWindow.MathPlus) {
            isConnected = true;
        }
    } catch (e) {
    }

    // 获取所有测试按钮 (除了清空日志)
    const buttons = document.querySelectorAll('button#testBtn, button.test-case-btn');

    if (isConnected) {
        statusDot.className = "status-dot active";
        statusText.innerText = "就绪 - 已连接";
        buttons.forEach(b => b.disabled = false);
    } else {
        statusDot.className = "status-dot error";
        statusText.innerText = "连接失败 (Core Missing)";
        buttons.forEach(b => b.disabled = true);
    }
    return isConnected;
}

// --- 运行器 ---
async function uiRunTest(mode) {
    // 运行时禁用按钮
    document.querySelectorAll('button:not(.console-header button)').forEach(b => b.disabled = true);
    const mapTitle = {0: "全部测试集", 1: "性能测试", 2: "幂函数", 3: "统计", 4: "根式", 5: "值列表", 6: "表达式"};

    statusDot.className = "status-dot loading";
    statusText.innerText = `Running...`;

    const hr = document.createElement('div');
    hr.style.borderTop = '1px dashed #333';
    hr.style.margin = '10px 0';
    output.appendChild(hr);

    addLogToUI("SYS", `>>> 开始: ${mapTitle[mode] || mode}`, "sys");
    enableConsoleCapture();

    try {
        await new Promise(r => setTimeout(r, 50));

        // 检查连接，防止中途断开
        if (!updateEngineStatus()) {
            throw new Error("引擎连接断开");
        }

        const result = await test(mode);

        const msg = mode === 0 ? "全部测试集" : "当前测试集";
        if (result) {
            addLogToUI("SYS", `<<< ${msg}通过`, "success");
        } else {
            addLogToUI("SYS", `<<< ${msg}未通过 (存在错误)`, "error");
        }

    } catch (e) {
        addLogToUI("FATAL", e.message, "error");
        originalConsole.error(e);
    } finally {
        disableConsoleCapture();
        document.getElementById('clearBtn').disabled = false;
        // 重新检查连接状态，而不是盲目设置为 Ready
        updateEngineStatus();
    }
}

// Iframe 加载事件
iframe.onload = () => {
    const connected = updateEngineStatus();
    if (connected) {
        addLogToUI("SYS", "核心组件 MathPlus 已加载。", "success");
    } else {
        addLogToUI("ERR", "Iframe 已加载，但未找到 MathPlus 对象 (可能由于路径错误)。", "error");
    }
};

// 初始检查 (防止缓存导致 onload 不触发)
if (iframe.contentWindow && iframe.contentWindow.document.readyState === 'complete') {
    updateEngineStatus();
}