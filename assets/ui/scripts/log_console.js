(() => {
    "use strict";

    function createSpan(text, className = "") {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        return span;
    }

    function getTimeString() {
        const now = new Date();
        return `${now.toLocaleTimeString("en-GB")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    }

    function createLogConsole(output, {autoScrollButton = null} = {}) {
        let isAutoScroll = true;
        const originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
        };

        function appendConsoleArguments(container, values) {
            const args = Array.isArray(values) ? values : [values];
            let startIndex = 0;

            if (typeof args[0] === "string" && args[0].includes("%c")) {
                const parts = args[0].split("%c");
                container.appendChild(createSpan(parts[0]));
                for (let index = 1; index < parts.length; index += 1) {
                    const span = createSpan(parts[index]);
                    if (typeof args[index] === "string") {
                        span.style.cssText = args[index];
                    }
                    container.appendChild(span);
                }
                startIndex = parts.length;
            }

            args.slice(startIndex).forEach((value, index) => {
                if (container.childNodes.length > 0 || index > 0) {
                    container.appendChild(document.createTextNode(" "));
                }
                if (typeof value === "object" && value !== null) {
                    container.appendChild(WhalgebraUI.JsonTree.create(value));
                    return;
                }
                container.appendChild(createSpan(String(value)));
            });
        }

        function addLog(tag, args, level = "info") {
            const row = document.createElement("div");
            const meta = document.createElement("div");
            const content = document.createElement("div");
            const fullTime = getTimeString();
            const tagClasses = {
                error: "tag-error",
                warn: "tag-warn",
                success: "tag-success",
                sys: "tag-sys",
                info: "tag-info"
            };

            row.className = `log-row${level === "error" ? " log-row-error" : ""}`;
            meta.className = "log-meta";
            meta.appendChild(createSpan(fullTime, "log-time log-time-full"));
            meta.appendChild(createSpan(fullTime.split(":").slice(1).join(":"), "log-time log-time-short"));
            meta.appendChild(createSpan(`[${tag}]`, `log-tag ${tagClasses[level] || "tag-info"}`));
            content.className = "log-content";
            appendConsoleArguments(content, args);
            row.append(meta, content);
            output.appendChild(row);

            if (isAutoScroll) {
                output.scrollTop = output.scrollHeight;
            }
        }

        function clearLog() {
            output.replaceChildren();
            addLog("SYS", "控制台已清空", "sys");
        }

        function toggleAutoScroll() {
            isAutoScroll = !isAutoScroll;
            if (autoScrollButton) {
                autoScrollButton.dataset.enabled = String(isAutoScroll);
                autoScrollButton.textContent = `自动滚动：${isAutoScroll ? "开" : "关"}`;
            }
        }

        function enableConsoleCapture() {
            console.log = (...args) => {
                addLog("LOG", args);
                originalConsole.log.apply(console, args);
            };
            console.warn = (...args) => {
                addLog("WARN", args, "warn");
                originalConsole.warn.apply(console, args);
            };
            console.error = (...args) => {
                addLog("ERR", args, "error");
                originalConsole.error.apply(console, args);
            };
            console.info = (...args) => {
                addLog("INFO", args, "success");
                originalConsole.info.apply(console, args);
            };
        }

        function disableConsoleCapture() {
            Object.assign(console, originalConsole);
        }

        autoScrollButton?.addEventListener("click", toggleAutoScroll);

        return Object.freeze({
            addLog,
            clearLog,
            enableConsoleCapture,
            disableConsoleCapture,
            originalConsole
        });
    }

    window.WhalgebraUI.createLogConsole = createLogConsole;
})();
