import os
import shutil
import base64
import sys
import re
import argparse
import datetime
import time
from pathlib import Path

# 获取当前脚本所在目录
BASE_DIR = Path(__file__).parent.absolute()

# ================= 配置区域 (详细注释版) =================
CONFIG = {
    # ================= [路径配置] =================
    # 输入目录：默认在脚本同级创建 input，也可以通过命令行 -i 参数覆盖
    'input_dir': BASE_DIR / 'input',

    # 输出目录：生成的 CSS 文件存放位置
    'output_dir': BASE_DIR / 'output',

    # 临时目录：存放压缩优化后的 SVG 源文件 (方便您拿去单独使用)
    'temp_dir': BASE_DIR / 'temp',

    # 输出的 CSS 文件名称
    'output_css_name': 'icons.css',

    # ================= [压缩配置 (Scour Options)] =================
    # Scour 是核心压缩引擎，以下选项决定了 SVG 怎么瘦身
    'scour_options': {
        # [核心优化]
        'enable_viewboxing': True,  # 强烈建议开启！自动修正或添加 viewBox 属性 (网页响应式缩放必须)
        'enable_id_stripping': True,  # 删除未被使用的 ID 属性 (减小体积)
        'enable_comment_stripping': True,  # 删除文件中的注释
        'shorten_ids': True,  # 将 ID 缩短为随机字符 (如 id="layer1" -> id="a")，进一步减小体积

        # [格式化与清理]
        'indent_type': 'none',  # 缩进方式：'none'=压缩成一行(体积最小); 'space'=格式化(方便阅读)
        'strip_xml_prolog': True,  # 删除开头的 <?xml ...?> 声明 (浏览器不需要这个)
        'remove_metadata': True,  # 删除元数据 (如 Illustrator/Inkscape 留下的编辑信息，体积占用大且无用)
        'newlines': False,  # 是否保留换行符

        # [颜色与样式] (按需开启，通常保持默认即可)
        'simple_colors': False,  # 是否将 #RRGGBB 缩写为 #RGB (建议 False，防止某些老旧解析器出错)
        'style_to_xml': False,  # 是否将 style="..." 转换为 XML 属性 (如 fill="red")
        'group_collapse': False,  # 是否删除无用的 <g> 标签 (有时会导致复杂图形层级错乱，建议 False)
    }
}


# =======================================================

class Logger:
    """自定义日志打印类，支持颜色和时间戳"""
    # ANSI 颜色代码
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

    @staticmethod
    def _time():
        return datetime.datetime.now().strftime('%H:%M:%S')

    @classmethod
    def info(cls, msg):
        print(f"{cls.BOLD}[{cls._time()}] [INFO] {msg}{cls.RESET}")

    @classmethod
    def success(cls, msg):
        print(f"{cls.GREEN}[{cls._time()}] [SUCCESS] {msg}{cls.RESET}")

    @classmethod
    def warning(cls, msg):
        print(f"{cls.YELLOW}[{cls._time()}] [WARNING] {msg}{cls.RESET}")

    @classmethod
    def error(cls, msg):
        print(f"{cls.RED}[{cls._time()}] [ERROR] {msg}{cls.RESET}")

    @classmethod
    def box(cls, lines):
        """打印一个漂亮的方框信息"""
        width = 60
        print(f"{cls.CYAN}┌{'─' * width}┐{cls.RESET}")
        for line in lines:
            # 计算实际字符长度
            print(f"{cls.CYAN}│{cls.RESET} {line:<{width - 2}} {cls.CYAN}│{cls.RESET}")
        print(f"{cls.CYAN}└{'─' * width}┘{cls.RESET}")


# 引入 scour
try:
    from scour import scour
except ImportError as e:
    Logger.error(f"无法导入 scour 库。详情: {e}")
    print(">>> 请运行命令安装: pip install scour")
    sys.exit(1)


