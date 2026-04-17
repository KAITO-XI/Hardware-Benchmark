# 离线 Web CPU/GPU Benchmark 工具设计

## 1. 目标

设计一个离线可运行的 Web 工具，支持用户输入自己的 CPU / GPU 型号，自动生成统一的 Benchmark 分数，并支持最多 4 台设备进行横向比较。

核心目标：

1. 覆盖尽可能多的常见 CPU / GPU 型号。
2. 使用统一的离线数据包，不依赖在线接口。
3. 支持 CPU 单核、多核，以及 GPU 综合性能评分。
4. 支持自定义基准卡，例如设置 `GTX 1060 = 100`。
5. 支持最多 4 套硬件组合比较。

***

## 2. 数据源建议

## 2.1 推荐组合

推荐使用“主数据源 + 补充数据源”的方式，而不是完全依赖单一站点。

- 主数据源：PassMark
- CPU 补充源：Geekbench
- 笔记本 / 移动端补充源：Notebookcheck
- 可复现和开源补充源：OpenBenchmarking

## 2.2 为什么这样选

### PassMark

适合做主数据源，原因如下：

- CPU 和 GPU 覆盖面大，常见消费级、工作站、部分服务器型号较全。
- CPU 可拿到综合分和单线程分。
- GPU 可拿到综合图形分。
- 排名口径统一，适合做离线映射和归一化。

建议主用字段：

- CPU:
  - `cpuMark`
  - `singleThreadMark`
- GPU:
  - `g3dMark`

### Geekbench

适合做 CPU 校验和补充，尤其适合：

- 单核性能对比
- 新型号 CPU 的早期补录
- Apple / ARM / 移动 SoC 的补充

建议字段：

- `singleCoreScore`
- `multiCoreScore`

### Notebookcheck

适合补足以下场景：

- 笔记本移动版 CPU / GPU
- 核显
- 某些 OEM 特有命名

### OpenBenchmarking

适合未来增强：

- 做自建测试体系
- 提供 Linux 场景补充
- 支持更透明的测试来源

## 2.3 数据源落地策略

建议不要在运行时抓取网站，而是采用“离线构建数据包”的方式：

1. 在开发期写数据采集脚本。
2. 定期抓取 / 清洗 / 合并多个来源。
3. 生成本地静态 JSON。
4. Web 工具发布时直接内置 JSON。

这样工具在离线环境里也能完整工作。

***

## 3. 产品能力设计

## 3.1 输入方式

用户输入 1\~4 套硬件信息，每套设备至少包括：

- 设备名称，可选，例如“我的电脑 A”
- CPU 型号
- GPU 型号

可选扩展字段：

- 内存大小
- 分辨率
- 功耗档位
- 设备类型：台式机 / 笔记本 / 迷你主机

第一版建议只做 CPU 和 GPU，避免范围过大。

## 3.2 输出内容

每套设备输出：

- CPU 单核 Benchmark
- CPU 多核 Benchmark
- GPU Benchmark
- 综合分
- 相对基准百分比

同时支持：

- 柱状图比较
- 排名
- 某一设备相对另一设备的倍率说明

例如：

- `RTX 2060 GPU Benchmark = 150`
- `比 GTX 1060 高 50%`
- `CPU 多核性能约为设备 B 的 1.32 倍`

## 3.3 比较上限

最多支持 4 套设备并排比较，原因：

- UI 易读
- 柱状图不会太拥挤
- 对典型选型场景足够

***

## 4. 统一评分模型

## 4.1 核心思想

不要直接展示原始站点分数，而是做一层归一化，转换成产品自己的 Benchmark。

例如：

- 设定 `GTX 1060` 的 GPU 基准分为 `100`
- 如果某 GPU 原始分数是 GTX 1060 的 `1.5` 倍
- 则输出 GPU Benchmark = `150`

CPU 同理。

## 4.2 公式

### GPU 归一化

假设：

- `rawGpuScore(target)` = 某 GPU 的原始分数
- `rawGpuScore(base)` = 基准 GPU 的原始分数

则：

