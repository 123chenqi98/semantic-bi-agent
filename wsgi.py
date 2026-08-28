"""
Gunicorn 生产入口。
用法：
  gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app --timeout 120
"""
from src.demo.app_backend import app

if __name__ == "__main__":
    app.run()
