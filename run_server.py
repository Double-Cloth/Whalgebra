import http.server
import socketserver
import webbrowser
import os
import socket
import sys
import threading


# 1. 定义多线程服务器，解决资源加载阻塞问题
class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True


# 2. 自定义请求处理程序，禁用浏览器缓存
class NoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 添加 HTTP 头，告诉浏览器不要缓存文件
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # 让控制台日志更简洁
    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.client_address[0],
                          self.log_date_time_string(),
                          format % args))


def find_free_port(start_port=8000):
    """通过尝试绑定的方式寻找可用端口"""
    port = start_port
    while port < 9000:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(('localhost', port))
                return port
        except OSError:
            port += 1
    return start_port


def get_local_ip():
    """获取本机局域网 IP"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def run_enhanced_server():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    PORT = find_free_port(8000)
    Handler = NoCacheRequestHandler
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with ThreadingHTTPServer(("", PORT), Handler) as httpd:
            local_ip = get_local_ip()
            localhost_url = f"http://localhost:{PORT}"
            network_url = f"http://{local_ip}:{PORT}"

            print("=" * 50)
            print(f"服务器已启动 (多线程模式)")
            print(f"根目录: {base_dir}")
            print("-" * 50)
            print(f"本机访问: {localhost_url}")
            print(f"局域网访问: {network_url}")
            print("-" * 50)
            print("提示: 文件修改后刷新即生效 (已禁用缓存)")
            print("按 Ctrl+C 停止运行")
            print("=" * 50)

            webbrowser.open(localhost_url)
            httpd.serve_forever()

    except KeyboardInterrupt:
        print("\n服务器已停止")
        sys.exit(0)
    except Exception as e:
        print(f"运行出错: {e}")


if __name__ == "__main__":
    run_enhanced_server()