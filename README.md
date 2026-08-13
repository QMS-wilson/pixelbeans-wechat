# 拼豆图纸生成器 - 微信小程序（云开发版）

Web 版「像素工坊」的同风格微信小程序版本，核心功能一致：

- 上传图片 / 新建空白画布，网格化采样并映射拼豆色板
- 手绘编辑（画笔 / 橡皮 / 撤销 / 重做 / 清空）
- 可选 AI 优化（走火山引擎接口，由云函数代签）
- 色号用量统计
- 卡密兑换后下载带 Code 图纸、无 Code 图纸与 CSV 清单
- 未输入卡密时也可免费体验一次 AI 优化（按 openid / 设备限制一次）
- 未解锁时预览画布带「未付款预览」水印
- 图纸方案本地自动存档 / 恢复 / 清除
- 项目库：图纸云端保存（`projects` 集合 + 云存储），跨设备恢复，含原图 / 预览图
- 图纸分享：生成后可分享给微信好友，对方点开分享卡片可直接查看原图、预处理图与图纸网格，并可一键导入继续编辑
- 意见反馈与卡密管理入口

## 架构（云函数版）

本版本基于微信云开发，不再依赖任何自建服务器 / HTTP 域名。

| 部分 | 实现 | 说明 |
| --- | --- | --- |
| 前端页面 | 小程序原生 | `pages/index`、`pages/admin`、`pages/feedback-success` |
| 后端逻辑 | 云函数 `cloudfunctions/` | 共 10 个：access-status / redeem-card / logout-access / ai-optimize / download-prepare / card-admin / feedback / upload-chunk / project-store / share-pattern |
| 卡密数据 | 云数据库 `meta` 集合 | `cards.json` 整体作为 JSON 文档存储（`_id = "store"`），保持原格式 |
| 下载文件 | 云存储 `downloads/` | `download-prepare` 生成文件上传云存储，前端用 `wx.cloud.downloadFile` 拉取 |
| 身份鉴权 | 云函数 openid | 自动识别微信用户，替代原 accessToken |
| AI 任务 | 云数据库 `ai_tasks` + 云存储 `ai-results/` | 提交任务立即返回 taskId，前端轮询 `action=check` 获取结果，规避云函数 60s 超时限制 |
| 分块上传 | 云函数 `upload-chunk` + `chunks` 集合 | 大图 base64 分块上传，组装完成后自动清理分块文件与记录 |
| 项目库 | 云函数 `project-store` + `projects` 集合 | 图纸 JSON 与图片存云存储，元数据按 openid 隔离 |
| 图纸分享 | 云函数 `share-pattern` + `shares` 集合 | 分享快照由云函数复制到云存储 `shares/`，30 天内凭 shareId 查看 |

前端调用映射（`utils/api.js`）：

| 原接口 | 云函数 |
| --- | --- |
| `/api/access-status` | access-status |
| `/api/redeem-card` | redeem-card |
| `/api/logout-access` | logout-access |
| `/api/ai-optimize`（submit / check） | ai-optimize |
| `/api/download-prepare` | download-prepare |

## 首次部署步骤

1. 用微信开发者工具打开本目录 `D:\pixelbeans-wechat-cloud`。
2. 点击工具栏「云开发」→ 开通云开发并创建环境（免费额度即可）。
3. （可选）把环境 ID 填入 `config.js` 的 `cloudEnv`；留空则使用默认环境。
4. 在 `cloudfunctions/` 下，对每个函数文件夹右键 → 上传并部署：云端安装依赖（共 10 个）。
5. 配置云函数环境变量（云开发控制台 → 云函数 → 对应函数 → 配置）：
   - `ai-optimize`：`VOLC_ACCESS_KEY_ID`、`VOLC_SECRET_ACCESS_KEY`
   - `card-admin`：`CARD_ADMIN_KEY`
6. `ai-optimize` 采用「提交 + 轮询」模式，单次调用只需几秒；`upload-chunk`、`download-prepare` 超时保持默认 60s 即可，无需调大。
7. 初始化数据：首次使用前通过 `card-admin` 的 `import` 导入已有卡密（见下）。
8. 编译运行。开发者工具与真机均可直接使用（云函数无需配置 request 合法域名）。

## 卡密数据导入 / 导出

数据以 JSON 文件形式存在云数据库 `meta` 集合（`_id = "store"`），结构就是原来的 `cards.json`（含 `cards` / `logs` / `freeTrials` / `bindings`）。

导入（把原 `cards.json` 内容作为 `cards` 字段传入）：

```js
// 在云开发控制台「云函数 → card-admin → 测试」中调用，或从页面脚本调用：
wx.cloud.callFunction({
  name: "card-admin",
  data: { action: "import", adminKey: "你的密钥", cards: [...], logs: [...], freeTrials: {} },
});
```

