import os
import sys
import wave
import queue
import signal
import argparse
import asyncio
import json
import urllib.request
import urllib.error
import numpy as np
import sounddevice as sd
from loguru import logger

from vad.tenvad.provider import VADProvider
from asr.xunfei import ASRProvider

SAMPLE_RATE = 16000
CHANNELS = 1
BLOCK_DURATION_MS = 60
BLOCK_SIZE = int(SAMPLE_RATE * BLOCK_DURATION_MS / 1000)

VAD_HOP_SIZE = 480
VAD_THRESHOLD = 0.5
VAD_START_ACT = 3
VAD_STOP_DEACT = 15

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_PATH = os.path.join(BASE_DIR, "models", "ten-vad", "x64", "libten_vad.so")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")


def save_wav(pcm_data: list[np.ndarray], filepath: str):
    pcm = np.concatenate(pcm_data)
    with wave.open(filepath, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
    duration_ms = len(pcm) / SAMPLE_RATE * 1000
    logger.info(f"Saved: {filepath} ({duration_ms:.0f}ms)")


def call_callback(url: str, text: str) -> str:
    data = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if result.get("status") == "error":
                logger.error(f"Callback error: {result.get('error')}")
                return ""
            return result.get("reply", "")
    except urllib.error.URLError as e:
        logger.error(f"Callback request failed: {e}")
        return ""
    except Exception as e:
        logger.error(f"Callback parse error: {e}")
        return ""


def main():
    parser = argparse.ArgumentParser(description="Audio capture with VAD + ASR")
    parser.add_argument("--device", type=int, default=None, help="Input device index")
    parser.add_argument("--list-devices", action="store_true", help="List audio devices and exit")
    parser.add_argument("--output", type=str, default=OUTPUT_DIR, help="Output directory for WAV files")
    parser.add_argument("--save-wav", action="store_true", default=False, help="Save WAV files to output directory")
    parser.add_argument("--app-id", type=str, default=os.getenv("XF_APP_ID"), help="XunFei APP ID")
    parser.add_argument("--api-key", type=str, default=os.getenv("XF_API_KEY"), help="XunFei API Key")
    parser.add_argument("--api-secret", type=str, default=os.getenv("XF_API_SECRET"), help="XunFei API Secret")
    parser.add_argument("--callback-url", type=str, default=os.getenv("CALLBACK_URL", "http://localhost:5173/walkie/api/asr"), help="HTTP callback URL after ASR")
    args = parser.parse_args()

    if args.list_devices:
        print(sd.query_devices())
        return

    if not all([args.app_id, args.api_key, args.api_secret]):
        logger.error("XunFei credentials required: --app-id, --api-key, --api-secret (or env XF_APP_ID, XF_API_KEY, XF_API_SECRET)")
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)

    vad_config = {
        "lib_path": LIB_PATH,
        "threshold": VAD_THRESHOLD,
        "hop_size": VAD_HOP_SIZE,
        "start_act": VAD_START_ACT,
        "stop_deact": VAD_STOP_DEACT,
    }
    vad_provider = VADProvider(vad_config, SAMPLE_RATE, BLOCK_SIZE)

    asr_config = {
        "app_id": args.app_id,
        "api_key": args.api_key,
        "api_secret": args.api_secret,
        "language": "zh_cn",
        "domain": "iat",
        "accent": "mandarin",
    }
    asr_provider = ASRProvider(asr_config)

    audio_queue = queue.Queue()
    running = True

    def signal_handler(sig, frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, signal_handler)

    def audio_callback(indata, frames, time_info, status):
        if status:
            logger.warning(f"Audio status: {status}")
        audio_queue.put(indata[:, 0].copy())

    utterance_count = 0
    current_pcm = []
    asr_loop = asyncio.new_event_loop()

    logger.info(f"Starting audio capture: {SAMPLE_RATE}Hz, block={BLOCK_SIZE} samples")
    logger.info("Press Ctrl+C to stop")

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            blocksize=BLOCK_SIZE,
            device=args.device,
            callback=audio_callback,
        ):
            while running:
                try:
                    data = audio_queue.get(timeout=0.5)
                except queue.Empty:
                    continue

                state, pcms = vad_provider.check(data)

                if state == 0:
                    pass
                elif state == 1:
                    logger.info("Speech started")
                    current_pcm = list(pcms)
                elif state == 2:
                    current_pcm.extend(pcms)
                elif state == 3:
                    current_pcm = list(pcms)
                    if len(current_pcm) > 0:
                        utterance_count += 1
                        pcm_bytes = b"".join(arr.tobytes() for arr in current_pcm)
                        duration_ms = len(pcm_bytes) / 2 / SAMPLE_RATE * 1000
                        logger.info(f"Speech ended ({duration_ms:.0f}ms), recognizing...")

                        text = asr_loop.run_until_complete(
                            asr_provider._xfyun_asr(pcm_bytes)
                        )
                        logger.info(f"[{utterance_count}] ASR: {text}")

                        if args.callback_url and text:
                            reply = call_callback(args.callback_url, text)
                            if reply:
                                logger.info(f"[{utterance_count}] Reply: {reply}")

                        if args.save_wav:
                            filepath = os.path.join(args.output, f"utterance_{utterance_count:04d}.wav")
                            save_wav(current_pcm, filepath)

                    # 丢弃 ASR 识别期间积压的音频数据
                    while not audio_queue.empty():
                        try:
                            audio_queue.get_nowait()
                        except queue.Empty:
                            break
                    current_pcm = []
                    vad_provider.reset()

    except KeyboardInterrupt:
        pass
    finally:
        asr_loop.close()

    logger.info(f"Stopped. Total utterances: {utterance_count}")

if __name__ == "__main__":
    main()
