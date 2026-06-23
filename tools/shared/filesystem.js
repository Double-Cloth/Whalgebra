import {EOL} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function nativeNewlines(content) {
    return content.replace(/\r\n?|\n/gu, EOL);
}

export function isSameOrAncestor(candidate, target) {
    const relative = path.relative(candidate, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveProjectPath(value, fallback) {
    const fallbackPath = path.relative(PROJECT_ROOT, fallback);
    const resolvedPath = path.resolve(PROJECT_ROOT, value || fallbackPath);
    const relative = path.relative(PROJECT_ROOT, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        const error = new Error("工具路径必须位于项目目录内。");
        error.code = "PATH_OUTSIDE_PROJECT";
        throw error;
    }
    return resolvedPath;
}

export function assertSafeOutputPaths(outputPaths, {
    inputPath,
    disallowOverlapping = false,
    message = "输出目录不能是磁盘/项目根目录，也不能包含输入文件。"
} = {}) {
    const resolvedOutputs = outputPaths.map((outputPath) => path.resolve(outputPath));
    const resolvedInput = inputPath ? path.resolve(inputPath) : null;

    const unsafeOutput = resolvedOutputs.some((outputPath) =>
        outputPath === path.parse(outputPath).root
        || isSameOrAncestor(outputPath, PROJECT_ROOT)
        || (resolvedInput && isSameOrAncestor(outputPath, resolvedInput)));

    const overlappingOutputs = disallowOverlapping && resolvedOutputs.some((outputPath, index) =>
        resolvedOutputs.slice(index + 1).some((nextOutputPath) =>
            isSameOrAncestor(outputPath, nextOutputPath) || isSameOrAncestor(nextOutputPath, outputPath)));

    if (unsafeOutput || overlappingOutputs) {
        const error = new Error(message);
        error.code = "UNSAFE_OUTPUT";
        throw error;
    }

    return resolvedOutputs;
}