导出：调用 `card-admin` 的 `list` 拿回 `cards` / `logs`，自行保存即可。

注意：卡密与日志属于敏感数据，**严禁提交到 Git 仓库**（根目录 `.gitignore` 已忽略 `docs/cards-import*`）。如果曾经泄露，请立即在管理端作废 / 重置相关卡密。

## 管理端

`card-admin` 支持：
- `action: "verify"` → 仅返回管理员密钥是否匹配（用于反馈页判断入口，不返回密钥本身）
- `action: "list"` → 返回全部卡密 + 最近 200 条日志
- `action: "generate"`，参数 `{ count, prefix, note }` → 批量生成卡密
- `action: "reset"`，参数 `{ cardCode }` → 重置卡密
- `action: "import"`，参数 `{ cards, logs, freeTrials }` → 覆盖导入

所有管理操作需带 `adminKey`（与云函数环境变量 `CARD_ADMIN_KEY` 一致）。

安全说明：管理密码只在云函数环境变量中比对，不写进客户端代码；但前端验证通过后会明文缓存在本地 storage（`pixelbeansAdminKey`），共享设备请及时「清除密钥」。

## 意见反馈与隐藏管理入口

- 主页底部新增「意见反馈」栏：输入普通意见提交后跳转「提交成功」页，内容写入云数据库 `feedback` 集合。
- 若输入的内容恰好是管理密码（`CARD_ADMIN_KEY`），提交后跳转「卡密管理」页（`pages/admin`），可查看 / 生成 / 重置卡密与日志。

## 图纸分享

- 主页点击「分享图纸」后调用 `share-pattern`（create）：先把当前图纸、原图、预处理图上传到暂存区，云函数再复制到云存储 `shares/<shareId>/` 并写入 `shares` 集合，返回分享路径。
- 分享路径为 `/pages/share/share?shareId=xxx`，接收者点击微信分享卡片直接打开分享页，可查看原图、预处理图与图纸网格，并点击「导入并继续编辑」把图纸载入自己的画布（编辑与导出仍需各自的卡密授权）。
- 分享快照 30 天内有效（`shares` 集合中的 `expiresAt`）。
- 未付款创作者分享的图纸统一叠加「未付款预览」水印，避免绕过付费预览；分享不消耗卡密次数。
- 文件由云函数重新上传到 `shares/` 路径，保证不同 openid 的接收者都能读取；如你的云存储权限规则被自定义过，请确认允许所有用户读取。

## 卡密使用规则

- 一张卡密提供 3 次 AI 优化 + 3 次下载，并绑定首次使用的图片指纹（最多 3 张）。
- 次数用尽后继续操作会直接作废该卡密（前端在剩余 0 次时会禁用入口并提示）。
- 「退出当前授权」仅解绑 openid；同一张卡可再次兑换（剩余次数保留），无需管理员重置。
- 兑换新卡会覆盖旧卡绑定，旧卡将无法继续使用，请谨慎操作。

## 发布前注意

- 云函数版不依赖域名，无需在小程序后台配置 request / downloadFile 合法域名。
- 替换 `project.config.json` 中的 `appid` 为你的小程序 AppID（当前为开发用 AppID）。
- 保存图片到相册需要申请 `scope.writePhotosAlbum` 权限（`wx.saveImageToPhotosAlbum` 会自动弹授权）。
- 卡密数据只有一份（云数据库），请定期通过 `card-admin list` 导出备份。
- 云存储中的 `ai-results/`、`downloads/`、`projects/`、`shares/`、`share-staging/` 文件会持续增长，请定期在控制台清理或增加定时清理策略；分块文件（`chunks/`）会在组装完成后自动删除，暂存文件会在分享创建成功后自动删除。

## AI 优化失败排查

- 前端与 `ai-optimize` 云函数必须一起重新部署：前端提交后会校验云函数返回的 `version` 字段（当前为 2），检测到旧版本会直接提示「请重新部署 ai-optimize 云函数」，避免无响应。
- 云函数已添加完整日志：`[callVolc] response`（火山引擎 HTTP 状态与响应体）、`[submitImageTask]`、`[pollImageTask]`（任务状态、是否有返回图）、`[ai-optimize] check` 等，可在云开发控制台 → 云函数 → 日志中查看具体失败原因。
- 火山引擎业务错误会被分类透出：余额不足/欠费、鉴权失败（密钥或权限）、并发限制、内容安全拦截、限流等，都会以明确文案提示，不会再出现「无响应」。
- 前端轮询最多 180 秒；查询连续失败 3 次会直接报错，不会静默重试 3 分钟。
