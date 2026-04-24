# Hardware Benchmark

一个基于 **Vite + React + TypeScript** 的离线 CPU / GPU 性能对比工具。无需联网即可检索硬件型号、查看天梯排行、进行多设备横向比较。

## 功能特性

- **硬件搜索与比较** — 输入 CPU / GPU 型号，最多 4 台设备并排对比
- **归一化评分** — 以基准硬件为 100 分，一眼看出相对性能差距
- **CPU / GPU 天梯榜** — 按单核、多核、GPU 评分排名，快速定位硬件段位
- **柱状图可视化** — 直观展示各设备的单核、多核、GPU 及综合分数
- **完全离线** — 所有数据内置于 `public/data/hardware-data.json`，不依赖线上接口
- **一键数据更新** — 提供采集脚本从 PassMark 抓取最新数据并自动生成离线数据包

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 数据采集 | Node.js 原生 `fetch` + HTML 解析 |
| 部署 | 纯静态文件，可用 nginx / Caddy / GitHub Pages 等 |

## 项目结构

```
├── public/data/
│   └── hardware-data.json          # 离线硬件数据（CPU & GPU）
├── scripts/data/
│   ├── sources.json                # 数据源配置
│   ├── update-hardware-data.mjs    # 数据采集与生成脚本
│   └── cache/                      # 规格详情本地缓存
├── src/
│   ├── App.tsx                     # 主应用入口
│   ├── components/
│   │   ├── SearchCompareCard.tsx   # 搜索与比较面板
│   │   ├── CompareTable.tsx        # 设备对比表格
│   │   ├── ScoreChart.tsx          # 柱状图可视化
│   │   ├── CpuLadderCard.tsx       # CPU 天梯榜
│   │   └── GpuLadderCard.tsx       # GPU 天梯榜
│   ├── services/
│   │   ├── benchmark.ts            # 归一化评分计算
│   │   ├── matcher.ts              # 型号模糊搜索
│   │   └── offlineData.ts          # 离线数据加载与预处理
│   └── types/
│       └── hardware.ts             # 类型定义
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 环境要求

- **Node.js** ≥ 18（数据更新脚本使用了原生 `fetch`）
- **npm** ≥ 9

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

默认访问 `http://localhost:5173`，端口冲突时 Vite 会自动切换。

### 生产构建

```bash
npm run build
```

静态文件输出到 `dist/` 目录。

### 本地预览构建产物

```bash
npm run preview
```

## 部署

构建后的 `dist/` 目录为纯静态文件，可直接部署到任意静态服务器。

### nginx 示例