```text
gpuBenchmark(target) = rawGpuScore(target) / rawGpuScore(base) * 100
```

### CPU 单核归一化

```text
cpuSingleBenchmark(target) = rawCpuSingle(target) / rawCpuSingle(base) * 100
```

### CPU 多核归一化

```text
cpuMultiBenchmark(target) = rawCpuMulti(target) / rawCpuMulti(base) * 100
```

## 4.3 综合分建议

第一版不要过度复杂，建议使用简单加权：

```text
overallBenchmark = cpuSingleBenchmark * 0.2
                 + cpuMultiBenchmark  * 0.4
                 + gpuBenchmark       * 0.4
```

原因：

- 单核影响基础交互和轻任务体验
- 多核影响编译、压缩、渲染等重任务
- GPU 对图形类场景影响较大

如果你的工具更偏游戏，可以改成：

```text
overallBenchmark = cpuSingleBenchmark * 0.2
                 + cpuMultiBenchmark  * 0.2
                 + gpuBenchmark       * 0.6
```

建议把权重做成可配置项，而不是写死。

***

## 5. 数据模型设计

## 5.1 CPU 数据结构

```json
{
  "id": "cpu-intel-core-i5-12400f",
  "vendor": "Intel",
  "model": "Core i5-12400F",
  "aliases": ["i5 12400F", "Intel i5-12400F"],
  "sourceScores": {
    "passmark": {
      "cpuMark": 19432,
      "singleThreadMark": 3560
    },
    "geekbench": {
      "singleCore": 2501,
      "multiCore": 10982
    }
  },
  "normalizedScores": {
    "cpuSingle": 128,
    "cpuMulti": 142
  },
  "category": ["desktop"],
  "updatedAt": "2026-04-16"
}
```

## 5.2 GPU 数据结构

```json
{
  "id": "gpu-nvidia-geforce-rtx-2060",
  "vendor": "NVIDIA",
  "model": "GeForce RTX 2060",
  "aliases": ["RTX2060", "NVIDIA RTX 2060"],
  "sourceScores": {
    "passmark": {
      "g3dMark": 15000
    }
  },
  "normalizedScores": {
    "gpu": 150
  },
  "category": ["desktop"],
  "updatedAt": "2026-04-16"
}
```

## 5.3 设备比较输入结构

```json
[
  {
    "label": "设备 A",
    "cpuId": "cpu-intel-core-i5-12400f",
    "gpuId": "gpu-nvidia-geforce-gtx-1060"
  },
  {
    "label": "设备 B",
    "cpuId": "cpu-amd-ryzen-5-5600",
    "gpuId": "gpu-nvidia-geforce-rtx-2060"
  }
]
```

## 5.4 设备比较输出结构

```json
[
  {
    "label": "设备 A",
    "cpuSingleBenchmark": 120,
    "cpuMultiBenchmark": 135,
    "gpuBenchmark": 100,
    "overallBenchmark": 118
  },
  {
    "label": "设备 B",
    "cpuSingleBenchmark": 118,
    "cpuMultiBenchmark": 140,
    "gpuBenchmark": 150,
    "overallBenchmark": 140
  }
]
```

***

## 6. 型号匹配设计

这是整个工具里最关键的部分之一，因为用户输入不会总是标准型号。

## 6.1 匹配流程

建议采用三层匹配：

1. 精确匹配
2. 别名匹配
3. 模糊匹配

例如用户输入：

- `rtx2060`
- `RTX 2060`
- `NVIDIA GeForce RTX2060`

都应命中同一条 GPU 记录。

## 6.2 预处理规则

输入清洗建议：

- 转小写
- 去掉 `intel` / `amd` / `nvidia` / `geforce` / `radeon` 等冗余词时保留原始词典
- 去掉多余空格
- 统一连字符和空格
- 统一 `ti` / `super` / `mobile` / `laptop gpu` 等后缀格式

## 6.3 风险型号

需要特别处理：

- 笔记本 GPU 与桌面 GPU 同名但性能不同
- `Max-Q`
- `Laptop GPU`
- 同一 CPU 不同功耗版本
- 苹果芯片不同核心配置

