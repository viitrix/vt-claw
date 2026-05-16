import numpy as np
import time
from abc import ABC, abstractmethod
from typing import Optional
from collections import deque
from loguru import logger

RECORDER_MAX_DURATION = 90 * 1000.0

MIN_BUFFER = 8
MAX_BUFFER = 60 * 16

class VADProviderBase(ABC):
    def __init__(self, config, audiorate, audiopkg):
        # 采样率以及音频包长度
        self.audiorate = float(audiorate)
        self.audiopkg = float(audiopkg)
        self.start_act = int(config["start_act"])
        self.stop_deact = int(config["stop_deact"])
        self.is_vad = False

        self.vad_flags = deque()    # 保持是否Voice Activety的记录
        self.pcm_fifo = deque()
        for i in range(0, MIN_BUFFER):
            self.vad_flags.append(False)
            self.pcm_fifo.append( np.array([], dtype=np.int16) )

    def check(self, data):
        # 检测当前包是否Voice Activety, 并且添加到队列中
        vad = self._vad(data)
        self.pcm_fifo.append(data)
        self.vad_flags.append(vad)
        if len(self.pcm_fifo) > MAX_BUFFER:
            self.vad_flags.popleft()
            self.pcm_fifo.popleft()

        if self.is_vad == False:
            is_start = True
            for i in (-1, -1 - self.start_act):
                if self.vad_flags[i] == False:
                    is_start = False
                    break

            if is_start:
                self.is_vad = True
                pcms = []
                for i in self.pcm_fifo:
                    pcms.append(i)
                return 1, pcms

            ## 保持最小长度
            self.pcm_fifo.popleft()
            self.vad_flags.popleft()

            return 0, None
        else:
            dact = 0
            for a in reversed(self.vad_flags):
                if a == False:
                    dact = dact + 1
                else:
                    break

            if dact >= self.stop_deact:
                self.is_vad = False

                pcms = []
                for i in self.pcm_fifo:
                    pcms.append(i)

                ## 保留最后的 MIN_BUFFER
                for _ in range(0, len(self.vad_flags) - MIN_BUFFER):
                    self.vad_flags.popleft()
                    self.pcm_fifo.popleft()

                ## 最后一次，返回完整的PCM list
                return 3, pcms

            ## 当前数据，作为list形式返回
            return 2, [data]

    def reset(self):
        self._reset()

        self.is_vad = False
        self.vad_flags = deque()    # 保持是否Voice Activety的记录
        self.pcm_fifo = deque()
        for i in range(0, MIN_BUFFER):
            self.vad_flags.append(False)
            self.pcm_fifo.append( np.array([], dtype=np.int16) )

    @abstractmethod
    def _vad(self, data) -> bool:
        """检测音频数据中的语音活动"""
        pass

    @abstractmethod
    def _reset(self):
        """重置检测状态"""
        pass

