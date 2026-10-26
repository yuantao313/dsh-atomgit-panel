# AtomGit 工作台（dsh-atomgit-panel）

连接 [AtomGit](https://atomgit.com)（API：`api.atomgit.com`），在右侧栏追踪多个关注仓库的 Issue 与 Pull Request，并记录每次同步的变更。

## 设置页

设置 → **AtomGit 工作台**。

### 登录

一个容器里包含两种登录方式：

- 顶部一行显示登录状态：未登录时为「AtomGit 未登录」，登录后显示用户名。
- 下面一行是令牌输入框，右侧两个按钮：
  - **验证** —— 用输入框里的令牌请求 AtomGit，确认能否正常使用。验证通过后按钮变绿、文字变成「保存」；如果再改动输入框，按钮回到「验证」。
  - **OAuth 登录** —— 在本机打开 AtomGit 授权页，授权完成后自动回到本机。
- 登录后输入框位置不变，显示掩码令牌（只保留末 4 位），置灰、不可编辑、不可选中复制；两个按钮换成「个人信息」与「注销」，个人信息用系统浏览器打开 `atomgit.com/setting`。

**OAuth 登录开箱可用**，不需要自己注册 AtomGit 应用。授权在系统浏览器里完成，回调由本机进程接收。

内置的 OAuth 应用凭据写在源码里，因此是公开的。AtomGit 的 OAuth 只支持 `client_secret`（没有 PKCE），客户端应用无法真正保密；这里的取舍是：任何人都能用这个应用完成授权，但拿不到别人的令牌——授权码只在本机回调接收并兑换。

如需隔离，注册自己的 OAuth 应用并设置 `DSH_ATOMGIT_OAUTH_CLIENT_ID` 与 `DSH_ATOMGIT_OAUTH_CLIENT_SECRET` 覆盖内置值；回调地址填 `http://127.0.0.1:59058/api/dsh-atomgit-panel/oauth/callback`。

### 关注的仓库

输入 `owner/repo` 添加（也接受完整的仓库地址），可以移除。每个仓库一个标签页，配置只属于该仓库：

- **流水线**：一条流水线一行，三个格子分别填「成功 / 运行中 / 失败」对应的 label。多条流水线就加多行。
- **评审**：需要一个一个添加评审 label，全部命中才算通过。
- **代码检视**：勾选后每个 PR 多一次请求，用来统计检视讨论的已解决比例。
- **快捷评论**：按钮名 + 评论内容，例如 `L` → `/lgtm`。面板上每条 PR/Issue 行尾出现这些按钮，点击即发送。

### 刷新

自动刷新间隔，30–3600 秒，面板打开时生效。刷新有冷却：冷却期内的读取直接命中缓存。

## 右侧栏面板

对话头部的 **AtomGit 工作台** 按钮打开它；右侧栏的标签类型与引导页入口卡也指向同一个面板。

面板内容：

- 顶部：当前仓库、登录身份、上次同步时间、刷新按钮。
- 仓库切换下拉框。
- 统计：待办 Issue / 待合并 PR / 已合并 / 已关闭。
- 同步追踪：相对上次同步的新增、更新、关闭。
- 工作条目：**PR 与 Issue 分开显示**，用「类型」在两者间切换，不会混排。另有：
  - **我参与** —— 只留自己是作者或被指派的条目；
  - **按更新时间筛选** —— 只看最近 1 / 24 / 168 小时内有更新的条目。
- 每条前面的灯（悬停可看命中的 label 与比例）：
  - **流水线** —— 实心圆点，取所有流水线中最差的状态；运行中闪烁。
  - **评审** —— 扇形，填满是全部评审 label 命中。
  - **代码检视** —— 扇形，填满且变绿表示检视讨论全部已解决；没有任何检视也算已解决。
- 有未解决检视的 PR 行尾出现「全部解决」，有快捷评论配置时行尾出现对应按钮。
- 点开任意一条会在右侧栏的浏览器标签里打开 AtomGit 上的原页面，面板本身不再重复渲染正文与评论。
- 右上角刷新按钮在拉取期间旋转，拉取完成后列表即为最新。

## Agent 工具：`atomgit_tracker`

| action | 作用 |
| --- | --- |
| `status` | 关注列表、当前仓库、登录身份、统计、上次同步、最近变更 |
| `list` | 按 `kind`、`state`、`query`、`mine`、`updatedWithinHours`、`limit` 过滤条目 |
| `detail` | 某条 Issue 或 PR 的正文与评论 |
| `refresh` | 立即重新拉取并回报变更 |
| `watch` | 加入关注列表 |
| `unwatch` | 移出关注列表 |
| `select` | 切换当前仓库（仅供工具调用；界面用面板顶部的下拉框） |
| `configure` | 设置刷新间隔 |

`status` / `list` / `detail` / `refresh` 可用 `repo` 指定仓库，省略则用当前仓库。

## 凭据

| 项 | 存放位置 |
| --- | --- |
| 访问令牌（手动或 OAuth） | DSH 凭据服务 `DSH_ATOMGIT_TOKEN` |
| OAuth refresh token | DSH 凭据服务 `DSH_ATOMGIT_REFRESH` |

凭据只在本机，接口只返回掩码与登录名，不返回令牌原文。OAuth access token 过期时由 Host 自动续期。

## 接口

Host 只开放 loopback 同源的 `/api/dsh-atomgit-panel/**`。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /state` | 配置、关注列表、当前仓库、登录状态与令牌掩码 |
| `POST /config` | 保存刷新间隔 |
| `POST /auth/verify` | 验证一个令牌能否使用 |
| `POST /auth/token` | 保存令牌 |
| `POST /auth/signout` | 注销 |
| `POST /oauth/start` | 生成授权地址 |
| `GET /oauth/callback` | AtomGit 授权回调 |
| `POST /repos` · `POST /repos/remove` | 关注列表增删 |
| `GET /snapshot[?repo=&force=1]` | 条目与变更流水 |
| `GET /item?repo=&kind=&number=` | 单条正文与评论 |
| `POST /refresh` | 强制刷新 |
| `POST /repo-config` | 保存单个仓库的流水线/评审/检视/快捷评论配置 |
| `POST /comment` | 按快捷评论发送一条评论 |
| `POST /resolve` | 把某个 PR 的未解决代码检视讨论全部标记为已解决 |

`/oauth/callback` 作为来自 atomgit.com 的顶层导航到达，只接受 loopback 套接字与 loopback Host，并用一次性 `state`（10 分钟）确认归属。其余端点要求完整的同源校验。

## 边界

- 写操作只有两项（都需用户在界面上主动触发）：按快捷评论发一条评论；把某个 PR 的代码检视讨论标记为已解决。不会修改 label、不会合并、不会改 PR 状态。
- 变更流水按仓库分别记录，依据是上次同步见过的 `updated_at` 与状态；某仓库第一次同步时其全部条目记为「新增」。
- 每个仓库每次同步最多取 60 条 Issue + 60 条 PR（按更新时间倒序）。
- 关注列表只存 `owner/repo`，不做仓库发现；添加时会探测一次，`404` 直接报找不到仓库。
