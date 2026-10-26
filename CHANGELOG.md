# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [未发布]

### 性能

- 代码检视数据的读取改为并发，首次加载从约 7 秒降到 2 秒左右。此前 30 个 PR 是逐个请求的，现在最多 6 个并发，仍控制在 AtomGit 的限流额度内。

### 变更

- 移除未再使用的 `normalizeLabelRules` 与 `LIGHT_SLOTS`。

## [0.1.0] - 2026-10-26

首个可用版本。

### 新增

- **登录**：个人访问令牌（验证后保存，仅显示末 4 位掩码）或 OAuth 授权。
- **关注仓库**：输入 `owner/repo` 添加，每个仓库一个标签页，配置独立保存。
- **面板**：PR 与 Issue 分开显示，支持参与度与更新时间筛选（1 / 24 / 168 小时）。
- **指示灯**：
  - 流水线：实心圆点，多条流水线取最差状态，运行中闪烁。
  - 评审：扇形，表示已满足的评审 label 比例。
  - 代码检视：扇形，表示检视意见的已解决比例；没有检视意见时同样视为已解决。
- **快捷评论**：按仓库配置按钮名与评论内容，支持多行，面板行尾一键发送。
- **批量解决**：对有未解决检视意见的 PR，一次把全部检视讨论标记为已解决。
- **Agent 工具** `atomgit_tracker`：`status` / `list` / `detail` / `refresh` / `watch` / `unwatch` / `select` / `configure`。
- 面板与设置页的刷新都有缓存冷却，切回面板不会白屏等待。

### 修复

- **凭据记录名不符合内核要求**：原先用 `DSH_ATOMGIT_TOKEN` 这类名称，缺少 `<scope>/<id>` 两段结构。写入时不报错，但下次启动解析凭据文档失败，导致整个应用无法启动。现改为 `dsh-atomgit-panel/token` 与 `dsh-atomgit-panel/refresh`。
- **OAuth 回调地址随 GUI 端口变化**：GUI 端口由系统分配，每次启动可能不同，导致注册的回调地址无法长期匹配。现由插件独占固定端口 45821 接收回调，注册一次即可。
- **兑换 token 时未传 `redirect_uri`**：与授权阶段的地址不一致，可能导致兑换失败。现已补传。

### 说明

- 内置的 OAuth 应用凭据写在源码中，因此是公开的。AtomGit 的 OAuth 强制要求 `client_secret`，不支持 PKCE 与 device flow，桌面客户端无法真正保密。别人可以发起授权，但拿不到他人的令牌——授权码只在本机接收并兑换。需要隔离时，设 `DSH_ATOMGIT_OAUTH_CLIENT_ID` 与 `DSH_ATOMGIT_OAUTH_CLIENT_SECRET` 覆盖内置值。
- 写操作只有两项，都需要在界面上主动点击：发送配置好的评论、把检视讨论标记为已解决。不会修改 label、不会合并、不会改 PR 状态。

[未发布]: https://atomgit.com/yuantao_/dsh-atomgit-panel/compare/v0.1.0...HEAD
[0.1.0]: https://atomgit.com/yuantao_/dsh-atomgit-panel/releases/tag/v0.1.0
