# Piper TTS Server

Server Python cục bộ dùng [Piper TTS](https://github.com/rhasspy/piper) để tổng hợp giọng Việt truyền cảm hơn giọng hệ thống.

## Cài đặt nhanh

```bash
cd piper_tts_server

# 1. Cài dependencies
pip install flask piper-tts

# 2. Tải model tiếng Việt (~60MB)
python server.py --download

# 3. Chạy server (port 5500)
python server.py
```

## Các model tiếng Việt có sẵn (Piper)

| Model | Chất lượng | Size | Ghi chú |
|-------|-----------|------|---------|
| `vi_VN-vivos-low` | ⭐⭐⭐ | ~60MB | Mặc định, nhanh |
| `vi_VN-vivos-medium` | ⭐⭐⭐⭐ | ~120MB | Hay hơn, chậm hơn chút |

Để đổi sang model khác, sửa `DEFAULT_MODEL` trong `server.py` và tải file `.onnx` + `.onnx.json` tương ứng từ [HuggingFace rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vivos).

## Test thủ công

```bash
curl "http://localhost:5500/tts?text=Xin+chào+bàn+bạc+đêm+nay" --output test.wav
```

## Cấu trúc thư mục

```
piper_tts_server/
  server.py
  models/
    vi_VN-vivos-low.onnx
    vi_VN-vivos-low.onnx.json
```

## Fallback

Nếu server không chạy, game tự động fallback về Web Speech API (giọng hệ thống) — không bị lỗi.
