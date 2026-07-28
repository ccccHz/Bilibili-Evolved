# 自定义组件 Pages

此目录负责构建和发布个人使用的 Bilibili Evolved 组件, 不修改 Evo 的运行时、
registry 全局依赖或 Webpack 配置.

当前发布:

- `live/danmaku-visibility-check`
- `live/autoResolution`
- `live/liveData-reAdd`

`feeds/mine-test` 是早期测试组件, 不参与发布.

## 本地构建

先安装仓库、registry 和弹幕检测组件自己的依赖:

```bash
pnpm install --frozen-lockfile
pnpm --dir registry install --frozen-lockfile
pnpm --dir registry/lib/components/live/danmaku-visibility-check install --frozen-lockfile
```

然后执行:

```bash
pnpm tsx custom-registry/build.ts
```

输出位于 `custom-registry/dist/`, 该目录不会提交到 Git.

## 发布

推送到 `master` 后, `.github/workflows/custom-components-pages.yml` 只在自定义组件、
发布配置或工作流发生变化时运行. 也可以在 GitHub Actions 页面手动运行.

首次使用时, 在仓库 **Settings → Pages → Build and deployment → Source** 中选择
**GitHub Actions**. 发布页预期地址:

<https://cccchz.github.io/Bilibili-Evolved/>

页面提供单个和批量安装链接. 将链接粘贴到 Bilibili Evolved 的组件管理页面即可;
同一 URL 后续可供自动更新使用.
