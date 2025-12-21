import argparse
import hashlib
import shutil
from pathlib import Path
from bs4 import BeautifulSoup, Tag


def calculate_hash(content: str) -> str:
    """
    计算内容的 MD5 哈希值，用于生成唯一文件名。
    """
    return hashlib.md5(content.encode('utf-8')).hexdigest()[:8]


def extract_and_save(soup: BeautifulSoup, tag_name: str, output_dir: Path, ext: str):
    """
    提取指定标签的内容并保存为文件。
    """
    tags = soup.find_all(tag_name)

    # 计数器，用于没有 ID 且内容重复时的备用命名
    counter = 1

    for tag in tags:
        # 1. 基础检查
        # 如果是 script 标签，忽略已有 src 的
        if tag_name == 'script' and tag.get('src'):
            continue

        # 获取内容并去除首尾空白
        content = tag.string
        if not content or not content.strip():
            continue

        # 2. 特殊类型过滤 (针对 script)
        # 如果 script 只有 type="application/json" 等非执行代码，跳过
        if tag_name == 'script':
            script_type = tag.get('type', '').lower()
            if script_type and script_type not in ['text/javascript', 'application/javascript', 'module']:
                # 如果是模板或 JSON 数据，通常不应提取为 .js 文件
                print(f"Skipping non-executable script type: {script_type}")
                continue

        # 3. 确定文件名
        # 优先级: ID -> 内容哈希 -> 序号
        tag_id = tag.get('id')

        if tag_id:
            filename = f"{tag_id}{ext}"
        else:
            # 使用内容哈希避免重复文件
            content_hash = calculate_hash(content.strip())
            filename = f"extracted_{content_hash}{ext}"

        file_path = output_dir / filename

        # 4. 写入文件 (如果文件已存在且内容相同，则覆盖或跳过皆可，这里选择覆盖以确保最新)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content.strip())
        except IOError as e:
            print(f"Error writing file {filename}: {e}")
            continue

        # 5. 修改 HTML 标签
        # 清除原内容
        tag.string = ""

        if tag_name == 'style':
            # 创建新的 link 标签
            new_link = soup.new_tag("link", rel="stylesheet", href=f"css/{filename}")
            # 保留原 style 标签上的 media 等属性
            if tag.get('media'):
                new_link['media'] = tag['media']
            tag.replace_with(new_link)
            print(f"  [CSS] Extracted -> css/{filename}")

        elif tag_name == 'script':
            # 添加 src 属性指向新文件
            tag['src'] = f"js/{filename}"
            # 注意：不使用 replace_with，而是直接修改当前 tag，这样可以保留 async/defer 等属性
            print(f"  [JS]  Extracted -> js/{filename}")


def main():
    # --- 命令行参数配置 ---
    parser = argparse.ArgumentParser(description="Extract inline CSS and JS from an HTML file.")
    parser.add_argument("input_file", nargs='?', default="Whalgebra.html", help="Path to the input HTML file.")
    parser.add_argument("--out", "-o", default=None, help="Name of the output folder (optional).")

    args = parser.parse_args()

    input_path = Path(args.input_file)

    # 1. 检查源文件
    if not input_path.exists():
        print(f"Error: File '{input_path}' not found.")
        return

    # 如果未指定输出目录，则默认为 "split_files_of_[文件名]"
    if args.out:
        export_dir_name = args.out
    else:
        export_dir_name = f"split_files_of_{input_path.stem}"

    base_export_path = Path.cwd() / export_dir_name
    final_html_name = "index.html"

    print(f"Processing file: {input_path} ...")

    # 2. 准备输出目录
    if base_export_path.exists():
        try:
            shutil.rmtree(base_export_path)
        except OSError as e:
            print(f"Warning: Could not clear old directory. {e}")

    css_dir = base_export_path / "css"
    js_dir = base_export_path / "js"

    # parents=True 允许创建多级目录，exist_ok=True 允许目录已存在
    css_dir.mkdir(parents=True, exist_ok=True)
    js_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 3. 解析 HTML
        # 使用 utf-8 编码读取
        with open(input_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')

        # 4. 执行提取逻辑
        extract_and_save(soup, 'style', css_dir, '.css')
        extract_and_save(soup, 'script', js_dir, '.js')

        # 5. 保存结果
        output_html_path = base_export_path / final_html_name

        # 即使使用 prettify 也可能会破坏某些预格式化文本，
        # 如果对格式要求极高，可以直接使用 str(soup)
        with open(output_html_path, 'w', encoding='utf-8') as f:
            f.write(soup.prettify())

        print("-" * 30)
        print("Success: Processing complete.")
        print(f"Output directory: {base_export_path}")
        print(f"New HTML file:    {output_html_path}")

    except Exception as e:
        print(f"Error: An unexpected error occurred: {e}")


if __name__ == "__main__":
    main()