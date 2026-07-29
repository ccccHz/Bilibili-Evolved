# 弹幕可见性：延迟与屏蔽测试记录

本文件记录的是可复跑的测试方法，不维护“永久有效的 B 站屏蔽词表”。直播间、账号、时间、
活动状态和平台策略都可能改变结果；一次未观察到只表示独立公开流在窗口内没有收到，不能单独
证明账号受限。

## 当前临时基线（2026-07-29）

- 房间：`11192805`
- 样本：正常短数字弹幕 `3` 至 `12`，相邻发送约 4 秒。
- 观察窗口：测试专用 10 秒；10/10 在独立观察流中命中。
- 端到端延迟（ms）：`737, 423, 1324, 813, 1680, 1015, 572, 1441, 908, 1891`
- P50：1015ms；P95：1891ms；最大值：1891ms。
- 临时生产回退：2200ms（P95 + 300ms，向上取整到 100ms）。

这只是单房间、单次、10 条正常样本。它解释了原 1500ms 窗口的误报风险：本轮已有 2/10
正常样本超过 1500ms；不能据此推断所有直播间都应使用同一窗口。

## 两类样本必须分开

| 类别 | 目的 | 是否计入延迟窗口 |
| --- | --- | --- |
| `normal` | 估计“正常可见弹幕”的传播尾延迟 | 是，仅计入已观察到的样本 |
| `known-blocked` | 检验模块能否提示疑似未公开显示 | 否 |

用户已在近期实测仍可能触发未公开显示的候选词：`巴拿马`、`包子`。它们应仅作为
`known-blocked` 的复测候选，而不是在代码中硬编码成词库或自动处罚规则。

## 建议的复测协议

1. 先确认控制台依次出现 `starting`、`send context ready`、`observer ready`、
   `send capture ready`。
2. 用 20 条正常、互不重复且无敏感语义的短文本，间隔 4–8 秒发送；记录模块输出的
   `send-latency-test` JSON。高并发连续发送会把发送频率限制、排队和内容碰撞混入数据。
3. 另用 2–3 条候选高风险词，每条只测一次，并标为 `known-blocked`。不要将其延迟或超时
   混入正常样本。
4. 在至少 3 个直播间、不同时间段各完成一轮。报告要保留房间、日期、发送间隔、观察连接状态。
5. 用本目录脚本计算正常样本 P95 + 余量；若正常样本未观察到比例持续偏高，先检查
   observer 状态与页面结构，不能直接继续增大窗口。

## 数据与脚本

保存一个本地 JSON 文件（不提交账号信息或 Cookie）：

```json
[
  { "content": "normal-01", "category": "normal", "status": "observed", "latencyMs": 1891 },
  { "content": "normal-02", "category": "normal", "status": "not-observed" },
  { "content": "巴拿马", "category": "known-blocked", "status": "not-observed" }
]
```

运行：

```bash
node analyze-send-latency.mjs samples.json --margin=300
```

脚本只分析本地 JSON，绝不发弹幕。窗口推荐只用 `normal` 且 `observed` 的样本；
`known-blocked` 的作用是监控检测的预期命中率。

## 外部资料（仅作候选来源）

- [FHChen0420/bili_live_shield_words 的历史脚本](https://github.com/FHChen0420/bili_live_shield_words/blob/main/BiliLiveShieldWords.py)：包含大量历史候选与规避处理，不能反映实时策略。
- [甜品站的历史收集页](https://www.isndes.com/ms?t=496)：可作线索，页面和词条时效需实测验证。
- [B 站直播服务协议](https://live.bilibili.com/p/html/live-app-help/index.html)：平台规则会随版本更新，不能从历史词表推出当前行为。

近期公开报道仍能看到特定直播间按房间/赛事语境过滤特定 ID 的个案；这支持“策略可能是动态且房间相关”的工作假设，但不构成任何词条在全站、长期有效的证明。
