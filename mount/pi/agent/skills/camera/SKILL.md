---
name: camera
description: 店铺安防监控摄像头工具，你可以访问当前最新的图片，也可以访问历史图片记录。
---

# Camera

获摄像头最新图像，历史图像记录。其中录像数据，大约每分钟一张图像，记录最近72小时的图像数据。两个服务通过 http api 访问获得！ 

# Important environment variables has been set in the system, you can use them directly.
- 'BASE_URL'   : the prefix of http api url
- 'BOT_ID'     : the ID for camera

## 'fetch' HTTP API 

Fetch last image of the survillance camera, the last image is updated every minute.

- URL:   `${BASE_URL}/xiaoer/api/fetch?bot_id=${BOT_ID}`

- RETURN: return a json object `CameraImageURL`, timestamp is seconds timestamp.

``` javascript
interface CameraImageURL {
	url: string;		// 注意这个网址，不用改动，已经具备时间更新
	timestamp: number;
}
```

## 'query' HTTP API 

查询历史录像的截图，大约1分钟，记录一张图，按时间段进行查询，主要不要使用太大的时间跨度。

- URL:   `${BASE_URL}/xiaoer/api/query?bot_id=${BOT_ID}&from=_START_TIME_&to=_END_TIME_`

from 和 to 是时间戳，1970年1月1日以来的秒数 timestamp ，返回这个时间段内的图像记录。

- RETURN: return a array of json object. `CameraImageURL[]`
