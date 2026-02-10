import os
import shutil
import base64
import sys
import re
import argparse
import datetime
import time
from pathlib import Path

# ================= 配置区域 =================
CONFIG = {
    # ================= [路径配置] =================
    # 输入目录：默认为当前执行目录下的 input 文件夹
    'input_dir': Path('../tmp/input'),

    # 输出目录：生成的 CSS 文件存放位置
    'output_dir': Path('../tmp/output-css'),

    # 临时目录：存放压缩优化后的 SVG 源文件
    'temp_dir': Path('../tmp/output-svg'),

    # 输出的 CSS 文件名称
    'output_css_name': 'icons.css',

    # 输出 CSS 文件中 SVG 的默认高度
    'default_height': '5dvmin',

    # ================= [压缩配置 (Scour Options)] =================
    'scour_options': {
        'enable_viewboxing': True,
        'enable_id_stripping': True,
        'enable_comment_stripping': True,
        'shorten_ids': True,
        'indent_type': 'none',
        'strip_xml_prolog': True,
        'remove_metadata': True,
        'newlines': False,
        'simple_colors': False,
        'style_to_xml': False,
        'group_collapse': False,
    }
}


# =======================================================

class Logger:
    """自定义日志打印类"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    GREY = '\033[90m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

    SYM_OK = "[OK]"
    SYM_FAIL = "[!!]"
    SYM_WARN = "[WARN]"
    SYM_INFO = "[i]"
    SYM_SAVE = "v"

    @classmethod
    def format_bytes(cls, size):
        power = 2 ** 10
        n = size
        power_labels = {0: 'B', 1: 'KB', 2: 'MB', 3: 'GB'}
        n_label = 0
        while n > power:
            n /= power
            n_label += 1
        return f"{n:.1f}{power_labels.get(n_label, 'TB')}"

    @classmethod
    def info(cls, msg):
        print(f"{cls.BLUE}{cls.SYM_INFO} {msg}{cls.RESET}")

    @classmethod
    def section(cls, msg):
        print(f"\n{cls.BOLD}{cls.CYAN}== {msg} =={cls.RESET}")

    @classmethod
    def success(cls, msg):
        print(f"{cls.GREEN}{cls.SYM_OK} {msg}{cls.RESET}")

    @classmethod
    def warning(cls, msg):
        print(f"{cls.YELLOW}{cls.SYM_WARN} {msg}{cls.RESET}")

    @classmethod
    def error(cls, msg):
        print(f"{cls.RED}{cls.SYM_FAIL} {msg}{cls.RESET}")

    @classmethod
    def report_line(cls, label, value, color=RESET):
        print(f"{cls.GREY}|{cls.RESET} {label:<15} : {color}{value}{cls.RESET}")

    @classmethod
    def box_start(cls, title):
        width = 50
        print(
            f"\n{cls.CYAN}+{'-' * 2} {cls.BOLD}{title} {cls.RESET}{cls.CYAN}{'-' * (width - len(title) - 4)}+{cls.RESET}")

    @classmethod
    def box_end(cls):
        width = 50
        print(f"{cls.CYAN}+{'-' * width}+{cls.RESET}\n")


# 引入 scour
try:
    from scour import scour
except ImportError as e:
    Logger.error(f"无法导入核心库 [scour]。")
    print(f"{Logger.YELLOW}   >>> 请运行安装命令: pip install scour{Logger.RESET}")
    sys.exit(1)


class ScourOptionsMock:
    def __init__(self, config_options):
        defaults = {
            'simple_colors': False,
            'style_to_xml': False,
            'group_collapse': False,
            'doc_type_xml_ent': False,
            'embed_rasters': False,
            'keep_editor_data': False,
            'strip_ids': False,
            'shorten_ids': False,
            'strip_comments': False,
            'strip_xml_prolog': False,
            'remove_metadata': False,
            'enable_viewboxing': False,
            'indent_type': 'none',
            'digits': 5,
            'quiet': True,
            'verbose': False,
            'newlines': True,
            'line_terminator': '\n',
            'set_precision': 5,
            'renderer_workaround': False,
            'copy_defs': False,
            'no_renderer_workaround': True,
        }
        for k, v in defaults.items():
            setattr(self, k, v)
        for k, v in config_options.items():
            setattr(self, k, v)


class LocalSvgProcessor:
    def __init__(self):
        self.re_data_name = re.compile(r'\s+data-name=(["\']).*?\1')
        self.re_illustrator_id = re.compile(r'\s+id=["\']_图层_\d+["\']')
        # 新增：检测文本节点的正则 (<text>, <tspan>, <textPath>, <flowRoot>)
        self.re_text_tags = re.compile(r'<(text|tspan|textPath|flowRoot)\b', re.IGNORECASE)
        self._init_folders()

    def _init_folders(self):
        """初始化文件夹结构"""
        # 1. 检查输入目录
        if not CONFIG['input_dir'].exists():
            Logger.warning(f"未找到输入目录: {CONFIG['input_dir']}")
            try:
                CONFIG['input_dir'].mkdir(parents=True, exist_ok=True)
                Logger.success(f"已自动创建输入目录: ./input")
            except Exception as e:
                Logger.error(f"创建目录权限不足: {e}")
                sys.exit(1)

            print(f"\n{Logger.CYAN}>> 操作指南: 请将 SVG 文件放入 'input' 文件夹后重新运行本脚本。{Logger.RESET}")
            sys.exit(1)

        # 2. 重建输出目录
        if CONFIG['output_dir'].exists():
            shutil.rmtree(CONFIG['output_dir'], ignore_errors=True)
        CONFIG['output_dir'].mkdir(parents=True, exist_ok=True)

        # 3. 重建临时目录
        if CONFIG['temp_dir'].exists():
            shutil.rmtree(CONFIG['temp_dir'], ignore_errors=True)
        CONFIG['temp_dir'].mkdir(parents=True, exist_ok=True)

    def _sanitize_css_classname(self, filename: str) -> str:
        name = Path(filename).stem
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
        if clean_name and clean_name[0].isdigit():
            clean_name = f"_{clean_name}"
        return f"._{clean_name}_"

    def optimize_svg(self, file_path: Path) -> str:
        try:
            content = file_path.read_text(encoding='utf-8')
            content = self.re_data_name.sub('', content)
            content = self.re_illustrator_id.sub('', content)
            options = ScourOptionsMock(CONFIG['scour_options'])
            clean_data = scour.scourString(content, options=options)
            return clean_data
        except Exception as e:
            return ""

    def _format_path(self, path):
        """统一将路径格式化为 UNIX 风格 (使用正斜杠)，且是相对路径"""
        try:
            # 获取相对于当前工作目录的路径
            rel_path = os.path.relpath(path)
            # 强制替换反斜杠为正斜杠
            return rel_path.replace(os.sep, '/')
        except Exception:
            return str(path).replace(os.sep, '/')

    def _check_has_text(self, file_path: Path) -> bool:
        """检查源文件是否包含未转曲的字体"""
        try:
            content = file_path.read_text(encoding='utf-8')
            if self.re_text_tags.search(content):
                return True
        except Exception:
            pass
        return False

    def run(self):
        # 支持相对路径查找
        input_files = list(CONFIG['input_dir'].glob('*.svg'))
        if not input_files:
            # 这里的路径显示也优化一下
            display_path = self._format_path(CONFIG['input_dir'])
            Logger.warning(f"目录为空: {display_path}")
            return

        # 打印启动面板
        Logger.box_start("SVG OPTIMIZER ENGINE")
        # 移除了 Work Dir，只显示 Input Dir
        Logger.report_line("Input Dir", self._format_path(CONFIG['input_dir']))
        Logger.report_line("Target Files", f"{len(input_files)} SVG(s)", Logger.BOLD)
        Logger.box_end()

        start_time = time.time()
        css_rules = []
        success_count = 0
        total_files = len(input_files)

        total_orig_size = 0
        total_opt_size = 0

        # 打印表头
        print(f"{Logger.GREY}{'ID':<4} {'STATUS':<8} {'FILENAME':<25} {'SIZE OPTIMIZATION'}{Logger.RESET}")
        print(f"{Logger.GREY}{'-' * 60}{Logger.RESET}")

        for idx, f in enumerate(input_files, 1):
            orig_size = f.stat().st_size
            total_orig_size += orig_size

            optimized_svg = self.optimize_svg(f)

            if not optimized_svg:
                status = f"{Logger.RED}FAIL{Logger.RESET}"
                print(f"{idx:<4} {status:<8} {f.name[:24]:<25}")
                Logger.warning(f"Skip: {f.name} (Empty or Error)")
                continue

            opt_size_bytes = len(optimized_svg.encode('utf-8'))
            total_opt_size += opt_size_bytes
            savings = orig_size - opt_size_bytes
            savings_pct = (savings / orig_size) * 100 if orig_size > 0 else 0

            size_color = Logger.GREEN if savings_pct > 20 else Logger.YELLOW
            size_info = f"{Logger.format_bytes(orig_size)} -> {Logger.format_bytes(opt_size_bytes)} ({Logger.SYM_SAVE}{savings_pct:.0f}%)"

            status = f"{Logger.GREEN}DONE{Logger.RESET}"
            print(
                f"{Logger.GREY}{idx:<4}{Logger.RESET} {status:<18} {f.name[:24]:<25} {size_color}{size_info}{Logger.RESET}")

            # [新增功能] 检查是否含有非路径字体
            if self._check_has_text(f):
                print(
                    f"     {Logger.YELLOW}└── [WARN] Font detected (<text>). Please convert to outlines.{Logger.RESET}")

            temp_file_path = CONFIG['temp_dir'] / f.name
            try:
                temp_file_path.write_text(optimized_svg, encoding='utf-8')
            except Exception as e:
                Logger.error(f"Write Temp Fail: {e}")

            b64_str = base64.b64encode(optimized_svg.encode('utf-8')).decode('utf-8')
            class_name = self._sanitize_css_classname(f.name)
            rule = f"{class_name} {{\n    height: {CONFIG['default_height']};\n    content: url(data:image/svg+xml;base64,{b64_str});\n}}"
            css_rules.append(rule)
            success_count += 1

        print(f"{Logger.GREY}{'-' * 60}{Logger.RESET}")

        if not css_rules:
            Logger.error("No valid SVG content processed.")
            return

        output_file = CONFIG['output_dir'] / CONFIG['output_css_name']
        header = "/* Generated by SVG_compressor */\n/* Icons Base64 Data */\n\n"

        try:
            final_content = header + "\n\n".join(css_rules)
            output_file.write_text(final_content, encoding='utf-8')

            end_time = time.time()
            duration = end_time - start_time
            total_saved = total_orig_size - total_opt_size
            total_saved_pct = (total_saved / total_orig_size) * 100 if total_orig_size > 0 else 0

            Logger.box_start("BUILD SUCCESSFUL")
            Logger.report_line("Time", f"{duration:.2f}s")
            Logger.report_line("Status", f"{success_count}/{total_files} files processed", Logger.GREEN)
            Logger.report_line("Total Size",
                               f"{Logger.format_bytes(total_orig_size)} -> {Logger.format_bytes(total_opt_size)}")
            Logger.report_line("Saved", f"{Logger.format_bytes(total_saved)} (-{total_saved_pct:.1f}%)", Logger.GREEN)

            # 使用新的格式化方法
            Logger.report_line("Output", self._format_path(output_file), Logger.BOLD)
            Logger.report_line("Temp Dir", self._format_path(CONFIG['temp_dir']), Logger.GREY)
            Logger.box_end()

        except Exception as e:
            Logger.error(f"Final write failed: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SVG 压缩与 CSS 生成工具")
    parser.add_argument('-i', '--input', type=str, help='指定输入文件夹路径')
    args = parser.parse_args()

    if args.input:
        # 支持用户传入相对路径
        CONFIG['input_dir'] = Path(args.input)

    processor = LocalSvgProcessor()
    processor.run()
