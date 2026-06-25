import {loadWhalgebraTestSuites, test} from "../../../test/browser/test_logic.js";

WhalgebraUI.ready(() => {
    "use strict";

    const status = document.querySelector("[data-engine-status]");
    const output = document.getElementById("output");
    const iframe = document.getElementById("logicEngine");
    const testButtons = [...document.querySelectorAll("[data-test-mode]")];
    const clearButton = document.querySelector('[data-action="clear"]');
    const cancelButton = document.querySelector('[data-action="cancel"]');
    const autoScrollButton = document.querySelector('[data-action="auto-scroll"]');
    const runStatus = document.querySelector("[data-run-status]");
    const runStatusText = document.querySelector("[data-run-status-text]");
    const logger = WhalgebraUI.createLogConsole(output, {autoScrollButton});
    let isEngineConnected = false;
    let activeRun = null;

    function waitForPaint() {
        return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    function setControlsDisabled(disabled) {
        testButtons.forEach((button) => {
            button.disabled = disabled;
        });
    }

    function syncControls() {
        setControlsDisabled(Boolean(activeRun) || !isEngineConnected);
        if (cancelButton) {
            cancelButton.hidden = !activeRun;
            cancelButton.disabled = !activeRun || Boolean(activeRun.cancelRequested);
        }
    }

    function setRunStatus(title) {
        document.body.classList.add("is-test-running");
        if (runStatus) {
            runStatus.hidden = false;
        }
        if (runStatusText) {
            runStatusText.textContent = `正在运行：${title}`;
        }
        WhalgebraUI.setStatus(status, "loading", `正在运行：${title}`);
        syncControls();
    }

    function clearRunStatus() {
        document.body.classList.remove("is-test-running");
        if (runStatus) {
            runStatus.hidden = true;
        }
        syncControls();
    }

    function updateEngineStatus() {
        try {
            isEngineConnected = Boolean(iframe.contentWindow?.MathPlus);
        } catch {
            isEngineConnected = false;
        }

        if (!activeRun) {
            WhalgebraUI.setStatus(
                status,
                isEngineConnected ? "ready" : "error",
                isEngineConnected ? "计算核心已连接" : "计算核心连接失败"
            );
        }
        syncControls();
        return isEngineConnected;
    }

    async function runTest(mode) {
        if (activeRun) {
            return;
        }

        const suites = await loadWhalgebraTestSuites();
        const titles = Object.fromEntries((suites ?? []).map((suite) => [
            suite.id,
            `${suite.id}. ${suite.title}`
        ]));
        titles[0] = "全部测试集";
        const title = titles[mode] || mode;
        if (!updateEngineStatus()) {
            logger.addLog("ERR", "计算核心连接已断开", "error");
            return;
        }

        const controller = new AbortController();
        activeRun = {controller, title, cancelRequested: false};
        setRunStatus(title);
        const divider = document.createElement("div");
        divider.className = "console-divider";
        output.appendChild(divider);
        logger.addLog("SYS", `开始运行：${title}`, "sys");
        await waitForPaint();
        logger.enableConsoleCapture();

        try {
            if (!isEngineConnected) {
                throw new Error("计算核心连接已断开");
            }
            const result = await test(mode, iframe, {signal: controller.signal});
            logger.addLog("SYS", result ? "测试通过" : "测试未通过，存在错误", result ? "success" : "error");
        } catch (error) {
            if (error?.name === "AbortError") {
                logger.addLog("SYS", "测试已取消", "warn");
            } else {
                logger.addLog("FATAL", error.message, "error");
                logger.originalConsole.error(error);
            }
        } finally {
            logger.disableConsoleCapture();
            activeRun = null;
            clearRunStatus();
            updateEngineStatus();
        }
    }

    testButtons.forEach((button) => {
        button.addEventListener("click", () => runTest(Number(button.dataset.testMode)));
    });
    clearButton.addEventListener("click", logger.clearLog);
    cancelButton?.addEventListener("click", () => {
        if (!activeRun) {
            return;
        }
        activeRun.cancelRequested = true;
        activeRun.controller.abort();
        cancelButton.disabled = true;
        if (runStatusText) {
            runStatusText.textContent = `正在取消：${activeRun.title}`;
        }
        WhalgebraUI.setStatus(status, "loading", `正在取消：${activeRun.title}`);
        logger.addLog("SYS", `正在取消：${activeRun.title}`, "warn");
    });
    iframe.addEventListener("load", () => {
        if (updateEngineStatus()) {
            logger.addLog("SYS", "计算核心 MathPlus 已加载。", "success");
        } else {
            logger.addLog("ERR", "页面已加载，但未找到 MathPlus 对象。", "error");
        }
    });

    updateEngineStatus();
});
