import os
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from loguru import logger

from config import server_port, tts_config
from tts.aliyun import TTSProvider as AliyunTTS


app = FastAPI(title="Claw Extension Server")
_tts_providers: dict[str, AliyunTTS] = {}

def _load_tts_config():
    # For simplicity, we only support Aliyun TTS currently.
    aliyun_tts = AliyunTTS(tts_config)
    _tts_providers["default"] = aliyun_tts
    _tts_providers["aliyun"] = aliyun_tts
    logger.info("TTS providers loaded: {}", list(_tts_providers.keys()))
    
@app.on_event("startup")
async def startup():
    _load_tts_config()


# --- Routes ---
@app.get("/health")
async def health():
    return {"status": "ok"}

class TTSRequest(BaseModel):
    text: str
    provider: str = "default"
    voice: str | None = None

@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    tts = _tts_providers.get(req.provider)
    if not tts:
        raise HTTPException(404, f"TTS provider '{req.provider}' not found")

    if req.voice:
        tts.reConfig({"voice": req.voice})

    output = tts.to_tts(req.text)
    if not output or not os.path.exists(output):
        raise HTTPException(500, "TTS generation failed")

    return FileResponse(
        output,
        media_type="audio/wav",
        filename=Path(output).name,
    )


@app.post("/tts/play")
async def play_tts(req: TTSRequest):
    tts = _tts_providers.get(req.provider)
    if not tts:
        raise HTTPException(404, f"TTS provider '{req.provider}' not found")

    if req.voice:
        tts.reConfig({"voice": req.voice})

    output = tts.to_tts(req.text)
    if not output or not os.path.exists(output):
        raise HTTPException(500, "TTS generation failed")

    subprocess.Popen(
        ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", output],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {"status": "playing", "file": Path(output).name}


@app.post("/tts/cleanup")
async def cleanup_tts_files():
    """Remove old TTS temp files."""
    output_dir = tts_config["output_dir"]
    count = 0
    for f in Path(output_dir).glob("tts-*"):
        if f.is_file():
            f.unlink()
            count += 1
    return {"deleted": count}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=server_port)
