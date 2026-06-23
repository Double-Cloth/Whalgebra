(() => {
    "use strict";

    const ready = (callback) => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, {once: true});
            return;
        }
        callback();
    };

    function initializeAmbientBackground(root = document) {
        root.querySelectorAll(".ambient-blob").forEach((blob, index) => {
            const x = ((index * 31 + 7) % 108) - 18;
            const y = ((index * 43 + 11) % 108) - 18;
            blob.style.setProperty("--blob-x", `${x}%`);
            blob.style.setProperty("--blob-y", `${y}%`);
            blob.style.setProperty("--blob-delay", `${-index * 4}s`);
            window.requestAnimationFrame(() => blob.classList.add("is-ready"));
        });
    }

    function applyEnvironment(root = document) {
        const isFile = window.location.protocol === "file:";
        root.body.classList.add(isFile ? "environment-file" : "environment-server");
        if (!isFile) {
            return;
        }

        root.querySelectorAll("[data-server-only]").forEach((element) => {
            element.removeAttribute("href");
            element.setAttribute("aria-disabled", "true");
            element.setAttribute("tabindex", "-1");
        });
    }

    function setStatus(element, state, message) {
        if (!element) {
            return;
        }
        element.dataset.state = state;
        const text = element.querySelector("[data-status-text]");
        if (text && message) {
            text.textContent = message;
        }
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(body.error || `请求失败：HTTP ${response.status}`);
            Object.assign(error, body);
            throw error;
        }
        return body;
    }

    async function updateServiceStatus(root = document) {
        const status = root.querySelector("[data-service-status]");
        if (!status) {
            return;
        }
        if (window.location.protocol === "file:") {
            setStatus(status, "warning", "当前为文件预览模式");
            return;
        }
        try {
            await requestJson("/api/tools/status");
            setStatus(status, "ready", "本地服务与工具 API 已连接");
        } catch {
            setStatus(status, "warning", "页面可用，但工具 API 未连接");
        }
    }

    window.WhalgebraUI = {ready, setStatus, requestJson};

    ready(() => {
        initializeAmbientBackground();
        applyEnvironment();
        updateServiceStatus();
    });
})();
