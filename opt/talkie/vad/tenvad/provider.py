import time
import wave
import os
import sys
import io
from typing import Optional, Tuple, List
import uuid
import numpy as np
from loguru import logger

from vad.base import VADProviderBase
from .tenvad import TenVad

class VADProvider(VADProviderBase):
    def __init__(self, config, audiorate, audiopkg):
        super().__init__(config, audiorate, audiopkg)

        lib_path = config["lib_path"]
        threshold = config["threshold"]
        self.hop_size = config["hop_size"]
        self.ten_vad = TenVad(lib_path, self.hop_size, threshold)  # Create a TenVad instance

        self.buffer = np.array([], dtype=np.int16)

    def _vad(self, pcm) -> bool:
        try:
            # 将 PCM 数据添加到缓冲区
            self.buffer = np.concatenate([self.buffer, pcm])

            # 处理缓冲区中的完整帧（每次处理hop_size采样点）
            client_have_voice = False
            while len(self.buffer) >= self.hop_size:
                chunk = self.buffer[: self.hop_size]
                self.buffer = self.buffer[self.hop_size :]            
                _, out_flag = self.ten_vad.process(chunk)
                if out_flag == 1:
                    client_have_voice = True

            return client_have_voice
        except Exception as e:
            logger.error(f"_vad执行异常：{e}")
            return None

    def _reset(self):
        self.buffer = np.array([], dtype=np.int16)        
