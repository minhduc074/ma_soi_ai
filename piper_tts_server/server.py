"""
Piper TTS Local Server
======================
Chạy: python server.py

Yêu cầu:
  pip install flask piper-tts

Model tiếng Việt (tải về rồi đặt vào thư mục models/):
  https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vivos/low
  - vi_VN-vivos-low.onnx
  - vi_VN-vivos-low.onnx.json

Hoặc dùng script tải tự động bên dưới.
"""

import io
import os
import sys
import subprocess
import threading
from pathlib import Path
from flask import Flask, request, Response, jsonify

# ── Config ───────────────────────────────────────────────────────────
PIPER_HOST = "0.0.0.0"
PIPER_PORT = 5500

# Thư mục chứa model .onnx
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Tên model mặc định (có thể đổi sang medium/high nếu tải về)
DEFAULT_MODEL = "vi_VN-vivos-low"

# ── Flask app ─────────────────────────────────────────────────────────
app = Flask(__name__)

# Cache piper process per model
_piper_lock = threading.Lock()


def get_model_path(model_name: str) -> Path:
    return MODELS_DIR / f"{model_name}.onnx"


def synthesize(text: str, model_name: str = DEFAULT_MODEL) -> bytes:
    """Gọi piper binary/module để tổng hợp giọng nói, trả về bytes WAV."""
    model_path = get_model_path(model_name)
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model không tìm thấy: {model_path}\n"
            f"Chạy: python server.py --download để tải model tự động."
        )

    cmd = [
        sys.executable, "-m", "piper",
        "--model", str(model_path),
        "--output-raw",          # raw PCM 16-bit mono 22050 Hz
        "--sentence-silence", "0.15",
    ]

    proc = subprocess.run(
        cmd,
        input=text.encode("utf-8"),
        capture_output=True,
        timeout=30,
    )

    if proc.returncode != 0:
        raise RuntimeError(f"Piper error: {proc.stderr.decode()}")

    # Wrap raw PCM → WAV
    raw_pcm = proc.stdout
    return pcm_to_wav(raw_pcm, sample_rate=22050, channels=1, sampwidth=2)


def pcm_to_wav(pcm: bytes, sample_rate=22050, channels=1, sampwidth=2) -> bytes:
    import struct
    data_size = len(pcm)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,           # chunk size
        1,            # PCM format
        channels,
        sample_rate,
        sample_rate * channels * sampwidth,
        channels * sampwidth,
        sampwidth * 8,
        b"data",
        data_size,
    )
    return header + pcm


# ── Routes ────────────────────────────────────────────────────────────

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/tts", methods=["OPTIONS"])
def tts_preflight():
    return Response(status=200)


@app.route("/tts", methods=["GET", "POST"])
def tts():
    """
    GET  /tts?text=xin+chào&model=vi_VN-vivos-low
    POST /tts  body: { "text": "xin chào", "model": "vi_VN-vivos-low" }
    """
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        text = data.get("text", "")
        model = data.get("model", DEFAULT_MODEL)
    else:
        text = request.args.get("text", "")
        model = request.args.get("model", DEFAULT_MODEL)

    text = text.strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    try:
        wav_bytes = synthesize(text, model)
        return Response(wav_bytes, mimetype="audio/wav")
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    models = [p.stem for p in MODELS_DIR.glob("*.onnx")]
    return jsonify({"status": "ok", "models": models, "default": DEFAULT_MODEL})


# ── Auto-download ─────────────────────────────────────────────────────

def download_model(model_name: str = DEFAULT_MODEL):
    """Tải model Piper từ HuggingFace."""
    import urllib.request

    base_url = (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        "vi/vi_VN/vivos/low/"
    )
    files = [f"{model_name}.onnx", f"{model_name}.onnx.json"]

    for fname in files:
        dest = MODELS_DIR / fname
        if dest.exists():
            print(f"[OK] {fname} đã tồn tại, bỏ qua.")
            continue
        url = base_url + fname
        print(f"[↓] Đang tải {fname} từ {url} ...")
        urllib.request.urlretrieve(url, dest)
        print(f"[✓] Đã lưu → {dest}")

    print("\n[✓] Tải model xong! Chạy lại: python server.py")


# ── Entry point ───────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--download" in sys.argv:
        download_model()
        sys.exit(0)

    model_path = get_model_path(DEFAULT_MODEL)
    if not model_path.exists():
        print(f"[!] Model chưa có: {model_path}")
        print("[!] Chạy: python server.py --download  để tải model tự động.")
        print("[!] Khởi động server ở chế độ 'chưa có model' (sẽ trả 503 khi gọi /tts)")
    else:
        print(f"[✓] Model sẵn sàng: {model_path}")

    print(f"[*] Piper TTS server đang chạy tại http://localhost:{PIPER_PORT}")
    print(f"[*] Health check: http://localhost:{PIPER_PORT}/health")
    app.run(host=PIPER_HOST, port=PIPER_PORT, debug=False)
