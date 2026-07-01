WhalgebraUI.ready(() => {
    "use strict";

    const form = document.querySelector("[data-tool-form]");
    const log = document.querySelector("[data-tool-log]");
    const status = document.querySelector("[data-tool-status]");
    const submitButton = form?.querySelector('button[type="submit"]');

    if (!form || !log || !status || !submitButton) {
        return;
    }

    const logger = WhalgebraUI.createLogConsole(log);

    function createPayload() {
        const payload = Object.fromEntries(new FormData(form).entries());
        form.querySelectorAll('input[type="checkbox"][name]').forEach((checkbox) => {
            payload[checkbox.name] = checkbox.checked;
        });
        return payload;
    }

    function classifyLogLine(line) {
        if (/\[(?:error|err|!!)\]|FAIL|failed|not found|No valid|失败|错误/iu.test(line)) {
            return {tag: "ERR", level: "error"};
        }
        if (/\[WARN\]|Warning|Font detected|目录为空|已自动创建/iu.test(line)) {
            return {tag: "WARN", level: "warn"};
        }
        if (/DONE|Success|SUCCESSFUL|processed|执行完成|完成|已连接/iu.test(line)) {
            return {tag: "OK", level: "success"};
        }
        if (/\[(?:CSS|JS)\]|Processing|Output|Input|Target|Time|Status|Saved|Temp|Stats|Cleaning/iu.test(line)) {
            return {tag: "INFO", level: "info"};
        }
        return {tag: "SYS", level: "sys"};
    }

    function appendDivider() {
        const divider = document.createElement("div");
        divider.className = "console-divider";
        log.appendChild(divider);
    }

    function normalizeLogText(line, tag) {
        if (tag === "WARN") {
            return line.replace(/\[WARN\]\s*/iu, "").trim();
        }
        if (tag === "ERR") {
            return line.replace(/\[(?:ERROR|ERR|!!)\]\s*/iu, "").trim();
        }
        return line;
    }

    function renderLogLines(lines, fallback) {
        log.replaceChildren();
        const visibleLines = lines.filter((line) => line !== null && line !== undefined);
        if (visibleLines.length === 0) {
            logger.addLog("SYS", fallback, "sys");
            return;
        }

        visibleLines.forEach((line) => {
            const text = String(line);
            if (text.trim() === "" || /^[-=]{8,}$/u.test(text.trim())) {
                appendDivider();
                return;
            }
            const {tag, level} = classifyLogLine(text);
            logger.addLog(tag, normalizeLogText(text, tag) || text, level);
        });
    }

    async function execute(payload) {
        return WhalgebraUI.requestJson(form.dataset.endpoint, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
    }

    async function submitForm(event) {
        event.preventDefault();
        const payload = createPayload();
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        WhalgebraUI.setStatus(status, "loading", "正在执行工具任务……");
        renderLogLines(["正在执行工具任务……"], "正在执行工具任务……");

        try {
            let result;
            try {
                result = await execute(payload);
            } catch (error) {
                const shouldRetry = form.hasAttribute("data-confirm-overwrite")
                    && error.code === "OUTPUT_EXISTS"
                    && !payload.force
                    && window.confirm(`${error.message}\n\n是否覆盖并继续？`);
                if (!shouldRetry) {
                    throw error;
                }
                result = await execute({...payload, force: true});
            }
            renderLogLines(result.logs || [], "执行完成。");
            WhalgebraUI.setStatus(status, "success", "任务执行完成");
        } catch (error) {
            renderLogLines([...(error.logs || []), `[ERROR] ${error.message}`], "任务执行失败");
            WhalgebraUI.setStatus(status, "error", "任务执行失败，请检查日志");
        } finally {
            submitButton.disabled = false;
            submitButton.removeAttribute("aria-busy");
        }
    }

    async function checkServer() {
        try {
            await WhalgebraUI.requestJson("/api/tools/status");
            WhalgebraUI.setStatus(status, "ready", "工具服务已连接");
        } catch {
            WhalgebraUI.setStatus(status, "error", "工具服务不可用");
            submitButton.disabled = true;
        }
    }

    form.addEventListener("submit", submitForm);
    renderLogLines(["等待执行。"], "等待执行。");
    checkServer();
});
