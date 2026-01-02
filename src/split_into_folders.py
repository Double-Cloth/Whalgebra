import argparse
import hashlib
import shutil
import textwrap
from pathlib import Path
from bs4 import BeautifulSoup, Tag


def calculate_hash(content: str) -> str:
    """计算内容的 MD5 哈希值，用于生成唯一文件名。"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()[:8]


def extract_and_save(soup: BeautifulSoup, tag_name: str, output_dir: Path, ext: str):
    """提取指定标签的内容并保存为文件。"""
    tags = soup.find_all(tag_name)
    for tag in tags:
        if tag_name == 'script' and tag.get('src'):
            continue

        raw_content = tag.string
        if not raw_content:
            continue

        # textwrap.dedent: 去除所有行共有的前导空白（智能去缩进）
        # strip: 去除首尾的空行和多余空格
        content = textwrap.dedent(raw_content).strip()

        if not content:
            continue

        if tag_name == 'script':
            script_type = tag.get('type', '').lower()
            if script_type and script_type not in ['text/javascript', 'application/javascript', 'module']:
                continue

        tag_id = tag.get('id')
        if tag_id:
            filename = f"{tag_id}{ext}"
        else:
            # 直接使用处理后(去缩进)的内容计算哈希，保证内容一致性
            content_hash = calculate_hash(content)
            filename = f"extracted_{content_hash}{ext}"

        file_path = output_dir / filename

        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                # 写入处理后的内容
                f.write(content)
        except IOError as e:
            print(f"Error writing file {filename}: {e}")
            continue

        tag.string = ""
        if tag_name == 'style':
            # 显式使用相对路径 ./css/
            new_link = soup.new_tag("link", rel="stylesheet", href=f"./css/{filename}")
            if tag.get('media'):
                new_link['media'] = tag['media']
            tag.replace_with(new_link)
            print(f"  [CSS] Extracted -> css/{filename}")

        elif tag_name == 'script':
            # 显式使用相对路径 ./js/
            tag['src'] = f"./js/{filename}"
            print(f"  [JS]  Extracted -> js/{filename}")


def main():
    parser = argparse.ArgumentParser(description="Extract inline CSS and JS from an HTML file.")
    parser.add_argument("input_file", nargs='?', default="Whalgebra.html", help="Path to the input HTML file.")
    parser.add_argument("--out", "-o", default=None, help="Name of the output folder (optional).")

    args = parser.parse_args()
    input_path = Path(args.input_file)

    if not input_path.exists():
        print(f"Error: File '{input_path}' not found.")
        return

    export_dir_name = args.out if args.out else f"split_files_of_{input_path.stem}"
    base_export_path = Path.cwd() / export_dir_name

    if base_export_path.exists():
        shutil.rmtree(base_export_path)

    css_dir = base_export_path / "css"
    js_dir = base_export_path / "js"
    css_dir.mkdir(parents=True, exist_ok=True)
    js_dir.mkdir(parents=True, exist_ok=True)

    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')

        extract_and_save(soup, 'style', css_dir, '.css')
        extract_and_save(soup, 'script', js_dir, '.js')

        # 生成 .nojekyll 文件，确保 GitHub Pages 不过滤资源
        (base_export_path / ".nojekyll").touch()

        output_html_path = base_export_path / "index.html"
        with open(output_html_path, 'w', encoding='utf-8') as f:
            f.write(soup.prettify())

        print(f"Success! Created .nojekyll and saved to {base_export_path}")

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()