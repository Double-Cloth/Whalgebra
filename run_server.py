import http.server
import socketserver
import webbrowser
import os
import socket
import sys
import argparse
import threading
from typing import Tuple

# --- 配置常量 ---
DEFAULT_PORT = 8000
MAX_PORT_RETRIES = 100


class CORSNoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
    """
    增强型请求处理程序：
    1. 禁用浏览器缓存
    2. 支持 CORS (跨域资源共享)
    3. 优化日志输出
    """

    def end_headers(self):
        # 1. 禁用缓存
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

        # 2. 允许跨域 (CORS) - 方便前端调试
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type")

        super().end_headers()

    def do_OPTIONS(self):
        """处理预检请求"""
        self.send_response(200, "ok")
        self.end_headers()

    def log_message(self, format, *args):
        # 使用标准输出
        sys.stdout.write("[%s] %s\n" %
                         (self.log_date_time_string(),
                          format % args))


class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """多线程服务器，防止资源加载阻塞"""
    daemon_threads = True
    allow_reuse_address = True


def get_local_ip() -> str:
    """获取本机局域网 IP"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def create_server(target_dir: str, start_port: int, bind_all: bool) -> Tuple[socketserver.TCPServer, int]:
    """
    尝试创建服务器，如果端口被占用则自动递增
    返回: (server_instance, actual_port)
    """
    os.chdir(target_dir)
    port = start_port
    host = "" if bind_all else "127.0.0.1"

    for _ in range(MAX_PORT_RETRIES):
        try:
            # 直接尝试实例化服务器，原子性操作
            server = ThreadingHTTPServer((host, port), CORSNoCacheRequestHandler)
            return server, port
        except OSError:
            port += 1

    raise RuntimeError(f"无法在 {start_port} - {port} 范围内找到可用端口。")


def main():
    # --- 增强的帮助信息配置 ---
    global server
    description = "Python 静态文件服务器\n支持：多线程并发、CORS 跨域、禁用缓存。"

    epilog = """
使用示例:
  1. 默认启动 (当前目录, 端口 8000):
     python run_server.py

  2. 指定目录和端口:
     python run_server.py --dir ./dist --port 9000

  3. 仅允许本机访问 (更安全):
     python run_server.py --local

  4. 查看帮助:
     python run_server.py --help
    """

    # 使用 RawTextHelpFormatter 让 description 和 epilog 支持换行
    parser = argparse.ArgumentParser(
        description=description,
        epilog=epilog,
        formatter_class=argparse.RawTextHelpFormatter
    )

    parser.add_argument("--dir", default=".", metavar="PATH", help="指定要服务的目录路径 (默认: 当前目录)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, metavar="PORT",
                        help=f"指定起始端口号 (默认: {DEFAULT_PORT})")
    parser.add_argument("--local", action="store_true", help="安全模式：仅监听 127.0.0.1，不暴露给局域网")

    args = parser.parse_args()

    # --- 后续逻辑不变 ---
    target_dir = os.path.abspath(args.dir)
    if not os.path.exists(target_dir):
        print(f"错误: 目录 '{target_dir}' 不存在。")
        sys.exit(1)

    try:
        server, port = create_server(target_dir, args.port, not args.local)

        local_ip = get_local_ip()
        localhost_url = f"http://localhost:{port}"
        network_url = f"http://{local_ip}:{port}" if not args.local else "禁用 (仅本机)"

        print("=" * 60)
        print(f"服务器已启动")
        print(f"根目录: {target_dir}")
        print("-" * 60)
        print(f"本机访问: {localhost_url}")
        if not args.local:
            print(f"局域网访问: {network_url}")
        print("-" * 60)
        print("提示: 修改文件后刷新即生效。按 Ctrl+C 停止。")
        print("=" * 60)

        threading.Timer(0.5, lambda: webbrowser.open(localhost_url)).start()

        server.serve_forever()

    except KeyboardInterrupt:
        print("\n正在停止服务器...")
        server.shutdown()
        server.server_close()
        print("服务器已关闭。")
        sys.exit(0)
    except Exception as e:
        print(f"\n发生错误: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()