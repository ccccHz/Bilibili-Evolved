# 直播弹幕公开可见性检测

实验性 Bilibili Evolved 组件.

当前阶段只验证以下能力:

- 使用固定版本的 `@laplace.live/ws` 建立浏览器观察连接.
- 等待进入房间事件和首次心跳后再标记为就绪.
- 在组件关闭或重新加载时关闭连接.
- 接收 `DANMU_MSG`, 捕获原发送栏的提交动作, 但不代替用户发送弹幕.
- 按完整正文将提交动作和独立观察流做诊断匹配, 不直接判断弹幕是否受限.
- 使用消息唯一 ID 配对 Laplace 独立流与页面原生弹幕列表, 动态校准匹配窗口.

当前浏览器实测:

- 能通过 Evo Dev Server 以用户组件形式安装.
- 能在登录状态的直播间建立独立观察连接并输出
  `liveDanmakuVisibilityCheck Laplace observer ready`.
- 已兼容纯净直播网址 `/blanc/<roomId>` 的房间号解析.
- 当前直播页把发送栏放在 `/blanc/<roomId>` iframe 中. 组件只在该 iframe
  运行, 因此既能捕获真实发送动作, 又不会在顶层页面重复建立连接.
- 能从 Laplace 通用 `msg` 事件识别 `DANMU_MSG` 及带后缀的
  `DANMU_MSG:*` 命令.
- 已实测收到的消息能解析正文、时间戳和消息 ID.
- 发送者 UID 不能作为可靠信号: 在房间 7777 的同一匿名观察连接中,
  `info[2][0]` 和 `info[0][15].user.uid` 可能同时为 0; 也有少量消息仍返回旧位置 UID.
- 独立匿名连接的 `extra.send_from_me` 为 `false`, 因此它也不能直接识别当前用户.
- 当前发送栏选择器已在真实页面确认, 控制台会输出 `send capture ready`.
- 早期版本把 `mousedown` 直接绑定到发送按钮, 会漏掉 Evo 自定义发送栏的
  `sendButton.click()` 和按钮节点被页面重绘替换的情况. 当前改为 iframe
  `document` 捕获阶段的事件委托, 覆盖原生按钮点击、程序化点击、原生输入框 Enter
  和 Evo 自定义发送栏 Enter.

诊断日志:

- `diagnostic sample`: 最多输出前三条样本, 用户名打码且不输出原始消息.
- `diagnostic summary`: 首条消息和之后每 30 秒输出收到数、解析数、带 UID 数
  以及各种身份来源、消息 ID、发送捕获和匹配计数.
- `own danmaku observed`: 独立观察流收到当前登录 UID 的弹幕时输出.
- `send captured`: 捕获到点击发送或按 Enter 时的正文快照.
- `send interaction detected`: 低层发送动作已被事件委托捕获; 只输出来源和
  `hasContent`, 不输出正文. 用于区分事件未触发与正文读取失败.
- `latency calibration`: 输出独立流与页面原生弹幕列表的配对数量、P50、P95
  以及当前动态窗口.
- `captured danmaku observed`: 动态窗口内在独立观察流中收到相同正文. 登录昵称通过
  Evo `getUserInfo()` 获取, 日志中的 `nicknameEvidence` 只作为辅助证据.
- `captured danmaku not observed within diagnostic window`: 动态窗口内未收到相同正文.
  这只表示“未观察到”, 不等同于“被屏蔽”.
- 超时且观察连接仍为 `ready` 时, 使用 Evo `Toast.mini` 在弹幕输入框附近显示
  `「弹幕内容」可能被屏蔽`; 观察连接不可用时显示“无法判断弹幕可见性”.
  提示持续约 3 秒, 连续提示会替换上一条而不堆叠.
- mini Toast 优先锚定当前聚焦的原生或 Evo 弹幕输入框, 使用 `top-start`
  显示在输入区域上方. 独立暖橙红主题提供白字、描边和阴影, 不影响其他 Evo Toast.

已知限制:

- Evo Local 已升级到 TypeScript 5.8.3, 但 Laplace 8.0.3 当前的内部包仍声明
  TypeScript 7 peer 依赖. 因此运行时导入继续隔离在 `laplace-runtime.js` 中,
  业务代码使用本地最小接口进行类型检查.
- 浏览器入口不负责获取房间 token 和 WebSocket 地址. 当前配置适配器调用
  `room/v1/Room/mobileRoomInit` 和 `room/v1/Danmu/getConf`.
- Laplace 会把 operation 8 解释为 `live` 事件, 当前额外等待首次心跳来确认连接可用,
  但 operation 8 的错误码核验仍保留为后续 TODO.
- 纯正文匹配在高流量房间存在同文碰撞的理论风险. 当前“动态短窗口 + 完整正文”
  已作为宽松主规则; 昵称精确、打码前后缀或前缀匹配只增加诊断置信度, 不否决正文命中.
  生产判定还需结合发送接口成功响应和消息 ID 评估.
- 双流延迟样本只保留最近 120 对, 用于判断独立 socket 相对页面原生流是否健康;
  它不直接作为发送窗口, 因为不包含发送请求和服务器发布耗时.
- 真正的动态窗口使用“点击发送到独立流收到同正文”的端到端耗时, 保留最近
  30 个成功样本. 有有效样本后使用 `sendEndToEndP95 + 100ms`,
  并向上取整到 100ms.
- 端到端样本缺失、不是有限数字、为负数或 P95 超过 1400ms 时,
  回退为经验值 1500ms.
- 房间 7777 的双流健康校准已得到 36–116ms 的绝对延迟 P95;
  动态发送窗口仍需通过下一条真实发送取得首个端到端样本.
- 观察身份和“公开流是否代表其他观众”语义尚未完成验证.

后续 TODO:

- 用一条独特的真实弹幕完成 `send captured` 到
  `captured danmaku observed` 的端到端验证.
- 捕获发送接口的成功/失败响应, 避免把“页面尝试发送但接口失败”误计为公开流缺失.
- 评估同文碰撞, 并确定正文、时间戳、消息 ID 能否形成足够可靠的匹配策略.
- 将结果定义为“公开流已观察到 / 未观察到但不能确定原因 / 观察连接不可用”,
  不把单次超时直接表述为封禁.
- 验证组件关闭、重载和页面退出后连接及心跳完全清理.
- 当前功能验证完成后, 将当前 Evo Local 工作目录从 2.9.5 升级到上游 2.11.0,
  保留并迁移日常使用的本地组件, 再进行编译和浏览器回归测试.
