<template>
  <div class="diagnostics-panel">
    <div class="panel-title">检测窗口与测量</div>
    <div class="status-row">
      <span>观察连接</span>
      <span :class="['status', `status-${state.observerStatus}`]">{{ observerStatusText }}</span>
    </div>
    <div class="metric-grid">
      <span>当前生效窗口</span><strong>{{ formatMs(state.effectiveWindowMs) }}</strong>
      <span>窗口来源</span><strong>{{ windowStateText }}</strong> <span>发送匹配</span
      ><strong>{{ state.matchedSends }}/{{ state.capturedSends }}</strong>
      <span>提示 / 后台观察</span
      ><strong>{{ state.timedOutSends }} / {{ state.latePendingSends }}</strong>
      <span>迟到回撤</span><strong>{{ state.lateMatchedSends }}</strong>
    </div>

    <div class="section-title">长期测量（跨刷新持久化）</div>
    <div class="metric-grid">
      <span>成功 / 迟到 / 未观察</span
      ><strong
        >{{ measurementSummary.observed }} / {{ measurementSummary.observedLate }} /
        {{ measurementSummary.notObserved }}</strong
      >
      <span>P50 / P95 / P99 / Max</span><strong>{{ formatQuad(longTermLatencyQuad) }}</strong>
      <span>建议经验窗口</span><strong>{{ formatMs(measurementSummary.suggestedWindowMs) }}</strong>
    </div>

    <div class="section-title">本次会话：本地发送 → 独立观察流</div>
    <div class="metric-grid">
      <span>成功样本</span><strong>{{ state.sendEndToEndSamples.length }}</strong>
      <span>P50 / P95 / Max</span><strong>{{ formatTriple(sendLatencyTriple) }}</strong>
      <span>本次建议窗口</span><strong>{{ formatMs(state.sessionSuggestedWindowMs) }}</strong>
    </div>
    <div class="samples">{{ formatSamples(state.sendEndToEndSamples) }}</div>

    <div class="section-title">独立观察流 − 页面弹幕流（仅诊断链路）</div>
    <div class="metric-grid">
      <span>消息 ID 配对</span><strong>{{ state.latencyPairs }}</strong>
      <span>P50 / P95 / |P95|</span><strong>{{ formatTriple(observerPageTriple, true) }}</strong>
    </div>
    <div class="samples">{{ formatSamples(state.observerMinusPageSamples, true) }}</div>

    <div v-if="state.lastSendResult" class="last-result">
      最近发送：「{{ truncate(state.lastSendResult.content) }}」
      {{ sendResultText }}
      · {{ formatMs(state.lastSendResult.elapsedMs) }}
    </div>
    <div class="hint">
      当前窗口不会被样本自动改变。建议值在至少 30 个成功样本后按 P99 + 300ms、向上取整到 100ms
      计算，仅供长期调研；提示后仍在后台观察并可自动回撤。
    </div>

    <button class="open-history" type="button" @click="openHistory">
      管理屏蔽词检测记录（{{ failureHistory.length }}）
    </button>
    <div class="hint">管理界面独立于设置侧栏，可对疑似记录复核、打标签、备注和导入导出。</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import {
  DanmakuDiagnosticViewState,
  getDiagnosticViewState,
  subscribeDiagnosticViewState,
} from './diagnostic-store'
import {
  DanmakuVisibilityFailureRecord,
  getFailureHistory,
  subscribeFailureHistory,
} from './failure-history'
import { openVisibilityHistoryManager } from './history-manager-store'
import {
  DanmakuVisibilityMeasurement,
  getMeasurementHistory,
  subscribeMeasurementHistory,
  summarizeMeasurements,
} from './measurement-history'

