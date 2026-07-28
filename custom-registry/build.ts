import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import webpack, { Configuration, MultiStats, Stats } from 'webpack'
import { buildByEntry } from '../registry/webpack/config'
import { publishedComponents } from './components'

interface PublishedArtifact {
  id: string
  displayName: string
  description: string
  path: string
  bytes: number
  sha256: string
}

const repositoryRoot = path.resolve(__dirname, '..')
const outputRoot = path.resolve(
  repositoryRoot,
  process.env.CUSTOM_REGISTRY_OUTPUT_DIR ?? 'custom-registry/dist',
)
const componentsOutput = path.join(outputRoot, 'components')

const getRevision = () => {
  const githubSha = process.env.GITHUB_SHA
  if (githubSha) {
    return githubSha.slice(0, 12)
  }
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

const removeCdnSourceMapPlugin = (config: Configuration) => {
  config.plugins = config.plugins?.filter(
    plugin => plugin && plugin.constructor.name !== 'SourceMapDevToolPlugin',
  )
}

const createWebpackConfig = (id: string) => {
  const config = buildByEntry({
    src: './registry/lib/components/',
    type: 'component',
    entry: `./registry/lib/components/${id}/index.ts`,
  })
  removeCdnSourceMapPlugin(config)
  config.devtool = 'source-map'
  config.output = {
    ...config.output,
    path: componentsOutput,
    publicPath: 'auto',
  }
  return config
}

const compile = (configs: Configuration[]) =>
  new Promise<Stats | MultiStats>((resolve, reject) => {
    webpack(configs, (error, stats) => {
      if (error) {
        reject(error)
        return
      }
      if (!stats) {
        reject(new Error('Webpack did not return build statistics.'))
        return
      }
      if (stats.hasErrors()) {
        reject(
          new Error(
            stats.toString({
              all: false,
              errors: true,
              errorDetails: true,
            }),
          ),
        )
        return
      }
      resolve(stats)
    })
  })

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const renderIndex = (revision: string, artifacts: PublishedArtifact[]) => {
  const cards = artifacts
    .map(item => {
      const size = (item.bytes / 1024).toFixed(1)
      const shortChecksum = item.sha256.slice(0, 12)
      return `
        <article class="card">
          <div>
            <h2>${escapeHtml(item.displayName)}</h2>
            <code>${escapeHtml(item.id)}</code>
          </div>
          <p>${escapeHtml(item.description)}</p>
          <p class="meta">${size} KiB · SHA-256 ${shortChecksum}…</p>
          <div class="actions">
            <button data-copy="${escapeHtml(item.path)}">复制安装链接</button>
            <a href="${escapeHtml(item.path)}">查看构建文件</a>
          </div>
        </article>`
    })
    .join('')
  const paths = JSON.stringify(artifacts.map(item => item.path)).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Bilibili Evolved 自定义组件</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f4f6fb;
        color: #182033;
      }
      body { margin: 0; }
      main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0 72px; }
      header { margin-bottom: 32px; }
      h1 { margin: 0 0 12px; font-size: clamp(30px, 6vw, 48px); letter-spacing: -.04em; }
      h2 { margin: 0 0 8px; font-size: 20px; }
      p { line-height: 1.65; }
      .lead { max-width: 720px; color: #526078; }
      .toolbar { display: flex; align-items: center; gap: 12px; margin-top: 22px; flex-wrap: wrap; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 16px; }
      .card { display: flex; flex-direction: column; padding: 22px; border: 1px solid #dce2ee; border-radius: 18px; background: #fff; box-shadow: 0 12px 36px rgba(36, 52, 78, .08); }
      .card > p { flex: 1; color: #526078; }
      code { color: #a23b5a; overflow-wrap: anywhere; }
      .meta { font-size: 12px; }
      button, a { box-sizing: border-box; border-radius: 10px; padding: 9px 13px; font: inherit; text-decoration: none; cursor: pointer; }
      button { border: 0; background: #d94f70; color: white; }
      a { border: 1px solid #cfd6e4; color: inherit; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .revision { color: #6d7890; font-size: 13px; }
      #status { min-height: 1.5em; color: #a23b5a; }
      @media (prefers-color-scheme: dark) {
        :root { background: #111521; color: #edf1fa; }
        .lead, .card > p, .revision { color: #aeb8ca; }
        .card { background: #191f2d; border-color: #30394d; box-shadow: none; }
        a { border-color: #465068; }
        code, #status { color: #ff93ae; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Bilibili Evolved 自定义组件</h1>
        <p class="lead">在 Bilibili Evolved 的组件管理页面粘贴安装链接. 从这里安装后, 自动更新会继续使用同一个 Pages 地址.</p>
        <div class="toolbar">
          <button id="copy-all">复制全部安装链接</button>
          <a href="manifest.json">查看 manifest.json</a>
          <span class="revision">构建提交 ${escapeHtml(revision)}</span>
        </div>
        <p id="status" role="status" aria-live="polite"></p>
      </header>
      <section class="grid">${cards}</section>
    </main>
    <script>
      const paths = ${paths}
      const status = document.querySelector('#status')
      const absoluteUrl = path => new URL(path, window.location.href).href
      const copy = async text => {
        await navigator.clipboard.writeText(text)
        status.textContent = '已复制到剪贴板'
        window.setTimeout(() => { status.textContent = '' }, 1800)
      }
      document.querySelectorAll('[data-copy]').forEach(button => {
        button.addEventListener('click', () => copy(absoluteUrl(button.dataset.copy)))
      })
      document.querySelector('#copy-all').addEventListener('click', () => {
        copy(paths.map(absoluteUrl).join('\\n'))
      })
    </script>
  </body>
</html>
`
}

const main = async () => {
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(componentsOutput, { recursive: true })
  const stats = await compile(publishedComponents.map(item => createWebpackConfig(item.id)))
  console.log(
    stats.toString({
      all: false,
      assets: true,
      colors: true,
      errors: true,
      timings: true,
    }),
  )

  const artifacts = await Promise.all(
    publishedComponents.map(async item => {
      const relativePath = `components/${item.id}.js`
      const code = await readFile(path.join(outputRoot, relativePath), 'utf8')
      return {
        ...item,
        path: relativePath,
        bytes: Buffer.byteLength(code),
        sha256: createHash('sha256').update(code).digest('hex'),
      }
    }),
  )
  const revision = getRevision()
  await writeFile(
    path.join(outputRoot, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        revision,
        components: artifacts,
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(path.join(outputRoot, 'index.html'), renderIndex(revision, artifacts))
  console.log(`Custom registry site written to ${outputRoot}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
