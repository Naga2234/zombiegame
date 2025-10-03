#!/usr/bin/env bash
python3 app.py &
sleep 1
open http://127.0.0.1:8000/ 2>/dev/null || xdg-open http://127.0.0.1:8000/ 2>/dev/null || true
wait