因此数据表中建议增加：

- `variant`
- `platformType`
- `tdpClass`

***

## 7. 离线架构设计

## 7.1 推荐技术栈

如果你想做纯前端离线工具，推荐：

- 前端：React + TypeScript + Vite
- UI：Ant Design 或者简单原生组件
- 图表：ECharts
- 数据存储：静态 JSON
- 搜索：Fuse.js

理由：

- 打包后是纯静态页面
- 可以直接本地打开或放到内网静态服务器
- Fuse.js 足够处理 CPU/GPU 型号模糊搜索

## 7.2 目录建议

```text
hardware-benchmark/
  public/
    data/
      cpus.json
      gpus.json
      cpu-ladder-single.json
      cpu-ladder-multi.json
      gpu-ladder.json
      benchmark-config.json
  src/
    components/
      SearchCompareCard.tsx
      CpuLadderCard.tsx
      GpuLadderCard.tsx
      CompareTable.tsx
      ScoreChart.tsx
    pages/
      HomePage.tsx
    services/
      benchmark.ts
      matcher.ts
      ladder.ts
    types/
      hardware.ts
```

## 7.3 核心模块

### 数据加载模块

- 读取本地 JSON
- 建立索引
- 初始化别名字典

### 型号匹配模块

- 输入清洗
- 模糊检索
- 候选项排序

### 评分计算模块

- 读取基准配置
- 计算 CPU / GPU Benchmark
- 计算综合分

### 比较展示模块

- 最多 4 台设备并排
- 表格
- 条形图
- 差异说明

### 天梯图模块

- 读取 CPU / GPU Top100 数据
- 支持 CPU 单核和多核双榜展示
- 高亮当前检索或比较中的硬件
- 支持按排名和分数展示

***

## 8. 页面设计

## 8.1 首页

首页固定为 3 个主要卡片：

1. 检索和比较卡片
2. CPU 天梯图卡片
3. GPU 天梯图卡片

布局建议：

- 第一屏优先展示 3 个核心卡片
- 桌面端采用纵向三卡片布局
- CPU 天梯图卡片内部再拆成左右两栏
- 移动端则改为单列堆叠

## 8.2 检索和比较卡片

这是首页第一张主卡片，承担硬件检索、匹配、比较和结果展示。

卡片内建议包含：

- 基准配置区
- 设备输入区
- 对比结果区

允许设置：

- CPU 单核基准型号
- CPU 多核基准型号
- GPU 基准型号
- 综合分权重

默认建议：

- CPU 单核基准：`Intel Core i7-8700`
- CPU 多核基准：`AMD Ryzen 5 3600`
- GPU 基准：`GeForce GTX 1060`

也可以更简单：

- 直接固定一套默认基准
- 高级设置中再开放修改

设备输入区建议提供 4 组输入卡片：

- 设备名称
- CPU 输入框
- GPU 输入框
- 自动补全候选列表

支持：

- 增加设备
- 删除设备
- 一键填充示例
- 一键交换比较顺序

对比结果区建议包含 3 个视图：

1. 汇总卡片
2. 表格
3. 图表

汇总卡片显示：

- 每台设备总分
- 排名
- 相对第一名的差距

表格显示：

- CPU 单核
- CPU 多核
- GPU
- 综合分

图表显示：

- 柱状图对比
- 关键倍率说明

## 8.3 CPU 天梯图卡片

这是首页第二张主卡片。

布局要求：

- 左侧显示 CPU 单核天梯图
- 右侧显示 CPU 多核天梯图
- 两侧都展示 Top100

每一侧建议显示：

- 排名
- CPU 型号
- 原始分数
- 归一化 Benchmark 分数

交互建议：

- 支持搜索框快速定位某个 CPU
- 支持高亮当前比较中的 CPU
- 支持切换显示“原始分数 / Benchmark 分数”
- 支持点击某一行后加入比较卡片

数据规则建议：

- 单核榜使用 `singleThreadMark` 或等价字段排序
- 多核榜使用 `cpuMark` 或等价字段排序
- 只保留前 100 名，生成独立离线 JSON