```nginx
server {
    listen 80;
    server_name benchmark.example.com;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

部署步骤：

```bash
npm run build
# 将 dist/ 内容复制到 nginx 静态目录
cp -r dist/* /usr/share/nginx/html/
nginx -s reload
```

> 代码更新后只需重新 `npm run build` 并复制 `dist/` 即可，一般无需重启 nginx。

## 数据更新

离线数据来源于 [PassMark](https://www.cpubenchmark.net/)，包括 CPU 综合分 / 单线程分和 GPU G3D Mark。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run data:update` | 全量抓取并写入 `public/data/hardware-data.json` |
| `npm run data:update:dry` | Dry-run 模式，只抓取不写入，用于验证 |

### 脚本参数

数据更新脚本 `scripts/data/update-hardware-data.mjs` 支持以下参数：

| 参数 | 说明 |
| --- | --- |
| `--dry-run` | 仅预览，不写入输出文件 |
| `--skip-specs` | 跳过规格详情页抓取（仅使用列表页数据） |
| `--spec-limit=N` | 最多抓取 N 条规格详情（调试用） |
| `--refresh-spec-cache` | 强制刷新规格缓存 |
| `--cache-ttl-days=N` | 设置缓存过期天数，默认 30 |

### 缓存机制

脚本会将规格详情缓存到 `scripts/data/cache/spec-cache.json`，默认 30 天有效。首次全量更新较慢，后续增量更新会显著加快。

## 评分模型

### 归一化公式

以基准硬件为 100 分，其他型号按比例归一化：

$$\text{Benchmark}(target) = \frac{\text{RawScore}(target)}{\text{RawScore}(base)} \times 100$$

默认基准硬件（可在 `sources.json` 中配置）：

| 维度 | 基准型号 |
| --- | --- |
| CPU 单核 / 多核 | Intel Core i7-10700 |
| GPU | GeForce GTX 1060 |

### 测试工具与测试项目

所有原始分数均来自 **PassMark PerformanceTest**：

| 指标 | 测试项目 | 说明 |
| --- | --- | --- |
| CPU 单核 | CPU Single Thread Rating | 单线程运算性能，反映单核 IPC 与主频表现 |
| CPU 多核 | CPU Mark (Overall) | 全核综合评分，包含整数、浮点、压缩、加密等多项负载 |
| GPU | G3D Mark | 3D 图形渲染评分，覆盖 DirectX 9/10/11/12 场景 |

### 综合分权重

```
综合分 = CPU单核分 × W1 + CPU多核分 × W2 + GPU分 × W3
```

比较面板中默认权重为 CPU 单核 0.5、CPU 多核 0.5、GPU 0（仅按比较维度切换），可根据使用场景调整。

## 可用脚本

| 脚本 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | TypeScript 编译 + Vite 生产构建 |
| `npm run preview` | 本地预览构建产物 |
| `npm run data:update` | 全量更新离线硬件数据 |
| `npm run data:update:dry` | Dry-run 数据更新 |

## License

Private

规格缓存文件：

```text
scripts/data/cache/spec-cache.json
```

### 首次更新与后续更新

首次全量更新：
- 需要抓取大量 CPU / GPU 详情页
- 耗时可能超过 20 分钟

后续重复更新：
- 会优先命中 `scripts/data/cache/spec-cache.json`
- 速度会显著提升

### 额外参数

强制刷新规格缓存：

```bash
node ./scripts/data/update-hardware-data.mjs --refresh-spec-cache
```

设置缓存有效期，单位为天：

```bash
node ./scripts/data/update-hardware-data.mjs --cache-ttl-days=7
```

限制本次补规格数量，适合调试：

```bash
node ./scripts/data/update-hardware-data.mjs --spec-limit=20
```

跳过规格补全，只更新基础列表：

```bash
node ./scripts/data/update-hardware-data.mjs --skip-specs
```

只做调试，不写文件：

```bash
node ./scripts/data/update-hardware-data.mjs --dry-run --spec-limit=20
```

## 部署到 Nginx

这是一个纯前端静态站点，推荐流程是：
- 本地或 CI 执行 `npm install` 和 `npm run build`
- 将 `dist/` 目录部署到 Nginx 静态目录

### 方式一：直接复制 `dist/`

构建后，把 `dist/` 目录中的文件复制到 Nginx 站点目录，例如：

```text
/usr/share/nginx/html/hardware-benchmark/
```

### 方式二：作为独立站点部署

示例 Nginx 配置：

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    root /usr/share/nginx/html/hardware-benchmark;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /data/ {
        try_files $uri =404;
    }
}
```

说明：
- `root` 指向构建产物所在目录
- `try_files $uri $uri/ /index.html;` 适合前端路由场景，虽然当前项目不是复杂路由应用，但保留这条更稳妥
- `public/data/hardware-data.json` 在构建后会作为 `/data/hardware-data.json` 提供访问

### 方式三：部署到子路径

如果要部署到子路径，例如：

```text
https://your-domain.example.com/hardware-benchmark/
```

则需要同时处理两件事：
- 调整 Vite 的 `base` 配置
- 在 Nginx 中配置对应的 `location`

例如在 `vite.config.ts` 中改为：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/hardware-benchmark/',
  plugins: [react()],
});
```

对应 Nginx 示例：

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location /hardware-benchmark/ {
        alias /usr/share/nginx/html/hardware-benchmark/;
        index index.html;
        try_files $uri $uri/ /hardware-benchmark/index.html;
    }
}
```

如果你当前是直接部署在域名根路径下，则不需要修改 `base`。

## 典型发布流程

### 本地手动发布

```bash
npm install
npm run data:update
npm run build
```

然后把 `dist/` 上传到服务器的 Nginx 站点目录。

### 仅更新前端，不刷新数据

如果 `public/data/hardware-data.json` 已经是最新的：

```bash
npm install
npm run build
```

### 仅调试数据抓取

```bash
node ./scripts/data/update-hardware-data.mjs --dry-run --spec-limit=20 --refresh-spec-cache
```

## 目录说明

```text
public/data/hardware-data.json      离线硬件数据
scripts/data/update-hardware-data.mjs  数据更新脚本
scripts/data/cache/spec-cache.json  规格抓取缓存
src/                                前端源码
index.html                          入口 HTML
vite.config.ts                      Vite 配置
```

## 故障排查

### 1. `npm run dev` 启动失败

检查：
- Node.js 版本是否过低
- 是否已经执行 `npm install`

### 2. 数据更新很慢

先确认是否为首次执行。

首次执行慢是正常的，因为需要建立规格缓存。后续执行会明显变快。

如果希望更快：
- 调试时使用 `--spec-limit`
- 不需要规格详情时使用 `--skip-specs`
- 非必要不要频繁使用 `--refresh-spec-cache`

### 3. Nginx 部署后打开空白或资源 404

检查：
- 是否部署的是 `dist/` 目录内容，而不是项目源码
- Nginx `root` 或 `alias` 是否指向了正确目录
- 如果使用子路径部署，是否同时设置了 Vite `base`

### 4. 页面加载不到数据

检查浏览器是否能访问：

```text
/data/hardware-data.json
```

如果访问不到，通常是静态资源路径或 Nginx 配置问题。
