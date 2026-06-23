(() => {
    "use strict";

    function createSpan(text, className = "") {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        return span;
    }

    function renderPrimitive(text, className, key) {
        const wrapper = document.createElement("div");
        wrapper.className = "json-tree";
        wrapper.appendChild(createSpan("", "jv-spacer"));
        if (key !== null) {
            wrapper.appendChild(createSpan(`"${key}"`, "jv-key"));
            wrapper.appendChild(createSpan(": ", "jv-punct"));
        }
        wrapper.appendChild(createSpan(text, className));
        return wrapper;
    }

    function createJsonTree(data, key = null) {
        if (data === null || data === undefined) {
            return renderPrimitive(String(data), "jv-null", key);
        }
        if (typeof data === "boolean") {
            return renderPrimitive(String(data), "jv-boolean", key);
        }
        if (typeof data === "number") {
            return renderPrimitive(String(data), "jv-number", key);
        }
        if (typeof data === "string") {
            return renderPrimitive(`"${data}"`, "jv-string", key);
        }
        if (typeof data !== "object") {
            return renderPrimitive(String(data), "jv-string", key);
        }

        const isArray = Array.isArray(data);
        const entries = Object.entries(data);
        const container = document.createElement("div");
        const header = document.createElement("div");
        const openChar = isArray ? "[" : "{";
        const closeChar = isArray ? "]" : "}";
        container.className = "jv-node collapsed json-tree";
        header.className = "jv-header";

        if (entries.length > 0) {
            const toggle = createSpan("▼", "jv-toggle");
            header.appendChild(toggle);
            header.addEventListener("click", (event) => {
                event.stopPropagation();
                container.classList.toggle("collapsed");
                container.classList.toggle("expanded");
            });
        } else {
            header.appendChild(createSpan("", "jv-spacer"));
        }

        if (key !== null) {
            header.appendChild(createSpan(`"${key}"`, "jv-key"));
            header.appendChild(createSpan(": ", "jv-punct"));
        }
        header.appendChild(createSpan(openChar, "jv-punct"));
        if (entries.length > 0) {
            header.appendChild(createSpan(isArray ? `Array(${entries.length})` : "...", "jv-ellipsis"));
        }
        container.appendChild(header);

        if (entries.length > 0) {
            const children = document.createElement("div");
            children.className = "jv-children";
            entries.forEach(([entryKey, value]) => {
                const item = document.createElement("div");
                item.appendChild(createJsonTree(value, isArray ? null : entryKey));
                children.appendChild(item);
            });
            container.appendChild(children);
        }

        const footer = document.createElement("div");
        footer.className = "jv-footer";
        footer.appendChild(createSpan(closeChar, "jv-punct"));
        container.appendChild(footer);
        return container;
    }

    window.WhalgebraUI.JsonTree = Object.freeze({create: createJsonTree});
})();