## 8.4 GPU 天梯图卡片

这是首页第三张主卡片。

展示要求：

- 展示 GPU Top100
- 按 GPU 综合性能分排序
- 每一行显示排名、型号、原始分数、Benchmark 分数

交互建议：

- 支持搜索定位
- 支持高亮当前比较中的 GPU
- 支持点击加入比较
- 支持显示相对基准卡的百分比

数据规则建议：

- GPU 榜单默认按 `g3dMark` 或等价综合分排序
- 只保留前 100 名，生成独立离线 JSON

## 8.5 首页卡片之间的联动

建议支持以下联动：

- 在天梯图中点击某个 CPU / GPU，可直接填入检索和比较卡片
- 检索命中的 CPU / GPU 在天梯图里自动高亮
- 比较中的 1\~4 套设备，在天梯图中用不同颜色标记
- 鼠标悬停天梯图项时，显示与基准卡的倍率说明

## 8.6 天梯图展示建议

为了兼顾可读性和性能，建议：

- 默认显示前 20 条，其余内容通过滚动查看
- 右侧固定显示当前高亮硬件的信息
- 长型号做省略显示，但悬停时展示完整名称
- 使用虚拟列表，避免 Top100 全量渲染造成卡顿

## 8.7 首页线框图

下面给出桌面端首页线框图，按你当前确认的“三卡片首页”组织：

```text
+--------------------------------------------------------------------------------------------------+
| Header                                                                                           |
| [Logo / 产品名]                                              [数据版本] [更新时间] [帮助说明]   |
+--------------------------------------------------------------------------------------------------+
| Search & Compare Card                                                                            |
|--------------------------------------------------------------------------------------------------|
| 基准设置: [CPU单核基准 v] [CPU多核基准 v] [GPU基准 v] [权重设置] [重置默认]                    |
|--------------------------------------------------------------------------------------------------|
| 设备 A: [名称________] [CPU搜索____________________] [GPU搜索____________________] [删除]       |
| 设备 B: [名称________] [CPU搜索____________________] [GPU搜索____________________] [删除]       |
| 设备 C: [名称________] [CPU搜索____________________] [GPU搜索____________________] [删除]       |
| 设备 D: [名称________] [CPU搜索____________________] [GPU搜索____________________] [删除]       |
| [新增设备] [填充示例] [交换顺序]                                                                 |
|--------------------------------------------------------------------------------------------------|
| 汇总结果                                                                                         |
| [设备A 总分/排名] [设备B 总分/排名] [设备C 总分/排名] [设备D 总分/排名]                         |
|--------------------------------------------------------------------------------------------------|
| 对比表格                                                                                         |
| 指标          设备A        设备B        设备C        设备D                                       |
| CPU单核       xxx          xxx          xxx          xxx                                         |
| CPU多核       xxx          xxx          xxx          xxx                                         |
| GPU           xxx          xxx          xxx          xxx                                         |
| 综合分        xxx          xxx          xxx          xxx                                         |
|--------------------------------------------------------------------------------------------------|
| 对比图表                                                                                         |
| [CPU单核柱状图] [CPU多核柱状图] [GPU柱状图] [综合分柱状图]                                       |
+--------------------------------------------------------------------------------------------------+
| CPU Ladder Card                                                                                  |
|--------------------------------------------------------------------------------------------------|
| [CPU搜索________________] [显示原始分数/Benchmark切换]                                           |
|--------------------------------------------------------------------------------------------------|
| Single Core Top100                     | Multi Core Top100                                       |
| Rank  Model                    Score   | Rank  Model                    Score                    |
| 1     xxxxxxxxxxxxxxxxx        xxxx    | 1     xxxxxxxxxxxxxxxxx        xxxx                     |
| 2     xxxxxxxxxxxxxxxxx        xxxx    | 2     xxxxxxxxxxxxxxxxx        xxxx                     |
| ...                                ... | ...                                ...                  |
| 100   xxxxxxxxxxxxxxxxx        xxxx    | 100   xxxxxxxxxxxxxxxxx        xxxx                     |
+--------------------------------------------------------------------------------------------------+
| GPU Ladder Card                                                                                  |
|--------------------------------------------------------------------------------------------------|
| [GPU搜索________________] [显示原始分数/Benchmark切换]                                           |
|--------------------------------------------------------------------------------------------------|
| Rank  Model                                      Score                                            |
| 1     xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx         xxxx                                             |
| 2     xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx         xxxx                                             |
| ...                                                ...                                             |
| 100   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx         xxxx                                             |
+--------------------------------------------------------------------------------------------------+
```

