import asyncio
import hashlib
import hmac
import base64
import urllib.parse
from email.utils import formatdate
import time
import os
import wave
import uuid
import json
import websockets

from typing import Optional, Tuple, List
from loguru import logger
from asr.base import ASRProviderBase

## 讯飞平台
## https://console.xfyun.cn/services/iat_zh_cn_mulacc_slm
## 构造 WebSocket 地址，鉴权在URL中完成
# 压缩的PCM格式，每次发送音频间隔40ms，每次发送音频字节数1280B
CHUNK_SIZE = 1280 * 3
EXCEPTION_WORD = "嗯...[一段不清晰的话]"
#XF_ASR_API_URL = "wss://iat.cn-huabei-1.xf-yun.com/v1"
XF_ASR_API_URL = "wss://iat-api.xfyun.cn/v2/iat"
def xfyun_url(api_key: str, api_secret: str) -> str:
    # Parse URL
    parsed_url = urllib.parse.urlparse(XF_ASR_API_URL)

    # Get UTC time in RFC1123 format
    current_timestamp = time.time()
    date = formatdate(timeval=current_timestamp, localtime=False, usegmt=True)


    # Fields for signature: host, date, request-line
    sign_string = [
        f"host: {parsed_url.hostname}",
        f"date: {date}",
        f"GET {parsed_url.path} HTTP/1.1"
    ]

    # Join signature string with newlines
    sgin = '\n'.join(sign_string)

    # Create HMAC-SHA256 signature
    sha = hmac.new(
        api_secret.encode('utf-8'),
        sgin.encode('utf-8'),
        hashlib.sha256
    ).digest()

    # Base64 encode signature
    sha_base64 = base64.b64encode(sha).decode('utf-8')

    # Build authorization string
    auth_url = f'api_key="{api_key}", algorithm="hmac-sha256", headers="host date request-line", signature="{sha_base64}"'

    # Base64 encode authorization string
    authorization = base64.b64encode(auth_url.encode('utf-8')).decode('utf-8')

    # Build query parameters
    params = {
        'host': parsed_url.hostname,
        'date': date,
        'authorization': authorization
    }

    # Encode query parameters and append to URL
    callurl = XF_ASR_API_URL + '?' + urllib.parse.urlencode(params)
    return callurl

# 延迟关闭，不阻塞当前代码
async def close_ws(ws):
    await asyncio.sleep(0)  # 让其他协程先执行
    await ws.close()

