#!/bin/bash

# VoiceCanvas 一键启动脚本 (Linux/Mac)

echo "========================================"
echo "  VoiceCanvas 纯语音绘图工具 - 启动器"
echo "========================================"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 启动后端
echo "[1/2] 启动后端服务..."
cd "$SCRIPT_DIR/ai-service"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
echo "      后端地址: http://localhost:8000"
echo "      PID: $BACKEND_PID"

# 等待后端启动
sleep 3

# 启动前端
echo "[2/2] 启动前端服务..."
cd "$SCRIPT_DIR/web"
npm run dev &
FRONTEND_PID=$!
echo "      前端地址: http://localhost:5173"
echo "      PID: $FRONTEND_PID"

echo ""
echo "========================================"
echo "  启动完成！"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:8000"
echo "  API文档: http://localhost:8000/docs"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获退出信号
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# 等待
wait