如果做成更贴近真实产品的桌面端布局，建议：

- 第一张卡片高度最高，承担主要输入和结果展示
- 第二张卡片横向分为左右两栏，分别显示 CPU 单核 / 多核
- 第三张卡片使用整宽列表，避免 GPU 型号过长导致拥挤

## 8.8 移动端线框图

移动端建议改为单列堆叠：

```text
+--------------------------------------+
| Header                               |
+--------------------------------------+
| Search & Compare Card                |
| 基准设置折叠区                        |
| 设备A 输入                            |
| 设备B 输入                            |
| 设备C 输入                            |
| 设备D 输入                            |
| 汇总结果卡片                          |
| 对比表格（横向滚动）                  |
| 对比图表                              |
+--------------------------------------+
| CPU Ladder Card                      |
| [切换: 单核 | 多核]                  |
| Top100 列表                           |
+--------------------------------------+
| GPU Ladder Card                      |
| Top100 列表                           |
+--------------------------------------+
```

移动端注意事项：

- 对比表格允许横向滚动
- CPU 双榜不要并排，改成 tab 切换
- 设备输入项建议折叠，避免首页过长

## 8.9 组件层级

推荐页面组件层级如下：

```text
HomePage
├─ PageHeader
│  ├─ Brand
│  ├─ DataVersionTag
│  └─ HelpEntry
├─ SearchCompareCard
│  ├─ BaseConfigPanel
│  │  ├─ CpuSingleBaseSelector
│  │  ├─ CpuMultiBaseSelector
│  │  ├─ GpuBaseSelector
│  │  └─ WeightConfigPanel
│  ├─ DeviceCompareForm
│  │  ├─ DeviceSlotCard x 1..4
│  │  │  ├─ DeviceNameInput
│  │  │  ├─ CpuSearchInput
│  │  │  ├─ CpuSuggestionList
│  │  │  ├─ GpuSearchInput
│  │  │  └─ GpuSuggestionList
│  │  └─ FormActionBar
│  ├─ CompareSummary
│  │  └─ SummaryMetricCard x 1..4
│  ├─ CompareTable
│  └─ ScoreChartGroup
│     ├─ CpuSingleChart
│     ├─ CpuMultiChart
│     ├─ GpuChart
│     └─ OverallChart
├─ CpuLadderCard
│  ├─ CpuLadderToolbar
│  │  ├─ CpuLadderSearch
│  │  └─ ScoreModeSwitch
│  ├─ CpuSingleLadderPanel
│  │  └─ LadderList
│  └─ CpuMultiLadderPanel
│     └─ LadderList
└─ GpuLadderCard
   ├─ GpuLadderToolbar
   │  ├─ GpuLadderSearch
   │  └─ ScoreModeSwitch
   └─ GpuLadderPanel
      └─ LadderList
```

## 8.10 状态层级

为了避免后续状态混乱，建议把状态按 3 层管理：

### 页面级状态

- 当前比较的设备列表
- 当前基准配置
- 当前高亮硬件
- 当前图表显示模式

### 卡片级状态

- 搜索框输入值
- 自动补全候选
- 天梯图搜索关键字
- 当前榜单滚动位置

### 派生状态

- 设备比较结果
- 当前榜单高亮项
- Top100 过滤结果
- 当前倍率说明文案

## 8.11 组件职责边界

建议把职责划清楚，避免组件过胖：

