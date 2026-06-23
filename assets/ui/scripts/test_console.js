WhalgebraUI.ready(() => {
    "use strict";

    const status = document.querySelector("[data-engine-status]");
    const output = document.getElementById("output");
    const iframe = document.getElementById("logicEngine");
    const testButtons = [...document.querySelectorAll("[data-test-mode]")];
    const clearButton = document.querySelector('[data-action="clear"]');
    const autoScrollButton = document.querySelector('[data-action="auto-scroll"]');
    const logger = WhalgebraUI.createLogConsole(output, {autoScrollButton});

    function setControlsDisabled(disabled) {
        testButtons.forEach((button) => {
            button.disabled = disabled;
        });
    }

    function updateEngineStatus() {
        let isConnected = false;
        try {
            isConnected = Boolean(iframe.contentWindow?.MathPlus);
        } catch {
            isConnected = false;
        }

        setControlsDisabled(!isConnected);
        WhalgebraUI.setStatus(
            status,
            isConnected ? "ready" : "error",
            isConnected ? "计算核心已连接" : "计算核心连接失败"
        );
        return isConnected;
    }

    async function runTest(mode) {
        const titles = {0: "全部测试集", 1: "性能测试", 2: "幂函数", 3: "统计", 4: "根式", 5: "值列表", 6: "表达式"};
        setControlsDisabled(true);
        WhalgebraUI.setStatus(status, "loading", `正在运行：${titles[mode] || mode}`);
        const divider = document.createElement("div");
        divider.className = "console-divider";
        output.appendChild(divider);
        logger.addLog("SYS", `开始运行：${titles[mode] || mode}`, "sys");
        logger.enableConsoleCapture();

        try {
            if (!updateEngineStatus()) {
                throw new Error("计算核心连接已断开");
            }
            setControlsDisabled(true);
            const result = await test(mode, iframe);
            logger.addLog("SYS", result ? "测试通过" : "测试未通过，存在错误", result ? "success" : "error");
        } catch (error) {
            logger.addLog("FATAL", error.message, "error");
            logger.originalConsole.error(error);
        } finally {
            logger.disableConsoleCapture();
            updateEngineStatus();
        }
    }

    testButtons.forEach((button) => {
        button.addEventListener("click", () => runTest(Number(button.dataset.testMode)));
    });
    clearButton.addEventListener("click", logger.clearLog);
    iframe.addEventListener("load", () => {
        if (updateEngineStatus()) {
            logger.addLog("SYS", "计算核心 MathPlus 已加载。", "success");
        } else {
            logger.addLog("ERR", "页面已加载，但未找到 MathPlus 对象。", "error");
        }
    });

    updateEngineStatus();
});
