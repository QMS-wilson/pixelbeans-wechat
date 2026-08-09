# 拼豆图纸生成器 - 微信小程序（云开发版）

Web 版「像素工坊」的同风格微信小程序版本，核心功能一致：

- 上传图片 / 新建空白画布，网格化采样并映射拼豆色板
- 手绘编辑（画笔 / 橡皮 / 撤销 / 清空）
- 可选 AI 优化（走火山引擎接口，由云函数代签）
- 色号用量统计
- 卡密兑换后下载带 Code 图纸、无 Code 图纸与 CSV 清单
- 未输入卡密时也可免费体验一次 AI 优化（按 openid/设备限制一次）
- 未解锁时预览画布带「未付款预览」水印
- 图纸方案本地自动存档 / 恢复 / 清除

## 架构（云函数版）

本版本基于微信云开发，不再依赖任何自建服务器 / HTTP 域名：

| 部分 | 实现 | 说明 |
| --- | --- | --- |
| 前端页面 | 小程序原生 | `pages/index` |
| 后端逻辑 | 云函数 `cloudfunctions/` | 6 个函数：access-status / redeem-card / logout-access / ai-optimize / download-prepare / card-admin |
| 卡密数据 | 云数据库 `meta` 集合 | `cards.json` 整份作为 JSON 文档存储（`_id = "store"`），保持原格式，无 SQL 表结构 |
| 下载文件 | 云存储 `downloads/` | `download-prepare` 生成文件上传云存储，前端用 `wx.cloud.downloadFile` 拉取 |
| 身份鉴权 | 云函数 openid | 自动识别微信用户，替代原 accessToken |

前端调用映射（`utils/api.js`）：

| 原接口 | 云函数 |
| --- | --- |
| `/api/access-status` | access-status |
| `/api/redeem-card` | redeem-card |
| `/api/logout-access` | logout-access |
| `/api/ai-optimize` | ai-optimize |
| `/api/download-prepare` | download-prepare |

## 首次部署步骤

1. 用微信开发者工具打开本目录 `D:\pixelbeans-wechat-cloud`。
2. 点击工具栏「云开发」→ 开通云开发并创建环境（免费额度即可）。
3. （可选）把环境 ID 填入 `config.js` 的 `cloudEnv`；留空则使用默认环境。
4. 在 `cloudfunctions/` 下，**对每个函数文件夹右键 → 上传并部署：云端安装依赖**（共 6 个）。
5. 配置云函数环境变量（云开发控制台 → 云函数 → 对应函数 → 配置）：
   - `ai-optimize`：`VOLC_ACCESS_KEY_ID`、`VOLC_SECRET_ACCESS_KEY`
   - `card-admin`：`CARD_ADMIN_KEY`
6. 把 `ai-optimize` 的超时时间调到允许的最大值（默认 3 秒不够，AI 任务需轮询）。
7. 初始化数据：首次使用前通过 `card-admin` 的 `import` 导入已有卡密（见下）。
8. 编译运行。开发者工具与真机均可直接使用（云函数无需配置 request 合法域名）。

## 卡密数据导入 / 导出

数据以 JSON 文档形式存在云数据库 `meta` 集合（`_id = "store"`），结构就是原来的
`cards.json`（含 `cards` / `logs` / `freeTrials` / `bindings`）。

导入（把原 `cards.json` 内容作为 `cards` 字段传入）：

```js
// 在云开发控制台「云函数 → card-admin → 测试」中调用，或从页面/脚本调用：
wx.cloud.callFunction({
  name: "card-admin",
  data: { action: "import", adminKey: "你的密钥", cards: [...], logs: [...], freeTrials: {} },
});
```

导出：调用 `card-admin` 的 `list` 拿回 `cards` / `logs`，自行保存即可。

## 管理端

`card-admin` 支持：

- `action: "list"` → 返回全部卡密 + 最近 200 条日志
- `action: "generate"`，参数 `{ count, prefix, note }` → 批量生成卡密
- `action: "reset"`，参数 `{ cardCode }` → 重置卡密
- `action: "import"`，参数 `{ cards, logs, freeTrials }` → 覆盖导入

所有管理操作需传 `adminKey`（与云函数环境变量 `CARD_ADMIN_KEY` 一致）。

## 发布前注意

- 云函数版不依赖域名，无需在小程序后台配置 request/downloadFile 合法域名。
- 替换 `project.config.json` 中的 `appid` 为你的小程序 AppID（当前为开发用 AppID）。
- 保存图片到相册需要申请 `scope.writePhotosAlbum` 权限（`wx.saveImageToPhotosAlbum` 会自动弹授权）。
- 卡密数据只有一份（云数据库），请定期通过 `card-admin list` 导出备份。
