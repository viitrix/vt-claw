---
name: ttsplay
description: 播放一段指定文字的语言合成音频。
---

HOST_EXT_PORT 是技能对外提供服务的端口的环境变量，如果没有设置，默认为 4000。

扩展服务地址：`http://host.docker.internal:${HOST_EXT_PORT}`

播放语音合成音频：

```bash
curl -s -X POST "http://host.docker.internal:${HOST_EXT_PORT}/tts/play" \
  -H "Content-Type: application/json" \
  -d '{"text": "你好，世界"}'
```

其中，`text` 字段是要合成的文本内容。发送请求后，技能会将合成的音频播放出来。