---
name: vision
description: 对图像进视觉分析，通过 Visual Question Answering VQA 能力对图像内容进行提问并回答相关结果。
---

# Important environment variables has been set in the system, you can use them directly.
- 'BASE_URL'   : the prefix of http api url

## 'vqa' HTTP POST API

对安防监控画面进行视觉分析，负责分析监控画面，回答画面相关的问题， Visual Question Answering

- HTTP POST URL: `${BASE_URL}/xiaoer/api/vqa`
- INPUT: POST a json  `VQARequest` object

``` javascript
interface VQARequest {
    prompt: string;     // 关于画面的问题
    image_url: string;  // 监控画面的 HTTP URL，可以通过 query/fetch API 得到
}
```
