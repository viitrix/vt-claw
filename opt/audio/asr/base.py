from abc import ABC, abstractmethod
from typing import Optional, Tuple, List

class ASRProviderBase(ABC):
    def __init__(self):
        pass

    @abstractmethod
    def reConfig(self, config):
        pass


    '''
    push_cont: 流式传输，pcm数据为累加的数据，反复调用
    push:   流式传输，pcm数据为完整包，兼容非流式调用
            如果pcm为None，表示取消这次ASR
    '''
    @abstractmethod
    async def push_cont(self, pcm):
        pass

    @abstractmethod
    async def push(self, pcm) -> Optional[str]:
        pass