class ASRProvider(ASRProviderBase):
    def __init__(self, config: dict):
        super().__init__()
        ## API 设置
        self.app_id = config.get("app_id")
        self.api_key = config.get("api_key")
        self.api_secret = config.get("api_secret")

        ## 语言设置
        self.language = config.get("language")
        self.domain = config.get("domain")
        self.accent = config.get("accent")

        ## API handle
        self.ws = None
        self.pcmBuf = b""
        self.pcmIndex = 0

    def reConfig(self, config):
        if "domain" in config:
            self.domain = config.get("domain")
        if "accent" in config:
            self.accent = config.get("accent")

    async def _send_cont(self):
        while ( (len(self.pcmBuf) - self.pcmIndex) >= CHUNK_SIZE ):
            adata = self.pcmBuf[self.pcmIndex : self.pcmIndex + CHUNK_SIZE]
            flag = 0 if self.pcmIndex == 0 else 1
            chunk = json.dumps(self._create_payload_v2(adata, flag))
            await self.ws.send(chunk)

            self.pcmIndex += CHUNK_SIZE

    async def _flush(self):
           ## 发送最后一个数据包
            adata = self.pcmBuf[self.pcmIndex:]
            chunk = json.dumps(self._create_payload_v2(adata, 2))
            await self.ws.send(chunk)

    async def push_cont(self, pcm):
        try:
            if self.ws == None:
                api_url = xfyun_url(self.api_key, self.api_secret)
                self.ws = await websockets.connect( api_url )
                self.pcmBuf = b"".join(pcm)
                self.pcmIndex = 0
            else:
                self.pcmBuf += b"".join(pcm)

            await self._send_cont()

        except Exception as e:
            logger.error(f"push_cont 异常: {e}, 重试...", exc_info=True)
            api_url = xfyun_url(self.api_key, self.api_secret)
            self.ws = await websockets.connect( api_url )
            self.pcmIndex = 0
            await self._send_cont()

    async def push(self, pcm_all_data) -> Optional[str]:
        if pcm_all_data is None:
            if self.ws is not None:
                asyncio.create_task(close_ws(self.ws))
                self.ws = None
                self.pcmBuf = b""
                self.pcmIndex = 0
            return ""

        try:
            ret = ""
            await self._flush()
            while True:
                resp = json.loads( await self.ws.recv() )
                if resp["code"] != 0:
                    return EXCEPTION_WORD

                if "data" in resp:
                    text = resp["data"]["result"]
                    for wss in text["ws"]:
                        for w in wss["cw"]:
                            ret = ret + w["w"]

                    if resp["data"]["status"] == 2:
                        break;
                else:
                    break

            asyncio.create_task(close_ws(self.ws))
            self.ws = None
            self.pcmBuf = b""
            self.pcmIndex = 0

            return ret

        except Exception as e:
            logger.error(f"语音识别失败: {e}, 重试...", exc_info=True)
            self.ws = None
            self.pcmBuf = b""
            self.pcmIndex = 0
            return await self._xfyun_asr(pcm_all_data)

    ## 单次完成 ASR 调用
    async def _xfyun_asr(self, audio_data: List[bytes]) -> Optional[str]:
        pcm_length = len(audio_data);
        chunk_num = int(pcm_length / CHUNK_SIZE)
        if  chunk_num * CHUNK_SIZE != pcm_length :
            chunk_num = chunk_num + 1

        ## 120 毫秒都不到，拒绝 ASR
        if chunk_num < 3:
            return "";

        api_url = xfyun_url(self.api_key, self.api_secret)
        ret = ""
        try:
            ## V2 API
            ws = await websockets.connect(api_url)
            adata = audio_data[0 : CHUNK_SIZE]
            chunk = json.dumps(self._create_payload_v2(adata, 0))
            await ws.send(chunk)

            adata = audio_data[CHUNK_SIZE: (chunk_num - 1) * CHUNK_SIZE]
            chunk = json.dumps(self._create_payload_v2(adata, 1))
            await ws.send(chunk)

            adata = audio_data[(chunk_num-1)*CHUNK_SIZE: pcm_length]
            chunk = json.dumps(self._create_payload_v2(adata, 2))
            await ws.send(chunk)

            while True:
                resp = json.loads( await ws.recv() )
                if resp["code"] != 0:
                    return EXCEPTION_WORD

                if "data" in resp:
                    text = resp["data"]["result"]
                    for wss in text["ws"]:
                        for w in wss["cw"]:
                            ret = ret + w["w"]

                    if resp["data"]["status"] == 2:
                        break;
                else:
                    break

            asyncio.create_task(close_ws(ws))

            return ret

        except Exception as e:
            logger.error(f"XunFei ASR request failed: {e}", exc_info=True)
            return EXCEPTION_WORD

    def _create_payload_v2(self, d, st):
        if st == 0:
            return {
                "common" : {
                    "app_id" : self.app_id
                },
                "business" : {
                    "language" : self.language,
                    "domain" : self.domain,
                    "accent" : self.accent
                },
                "data" : {
                    "status": st,
                    "encoding": "raw",
                    "format": "audio/L16;rate=16000",
                    "audio" : base64.b64encode(d).decode('ascii')
                }
            }
        else:
            return {
                "common" : {
                    "app_id" : self.app_id
                },
                "data" : {
                    "status": st,
                    "encoding": "raw",
                    "format": "audio/L16;rate=16000",
                    "audio" : base64.b64encode(d).decode('ascii')
                }
            }
