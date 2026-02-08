import argparse
import hashlib
import shutil
import textwrap
import sys
from pathlib import Path
from typing import Optional, Tuple
from bs4 import BeautifulSoup, Tag
from bs4.formatter import HTMLFormatter
from argparse import RawTextHelpFormatter

# ==========================================
# 全局配置 (Global Configuration)
# 在此处修改默认的输入路径和输出行为
# ==========================================
GLOBAL_CONFIG = {
    # 默认输入文件名 (如果在命令行未指定)
    "DEFAULT_INPUT_FILE": "../src/Whalgebra.html",

    # 默认输出目录名称 (设为 None 则自动生成: split_files_of_{filename})
    "DEFAULT_OUTPUT_DIR": "../src/split_files_of_Whalgebra",

    # 文件编码
    "ENCODING": "utf-8",

    # HTML 输出缩进空格数
    "INDENT_WIDTH": 4,

    # 子目录名称
    "CSS_DIR_NAME": "css",
    "JS_DIR_NAME": "js"
}


def calculate_hash(content: str) -> str:
    """计算内容的 MD5 哈希值（取前8位）。"""
    return hashlib.md5(content.encode(GLOBAL_CONFIG["ENCODING"])).hexdigest()[:8]


def get_unique_filepath(directory: Path, filename: str) -> Path:
    """确保文件名不重复，如果重复则添加计数后缀。"""
    name = Path(filename).stem
    ext = Path(filename).suffix
    counter = 1
    file_path = directory / filename

    while file_path.exists():
        file_path = directory / f"{name}_{counter}{ext}"
        counter += 1
    return file_path


def process_tags(soup: BeautifulSoup, tag_name: str, output_subdir: Path, ext: str, do_dedent: bool = True) -> int:
    """
    提取 HTML 标签内容到文件，并替换原标签引用。
    """
    tags = soup.find_all(tag_name)
    count = 0

    # 获取子文件夹名称 (用于生成相对路径 e.g., "css" or "js")
    subdir_name = output_subdir.name

    for tag in tags:
        # 1. 过滤：跳过带有 src (JS) 或 href (CSS link) 的外部资源
        if tag_name == 'script' and tag.get('src'):
            continue
        if tag_name == 'link':
            continue

        raw_content = tag.string
        if not raw_content:
            continue

        # 2. 处理缩进
        content = textwrap.dedent(raw_content).strip() if do_dedent else raw_content.strip()
        if not content:
            continue

        # 3. 过滤 Script 类型 (仅处理标准 JS)
        if tag_name == 'script':
            script_type = tag.get('type', '').lower()
            valid_types = ['', 'text/javascript', 'application/javascript', 'module']
            if script_type not in valid_types:
                continue

        # 4. 确定文件名 (优先使用 ID，否则使用 Hash)
        tag_id = tag.get('id')
        if tag_id:
            filename = f"{tag_id}{ext}"
        else:
            content_hash = calculate_hash(content)
            filename = f"extracted_{content_hash}{ext}"

        file_path = get_unique_filepath(output_subdir, filename)
        final_filename = file_path.name

        # 5. 写入文件
        try:
            with open(file_path, 'w', encoding=GLOBAL_CONFIG["ENCODING"]) as f:
                f.write(content)
        except IOError as e:
            print(f"  [Error] Writing {final_filename}: {e}")
            continue

        # 6. 修改 HTML DOM：替换为 link 或 script src
        # 使用正斜杠 / 构建 Web 路径，即使在 Windows 上也是如此
        relative_path = f"./{subdir_name}/{final_filename}"

        tag.string = ""  # 清空原内容

        if tag_name == 'style':
            new_link = soup.new_tag("link", rel="stylesheet", href=relative_path)
            # 保留 media 属性
            if tag.get('media'):
                new_link['media'] = tag['media']
            tag.replace_with(new_link)
            print(f"  [CSS] Extracted -> {subdir_name}/{final_filename}")

        elif tag_name == 'script':
            tag['src'] = relative_path
            # script 标签通常保留原位置，只增加 src 属性，内容已清空
            print(f"  [JS]  Extracted -> {subdir_name}/{final_filename}")

        count += 1

    return count


