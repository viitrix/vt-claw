import os
import tempfile
from dotenv import load_dotenv

load_dotenv()

tts_config = {
    "access_key_id": os.getenv("TTS_ACCESS_KEY_ID", ""),
    "access_key_secret": os.getenv("TTS_ACCESS_KEY_SECRET", ""),
    "appkey": os.getenv("TTS_APPKEY", ""),
    "voice": os.getenv("TTS_VOICE", "xiaogang"),
    "format": os.getenv("TTS_FORMAT", "wav"),
    "sample_rate": int(os.getenv("TTS_SAMPLE_RATE", "16000")),
    "volume": int(os.getenv("TTS_VOLUME", "50")),
    "speech_rate": int(os.getenv("TTS_SPEECH_RATE", "0")),
    "pitch_rate": int(os.getenv("TTS_PITCH_RATE", "0")),
    "output_dir": "./tts_output",
}

server_port = int(os.getenv("SERVER_PORT", "4000"))

## create output dir if not exists
os.makedirs(tts_config["output_dir"], exist_ok=True)
