---
name: camera
description: 通过USB摄像头抓取图像，用于监控安防场景，保存到本地。
---

摄像头设备： /dev/video79

抓取图像：

```bash
ffmpeg -f video4linux2 -i /dev/video79 -vframes 1 -q:v 2 output.jpg
```

其中，`-vframes 1` 表示只抓取一帧图像，`-q:v 2` 表示设置图像质量为2（范围是1-31，数值越小质量越好）。抓取的图像将保存为 `output.jpg`。

注意图像要保存到自己的工作目录里面，不要保存到其他位置。
