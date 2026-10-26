window.__ModuleLoader__.load({
  id: 'dsh-atomgit-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * A button. `primary` carries the accent, `danger` the error colour, and
     * the default is the neutral surface used for secondary actions.
     */
    function Btn({ variant = 'default', icon, children, disabled = false, style, ...rest }) {
      const base =
        variant === 'primary' ? S.buttonPrimary : variant === 'danger' ? S.buttonDanger : S.button
      return h(
        'button',
        {
          type: 'button',
          ...rest,
          disabled,
          style: { ...base, ...(disabled ? S.buttonDisabled : null), ...style },
        },
        icon === undefined || icon === null ? null : h('span', { style: { display: 'inline-flex', flex: 'none' } }, icon),
        children,
      )
    }

    /** A text field with its own border and background. */
    function Field({ grow = '1 1 200px', style, ...rest }) {
      return h('input', { style: { ...S.input, flex: grow, ...style }, ...rest })
    }

    /** A row of mutually-exclusive chips. */
    function Segments({ label, value, items, onChange }) {
      return h(
        'div',
        { style: S.filters, role: 'group', 'aria-label': label },
        items.map((item) =>
          h(
            'button',
            {
              key: item.value,
              type: 'button',
              'aria-pressed': item.value === value,
              style: { ...S.chip, ...(item.value === value ? S.chipActive : null) },
              onClick: () => onChange(item.value),
            },
            item.label,
          ),
        ),
      )
    }

    /** A single toggleable chip. */
    function Chip({ active = false, onClick, children, ...rest }) {
      return h(
        'button',
        {
          type: 'button',
          ...rest,
          'aria-pressed': active,
          style: { ...S.chip, ...(active ? S.chipActive : null) },
          onClick,
        },
        children,
      )
    }

    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const LIGHT_ROWS = ['SUCCESS', 'RUNNING', 'FAILURE']
    /**
     * Last snapshot per repository, kept outside the component so switching away
     * from the panel and back paints the previous content instead of waiting for
     * the network again.
     */
    const snapshotCache = new Map()
    const SNAPSHOT_CACHE_MAX_AGE = 5 * 60 * 1000

    function readSnapshotCache(repo) {
      const hit = snapshotCache.get(repo)
      if (hit === undefined) return null
      if (Date.now() - hit.at > SNAPSHOT_CACHE_MAX_AGE) {
        snapshotCache.delete(repo)
        return null
      }
      return hit.value
    }

    function writeSnapshotCache(repo, value) {
      if (typeof repo !== 'string' || repo === '') return
      if (value?.ok !== true) return
      snapshotCache.set(repo, { at: Date.now(), value })
    }

    const NS = 'atomgit-panel'
    const TAB_KIND = 'atomgit'
    const TAB_ID = 'atomgit-panel'
    const SETTINGS_ID = 'atomgit-panel'
    const ROUTE = 'api/dsh-atomgit-panel'

    const zh = {
      'guide.title': 'AtomGit 工作台',
      'guide.description': '追踪关注仓库的 Issue 与 Pull Request',
      'tab.title': 'AtomGit 工作台',
      'header.open': '打开 AtomGit 工作台',
      'settings.nav': 'AtomGit 工作台',

      'common.save': '保存',
      'common.saving': '保存中…',
      'common.saved': '已保存',
      'common.loading': '读取中…',
      'common.unknownError': '未知错误',

      'auth.notSignedIn': 'AtomGit 未登录',
      'auth.signedIn': '已登录 {login}',
      'auth.signOut': '注销',
      'auth.profile': '个人信息',
      'auth.verify': '验证',
      'auth.verifying': '验证中…',
      'auth.tokenPlaceholder': '输入个人访问令牌',
      'auth.oauth': 'OAuth 登录',
      'auth.oauthWaiting': '已打开授权页，完成后自动返回',
      'auth.tokenLink': '获取令牌',

      'settings.repos': '关注的仓库',
      'settings.reposEmpty': '还没有关注任何仓库',
      'settings.repoAdd': '添加仓库',
      'settings.repoPlaceholder': 'owner/repo，例如 openharmony/docs',
      'settings.repoRemove': '移除',
      'settings.repoAdded': '已添加 {repo}',
      'settings.repoExists': '{repo} 已经在列表里了',
      'settings.repoNotFound': 'AtomGit 上找不到仓库 {repo}',

      'settings.general': '刷新',
      'settings.interval': '自动刷新间隔（秒）',

      'panel.notSignedInHint': '未登录时只能读取公开仓库。',
      'panel.noRepos': '还没有关注仓库',
      'panel.noReposHint': '在设置里把要追踪的仓库加进关注列表。',
      'panel.noActive': '还没有选择仓库',
      'panel.repoSwitch': '切换仓库',
      'panel.refresh': '刷新',
      'panel.updated': '更新于 {time}',
      'panel.openOnAtomGit': '在 AtomGit 打开',

      'count.issuesOpen': '待办 Issue',
      'count.pullsOpen': '待合并 PR',
      'count.merged': '已合并',
      'count.closed': '已关闭',

      'section.changes': '同步追踪',

      'filter.issue': 'Issue',
      'filter.pr': 'Pull Request',
      'scope.all': '所有状态',
      'scope.open': '未完成',
      'scope.closed': '已关闭 / 已合并',
      'scope.recent': '近 {hours} 小时更新',
      'scope.recentOff': '按更新时间筛选',
      'mine.label': '我参与',
      'search.placeholder': '搜索标题或作者',

      'state.open': '开启',
      'state.closed': '已关闭',
      'state.merged': '已合并',
      'state.draft': '草稿',

      'lamp.pipeline': '流水线',
      'lamp.review': '评审',
      'lamp.off': '无',
      'lamp.reviewDone': '已满足',
      'lamp.reviewPending': '未满足',
      'lamp.progress': '已满足',
      'lamp.state.SUCCESS': '通过',
      'lamp.state.RUNNING': '运行中',
      'lamp.state.FAILURE': '失败',
      'settings.quickActions': '快捷评论',
      'settings.quickActionsEmpty': '还没有快捷评论，点「添加」新建一条。',
      'settings.actionKey': '按钮',
      'settings.actionBodyPlaceholder': '/lgtm（换行可直接回车）',
      'settings.actionAdd': '添加',
      'settings.actionRemove': '删除',
      'lamp.hint.SUCCESS': '成功',
      'lamp.hint.RUNNING': '运行中',
      'lamp.hint.FAILURE': '失败',
      'lamp.hint.review': '评审 label',
      'lamp.reviewEmpty': '还没有评审 label，点「添加」新建一条。',
      'lamp.reviewAdd': '添加评审 label',
      'lamp.discussions': '代码检视',
      'lamp.discussionsNone': '代码检视',
      'lamp.discussionsClean': '无未解决项',
      'action.resolve': '全部解决',
      'action.resolveTitle': '解决全部 {n} 条未解决讨论',
      'settings.discussions': '跟踪代码检视',
      'settings.discussionsHint': '每个 PR 多一次请求',
      'settings.pipelines': '流水线',
      'settings.pipeline': '流水线',
      'settings.pipelineAdd': '添加流水线',
      'event.new': '新增',
      'event.updated': '更新',
      'event.closed': '关闭',

      'empty.loading': '正在读取 AtomGit…',
      'empty.noItems': '没有符合条件的条目',

      'error.title': '读取失败',
      'error.unauthorized': 'AtomGit 拒绝了令牌（401）。',
      'error.forbidden': 'AtomGit 拒绝了这次请求（403）。',
      'error.not-found': '找不到仓库或条目。',
      'error.network': '网络不可达，请检查网络后重试。',
      'error.timeout': 'AtomGit 响应超时，请稍后重试。',
      'error.empty-token': '请先输入令牌。',
      'error.no-repositories': '还没有关注仓库。',
      'error.no-active-repository': '还没有选择仓库。',
      'error.not-watched': '这个仓库不在关注列表里。',
    }

    const en = {
      'guide.title': 'AtomGit Workbench',
      'guide.description': 'Track Issues and Pull Requests of the repositories you watch',
      'tab.title': 'AtomGit Workbench',
      'header.open': 'Open AtomGit Workbench',
      'settings.nav': 'AtomGit Workbench',

      'common.save': 'Save',
      'common.saving': 'Saving…',
      'common.saved': 'Saved',
      'common.loading': 'Loading…',
      'common.unknownError': 'unknown error',

      'auth.notSignedIn': 'AtomGit — not signed in',
      'auth.signedIn': 'Signed in as {login}',
      'auth.signOut': 'Sign out',
      'auth.profile': 'Profile',
      'auth.verify': 'Verify',
      'auth.verifying': 'Verifying…',
      'auth.tokenPlaceholder': 'Enter a personal access token',
      'auth.oauth': 'Sign in with OAuth',
      'auth.oauthWaiting': 'Authorization opened; returning automatically when done',
      'auth.tokenLink': 'Get a token',

      'settings.repos': 'Watched repositories',
      'settings.reposEmpty': 'No repository watched yet',
      'settings.repoAdd': 'Add repository',
      'settings.repoPlaceholder': 'owner/repo, for example openharmony/docs',
      'settings.repoRemove': 'Remove',
      'settings.repoAdded': 'Added {repo}',
      'settings.repoExists': '{repo} is already on the list',
      'settings.repoNotFound': 'AtomGit has no repository {repo}',

      'settings.general': 'Refresh',
      'settings.interval': 'Auto-refresh interval (seconds)',

      'panel.notSignedInHint': 'Signed out, only public repositories can be read.',
      'panel.noRepos': 'No repository watched yet',
      'panel.noReposHint': 'Add the repositories you want to follow in Settings.',
      'panel.noActive': 'No repository selected',
      'panel.repoSwitch': 'Switch repository',
      'panel.refresh': 'Refresh',
      'panel.updated': 'Updated {time}',
      'panel.openOnAtomGit': 'Open on AtomGit',

      'count.issuesOpen': 'Open issues',
      'count.pullsOpen': 'Open PRs',
      'count.merged': 'Merged',
      'count.closed': 'Closed',

      'section.changes': 'Watch feed',

      'filter.issue': 'Issues',
      'filter.pr': 'Pull requests',
      'panel.kind': 'Kind',
      'scope.all': 'Any state',
      'scope.open': 'Unfinished',
      'scope.closed': 'Closed / merged',
      'scope.recent': 'Updated in {hours}h',
      'scope.recentOff': 'Filter by update time',
      'mine.label': 'Mine',
      'search.placeholder': 'Search title or author',

      'state.open': 'Open',
      'state.closed': 'Closed',
      'state.merged': 'Merged',
      'state.draft': 'Draft',

      'lamp.pipeline': 'Pipeline',
      'lamp.review': 'Review',
      'lamp.off': 'none',
      'lamp.reviewDone': 'complete',
      'lamp.reviewPending': 'incomplete',
      'lamp.progress': 'satisfied',
      'lamp.state.SUCCESS': 'passed',
      'lamp.state.RUNNING': 'running',
      'lamp.state.FAILURE': 'failed',
      'settings.quickActions': 'Quick comments',
      'settings.quickActionsEmpty': 'No quick comment yet. Press Add to create one.',
      'settings.actionKey': 'Key',
      'settings.actionBodyPlaceholder': '/lgtm (Enter adds a line)',
      'settings.actionAdd': 'Add',
      'settings.actionRemove': 'Remove',
      'lamp.hint.SUCCESS': 'passed',
      'lamp.hint.RUNNING': 'running',
      'lamp.hint.FAILURE': 'failed',
      'lamp.hint.review': 'review label',
      'lamp.reviewEmpty': 'No review label yet. Press Add to create one.',
      'lamp.reviewAdd': 'Add review label',
      'lamp.discussions': 'Code review',
      'lamp.discussionsNone': 'Code review',
      'lamp.discussionsClean': 'nothing unresolved',
      'action.resolve': 'Resolve all',
      'action.resolveTitle': 'Resolve all {n} unresolved threads',
      'settings.discussions': 'Track code review',
      'settings.discussionsHint': 'one extra request per PR',
      'settings.pipelines': 'Pipelines',
      'settings.pipeline': 'Pipeline',
      'settings.pipelineAdd': 'Add pipeline',
      'event.new': 'New',
      'event.updated': 'Updated',
      'event.closed': 'Closed',

      'empty.loading': 'Reading AtomGit…',
      'empty.noItems': 'Nothing matches these filters',

      'error.title': 'Could not read',
      'error.unauthorized': 'AtomGit rejected the token (401).',
      'error.forbidden': 'AtomGit refused the request (403).',
      'error.not-found': 'Repository or item not found.',
      'error.network': 'AtomGit is unreachable. Check the network and retry.',
      'error.timeout': 'AtomGit did not answer in time. Retry in a moment.',
      'error.empty-token': 'Enter a token first.',
      'error.no-repositories': 'No repository watched yet.',
      'error.no-active-repository': 'No repository selected.',
      'error.not-watched': 'That repository is not on your watch list.',
    }

    function apiBaseUrl() {
      const fallback = '/' + ROUTE
      try {
        if (typeof document === 'undefined') return fallback
        const base = new URL(document.baseURI)
        const path = base.pathname
        return path.slice(0, path.lastIndexOf('/') + 1) + ROUTE
      } catch {
        return fallback
      }
    }

    async function callApi(path, init) {
      const options = init === undefined ? {} : init
      let response
      try {
        response = await fetch(apiBaseUrl() + path, {
          ...options,
          headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
        })
      } catch (cause) {
        return { ok: false, error: { code: 'network', message: String(cause?.message ?? cause) } }
      }
      try {
        return await response.json()
      } catch {
        return { ok: false, error: { code: 'bad-json', message: `HTTP ${response.status}` } }
      }
    }

    const postJson = (path, body) => callApi(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

    function formatTime(value) {
      if (typeof value !== 'string' || value === '') return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
      const delta = Math.round((Date.now() - date.getTime()) / 1000)
      if (delta >= 0 && delta < 60) return `${delta}s`
      if (delta >= 60 && delta < 3600) return `${Math.floor(delta / 60)}m`
      if (delta >= 3600 && delta < 86400) return `${Math.floor(delta / 3600)}h`
      if (delta >= 86400 && delta < 86400 * 30) return `${Math.floor(delta / 86400)}d`
      const month = `${date.getMonth() + 1}`.padStart(2, '0')
      const day = `${date.getDate()}`.padStart(2, '0')
      return `${date.getFullYear()}-${month}-${day}`
    }

    const C = {
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      base: 'var(--dsw-alias-bg-base)',
      layer1: 'var(--dsw-alias-bg-layer-1)',

      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    function toneColor(tone) {
      if (tone === 'success') return C.ok
      if (tone === 'brand') return C.brand
      if (tone === 'error') return C.error
      if (tone === 'warn') return C.warn
      return C.idle
    }

    function stateTone(stateName) {
      if (stateName === 'merged') return 'success'
      if (stateName === 'open') return 'brand'
      return 'idle'
    }

    const S = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '2px 2px 28px',
        maxWidth: 720,
        fontSize: 13,
        lineHeight: 1.55,
        color: C.text,
      },
      card: {
        border: `0.5px solid ${C.border}`,
        borderRadius: 10,
        background: C.layer1,
        padding: '12px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        minWidth: 0,
      },
      cardTitle: { fontSize: 13.5, fontWeight: 700 },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
      label: { fontSize: 11, color: C.muted, fontWeight: 600 },      link: { color: C.brand, fontSize: 11.5, textDecoration: 'none' },
      statusLine: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minWidth: 0, fontWeight: 600 },
      dot: (tone) => ({ width: 8, height: 8, borderRadius: '50%', background: toneColor(tone), flex: 'none', display: 'inline-block' }),
      commentBody: {
        boxSizing: 'border-box',
        minWidth: 0,
        border: `0.5px solid ${C.border2}`,
        borderRadius: 6,
        padding: '4px 8px',
        background: C.base,
        color: C.text,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.45,
        resize: 'vertical',
        whiteSpace: 'pre-wrap',
      },
      tagCloud: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
      tagChip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        maxWidth: 180,
        height: 19,
        padding: '0 3px 0 7px',
        border: `0.5px solid ${C.border2}`,
        borderRadius: 999,
        background: C.layer1,
        color: C.text,
        fontSize: 10.5,
        whiteSpace: 'nowrap',
      },
      tagChipRemove: {
        border: 'none',
        background: 'transparent',
        color: C.muted,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 12,
        lineHeight: 1,
        padding: '0 3px',
      },
      repoTabs: {
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        borderBottom: `0.5px solid ${C.border}`,
        paddingBottom: 0,
        marginBottom: 2,
      },
      repoTab: {
        boxSizing: 'border-box',
        border: 'none',
        borderBottom: '2px solid transparent',
        background: 'transparent',
        color: C.muted,
        font: 'inherit',
        fontSize: 11.5,
        padding: '4px 8px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        maxWidth: 180,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      repoTabActive: { color: C.text, fontWeight: 700, borderBottomColor: C.brand },
      repoName: { flex: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 },
      errorBox: {
        border: `0.5px solid color-mix(in srgb, ${C.error} 45%, transparent)`,
        background: `color-mix(in srgb, ${C.error} 8%, transparent)`,
        borderRadius: 8,
        padding: '6px 9px',
        fontSize: 11.5,
        minWidth: 0,
      },
      noticeBox: {
        border: `0.5px solid color-mix(in srgb, ${C.brand} 35%, transparent)`,
        background: `color-mix(in srgb, ${C.brand} 7%, transparent)`,
        borderRadius: 8,
        padding: '6px 9px',
        fontSize: 11.5,
        minWidth: 0,
      },

      root: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', color: C.text, background: C.base, fontSize: 13, lineHeight: 1.5 },
      header: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px 8px', borderBottom: `0.5px solid ${C.border}`, flex: 'none', minWidth: 0 },
      headerText: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 'auto' },
      repoName: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      repoPicker: {
        width: '100%',
        boxSizing: 'border-box',
        border: 'none',
        background: 'transparent',
        color: C.text,
        font: 'inherit',
        fontSize: 13,
        fontWeight: 600,
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        textOverflow: 'ellipsis',
        minWidth: 0,
      },
      headerMeta: { color: C.muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },      spinner: 'atomgit-panel-spin',
      scroll: { flex: 'auto', minHeight: 0, overflowY: 'auto', padding: '8px 10px 16px' },
      stats: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, margin: '2px 0 8px' },
      stat: {
        border: `0.5px solid ${C.border}`,
        background: C.layer1,
        borderRadius: 8,
        padding: '5px 7px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0,
      },
      statValue: { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
      statLabel: { fontSize: 10, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      pieWrap: { display: 'inline-flex', alignItems: 'center', flex: 'none' },
      lampRow: { display: 'inline-flex', alignItems: 'center', gap: 3, flex: 'none' },
      lampDot: (state) => ({
        width: 10,
        height: 10,
        borderRadius: '50%',
        boxSizing: 'border-box',
        background:
          state === 'SUCCESS' ? C.ok : state === 'FAILURE' ? C.error : state === 'RUNNING' ? C.warn : 'transparent',
        border: `1px solid ${
          state === 'SUCCESS' ? C.ok : state === 'FAILURE' ? C.error : state === 'RUNNING' ? C.warn : C.muted
        }`,
      }),
      lamp: (state) => ({
        width: 10,
        height: 10,
        borderRadius: '50%',
        flex: 'none',
        display: 'inline-block',
        boxSizing: 'border-box',
        background:
          state === 'SUCCESS'
            ? C.ok
            : state === 'FAILURE'
              ? C.error
              : state === 'RUNNING'
                ? C.warn
                : 'transparent',
        border: `1px solid ${
          state === 'SUCCESS'
            ? C.ok
            : state === 'FAILURE'
              ? C.error
              : state === 'RUNNING'
                ? C.warn
                : `color-mix(in srgb, ${C.muted} 45%, transparent)`
        }`,
        animation: state === 'RUNNING' ? 'atomgit-panel-pulse 1.2s ease-in-out infinite' : 'none',
      }),
      rowMain: {
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        width: '100%',
        border: 'none',
        background: 'transparent',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
      },
      rowActions: { display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' },
      rowQuick: {
        boxSizing: 'border-box',
        height: 18,
        minWidth: 20,
        padding: '0 5px',
        border: `0.5px solid ${C.border2}`,
        borderRadius: 4,
        background: C.base,
        color: C.muted,
        font: 'inherit',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer',
      },
      rowCard: {
        border: `0.5px solid ${C.border}`,
        borderRadius: 8,
        padding: '6px 9px',
        marginBottom: 5,
        background: C.layer1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
      },
      rowTop: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 },
      rowNumber: { color: C.muted, fontVariantNumeric: 'tabular-nums', fontSize: 11.5, flex: 'none' },
      rowTitle: { flex: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },      rowMeta: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted, minWidth: 0, flexWrap: 'wrap' },

      filters: { display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', margin: '2px 0 6px' },
      button: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        height: 28,
        padding: '0 12px',
        border: `0.5px solid ${C.border2}`,
        borderRadius: 6,
        background: C.layer1,
        color: C.text,
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        flex: 'none',
        whiteSpace: 'nowrap',
      },
      buttonPrimary: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        height: 28,
        padding: '0 12px',
        border: `0.5px solid ${C.brand}`,
        borderRadius: 6,
        background: `color-mix(in srgb, ${C.brand} 14%, transparent)`,
        color: C.brand,
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        flex: 'none',
        whiteSpace: 'nowrap',
      },
      buttonDanger: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        height: 28,
        padding: '0 12px',
        border: `0.5px solid color-mix(in srgb, ${C.error} 55%, transparent)`,
        borderRadius: 6,
        background: `color-mix(in srgb, ${C.error} 8%, transparent)`,
        color: C.error,
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        flex: 'none',
        whiteSpace: 'nowrap',
      },
      buttonDisabled: { opacity: 0.45, cursor: 'default' },

      input: {
        boxSizing: 'border-box',
        height: 28,
        border: `0.5px solid ${C.border2}`,
        borderRadius: 6,
        padding: '0 9px',
        background: C.base,
        color: C.text,
        font: 'inherit',
        fontSize: 12.5,
        minWidth: 0,
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        border: `0.5px solid ${C.border2}`,
        borderRadius: 999,
        background: 'transparent',
        color: C.muted,
        padding: '0 9px',
        font: 'inherit',
        fontSize: 11.5,
        cursor: 'pointer',
        flex: 'none',
        whiteSpace: 'nowrap',
      },
      chipActive: {
        background: `color-mix(in srgb, ${C.brand} 14%, transparent)`,
        borderColor: C.brand,
        color: C.brand,
        fontWeight: 600,
      },
      sectionTitle: {
        fontSize: 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: C.muted,
        fontWeight: 700,
        margin: '10px 0 5px',
      },
      empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        textAlign: 'center',
        color: C.muted,
        padding: '24px 12px',
        fontSize: 12,
      },
      activityRow: { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11.5, padding: '3px 0', borderBottom: `0.5px solid ${C.border}`, minWidth: 0 },
    }

    function Icon({ size = 15, children }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
        },
        children,
      )
    }

    function GitGlyph({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('circle', { cx: 4.2, cy: 3.4, r: 1.6 }),
        h('circle', { cx: 4.2, cy: 12.6, r: 1.6 }),
        h('circle', { cx: 11.8, cy: 6.4, r: 1.6 }),
        h('path', { d: 'M4.2 5v6' }),
        h('path', { d: 'M11.8 8v1.2a2.4 2.4 0 0 1-2.4 2.4H4.2' }),
      )
    }

    function RefreshGlyph({ spinning = false }) {
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            animation: spinning ? 'atomgit-panel-spin 900ms linear infinite' : 'none',
          },
        },
        h(Icon, null, h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.9-4.15' }), h('path', { d: 'M13.6 2.6v3.6h-3.6' })),
      )
    }

    function ErrorBox({ error, t }) {
      if (error === null || error === undefined) return null
      const known = error.code !== undefined && t(`error.${error.code}`) !== `error.${error.code}`
      const text = known ? t(`error.${error.code}`) : (error.message ?? t('common.unknownError'))
      return h('div', { style: S.errorBox, role: 'status' }, h('strong', null, t('error.title')), ' — ', text)
    }

    function Empty({ title, hint }) {
      return h(
        'div',
        { style: S.empty },
        title ? h('div', { style: { fontWeight: 600, color: C.text } }, title) : null,
        hint ? h('div', { style: { maxWidth: 340 } }, hint) : null,
      )
    }

    function StateBadge({ item, t }) {
      const label = item.draft ? t('state.draft') : t(`state.${item.state}`)
      const color = toneColor(stateTone(item.state))
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            height: 17,
            padding: '0 7px',
            borderRadius: 999,
            border: `0.5px solid color-mix(in srgb, ${color} 50%, transparent)`,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            color,
            fontSize: 10,
            fontWeight: 600,
            flex: 'none',
            whiteSpace: 'nowrap',
          },
        },
        label,
      )
    }

    /**
     * The pipeline lamp is a filled dot. The review lamp is a pie: the lit slice
     * is the share of the required review labels the item already carries, and
     * the colour still follows the worst state found. Both describe themselves
     * on hover with the exact labels involved.
     */
    function Lamps({ lights, discussionsRatio, t }) {
      const describe = (slot) => {
        const lamp = lights?.[slot]
        const done = lamp?.state === 'SUCCESS'
        const headline =
          slot === 'review'
            ? lamp && lamp.total > 0
              ? done
                ? t('lamp.reviewDone')
                : t('lamp.reviewPending')
              : t('lamp.off')
            : lamp?.state
              ? t(`lamp.state.${lamp.state}`)
              : t('lamp.off')
        const head = `${t(`lamp.${slot}`)}: ${headline}`
        const lines = [head]
        if (lamp && lamp.total > 0) lines.push(`${t('lamp.progress')}: ${lamp.matched}/${lamp.total}`)
        // Only the labels this lamp actually found on the item. What is missing
        // is already visible as the unfilled pie or the dark dot.
        for (const hit of lamp?.present ?? []) lines.push(`✓ ${hit.name}`)
        return lines.join('\n')
      }
      const pipeline = lights?.pipeline ?? null
      const review = lights?.review ?? null
      const discussions = discussionsRatio
      const discussText = () => {
        if (!discussions) return t('lamp.discussionsNone')
        const head = `${t('lamp.discussions')}: ${discussions.resolved}/${discussions.total}`
        if (discussions.total === 0) return `${head} — ${t('lamp.discussionsClean')}`
        return discussions.unresolved === 0 ? `${head} — ${t('lamp.discussionsClean')}` : head
      }
      return h(
        'span',
        { style: S.lampRow, 'data-atomgit-lamps': '1' },
        // filled dot
        h('span', {
          style: S.lamp(pipeline?.state ?? null),
          title: describe('pipeline'),
          'data-atomgit-lamp': `pipeline:${pipeline?.state ?? 'off'}`,
        }),
        // pie: review
        h(
          'span',
          { style: S.pieWrap, title: describe('review'), 'data-atomgit-lamp': `review:${review?.state ?? 'off'}` },
          h(PieLamp, { lamp: review }),
        ),
        // pie: resolved discussions, shown only when the repository opted in
        discussions === null || discussions === undefined
          ? null
          : h(
              'span',
              { style: S.pieWrap, title: discussText(), 'data-atomgit-lamp': `discussions:${discussions.resolved}/${discussions.total}` },
              h(ResolvePie, { ratio: discussions }),
            ),
      )
    }

    /**
     * The review-discussion pie: how many of a pull request's review threads are
     * resolved. Full green when all are resolved, neutral otherwise.
     */
    function ResolvePie({ ratio }) {
      const total = ratio?.total ?? 0
      const resolved = ratio?.resolved ?? 0
      // Nothing to resolve is already resolved: a pull request without review
      // threads reads green, exactly like one whose threads are all closed.
      const all = resolved === total
      const color = all ? C.ok : C.muted
      const share = total > 0 ? Math.max(0, Math.min(1, resolved / total)) : 0
      const deg = Math.round(share * 360)
      return h('span', {
        style: {
          display: 'block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: `1px solid ${all ? C.ok : `color-mix(in srgb, ${C.muted} 45%, transparent)`}`,
          // All resolved is a filled circle, including when there was nothing to
          // resolve; anything outstanding stays a partial or empty sweep.
          background: all
            ? C.ok
            : deg === 0
              ? 'transparent'
              : `conic-gradient(${color} 0deg ${deg}deg, transparent ${deg}deg 360deg)`,
        },
      })
    }

    /**
     * A 10px pie. `matched/total` sets the lit sweep; `state` picks its colour.
     * It is drawn with a conic gradient so no extra element is needed.
     */
    function PieLamp({ lamp }) {
      const state = lamp?.state ?? null
      const total = lamp?.total ?? 0
      const matched = lamp?.matched ?? 0
      // Review is binary; a partial pie is simply not done yet, so it stays neutral.
      const color = state === 'SUCCESS' ? C.ok : C.muted
      const share = total > 0 ? Math.max(0, Math.min(1, matched / total)) : 0
      const deg = Math.round(share * 360)
      const ring = `color-mix(in srgb, ${color} 28%, transparent)`
      return h('span', {
        style: {
          display: 'block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: `1px solid ${state === null ? ring : color}`,
          background:
            deg === 0
              ? 'transparent'
              : `conic-gradient(${color} 0deg ${deg}deg, transparent ${deg}deg 360deg)`,
          animation: state === 'RUNNING' ? 'atomgit-panel-pulse 1.2s ease-in-out infinite' : 'none',
        },
      })
    }

    function ItemRow({ item, onOpen, actions, onComment, commenting, onResolve, resolving, t }) {
      const meta = []
      if (item.author) meta.push(item.author)
      if (item.comments > 0) meta.push(`💬 ${item.comments}`)
      if (item.updatedAt) meta.push(formatTime(item.updatedAt))
      const quick = actions ?? []
      return h(
        'div',
        { style: S.rowCard, 'data-atomgit-item': `${item.kind}:${item.number}` },
        h(
          'button',
          { type: 'button', style: S.rowMain, onClick: () => onOpen(item) },
          h(
            'span',
            { style: S.rowTop },
            h(Lamps, { lights: item.lights, discussionsRatio: item.discussions, t }),
            h(
              'span',
              { style: { ...S.rowNumber, color: toneColor(item.kind === 'pr' ? 'brand' : 'idle') } },
              item.kind === 'pr' ? `!${item.number}` : `#${item.number}`,
            ),
            h('span', { style: S.rowTitle, title: item.title }, item.title),
          ),
          meta.length > 0 ? h('span', { style: S.rowMeta }, meta.join(' · ')) : null,
        ),
        quick.length === 0 && (item.discussions?.unresolved ?? 0) === 0
          ? null
          : h(
              'span',
              { style: S.rowActions },
              (item.discussions?.unresolved ?? 0) > 0 && onResolve
                ? h(
                    'button',
                    {
                      type: 'button',
                      style: { ...S.rowQuick, width: 'auto' },
                      title: t('action.resolveTitle').replace('{n}', String(item.discussions.unresolved)),
                      disabled: resolving === `${item.kind}:${item.number}`,
                      'data-atomgit-resolve': item.number,
                      onClick: () => onResolve(item),
                    },
                    t('action.resolve'),
                  )
                : null,
              quick.map((action) =>
                h(
                  'button',
                  {
                    key: action.key,
                    type: 'button',
                    style: S.rowQuick,
                    title: action.body,
                    disabled: commenting === `${item.kind}:${item.number}:${action.key}`,
                    'data-atomgit-quick': action.key,
                    onClick: () => onComment(item, action),
                  },
                  action.key,
                ),
              ),
            ),
      )
    }

    function Stat({ value, label }) {
      return h(
        'span',
        { style: S.stat },
        h('span', { style: S.statValue }, value === null || value === undefined ? '—' : String(value)),
        h('span', { style: S.statLabel }, label),
      )
    }

    function ActivityRow({ entry, t }) {
      const verb = t(`event.${entry.event}`)
      const color = entry.event === 'new' ? toneColor('brand') : entry.event === 'closed' ? toneColor('success') : toneColor('warn')
      const marker = entry.kind === 'pr' ? `!${entry.number}` : `#${entry.number}`
      return h(
        'span',
        { style: S.activityRow },
        h('span', { style: { color, fontWeight: 600, flex: 'none', fontSize: 10.5 } }, verb),
        h('span', { style: { color: C.muted, flex: 'none' } }, marker),
        h(
          'span',
          { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }, title: entry.title },
          entry.url
            ? h(
                'a',
                { href: entry.url, target: '_blank', rel: 'noreferrer', style: { color: 'inherit', textDecoration: 'none' }, onClick: (event) => event.stopPropagation() },
                entry.title,
              )
            : entry.title,
        ),
        h('span', { style: { marginLeft: 'auto', color: C.muted, flex: 'none' } }, formatTime(entry.at)),
      )
    }

    /** Login state, token row with its verify/save action and the OAuth action. */
    function LoginCard({ auth, t, onChanged }) {
      const [draft, setDraft] = useState('')
      const [phase, setPhase] = useState('idle') // idle | verifying | verified | saving
      const [error, setError] = useState(null)
      const [login, setLogin] = useState(null)
      const [oauthOpen, setOauthOpen] = useState(null)
      const [awaiting, setAwaiting] = useState(false)
      const mounted = useRef(true)

      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
        }
      }, [])

      const signedIn = auth?.signedIn === true
      const verified = phase === 'verified'

      useEffect(() => {
        if (!awaiting) return undefined
        const timer = setInterval(() => {
          if (mounted.current) onChanged()
        }, 2000)
        return () => clearInterval(timer)
      }, [awaiting, onChanged])

      useEffect(() => {
        if (awaiting && signedIn) {
          setAwaiting(false)
          setOauthOpen(null)
        }
      }, [awaiting, signedIn])

      useEffect(() => {
        if (signedIn) {
          setDraft('')
          setPhase('idle')
        }
      }, [signedIn])

      const changeDraft = (value) => {
        setDraft(value)
        setPhase('idle')
        setError(null)
        setLogin(null)
      }

      const verify = async () => {
        const token = draft.trim()
        if (token === '') return
        setPhase('verifying')
        setError(null)
        const result = await postJson('/auth/verify', { token })
        if (!mounted.current) return
        if (result?.ok === true && result.valid === true) {
          setLogin(result.login ?? null)
          setPhase('verified')
          return
        }
        setPhase('idle')
        setError(result?.error ?? { code: 'unknown', message: t('common.unknownError') })
      }

      const save = async () => {
        const token = draft.trim()
        setPhase('saving')
        setError(null)
        const result = await postJson('/auth/token', { token, login })
        if (!mounted.current) return
        if (result?.ok === true) {
          setDraft('')
          setPhase('idle')
          onChanged()
          return
        }
        setPhase('verified')
        setError(result?.error ?? { code: 'unknown', message: t('common.unknownError') })
      }

      /**
       * Opens the account page in the system browser. A synthetic click on an
       * anchor hands the address to the shell, which owns external navigation;
       * `window.open` covers the case where no anchor is available.
       */
      const openProfile = () => {
        const url = typeof auth?.profileUrl === 'string' && auth.profileUrl !== '' ? auth.profileUrl : null
        if (url === null) return
        try {
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.target = '_blank'
          anchor.rel = 'noopener noreferrer'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
        } catch {
          try {
            window.open(url, '_blank', 'noopener,noreferrer')
          } catch {
            /* the address stays in the status line */
          }
        }
      }

      const signOut = async () => {
        setError(null)
        setPhase('idle')
        setDraft('')
        setOauthOpen(null)
        setAwaiting(false)
        await postJson('/auth/signout', {})
        if (mounted.current) onChanged()
      }

      const startOauth = async () => {
        setError(null)
        const result = await postJson('/oauth/start', { scope: 'all' })
        if (!mounted.current) return
        if (result?.ok !== true) {
          setError(result?.error ?? { code: 'unknown', message: t('common.unknownError') })
          return
        }
        setOauthOpen(result.url)
        setAwaiting(true)
        try {
          window.open(result.url, '_blank', 'noopener,noreferrer')
        } catch {
          /* the link stays available */
        }
      }

      const identity = signedIn
        ? t('auth.signedIn').replace('{login}', auth?.login ?? '—')
        : t('auth.notSignedIn')

      // Signed in: the input keeps its place and shows the masked token, disabled
      // and unselectable; the single red button replaces the two actions.
      const tokenField = signedIn
        ? h(Field, {
            type: 'text',
            readOnly: true,
            disabled: true,
            tabIndex: -1,
            'aria-label': t('auth.signedIn').replace('{login}', auth?.login ?? '—'),
            value: auth?.tokenPreview ?? '',
          })
        : h(Field, {
            type: 'password',
            autoComplete: 'off',
            'aria-label': t('auth.tokenPlaceholder'),
            value: draft,
            placeholder: t('auth.tokenPlaceholder'),
            onChange: (event) => changeDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') (verified ? save : verify)()
            },
          })

      const actionButton = verified
        ? h(Btn, { variant: 'primary', onClick: save }, phase === 'saving' ? t('common.saving') : t('common.save'))
        : h(
            Btn,
            { variant: 'primary', disabled: draft.trim() === '', onClick: verify },
            phase === 'verifying' ? t('auth.verifying') : t('auth.verify'),
          )

      const actions = signedIn
        ? h(
            'span',
            { style: { display: 'inline-flex', gap: 8, flex: 'none' } },
            h(Btn, { onClick: openProfile }, t('auth.profile')),
            h(Btn, { variant: 'danger', onClick: signOut }, t('auth.signOut')),
          )
        : h(
            'span',
            { style: { display: 'inline-flex', gap: 8, flex: 'none' } },
            actionButton,
            auth?.oauthAvailable === false
              ? null
              : h(Btn, { disabled: awaiting, onClick: startOauth }, t('auth.oauth')),
          )

      return h(
        'section',
        { style: S.card, 'data-atomgit-login': 'card' },
        h(
          'div',
          { style: S.statusLine },
          h('span', { style: S.dot(signedIn ? 'success' : 'idle') }),
          h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, identity),
        ),
        h('div', { style: S.row }, tokenField, actions),
        signedIn
          ? null
          : h(
              'div',
              { style: S.row },
              h('a', { href: 'https://atomgit.com/setting/token-classic', target: '_blank', rel: 'noreferrer', style: S.link }, `${t('auth.tokenLink')} ↗`),
              awaiting && oauthOpen !== null
                ? h('a', { href: oauthOpen, target: '_blank', rel: 'noreferrer', style: S.link }, `${t('auth.oauthWaiting')} ↗`)
                : null,
            ),
        error !== null ? h(ErrorBox, { error, t }) : null,
      )
    }

    /**
     * Pipeline rows: one row per pipeline, three columns for its success,
     * running and failure labels. The review box lists the labels an item must
     * all carry to count as reviewed.
     */
    function LampEditor({ repo, lights, actions, t, onSave, busy }) {
      const [rows, setRows] = useState(() => {
        const list = (lights?.pipeline ?? []).map((row) => ({
          SUCCESS: (row.SUCCESS ?? []).join(', '),
          RUNNING: (row.RUNNING ?? []).join(', '),
          FAILURE: (row.FAILURE ?? []).join(', '),
        }))
        return list.length > 0 ? list : [{ SUCCESS: '', RUNNING: '', FAILURE: '' }]
      })
      const [reviewDraft, setReviewDraft] = useState('')
      const [reviewRows, setReviewRows] = useState(() => {
        const list = (lights?.review ?? []).filter((name) => typeof name === 'string' && name !== '')
        return list.length > 0 ? list : []
      })
      const [discussOn, setDiscussOn] = useState(() => lights?.discussions === true)
      const [actDraft, setActDraft] = useState(() =>
        (actions ?? []).map((a) => ({ key: a.key, body: a.body })),
      )

      // Typing a label and pressing Enter appends it; the list stays a row of chips.
      const commitReview = () => {
        const name = reviewDraft.trim()
        if (name === '') return
        setReviewRows((current) => (current.length >= 12 || current.includes(name) ? current : [...current, name]))
        setReviewDraft('')
      }

      // One cell is one label. Several pipelines means several rows, not several
      // labels joined inside a cell.
      const oneName = (text) => {
        const name = String(text ?? '').trim()
        return name === '' ? [] : [name]
      }

      const cell = (index, state) =>
        h('input', {
          style: { ...S.input, flex: '1 1 0', minWidth: 0, fontSize: 11.5 },
          value: rows[index][state],
          placeholder: t(`lamp.hint.${state}`),
          spellCheck: false,
          'data-atomgit-cell': `${index}:${state}`,
          onChange: (event) =>
            setRows((current) =>
              current.map((row, i) => (i === index ? { ...row, [state]: event.target.value } : row)),
            ),
        })

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 2 } },

        h('div', { style: { ...S.label, fontWeight: 700 } }, t('settings.pipelines')),

        // header row
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('span', { style: { width: 64, flex: 'none' } }),
          LIGHT_ROWS.map((state) =>
            h(
              'span',
              { key: state, style: { display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 0', minWidth: 0 } },
              h('span', { style: { ...S.lampDot(state), flex: 'none' } }),
              h('span', { style: { fontSize: 10.5, color: C.muted } }, t(`lamp.state.${state}`)),
            ),
          ),
        ),

        // one row per pipeline
        rows.map((row, index) =>
          h(
            'div',
            { key: index, style: { display: 'flex', alignItems: 'center', gap: 6 }, 'data-atomgit-pipeline-row': index },
            h('span', { style: { width: 64, flex: 'none', fontSize: 10.5, color: C.muted } },
              `${t('settings.pipeline')} ${index + 1}`),
            cell(index, 'SUCCESS'),
            cell(index, 'RUNNING'),
            cell(index, 'FAILURE'),
            h(
              Btn,
              {
                variant: 'danger',
                disabled: rows.length <= 1,
                onClick: () => setRows((current) => current.filter((_, i) => i !== index)),
              },
              t('settings.actionRemove'),
            ),
          ),
        ),

        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h(Btn, {
            disabled: rows.length >= 8,
            onClick: () => setRows((current) => [...current, { SUCCESS: '', RUNNING: '', FAILURE: '' }]),
          }, t('settings.pipelineAdd')),
        ),

        h('div', { style: { ...S.label, fontWeight: 700, marginTop: 4 } }, t('lamp.review')),
        reviewRows.length === 0
          ? null
          : h(
              'div',
              { style: S.tagCloud, 'data-atomgit-review-cloud': '1' },
              reviewRows.map((name, index) =>
                h(
                  'span',
                  { key: index, style: S.tagChip },
                  h('span', { style: { maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' } }, name === '' ? '…' : name),
                  h(
                    'button',
                    {
                      type: 'button',
                      style: S.tagChipRemove,
                      title: t('settings.actionRemove'),
                      'aria-label': `${t('settings.actionRemove')} ${name}`,
                      'data-atomgit-review-remove': index,
                      onClick: () => setReviewRows((current) => current.filter((_, i) => i !== index)),
                    },
                    '×',
                  ),
                ),
              ),
            ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
          h('input', {
            style: { ...S.input, flex: '1 1 auto', fontSize: 11.5 },
            value: reviewDraft,
            placeholder: t('lamp.hint.review'),
            spellCheck: false,
            'data-atomgit-review-draft': '1',
            onChange: (event) => setReviewDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitReview()
              }
            },
          }),
          h(Btn, { disabled: reviewDraft.trim() === '', onClick: commitReview }, t('lamp.reviewAdd')),
        ),

        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: discussOn,
            'data-atomgit-discussions': '1',
            onChange: (event) => setDiscussOn(event.target.checked),
          }),
          h('span', { style: { fontSize: 11.5, color: C.text } }, t('settings.discussions')),
          h('span', { style: { fontSize: 10.5, color: C.muted } }, t('settings.discussionsHint')),
        ),

        h('div', { style: { ...S.label, fontWeight: 700, marginTop: 4 } }, t('settings.quickActions')),
        actDraft.length === 0
          ? h('div', { style: { fontSize: 10.5, color: C.muted, fontStyle: 'italic' } }, t('settings.quickActionsEmpty'))
          : actDraft.map((action, index) =>
              h(
                'div',
                { key: index, style: { display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 } },
                h('input', {
                  style: { ...S.input, width: 56, flex: 'none', fontSize: 11.5, textAlign: 'center' },
                  value: action.key,
                  placeholder: t('settings.actionKey'),
                  maxLength: 8,
                  onChange: (event) =>
                    setActDraft((current) => current.map((a, i) => (i === index ? { ...a, key: event.target.value } : a))),
                }),
                h('textarea', {
                  style: { ...S.commentBody, flex: '1 1 auto' },
                  rows: 2,
                  value: action.body,
                  placeholder: t('settings.actionBodyPlaceholder'),
                  spellCheck: false,
                  'data-atomgit-action-body': index,
                  onChange: (event) =>
                    setActDraft((current) => current.map((a, i) => (i === index ? { ...a, body: event.target.value } : a))),
                }),
                h(Btn, { variant: 'danger', onClick: () => setActDraft((current) => current.filter((_, i) => i !== index)) },
                  t('settings.actionRemove')),
              ),
            ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h(Btn, {
            disabled: actDraft.length >= 6,
            onClick: () => setActDraft((current) => [...current, { key: '', body: '' }]),
          }, t('settings.actionAdd')),
          h(
            Btn,
            {
              variant: 'primary',
              disabled: busy === `lights:${repo}`,
              onClick: () =>
                onSave(repo, {
                  lights: {
                    pipeline: rows.map((row) => ({
                      SUCCESS: oneName(row.SUCCESS),
                      RUNNING: oneName(row.RUNNING),
                      FAILURE: oneName(row.FAILURE),
                    })),
                    review: reviewRows.map((n) => n.trim()).filter((n) => n !== ''),
                    discussions: discussOn === true,
                  },
                  actions: actDraft.filter((a) => a.key.trim() !== '' && a.body.trim() !== ''),
                }),
            },
            busy === `lights:${repo}` ? t('common.saving') : t('common.save'),
          ),
        ),
      )
    }

    function SettingsPage(props) {
      const t = props.t
      const [data, setData] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [busy, setBusy] = useState(null)
      const [flash, setFlash] = useState(null)
      const [repoDraft, setRepoDraft] = useState('')
      const [editorRepo, setEditorRepo] = useState(null)
      const [intervalDraft, setIntervalDraft] = useState('')
      const mounted = useRef(true)

      const applyData = useCallback((next) => {
        setData(next)
        setIntervalDraft((current) => (current === '' ? String(next?.state?.config?.intervalSec ?? 120) : current))
      }, [])

      const load = useCallback(async () => {
        const result = await callApi('/state')
        if (!mounted.current) return null
        if (result?.ok === true) {
          applyData(result)
          setLoadError(null)
          return result
        }
        setLoadError(result?.error ?? { code: 'unknown', message: t('common.unknownError') })
        return null
      }, [applyData, t])

      useEffect(() => {
        mounted.current = true
        load()
        return () => {
          mounted.current = false
        }
      }, [load])

      const run = async (key, fn) => {
        setBusy(key)
        setFlash(null)
        try {
          return await fn()
        } finally {
          if (mounted.current) setBusy(null)
        }
      }

      const state = data?.state ?? {}
      const watched = state.watched ?? []

      const addRepo = () =>
        run('repo', async () => {
          const value = repoDraft.trim()
          if (value === '') return
          const result = await postJson('/repos', { repo: value })
          if (result?.ok !== true) {
            const text =
              result?.error?.code === 'not-found'
                ? t('settings.repoNotFound').replace('{repo}', value)
                : (result?.error?.message ?? t('common.unknownError'))
            setFlash({ tone: 'error', text })
            return
          }
          setRepoDraft('')
          await load()
          setFlash({
            tone: 'ok',
            text: result.alreadyWatched ? t('settings.repoExists').replace('{repo}', value) : t('settings.repoAdded').replace('{repo}', value),
          })
        })

      // The open tab must always name a repository that is still watched.
      const openRepo =
        editorRepo !== null && watched.some((row) => row.key === editorRepo)
          ? editorRepo
          : watched.length > 0
            ? watched[0].key
            : null

      const removeRepo = (repo) =>
        run(`remove:${repo}`, async () => {
          const result = await postJson('/repos/remove', { repo })
          if (result?.ok !== true) {
            setFlash({ tone: 'error', text: result?.error?.message ?? t('common.unknownError') })
            return
          }
          applyData({ ...data, state: result.state })
        })

      const saveLights = (repo, config) =>
        run(`lights:${repo}`, async () => {
          const result = await postJson('/repo-config', { repo, lights: config.lights, actions: config.actions })
          if (result?.ok !== true) {
            setFlash({ tone: 'error', text: result?.error?.message ?? t('common.unknownError') })
            return
          }
          applyData({ ...data, state: result.state })
          setFlash({ tone: 'ok', text: t('common.saved') })
        })

      const saveInterval = () =>
        run('interval', async () => {
          const value = Number(intervalDraft)
          const result = await postJson('/config', { intervalSec: Number.isFinite(value) ? value : 120 })
          if (result?.ok !== true) {
            setFlash({ tone: 'error', text: result?.error?.message ?? t('common.unknownError') })
            return
          }
          applyData({ ...data, state: result.state })
          setFlash({ tone: 'ok', text: t('common.saved') })
        })

      if (data === null) {
        return h('div', { style: S.page }, loadError ? h(ErrorBox, { error: loadError, t }) : h(Empty, { title: t('common.loading') }))
      }

      return h(
        'div',
        { style: S.page, 'data-atomgit-settings-page': 'page' },
        loadError ? h(ErrorBox, { error: loadError, t }) : null,
        flash === null ? null : h('div', { style: flash.tone === 'error' ? S.errorBox : S.noticeBox, role: 'status' }, flash.text),

        h(LoginCard, { auth: data.auth, t, onChanged: load }),

        h(
          'section',
          { style: S.card },
          h('div', { style: S.cardTitle }, t('settings.repos')),
          h(
            'div',
            { style: S.row },
            h(Field, {
              grow: '1 1 240px',
              value: repoDraft,
              placeholder: t('settings.repoPlaceholder'),
              'aria-label': t('settings.repoAdd'),
              onChange: (event) => setRepoDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') addRepo()
              },
            }),
            h(
              Btn,
              { variant: 'primary', disabled: busy === 'repo' || repoDraft.trim() === '', onClick: addRepo },
              busy === 'repo' ? t('common.saving') : t('settings.repoAdd'),
            ),
          ),
          watched.length === 0
            ? h('div', { style: { fontSize: 11.5, color: C.muted, fontStyle: 'italic' } }, t('settings.reposEmpty'))
            : h(
                'div',
                null,
                // tabs: one strip of repository names, only the selected one is expanded
                h(
                  'div',
                  { style: S.repoTabs, role: 'tablist' },
                  watched.map((entry) =>
                    h(
                      'button',
                      {
                        key: entry.key,
                        type: 'button',
                        role: 'tab',
                        'aria-selected': entry.key === openRepo,
                        'data-atomgit-repo-tab': entry.key,
                        style: {
                          ...S.repoTab,
                          ...(entry.key === openRepo ? S.repoTabActive : null),
                        },
                        onClick: () => setEditorRepo(entry.key),
                      },
                      entry.key,
                    ),
                  ),
                ),
                watched.length === 0
                  ? null
                  : (() => {
                      const entry = watched.find((row) => row.key === openRepo) ?? watched[0]
                      if (entry === undefined) return null
                      return h(
                        'div',
                        { key: entry.key, style: { paddingTop: 10, minWidth: 0 }, 'data-atomgit-watched': entry.key },
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                          h(Btn, {
                            variant: 'danger',
                            disabled: busy === `remove:${entry.key}`,
                            onClick: () => removeRepo(entry.key),
                          }, t('settings.repoRemove')),
                        ),
                        h(LampEditor, { repo: entry.key, lights: entry.lights, actions: entry.actions, t, busy, onSave: saveLights }),
                      )
                    })(),
              ),
        ),

        h(
          'section',
          { style: S.card },
          h('div', { style: S.cardTitle }, t('settings.general')),
          h(
            'div',
            { style: { ...S.row, flexWrap: 'nowrap' } },
            h('label', { style: { ...S.label, flex: 'none' }, htmlFor: 'atomgit-interval' }, t('settings.interval')),
            h(Field, {
              id: 'atomgit-interval',
              type: 'number',
              min: 30,
              max: 3600,
              grow: '0 0 auto',
              style: { width: 72, textAlign: 'right' },
              value: intervalDraft,
              onChange: (event) => setIntervalDraft(event.target.value),
            }),
            h(Btn, { variant: 'primary', disabled: busy === 'interval', onClick: saveInterval }, busy === 'interval' ? t('common.saving') : t('common.save')),
          ),
        ),
      )
    }

    function Panel(props) {
      const t = props.t
      const openInBrowser = props.openInBrowser
      const [meta, setMeta] = useState(null)
      const [snapshot, setSnapshot] = useState(null)
      const [loading, setLoading] = useState(false)
      const [metaError, setMetaError] = useState(null)
      const [kindFilter, setKindFilter] = useState('pr')
      const [scopeFilter, setScopeFilter] = useState('open')
      const [query, setQuery] = useState('')
      const [mineOnly, setMineOnly] = useState(false)
      const [recentHours, setRecentHours] = useState(null)
      const [pendingRepo, setPendingRepo] = useState(null)
      const [refreshing, setRefreshing] = useState(false)
      const mounted = useRef(true)

      const loadMeta = useCallback(async () => {
        const result = await callApi('/state')
        if (!mounted.current) return null
        if (result?.ok === true) {
          setMeta(result)
          setMetaError(null)
          return result
        }
        setMetaError(result?.error ?? { code: 'unknown', message: t('common.unknownError') })
        return null
      }, [t])

      const loadSnapshot = useCallback(async (force, repo) => {
        if (mounted.current) {
          setLoading(true)
          if (force) setRefreshing(true)
        }
        const target = repo ?? null
        try {
          const result = force
            ? await postJson('/refresh', { repo: target })
            : await callApi(`/snapshot${target ? `?repo=${encodeURIComponent(target)}` : ''}`)
          if (result?.ok === true && typeof result.repo?.key === 'string') {
            writeSnapshotCache(result.repo.key, result)
          }
          if (mounted.current) setSnapshot(result)
        } catch (cause) {
          if (mounted.current) {
            setSnapshot({ ok: false, error: { code: 'network', message: String(cause?.message ?? cause) }, items: [], activity: [] })
          }
        } finally {
          if (mounted.current) {
            setLoading(false)
            if (force) setRefreshing(false)
          }
        }
      }, [])

      useEffect(() => {
        mounted.current = true
        loadMeta().then((result) => {
          if (result === null) return
          const repo = result.state?.active ?? null
          if (repo === null) {
            loadSnapshot(false, null)
            return
          }
          // Show what was already read, then ask only if it is old enough to
          // matter. Returning to the panel should not cost a wait.
          const cached = readSnapshotCache(repo)
          if (cached !== null) {
            if (mounted.current) setSnapshot(cached)
            const age = Date.now() - (snapshotCache.get(repo)?.at ?? 0)
            const fresh = Math.max(30, Number(result.state?.config?.intervalSec ?? 120)) * 1000
            if (age < fresh) return
          }
          loadSnapshot(false, repo)
        })
        return () => {
          mounted.current = false
        }
      }, [loadMeta, loadSnapshot])

      const watched = meta?.state?.watched ?? []
      const activeKey = meta?.state?.active ?? null
      const intervalSec = Number(meta?.state?.config?.intervalSec ?? snapshot?.intervalSec ?? 120)
      const signedIn = meta?.auth?.signedIn === true

      useEffect(() => {
        if (watched.length === 0) return undefined
        const delay = Math.max(30, intervalSec) * 1000
        const timer = setInterval(() => {
          if (!mounted.current) return
          loadMeta().then((result) => {
            if (result === null) return
            // Ask without forcing: the host answers from its own cache while the
            // interval has not elapsed, so a tick never spends a fetch it does
            // not need.
            loadSnapshot(false, result.state?.active ?? null)
          })
        }, delay)
        return () => clearInterval(timer)
      }, [watched.length, intervalSec, loadMeta, loadSnapshot])

      const [commenting, setCommenting] = useState(null)
      const [commentError, setCommentError] = useState(null)

      const [resolving, setResolving] = useState(null)

      /** Resolve every unresolved review thread on one pull request. */
      const resolveItem = async (item) => {
        setResolving(`${item.kind}:${item.number}`)
        setCommentError(null)
        try {
          const result = await postJson('/resolve', { repo: activeKey, number: item.number })
          if (result?.ok !== true) {
            setCommentError(result?.error ?? { code: 'unknown', message: 'resolve failed' })
            return
          }
          await loadSnapshot(true, activeKey)
        } finally {
          if (mounted.current) setResolving(null)
        }
      }

      /** Post one configured quick comment on this item. */
      const postComment = async (item, action) => {
        const ticket = `${item.kind}:${item.number}:${action.key}`
        setCommenting(ticket)
        setCommentError(null)
        try {
          const result = await postJson('/comment', {
            repo: activeKey,
            kind: item.kind,
            number: item.number,
            action: action.key,
          })
          if (result?.ok !== true) {
            setCommentError(result?.error ?? { code: 'unknown', message: 'comment failed' })
            return
          }
          await loadSnapshot(true, activeKey)
        } finally {
          if (mounted.current) setCommenting(null)
        }
      }

      const switchRepo = async (key) => {
        setPendingRepo(key)
        try {
          const result = await postJson('/repos/active', { repo: key })
          if (result?.ok === true) {
            if (mounted.current) setMeta((current) => (current === null ? current : { ...current, state: result.state }))
            await loadSnapshot(false, key)
          } else if (mounted.current) {
            setMetaError(result?.error ?? { code: 'unknown', message: t('common.unknownError') })
          }
        } finally {
          if (mounted.current) setPendingRepo(null)
        }
      }

      const items = snapshot?.items ?? []
      const viewer = snapshot?.viewer ?? meta?.auth?.login ?? null
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        const cutoff = recentHours === null ? null : Date.now() - recentHours * 3600 * 1000
        const login = typeof viewer === 'string' ? viewer.toLowerCase() : ''
        return items.filter((item) => {
          if (item.kind !== kindFilter) return false
          if (scopeFilter === 'open' && !(item.state === 'open' || item.state === 'draft')) return false
          if (scopeFilter === 'closed' && !(item.state === 'closed' || item.state === 'merged')) return false
          if (mineOnly) {
            if (login === '') return false
            const involved =
              String(item.author).toLowerCase() === login ||
              String(item.assignee).toLowerCase() === login ||
              (Array.isArray(item.assignees) && item.assignees.some((name) => String(name).toLowerCase() === login))
            if (!involved) return false
          }
          if (cutoff !== null) {
            const when = Date.parse(item.updatedAt)
            if (!Number.isFinite(when) || when < cutoff) return false
          }
          if (needle !== '' && !`${item.title} ${item.author} #${item.number}`.toLowerCase().includes(needle)) return false
          return true
        })
      }, [items, kindFilter, scopeFilter, query, mineOnly, recentHours, viewer])

      const counts = snapshot?.counts ?? null
      const activity = snapshot?.activity ?? []
      const repoLabel = snapshot?.repo ? snapshot.repo.key : activeKey
      const failed = snapshot?.ok === false

      const headerMeta = [signedIn ? meta?.auth?.login ?? 'AtomGit' : t('auth.notSignedIn')]
      if (snapshot?.fetchedAt) headerMeta.push(t('panel.updated').replace('{time}', formatTime(snapshot.fetchedAt)))

      let body
      if (watched.length === 0) {
        body = h(Empty, { title: t('panel.noRepos'), hint: t('panel.noReposHint') })
      } else {
        body = h(
          'div',
          null,
          failed && snapshot?.error ? h(ErrorBox, { error: snapshot.error, t }) : null,
          commentError ? h(ErrorBox, { error: commentError, t }) : null,
          h(
            'div',
            { style: S.stats },
            h(Stat, { value: counts?.issuesOpen, label: t('count.issuesOpen') }),
            h(Stat, { value: counts?.pullsOpen, label: t('count.pullsOpen') }),
            h(Stat, { value: counts?.pullsMerged, label: t('count.merged') }),
            h(Stat, { value: (counts?.issuesClosed ?? 0) + (counts?.pullsClosed ?? 0), label: t('count.closed') }),
          ),
          activity.length > 0
            ? h(
                'div',
                null,
                h('div', { style: S.sectionTitle }, t('section.changes')),
                activity.slice(0, 5).map((entry, index) => h(ActivityRow, { key: `${entry.at}:${entry.kind}:${entry.number}:${index}`, entry, t })),
              )
            : null,
          h(Segments, {
            label: t('panel.kind'),
            value: kindFilter,
            items: ['pr', 'issue'].map((value) => ({ value, label: t(`filter.${value}`) })),
            onChange: setKindFilter,
          }),
          h(Segments, {
            label: t('scope.all'),
            value: scopeFilter,
            items: ['open', 'closed', 'all'].map((value) => ({ value, label: t(`scope.${value}`) })),
            onChange: setScopeFilter,
          }),
          h(
            'div',
            { style: S.filters },
            h(
              Chip,
              {
                active: mineOnly,
                title: typeof viewer === 'string' ? t('mine.label') : t('panel.notSignedInHint'),
                'data-atomgit-filter': 'mine',
                onClick: () => setMineOnly((value) => !value),
              },
              t('mine.label'),
            ),
            h(
              Chip,
              {
                active: recentHours !== null,
                'data-atomgit-filter': 'recent',
                onClick: () => setRecentHours((value) => (value === null ? 24 : null)),
              },
              recentHours === null ? t('scope.recentOff') : t('scope.recent').replace('{hours}', String(recentHours)),
            ),
            recentHours === null
              ? null
              : [1, 24, 168].map((hours) =>
                  h(Chip, { key: hours, active: recentHours === hours, onClick: () => setRecentHours(hours) }, `${hours}h`),
                ),
          ),
          h(Field, {
            grow: '1 1 100%',
            value: query,
            placeholder: t('search.placeholder'),
            'aria-label': t('search.placeholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          loading && items.length === 0
            ? h(Empty, { title: t('empty.loading') })
            : filtered.length === 0
              ? h(Empty, { title: t('empty.noItems') })
              : h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column' } },
                  filtered.map((item) =>
                    h(ItemRow, {
                      key: `${item.kind}:${item.number}`,
                      item,
                      t,
                      actions: snapshot?.actions ?? [],
                      onComment: postComment,
                      commenting,
                      onResolve: resolveItem,
                      resolving,
                      onOpen: (picked) => openInBrowser(picked.url),
                    }),
                  ),
                ),
        )
      }

      return h(
        'div',
        { style: S.root, 'data-atomgit-panel': 'panel' },
        h(
          'div',
          { style: S.header },
          h('span', { style: { color: C.brand, flex: 'none' } }, h(GitGlyph, null)),
          h(
            'div',
            { style: S.headerText },
            watched.length === 0
              ? h('span', { style: S.repoName }, t('panel.noActive'))
              : h(
                  'select',
                  {
                    style: S.repoPicker,
                    value: pendingRepo ?? activeKey ?? '',
                    title: t('panel.repoSwitch'),
                    'aria-label': t('panel.repoSwitch'),
                    'data-atomgit-switcher': 'repos',
                    disabled: pendingRepo !== null,
                    onChange: (event) => {
                      const next = event.target.value
                      if (next !== '' && next !== activeKey) switchRepo(next)
                    },
                  },
                  activeKey === null ? h('option', { value: '' }, t('panel.noActive')) : null,
                  watched.map((entry) => h('option', { value: entry.key, key: entry.key }, entry.key)),
                ),
            h('span', { style: S.headerMeta }, headerMeta.join(' · ')),
          ),
          h(
            Btn,
            {
              icon: h(RefreshGlyph, { spinning: refreshing }),
              style: { width: 28, padding: 0 },
              title: refreshing ? t('panel.refreshing') : t('panel.refresh'),
              'aria-label': t('panel.refresh'),
              'aria-busy': refreshing,
              disabled: watched.length === 0 || refreshing,
              onClick: () => {
                loadMeta().then(() => loadSnapshot(true, activeKey))
              },
            },
            null,
          ),
        ),
        h(
          'div',
          { style: S.scroll },
          metaError ? h(ErrorBox, { error: metaError, t }) : null,
          meta !== null && !signedIn ? h('div', { style: { ...S.noticeBox, marginBottom: 8 } }, t('panel.notSignedInHint')) : null,
          body,
        ),
      )
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const service = (key) => {
        try {
          return typeof ctx.get === 'function' ? ctx.get(key) : undefined
        } catch {
          return undefined
        }
      }

      ctx.effect(
        () => {
          if (typeof document === 'undefined') return undefined
          const tag = document.createElement('style')
          tag.dataset.atomgitSync = 'spin'
          tag.textContent =
            '@keyframes atomgit-panel-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
            '@keyframes atomgit-panel-pulse{0%,100%{opacity:1}50%{opacity:.25}}'
          document.head.appendChild(tag)
          return () => tag.remove()
        },
        'atomgit-panel: styles',
      )

      ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'atomgit-panel: zh dictionary')
      ctx.effect(() => ctx.locale.register(NS, 'en', en), 'atomgit-panel: en dictionary')

      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: SETTINGS_ID, order: 55, label: () => t('settings.nav'), inject: () => ({ t }) },
              SettingsPage,
            ),
          ),
        'atomgit-panel: settings page',
      )

      let typeDispose = null
      let retryHandle = null
      let attempts = 0
      const tryRegisterType = () => {
        if (typeDispose !== null) return
        const tabs = service('sidebarRightTabs')
        if (tabs === undefined || tabs === null || typeof tabs.register !== 'function') {
          if (attempts < 6) {
            attempts += 1
            retryHandle = setTimeout(tryRegisterType, 400)
          }
          return
        }
        try {
          typeDispose = tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => t('tab.title'),
            guide: [{ id: 'atomgit', order: 30, title: () => t('guide.title'), description: () => t('guide.description') }],
          })
        } catch (error) {
          typeDispose = null
          console.error('[atomgit-panel] sidebarRightTabs.register failed', error)
        }
      }
      ctx.effect(() => {
        tryRegisterType()
        return () => {
          if (retryHandle !== null) clearTimeout(retryHandle)
          retryHandle = null
          const dispose = typeDispose
          typeDispose = null
          if (typeof dispose === 'function') dispose()
        }
      }, 'atomgit-panel: tab type')

      /**
       * A work item's canonical page belongs to AtomGit, so it opens in the
       * sidebar's own browser tab. When that tab type is absent the address is
       * handed to the environment instead, so the reader still sees the real page.
       */
      const openInBrowser = (url) => {
        const target = typeof url === 'string' ? url : ''
        if (target === '') return
        const sidebar = service('sidebarRight')
        try {
          if (sidebar && typeof sidebar.openTab === 'function') {
            sidebar.openTab('browser', { params: { url: target } })
            return
          }
        } catch {
          /* fall through to the environment */
        }
        try {
          window.open(target, '_blank', 'noopener,noreferrer')
        } catch {
          /* nothing else to try */
        }
      }

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, (props) =>
              h(Panel, { ...props, t, openInBrowser }),
            ),
          ),
        'atomgit-panel: tab body',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID, locale: NS }, () =>
              h(
                'span',
                { style: { display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 } },
                h('span', { style: { display: 'inline-flex', flex: 'none', color: C.brand } }, h(GitGlyph, { size: 13 })),
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t('tab.title')),
              ),
            ),
          ),
        'atomgit-panel: tab chip',
      )

      ctx.effect(
        () =>
          ctx.slots.inject('conversation.session.header.utilities', () =>
            ctx.slots.register(
              { name: 'conversation.session.header.utilities', id: 'atomgit-panel', order: 12, label: () => t('header.open') },
              () => {
                const open = () => {
                  const sidebar = service('sidebarRight')
                  try {
                    if (sidebar && typeof sidebar.openTab === 'function') {
                      sidebar.openTab(TAB_KIND)
                      return
                    }
                  } catch {
                    /* fall through */
                  }
                  try {
                    if (sidebar && typeof sidebar.toggleExpanded === 'function') sidebar.toggleExpanded()
                  } catch {
                    /* no other path */
                  }
                }
                return h(
                  Btn,
                  {
                    style: { height: 26 },
                    title: t('header.open'),
                    'aria-label': t('header.open'),
                    'data-atomgit-entry': 'header',
                    onClick: open,
                  },
                  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
                    h(GitGlyph, { size: 14 }),
                    h('span', { style: { fontSize: 12 } }, t('guide.title')),
                  ),
                )
              },
            ),
          ),
        'atomgit-panel: header entry',
      )
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
