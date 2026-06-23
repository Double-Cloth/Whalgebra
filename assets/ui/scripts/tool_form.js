WhalgebraUI.ready(() => {
    "use strict";

    const form = document.querySelector("[data-tool-form]");
    const log = document.querySelector("[data-tool-log]");
    const status = document.querySelector("[data-tool-status]");
    const submitButton = form?.querySelector('button[type="submit"]');

    if (!form || !log || !status || !submitButton) {
        return;
    }

    function createPayload() {
        const payload = Object.fromEntries(new FormData(form).entries());
        form.querySelectorAll('input[type="checkbox"][name]').forEach((checkbox) => {
            payload[checkbox.name] = checkbox.checked;
        });
        return payload;
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
        log.textContent = "正在执行……";

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
            log.textContent = result.logs?.join("\n") || "执行完成。";
            WhalgebraUI.setStatus(status, "success", "任务执行完成");
        } catch (error) {
            log.textContent = [...(error.logs || []), `[ERROR] ${error.message}`].join("\n");
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
            WhalgebraUI.setStatus(status, "error", "工具服务不可用，请运行 npm start");
            submitButton.disabled = true;
        }
    }

    form.addEventListener("submit", submitForm);
    checkServer();
});