export default defineComponent({
  data() {
    return {
      state: getDiagnosticViewState() as DanmakuDiagnosticViewState,
      failureHistory: getFailureHistory() as DanmakuVisibilityFailureRecord[],
      measurements: getMeasurementHistory() as DanmakuVisibilityMeasurement[],
      unsubscribe: null as (() => void) | null,
      unsubscribeFailureHistory: null as (() => void) | null,
      unsubscribeMeasurements: null as (() => void) | null,
    }
  },
  computed: {
    observerStatusText(): string {
      return {
        inactive: '未运行',
        starting: '启动中',
        connecting: '连接中',
        ready: '已就绪',
        error: '异常（可手动重试）',
        retrying: '等待重连',
        closing: '关闭中',
        closed: '已关闭',
      }[this.state.observerStatus]
    },
    windowStateText(): string {
      return {
        manual: '手动固定',
        'fixed-experience': '固定经验值',
      }[this.state.sendWindowState]
    },
    measurementSummary() {
      return summarizeMeasurements(this.measurements)
    },
    longTermLatencyQuad(): Array<number | null> {
      return [
        this.measurementSummary.p50Ms,
        this.measurementSummary.p95Ms,
        this.measurementSummary.p99Ms,
        this.measurementSummary.maximumMs,
      ]
    },
    sendLatencyTriple(): Array<number | null> {
      return [
        this.state.sendEndToEndP50Ms,
        this.state.sendEndToEndP95Ms,
        this.state.sendEndToEndMaxMs,
      ]
    },
    observerPageTriple(): Array<number | null> {
      return [
        this.state.observerMinusPageP50Ms,
        this.state.observerMinusPageP95Ms,
        this.state.absoluteLatencyP95Ms,
      ]
    },
    sendResultText(): string {
      return {
        observed: '已匹配',
        'not-observed': '未观察到，后台继续观察',
        'observed-late': '迟到出现，已撤回',
      }[this.state.lastSendResult?.status ?? 'observed']
    },
  },
  mounted() {
    this.unsubscribe = subscribeDiagnosticViewState(state => {
      this.state = state
    })
    this.unsubscribeFailureHistory = subscribeFailureHistory(records => {
      this.failureHistory = records
    })
    this.unsubscribeMeasurements = subscribeMeasurementHistory(records => {
      this.measurements = records
    })
  },
  beforeDestroy() {
    this.unsubscribe?.()
    this.unsubscribeFailureHistory?.()
    this.unsubscribeMeasurements?.()
  },
  methods: {
    formatMs(value: number | null) {
      return value === null ? '--' : `${value}ms`
    },
    formatTriple(values: Array<number | null>, signed = false) {
      return values
        .map(value => {
          if (value === null) {
            return '--'
          }
          return `${signed && value > 0 ? '+' : ''}${value}ms`
        })
        .join(' / ')
    },
    formatQuad(values: Array<number | null>) {
      return values.map(value => (value === null ? '--' : `${value}ms`)).join(' / ')
    },
    formatSamples(values: number[], signed = false) {
      if (values.length === 0) {
        return '暂无样本'
      }
      return values
        .slice(-10)
        .map(value => `${signed && value > 0 ? '+' : ''}${value}`)
        .join(', ')
    },
    truncate(content: string) {
      return content.length > 24 ? `${content.slice(0, 24)}…` : content
    },
    openHistory() {
      openVisibilityHistoryManager()
    },
  },
})
</script>

<style lang="scss" scoped>
@import 'common';

.diagnostics-panel {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #8884;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;

  .panel-title {
    @include semi-bold();
    margin-bottom: 6px;
    font-size: 13px;
  }

  .status-row,
  .metric-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 3px 8px;
    align-items: baseline;

    > :nth-child(even) {
      text-align: right;
      overflow-wrap: anywhere;
    }
  }

  .status {
    @include semi-bold();
  }
  .status-ready {
    color: #43a047;
  }
  .status-error {
    color: #e53935;
  }
  .status-starting,
  .status-connecting {
    color: #fb8c00;
  }

  .section-title {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #8883;
    @include semi-bold();
  }

  .samples,
  .last-result,
  .hint {
    margin-top: 5px;
    overflow-wrap: anywhere;
    color: #888;
  }

  .samples {
    font-family: monospace;
  }

  .open-history {
    width: 100%;
    margin-top: 10px;
    padding: 6px 8px;
    border: 1px solid #8885;
    border-radius: 5px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
}
</style>
