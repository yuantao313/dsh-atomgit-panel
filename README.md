<div align="center">

# AtomGit 工作台

**在 DeepSeek Harness 的右侧栏里，把 AtomGit 的 Issue 与 Pull Request 变成一块随时可扫的工作面板。**

不用开着十几个人网页标签，不用在仓库之间来回跳。

[功能](#功能) · [安装](#安装) · [配置](#配置) · [指示灯](#指示灯) · [Agent 工具](#agent-工具) · [设计边界](#设计边界)

</div>

---

## 它解决什么

一个仓库的 Issue 和 PR，网页上翻几下就够。真正麻烦的是**多个仓库**：

- 哪个 PR 等着你评审？
- 哪条流水线刚挂了？
- 哪些评审意见还没人处理？
- 今天到底有哪些东西动过？

AtomGit 工作台把这些收进一个面板，每条一行，状态压缩成几个灯，扫一眼就知道该看哪里。

## 功能

<table>
<tr>
<td width="50%" valign="top">

**一眼扫状态**

每个条目前面最多三盏灯。悬停显示命中的原始 label。

- 流水线：实心圆点，运行中会闪
- 评审：扇形，填满即全部通过
- 代码检视：扇形，填满且变绿即全部解决

</td>
<td width="50%" valign="top">

**点一下就动手**

- 点条目 → 内置浏览器打开 AtomGit 原页面
- 点快捷按钮 → 发预置评论（`L` → `/lgtm`）
- 点「全部解决」→ 批量 resolve 检视意见

</td>
</tr>
<tr>
<td valign="top">

**PR 与 Issue 分开看**

不再混排。用「类型」切换，各看各的。

另有「我参与」和时间窗筛选（1 / 24 / 168 小时）。

</td>
<td valign="top">

**每个仓库独立配置**

标签页切换。有的仓库用 CI label，有的用 RDV label，各配各的。

配置按仓库保存，互不干扰。

</td>
</tr>
</table>

## 安装

从仓库直接安装（包尚未发布到 npm registry）：

```bash
dsh plugin --profile desktop add \
  git+https://atomgit.com/yuantao_/dsh-atomgit-panel.git
```

也可以克隆后链接本地目录：

```bash
git clone https://atomgit.com/yuantao_/dsh-atomgit-panel.git
dsh plugin --profile desktop add link:$(pwd)/dsh-atomgit-panel
```

装完重启 DeepSeek Harness。入口有三个，都指向同一个面板：

- 对话头部的 **AtomGit 工作台** 按钮
- 右侧栏的标签类型
- 右侧栏引导页的入口卡

设置入口：**设置 → AtomGit 工作台**。

## 配置

### 登录

两种方式，在同一个容器里。

| 方式 | 说明 |
| --- | --- |
| **OAuth** | 开箱可用，无需注册应用。系统浏览器授权，回调在本机接收 |
| **令牌** | 粘贴 AtomGit 个人访问令牌 → 点「验证」→ 通过后按钮变绿、文字变「保存」 |

登录后令牌位置不变，只显示末 4 位掩码，置灰不可复制。按钮换成「个人信息」与「注销」。

> **关于内置 OAuth 凭据**
>
> 凭据写在源码里，因此是公开的。AtomGit 的 OAuth **强制要求 `client_secret`**，不支持 PKCE，也没有 device flow —— 桌面客户端无法真正保密，这是绕不开的取舍。
>
> 实际影响：别人能用自己的账号授权这个应用，但**拿不到你的令牌** —— 授权码只在本机回调接收并兑换。
>
> 想隔离就自建应用，设环境变量覆盖内置值：
>
> ```bash
> export DSH_ATOMGIT_OAUTH_CLIENT_ID=...
> export DSH_ATOMGIT_OAUTH_CLIENT_SECRET=...
> ```
>
> 回调地址填 `http://127.0.0.1:45821/api/dsh-atomgit-panel/oauth/callback`（端口固定，注册一次即可）

### 关注的仓库

输入 `owner/repo`（也接受完整仓库地址）添加。每个仓库一个标签页。

标签页里配四样东西：

| 项 | 怎么填 |
| --- | --- |
| **流水线** | 一条流水线一行，三个格子填「成功 / 运行中 / 失败」对应的 label。多条流水线就加多行 |
| **评审** | 逐个添加评审 label，全部命中才算通过 |
| **代码检视** | 勾选后启用。每个 PR 多一次请求，用来统计检视意见的已解决比例 |
| **快捷评论** | 按钮名 + 评论内容，支持多行。例如 `L+A` → `/lgtm` 换行 `/approve` |

### 刷新

自动刷新间隔 30–3600 秒，面板打开时生效。

刷新有冷却。切到别的页面再回来会先用缓存绘制，不会白屏等网络；冷却期内的读取直接命中缓存。

## 指示灯

三盏灯，全部用颜色和形状表达，不占文字空间。

### 流水线 <kbd>●</kbd>

| 状态 | 显示 |
| --- | --- |
| 成功 | 绿点 |
| 运行中 | 黄点，**闪烁** |
| 失败 | 红点 |
| 无匹配 | 空心灰点 |

配置了多条流水线时，**取最差的一条**。悬停显示「1/2」这样的比例 —— 分母是流水线条数，不是 label 个数。

### 评审 <kbd>◕</kbd>

扇形，填满的比例 = 已满足的评审 label 比例。

- 全部命中 → 实心绿 + 通过
- 部分命中 → 部分扇区，灰
- 全部未命中 → 空心环

评审是**二值**的，没有「进行中」—— 要么够，要么不够。

### 代码检视 <kbd>◕</kbd>

按 PR 的检视意见（`diff_comment`）统计已解决比例。

| 情况 | 显示 |
| --- | --- |
| 全部已解决 | 实心绿 |
| 有未解决 | 部分扇区，灰 |
| **没有检视** | **实心绿** |

最后一行为什么算绿：没有检视意见 = 没有未解决项 = 无需关注。和「全部已解决」视觉一致，不额外制造一个待办。

## Agent 工具

给 Agent 用的 `atomgit_tracker`：

| action | 作用 |
| --- | --- |
| `status` | 关注列表、当前仓库、登录身份、统计、上次同步、最近变更 |
| `list` | 按 `kind`、`state`、`query`、`mine`、`updatedWithinHours`、`limit` 过滤 |
| `detail` | 某条 Issue 或 PR 的正文与评论 |
| `refresh` | 立即重新拉取并回报变更 |
| `watch` / `unwatch` | 加入 / 移出关注列表 |
| `select` | 切换当前仓库 |
| `configure` | 设置刷新间隔 |

`status` / `list` / `detail` / `refresh` 都可用 `repo` 指定仓库，省略则用当前仓库。

## 设计边界

**写操作只有两项**，都需要你在界面上主动点击：

1. 按快捷评论发一条评论
2. 把某个 PR 的代码检视意见标记为已解决

不会修改 label、不会合并、不会改 PR 状态。

其余边界：

- 变更流水按仓库分别记录，依据是上次同步见过的 `updated_at` 与状态。首次同步时全部记为「新增」。
- 每次同步最多取 60 条 Issue + 60 条 PR（按更新时间倒序）。
- 代码检视统计最多覆盖 30 个未关闭 PR，避免 N+1 请求打满限流。
- 关注列表只存 `owner/repo`，不做仓库发现。

## 数据与隐私

| 项 | 位置 |
| --- | --- |
| 访问令牌 | DSH 凭据服务记录 `dsh-atomgit-panel/token` |
| OAuth refresh token | DSH 凭据服务记录 `dsh-atomgit-panel/refresh` |
| 关注列表与配置 | `~/.dsh/dsh-atomgit-panel/state.json`（`0600`） |

凭据记录名必须是 `<scope>/<id>` 两段，scope 为本插件的包名。写成别的形式时，写入不会报错，但下次启动解析凭据文档会失败。

凭据只在本机。接口只返回掩码与登录名，不返回令牌原文。OAuth token 过期时由 Host 自动续期。

## 接口

Host 只开放 loopback 同源的 `/api/dsh-atomgit-panel/**`。

<details>
<summary>展开全部端点</summary>

| 方法与路径 | 说明 |
| --- | --- |
| `GET /state` | 配置、关注列表、当前仓库、登录状态与令牌掩码 |
| `POST /config` | 保存刷新间隔 |
| `POST /auth/verify` | 验证令牌能否使用 |
| `POST /auth/token` | 保存令牌 |
| `POST /auth/signout` | 注销 |
| `POST /oauth/start` | 生成授权地址 |
| `GET /oauth/callback` | 授权回调 |
| `POST /repos` · `POST /repos/remove` | 关注列表增删 |
| `GET /snapshot[?repo=&force=1]` | 条目与变更流水 |
| `GET /item?repo=&kind=&number=` | 单条正文与评论 |
| `POST /refresh` | 强制刷新 |
| `POST /repo-config` | 保存单仓库配置 |
| `POST /comment` | 按快捷评论发评论 |
| `POST /resolve` | 批量解决代码检视意见 |

</details>

`/oauth/callback` 由插件独占的 45821 端口接收，作为来自 `atomgit.com` 的顶层导航到达。它只接受 loopback 套接字与 loopback Host，并用一次性 `state`（10 分钟）确认归属。其余端点都要求完整的同源校验。

OAuth 回调走固定端口，与 GUI 端口无关 —— GUI 端口由系统分配，每次启动可能不同。

## 许可

[MIT](./LICENSE)
