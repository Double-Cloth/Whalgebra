import argparse
import hashlib
import shutil
import textwrap
import os
from pathlib import Path
from bs4 import BeautifulSoup, Tag
from bs4.formatter import HTMLFormatter
from argparse import RawTextHelpFormatter


def calculate_hash(content: str) -> str:
    """计算内容的 MD5 哈希值（取前8位）。"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()[:8]


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


def process_tags(soup: BeautifulSoup, tag_name: str, output_dir: Path, ext: str, do_dedent: bool = True):
    """
    提取标签内容，保存文件，并替换 HTML 标签。
    """
    tags = soup.find_all(tag_name)
    count = 0

    for tag in tags:
        # 1. 过滤：跳过带有 src (JS) 或 href (CSS link) 的外部资源
        if tag_name == 'script' and tag.get('src'):
            continue
        if tag_name == 'link':
            continue

        raw_content = tag.string
        if not raw_content:
            continue

        # 2. 处理缩进：去除多余的公共缩进
        if do_dedent:
            content = textwrap.dedent(raw_content).strip()
        else:
            content = raw_content.strip()

        if not content:
            continue

        # 3. 过滤 Script 类型
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

        file_path = get_unique_filepath(output_dir, filename)
        final_filename = file_path.name

        # 5. 写入 CSS/JS 文件
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
        except IOError as e:
            print(f"  [Error] Writing {final_filename}: {e}")
            continue

        # 6. 修改 HTML DOM：替换为 link 或 script src
        tag.string = ""  # 清空原内容
        relative_path = f"./{output_dir.name}/{final_filename}"

        if tag_name == 'style':
            new_link = soup.new_tag("link", rel="stylesheet", href=relative_path)
            # 保留 media 属性 (例如 media="print")
            if tag.get('media'):
                new_link['media'] = tag['media']
            tag.replace_with(new_link)
            print(f"  [CSS] Extracted -> {output_dir.name}/{final_filename}")

        elif tag_name == 'script':
            tag['src'] = relative_path
            # script 标签通常保留原位置，只增加 src 属性
            print(f"  [JS]  Extracted -> {output_dir.name}/{final_filename}")

        count += 1

    return count


def main():
    description_text = """
    将 HTML 文件中的内联 CSS (<style>) 和 JS (<script>) 提取为独立文件。
    自动更新 HTML 中的引用链接，并生成 output 文件夹。
    """

    epilog_text = """
    示例:
      1. 默认用法:
         python split_into_folders.py

      2. 指定输入文件:
         python split_into_folders.py index.html
    """

    parser = argparse.ArgumentParser(
        description=textwrap.dedent(description_text),
        epilog=textwrap.dedent(epilog_text),
        formatter_class=RawTextHelpFormatter
    )

    parser.add_argument(
        "input_file",
        nargs='?',
        default="Whalgebra.html",
        help="输入 HTML 文件的路径"
    )

    parser.add_argument(
        "--out", "-o",
        default=None,
        help="指定输出文件夹名称"
    )

    parser.add_argument(
        "--no-dedent",
        action="store_true",
        help="禁用智能去缩进"
    )

    args = parser.parse_args()
    input_path = Path(args.input_file)

    if not input_path.exists():
        print(f"Error: File '{input_path}' not found.")
        return

    # 确定输出路径
    export_dir_name = args.out if args.out else f"split_files_of_{input_path.stem}"
    base_export_path = Path.cwd() / export_dir_name

    # ==========================================
    # 核心步骤：先清空目标目录
    # ==========================================
    if base_export_path.exists():
        print(f"Cleaning existing directory: {base_export_path}")
        try:
            shutil.rmtree(base_export_path)
        except OSError as e:
            print(f"Error: 无法删除目录 {base_export_path}. 请检查文件是否被占用。\nDetails: {e}")
            return

    # 创建目录结构
    css_dir = base_export_path / "css"
    js_dir = base_export_path / "js"
    css_dir.mkdir(parents=True, exist_ok=True)
    js_dir.mkdir(parents=True, exist_ok=True)

    print(f"Processing: {input_path.name}")
    print(f"Output to: {base_export_path}")

    try:
        # 尝试使用 lxml 解析器以获得更好的格式支持，如果没有则回退到 html.parser
        try:
            with open(input_path, 'r', encoding='utf-8') as f:
                soup = BeautifulSoup(f, 'lxml')
        except Exception:
            with open(input_path, 'r', encoding='utf-8') as f:
                soup = BeautifulSoup(f, 'html.parser')

        # 处理标签
        css_count = process_tags(soup, 'style', css_dir, '.css', do_dedent=not args.no_dedent)
        js_count = process_tags(soup, 'script', js_dir, '.js', do_dedent=not args.no_dedent)

        # 创建 .nojekyll (防止 GitHub Pages 忽略下划线开头的文件夹)
        (base_export_path / ".nojekyll").touch()

        # 输出 HTML
        output_html_path = base_export_path / "index.html"
        with open(output_html_path, 'w', encoding='utf-8') as f:
            # ==========================================
            # 格式化输出：保证缩进
            # indent=2 代表使用 2 个空格缩进
            # ==========================================
            formatter = HTMLFormatter(indent=2)
            f.write(soup.prettify(formatter=formatter))

        print("-" * 40)
        print(f"Success!")
        print(f"  - Extracted {css_count} CSS files")
        print(f"  - Extracted {js_count} JS files")
        print(f"  - Cleaned and recreated output directory")

    except Exception as e:
        print(f"Critical Error: {e}")


if __name__ == "__main__":
    main()