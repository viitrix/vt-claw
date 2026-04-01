---
name: shop-page
description: 店铺网页创建与更新工具，支持创建和更新店铺的 HTML、CSS、JavaScript 三个文件，生成完整的店铺展示页面。
---

# Shop Page - 店铺网页创建与更新

创建和更新店铺网页，支持分别编辑 HTML、CSS、JavaScript 三个文件。服务端提供这三个文件的HTTP访问。生成的 index.html 是完整的页面文件，需要包含加载 CSS 和 Javascript 文件。

## Important environment variables has been set in the system, you can use them directly.
- `BASE_URL`: API 服务基础 URL
- `BOT_ID`: 店铺的唯一标识符

店铺网址： `${BASE_URL}/xiaoer/preview/${BOT_ID}/index.html`

注意：给用户展示店铺网址，请用环境变量填充成完成的网址。

## API 接口

### 上传/更新网页内容

**请求:**

```
POST ${BASE_URL}/xiaoer/api/upload
```

**请求方式:**
#### JSON POST API 格式

```bash
curl -X POST "${BASE_URL}/xiaoer/api/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "${BOT_ID}",
    "html": "<html><div class=\"container\">...</div></html>",
    "css": ".container { max-width: 1200px; }",
    "js": "console.log(\"loaded\");"
  }'
```

**参数说明:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 店铺唯一标识符，不能包含 `..`、`/`、`\`，从环境变量读取 'BOT_ID' |
| html | string | 否 | HTML 完整内容，要加载对应的CSS/JS |
| css | string | 否 | CSS 样式代码 |
| js | string | 否 | JavaScript 代码 |

**返回:**

```json
{
  "success": true,
  "message": "文件上传成功",
  "id": "'BOT_ID'"
}
```

* 上传的文件会保存在服务端，分别保存指定目录下的 'index.html', 'style.css', 'code.js', 文件名固定。
* 注意不要使用其他第三方库，只能使用提供的第三方库，如 tailwind。 
* 提供的 index.html 是完整的，要按正确的路径加载css, js等文件。

## 各种文件的URL路径，注意这里使用环境变量名字，需要用环境变量真实值填充

- `${BASE_URL}/xiaoer/preview/${BOT_ID}/index.html` - HTML 内容，也店铺网页入口
- `${BASE_URL}/xiaoer/preview/${BOT_ID}/style.css` - CSS 样式
- `${BASE_URL}/xiaoer/preview/${BOT_ID}/code.js` - JavaScript 代码
- `${BASE_URL}/xiaoer/tailwind-classes-min.css` 系统可用的第三方库 Tailwind-css 库，可以减少CSS代码量。

## 系统提供了一下其他数据：
- '店铺安防监控摄像头工具' 内的当前最新摄像头图片，根据需求可以店铺页面使用。