class ScourOptionsMock:
    """
    用于模拟 scour 需要的 options 对象。
    """

    def __init__(self, config_options):
        # 1. 设置 Scour 所有可能的默认值 (防止报错)
        # =========================================================================
        # [注意] 为什么要写这一大堆默认值？
        # Scour 库的内部代码（scour.py）会直接读取 options 对象的属性，例如 options.simple_colors。
        # 如果我们只传了 CONFIG 里那几个配置，Scour 访问其他未定义的属性时，就会直接报错：
        # AttributeError: 'ScourOptionsMock' object has no attribute 'xxx'
        # 因此，这里必须把 Scour 可能用到的所有参数都列出来，并给一个安全的默认值（通常是 False 或 None）。
        # =========================================================================
        defaults = {
            # --- 颜色与样式 ---
            'simple_colors': False,  # 是否简化颜色代码 (#aabbcc -> #abc)
            'style_to_xml': False,  # 是否将 style 属性转换为 XML 属性
            'group_collapse': False,  # 是否合并无用的 <g> 组

            # --- 兼容性与清理 ---
            'doc_type_xml_ent': False,  # 是否保留文档类型定义
            'embed_rasters': False,  # 是否嵌入位图 (我们只处理矢量)
            'keep_editor_data': False,  # 是否保留编辑器元数据

            # --- ID 处理 ---
            'strip_ids': False,  # 是否完全剥离 ID (慎用，可能导致引用丢失)
            'shorten_ids': False,  # 是否缩短 ID

            # --- 结构清理 ---
            'strip_comments': False,  # 是否删除注释
            'strip_xml_prolog': False,  # 是否删除 XML 头声明
            'remove_metadata': False,  # 是否删除 <metadata> 标签
            'enable_viewboxing': False,  # 是否修正 viewBox

            # --- 输出格式 ---
            'indent_type': 'none',  # 缩进类型
            'digits': 5,  # 坐标精度 (小数点后保留几位)
            'quiet': True,  # 静默模式 (不输出 Scour 自己的日志)
            'verbose': False,  # 详细模式
            'newlines': True,  # 是否保留换行符
            'line_terminator': '\n',  # 行结束符
            'set_precision': 5,  # 设置精度
            'renderer_workaround': False,  # 针对某些渲染器的兼容性修复
            'copy_defs': False,  # 复制 defs (通常不需要)
            'no_renderer_workaround': True,
        }

        # 先将所有安全的默认值赋予当前对象
        for k, v in defaults.items():
            setattr(self, k, v)

        # 2. 用 CONFIG 中的配置覆盖默认值
        # 这里会将我们在开头 CONFIG 里自定义的配置（如 enable_viewboxing=True）应用生效
        for k, v in config_options.items():
            setattr(self, k, v)


