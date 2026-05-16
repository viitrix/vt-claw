import os
import sys
import wave
import time
import queue
import signal
import numpy as np
import sounddevice as sd
from datetime import datetime

SAMPLE_RATE = 16000
CHANNELS = 1
DURATION_SEC = 5
BLOCK_SIZE = 320  # 20ms @ 16kHz

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")


def save_wav(pcm_data: np.ndarray, filepath: str):
    with wave.open(filepath, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data.tobytes())
    duration_ms = len(pcm_data) / SAMPLE_RATE * 1000
    print(f"[Saved] {filepath} ({duration_ms:.0f}ms)")


def main():
    if "--list-devices" in sys.argv:
        print(sd.query_devices())
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    duration = DURATION_SEC
    for i, arg in enumerate(sys.argv):
        if arg == "--duration" and i + 1 < len(sys.argv):
            duration = int(sys.argv[i + 1])

    device = None
    for i, arg in enumerate(sys.argv):
        if arg == "--device" and i + 1 < len(sys.argv):
            device = int(sys.argv[i + 1])

    audio_queue = queue.Queue()
    start_time = None

    def audio_callback(indata, frames, time_info, status):
        nonlocal start_time
        if start_time is None:
            start_time = time_info.inputBufferAdcTime
        ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        adc_time = time_info.inputBufferAdcTime
        print(f"[{ts}] block: {frames} samples, ADC time: {adc_time:.6f}s")
        audio_queue.put(indata[:, 0].copy())

    print(f"Capturing {duration}s of audio @ {SAMPLE_RATE}Hz ...")
    print("Press Ctrl+C to stop early\n")

    all_pcm = []
    collected = 0

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            blocksize=BLOCK_SIZE,
            device=device,
            callback=audio_callback,
        ):
            deadline = time.monotonic() + duration
            while time.monotonic() < deadline:
                try:
                    data = audio_queue.get(timeout=0.5)
                    all_pcm.append(data)
                    collected += len(data)
                except queue.Empty:
                    continue
    except KeyboardInterrupt:
        pass

    if len(all_pcm) == 0:
        print("No audio data captured!")
        return

    pcm = np.concatenate(all_pcm)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(OUTPUT_DIR, f"test_capture_{timestamp}.wav")
    save_wav(pcm, filepath)

    elapsed = collected / SAMPLE_RATE
    print(f"\nCaptured {collected} samples ({elapsed:.2f}s)")


if __name__ == "__main__":
    main()