def parse_arguments() -> argparse.Namespace:
    """配置并解析命令行参数。"""
    description_text = """
    将 HTML 文件中的内联 CSS (<style>) 和 JS (<script>) 提取为独立文件。
    自动更新 HTML 中的引用链接，并生成 output 文件夹。
    """

    epilog_text = f"""
    默认配置:
      Input File: {GLOBAL_CONFIG['DEFAULT_INPUT_FILE']}
      Output Dir: split_files_of_[filename] (除非指定 -o)
    """

    parser = argparse.ArgumentParser(
        description=textwrap.dedent(description_text),
        epilog=textwrap.dedent(epilog_text),
        formatter_class=RawTextHelpFormatter
    )

    parser.add_argument(
        "input_file",
        nargs='?',
        default=GLOBAL_CONFIG['DEFAULT_INPUT_FILE'],
        help=f"输入 HTML 文件的路径 (默认: {GLOBAL_CONFIG['DEFAULT_INPUT_FILE']})"
    )

    parser.add_argument(
        "--out", "-o",
        default=GLOBAL_CONFIG['DEFAULT_OUTPUT_DIR'],
        help="指定输出文件夹名称 (覆盖默认生成规则)"
    )

    parser.add_argument(
        "--no-dedent",
        action="store_true",
        help="禁用智能去缩进 (保留原始空格)"
    )

    return parser.parse_args()


def main():
    args = parse_arguments()
    input_path = Path(args.input_file).resolve()

    if not input_path.exists():
        print(f"Error: Input file '{input_path}' not found.")
        print(f"Tip: You can change the default path in GLOBAL_CONFIG at the top of the script.")
        sys.exit(1)

    # 确定输出路径
    if args.out:
        export_dir_name = args.out
    else:
        export_dir_name = f"split_files_of_{input_path.stem}"

    base_export_path = Path.cwd() / export_dir_name

    # ==========================================
    # 准备环境：清理旧目录并创建新目录
    # ==========================================
    if base_export_path.exists():
        print(f"Cleaning existing directory: {base_export_path}")
        try:
            shutil.rmtree(base_export_path)
        except OSError as e:
            print(f"Error: 无法删除目录 {base_export_path}. 请检查文件是否被占用。\nDetails: {e}")
            sys.exit(1)

    # 创建目录结构
    css_dir = base_export_path / GLOBAL_CONFIG["CSS_DIR_NAME"]
    js_dir = base_export_path / GLOBAL_CONFIG["JS_DIR_NAME"]

    try:
        css_dir.mkdir(parents=True, exist_ok=True)
        js_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"Error: Failed to create directories. {e}")
        sys.exit(1)

    print(f"Processing: {input_path.name}")
    print(f"Output to: {base_export_path}")
    print("-" * 40)

    try:
        # 解析 HTML (优先尝试 lxml)
        encoding = GLOBAL_CONFIG["ENCODING"]
        with open(input_path, 'r', encoding=encoding) as f:
            try:
                soup = BeautifulSoup(f, 'lxml')
            except Exception:
                # 如果用户没安装 lxml，回退到标准库
                f.seek(0)
                soup = BeautifulSoup(f, 'html.parser')

        # 处理标签
        do_dedent = not args.no_dedent
        css_count = process_tags(soup, 'style', css_dir, '.css', do_dedent)
        js_count = process_tags(soup, 'script', js_dir, '.js', do_dedent)

        # 创建 .nojekyll (防止 GitHub Pages 忽略下划线开头的文件夹)
        (base_export_path / ".nojekyll").touch()

        # 输出 index.html
        output_html_path = base_export_path / "index.html"
        with open(output_html_path, 'w', encoding=encoding) as f:
            formatter = HTMLFormatter(indent=GLOBAL_CONFIG["INDENT_WIDTH"])
            f.write(soup.prettify(formatter=formatter))

        print("-" * 40)
        print(f"Success! Process completed.")
        print(f"  - Input:  {input_path}")
        print(f"  - Output: {output_html_path}")
        print(f"  - Stats:  {css_count} CSS files, {js_count} JS files extracted.")

    except Exception as e:
        print(f"Critical Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