class LocalSvgProcessor:
    def __init__(self):
        # 预编译正则，提升循环处理时的性能
        self.re_data_name = re.compile(r'\s+data-name=(["\']).*?\1')
        self.re_illustrator_id = re.compile(r'\s+id=["\']_图层_\d+["\']')

        self._init_folders()

    def _init_folders(self):
        """初始化文件夹结构"""
        # 1. 检查输入目录
        if not CONFIG['input_dir'].exists():
            Logger.warning(f"输入文件夹不存在: {CONFIG['input_dir']}")
            try:
                CONFIG['input_dir'].mkdir(parents=True, exist_ok=True)
                Logger.success("已自动为您创建该文件夹")
            except Exception as e:
                Logger.error(f"无法创建文件夹，请检查路径权限。错误: {e}")
                sys.exit(1)

            print(">>> 请将 SVG 文件放入该文件夹后重新运行。")
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
        """生成合法的 CSS 类名"""
        name = Path(filename).stem
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
        if clean_name and clean_name[0].isdigit():
            clean_name = f"_{clean_name}"
        return f"._{clean_name}_"

    def optimize_svg(self, file_path: Path) -> str:
        """读取 -> 正则清洗 -> Scour压缩"""
        try:
            content = file_path.read_text(encoding='utf-8')

            # =========== 1. 正则预清洗 ===========
            content = self.re_data_name.sub('', content)
            content = self.re_illustrator_id.sub('', content)

            # =========== 2. Scour 压缩 ===========
            options = ScourOptionsMock(CONFIG['scour_options'])
            clean_data = scour.scourString(content, options=options)
            return clean_data

        except Exception as e:
            # 这里的日志留给主循环处理，避免打断进度条
            return ""

    def run(self):
        input_files = list(CONFIG['input_dir'].glob('*.svg'))
        if not input_files:
            Logger.warning(f"在以下目录中未找到 SVG 文件:")
            print(f"   [DIR] {CONFIG['input_dir']}")
            return

        # 打印启动信息面板
        Logger.box([
            "[START] SVG 极速压缩工具启动",
            f"输入: {CONFIG['input_dir'].name}",
            f"数量: {len(input_files)} 个文件"
        ])

        start_time = time.time()
        css_rules = []
        success_count = 0
        total_files = len(input_files)

        # 开始处理循环
        for idx, f in enumerate(input_files, 1):
            # 打印单行进度条 (使用 \r 回到行首，实现原地刷新)
            # \033[K 用于清除光标后的残留字符
            sys.stdout.write(f"\r\033[K[PROCESSING] [{idx}/{total_files}] 正在处理: {f.name} ...")
            sys.stdout.flush()

            # 1. 压缩 SVG
            optimized_svg = self.optimize_svg(f)

            if not optimized_svg:
                sys.stdout.write(f"\n")  # 换行以免覆盖
                Logger.warning(f"文件压缩失败或为空: {f.name}")
                continue

            # 2. 保存压缩后的 SVG
            temp_file_path = CONFIG['temp_dir'] / f.name
            try:
                temp_file_path.write_text(optimized_svg, encoding='utf-8')
            except Exception as e:
                sys.stdout.write(f"\n")
                Logger.error(f"写入临时文件失败: {e}")

            # 3. 转 Base64
            b64_str = base64.b64encode(optimized_svg.encode('utf-8')).decode('utf-8')

            # 4. 生成 CSS
            class_name = self._sanitize_css_classname(f.name)
            rule = f"{class_name} {{\n    height: 5dvmin;\n    content: url(data:image/svg+xml;base64,{b64_str});\n}}"
            css_rules.append(rule)
            success_count += 1

        # 循环结束，换行
        print("\n")

        if not css_rules:
            Logger.error("没有生成任何 CSS 规则。")
            return

        # 5. 写入最终 CSS 文件
        output_file = CONFIG['output_dir'] / CONFIG['output_css_name']
        header = "/* Generated by Local-SVG-Tool */\n/* Icons Base64 Data */\n\n"

        try:
            final_content = header + "\n\n".join(css_rules)
            output_file.write_text(final_content, encoding='utf-8')

            end_time = time.time()
            duration = end_time - start_time

            # 打印结束统计
            Logger.success("处理完成！")
            Logger.box([
                f"[REPORT] 统计报告",
                f"耗时: {duration:.2f} 秒",
                f"成功: {success_count} / {total_files}",
                f"压缩源文件: temp/{'...' if success_count else '无'}",
                f"最终 CSS: {output_file.name}"
            ])

            # Windows 系统自动打开文件夹
            if sys.platform == 'win32':
                os.startfile(CONFIG['temp_dir'])

        except Exception as e:
            Logger.error(f"写入最终文件失败: {e}")


if __name__ == "__main__":
    # 命令行参数解析
    parser = argparse.ArgumentParser(description="SVG 极速压缩与 CSS 生成工具")
    parser.add_argument('-i', '--input', type=str, help='指定输入文件夹路径')
    args = parser.parse_args()

    # 如果有输入参数，覆盖配置
    if args.input:
        CONFIG['input_dir'] = Path(args.input).absolute()

    processor = LocalSvgProcessor()
    processor.run()