- `HomePage` 只负责组装页面和管理全局状态
- `SearchCompareCard` 负责输入、匹配、比较和结果展示
- `CpuLadderCard` 只负责 CPU 双榜展示和点击回填
- `GpuLadderCard` 只负责 GPU 榜单展示和点击回填
- `CompareTable` 只负责结果表格，不负责计算
- `ScoreChartGroup` 只负责图表渲染，不直接处理匹配逻辑
- `matcher.ts` 只负责型号清洗、别名命中和模糊匹配
- `benchmark.ts` 只负责评分计算和倍率文案生成
- `ladder.ts` 只负责 Top100 榜单读取、排序、过滤和高亮

***

## 9. 数据更新流程

## 9.1 构建期流程

建议单独做一套数据构建脚本：

```text
采集原始数据
-> 清洗字段
-> 型号归一化
-> 合并多源
-> 生成 normalizedScores
-> 生成 Top100 榜单
-> 输出 cpus.json / gpus.json / cpu-ladder-single.json / cpu-ladder-multi.json / gpu-ladder.json
```

## 9.2 更新频率

建议：

- 初期：手动更新
- 后期：每月更新一次

因为这个工具是离线工具，不需要每天更新。

## 9.3 版本控制

建议给数据包加版本号：

```json
{
  "version": "2026.04",
  "gpuBaseModel": "GeForce GTX 1060",
  "cpuSingleBaseModel": "Intel Core i7-8700",
  "cpuMultiBaseModel": "AMD Ryzen 5 3600"
}
```

***

## 10. 风险与注意事项

## 10.1 数据授权

这类 benchmark 网站的数据通常不应直接默认视为可自由再分发。

建议：

- 第一阶段先做内部工具 / 原型
- 落产品前核对各数据源许可
- 必要时保留“来源字段”和“更新时间”

## 10.2 同型号不同表现

真实硬件表现会受到以下影响：

- 笔记本散热
- 功耗限制
- 驱动版本
- 内存频率
- 双通道 / 单通道

所以工具应该明确说明：

- 输出的是“型号理论基准”
- 不是用户当前机器的实时实测结果

## 10.3 GPU 分数语义

GPU 可能同时存在：

- 图形渲染能力
- 计算能力

第一版建议只保留一个综合 GPU 分数，避免概念过多。

***

## 11. MVP 范围建议

第一版建议只做以下功能：

1. 内置 CPU / GPU 离线数据表
2. 支持输入型号自动补全
3. 支持最多 4 台设备比较
4. 输出 CPU 单核 / 多核 / GPU / 综合分
5. 支持自定义基准型号
6. 首页展示 CPU 单核 Top100 / 多核 Top100 / GPU Top100 天梯图

不要在第一版做：

- 在线抓取
- 用户上传跑分
- 实时硬件检测
- 太复杂的场景权重模板

***

## 12. 推荐实施顺序

### 阶段 1：设计验证

- 确认主数据源
- 确认基准型号
- 确认评分公式

### 阶段 2：数据层

- 建立 `cpus.json`
- 建立 `gpus.json`
- 建立别名字典

### 阶段 3：前端 MVP

- 输入
- 自动补全
- 评分计算
- 对比表格和图表

### 阶段 4：增强

- 增加更多别名规则
- 增加笔记本型号区分
- 增加场景权重模板

***

## 13. 最终建议

如果你的目标是“先做出一个实用、可信、能离线跑的版本”，最佳路径是：

1. 以 PassMark 作为主评分来源。
2. CPU 增加 Geekbench 作为补充校验。
3. 先定义固定基准，例如 `GTX 1060 = 100`。
4. 在离线 JSON 中提前计算好 normalized 分数。
5. 前端只负责匹配、计算综合分、展示比较结果。

这样第一版的复杂度最低，同时可扩展性最好。

***

## 14. 下一步可直接做的事

我可以继续帮你做下面任意一个步骤：

1. 直接搭一个 React + Vite 的离线前端原型。
2. 先定义 `cpus.json` / `gpus.json` 的最终字段规范。
3. 先写一份数据采集与清洗脚本设计。
4. 直接给你做一个可比较 4 台设备的页面 Demo。

