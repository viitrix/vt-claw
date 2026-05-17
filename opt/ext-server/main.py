import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from loguru import logger

from config import tts_config
from tts.aliyun import TTSProvider as AliyunTTS


app = FastAPI(title="Claw Extension Server")

# --- Config ---
TTS_CONFIG = tts_config

_tts_providers: dict[str, AliyunTTS] = {}
def _load_tts_config():
    # For simplicity, we only support Aliyun TTS currently.
    aliyun_tts = AliyunTTS(TTS_CONFIG)
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

@app.post("/tts")
async def text_to_speech(
    text: str = Query(..., description="Text to convert to speech"),
    provider: str = Query("default", description="TTS provider name"),
    voice: str | None = Query(None, description="Voice name override"),
):
    tts = _tts_providers.get(provider)
    if not tts:
        raise HTTPException(404, f"TTS provider '{provider}' not found")

    if voice:
        tts.reConfig({"voice": voice})

    output = tts.to_tts(text)
    if not output or not os.path.exists(output):
        raise HTTPException(500, "TTS generation failed")

    return FileResponse(
        output,
        media_type="audio/wav",
        filename=Path(output).name,
    )


@app.post("/tts/cleanup")
async def cleanup_tts_files():
    """Remove old TTS temp files."""
    output_dir = TTS_CONFIG["output_dir"]
    count = 0
    for f in Path(output_dir).glob("tts-*"):
        if f.is_file():
            f.unlink()
            count += 1
    return {"deleted": count}




if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8900)
