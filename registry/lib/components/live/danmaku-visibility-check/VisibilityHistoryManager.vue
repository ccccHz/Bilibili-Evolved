<template>
  <transition name="visibility-manager">
    <aside v-if="open" class="visibility-history-manager" @click.stop>
      <header>
        <div>
          <h2>弹幕可见性记录</h2>
          <div class="subtitle">本地 IndexedDB · {{ records.length }} 条检测记录</div>
        </div>
        <button class="icon-button" type="button" title="关闭" @click="close">×</button>
      </header>

      <div class="toolbar">
        <input v-model.trim="search" type="search" placeholder="搜索正文、房间号、备注" />
        <select v-model="outcomeFilter">
          <option value="all">全部结果</option>
          <option value="suspected">仍疑似屏蔽</option>
          <option value="observed-late">迟到已撤回</option>
        </select>
        <select v-model="tagFilter">
          <option value="all">全部标签</option>
          <option v-for="tag in tagOptions" :key="tag.value" :value="tag.value">
            {{ tag.text }}
          </option>
        </select>
      </div>

      <div class="actions">
        <button type="button" @click="downloadJson">导出 JSON</button>
        <button type="button" @click="$refs.fileInput.click()">导入 JSON</button>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="application/json,.json"
          @change="importJson"
        />
        <button class="danger" type="button" :disabled="records.length === 0" @click="clearAll">
          清空全部
        </button>
      </div>

      <div v-if="message" :class="['message', messageType]">{{ message }}</div>

      <div v-if="filteredRecords.length === 0" class="empty">没有符合条件的记录</div>
      <div v-else class="record-list">
        <article v-for="record in filteredRecords" :key="record.id" class="record-card">
          <div class="record-heading">
            <div class="content">「{{ record.content }}」</div>
            <span :class="['outcome', `outcome-${record.outcome}`]">
              {{ outcomeText(record) }}
            </span>
          </div>
          <div class="metadata">
            {{ formatTime(record.recordedAt) }} · 房间 {{ record.roomId ?? '--' }} · 提示窗口
            {{ record.windowMs }}ms
            <template v-if="record.observedLatencyMs !== null">
              · 实际出现 {{ record.observedLatencyMs }}ms
            </template>
          </div>

          <div class="tag-list">
            <button
              v-for="tag in record.tags"
              :key="tag"
              type="button"
              :title="`移除「${tagText(tag)}」`"
              @click="removeTag(record.id, tag)"
            >
              {{ tagText(tag) }} ×
            </button>
          </div>
          <div class="tag-editor">
            <select v-model="selectedTags[record.id]">
              <option value="">添加标签…</option>
              <option v-for="tag in availableTags(record)" :key="tag.value" :value="tag.value">
                {{ tag.text }}
              </option>
            </select>
            <button type="button" :disabled="!selectedTags[record.id]" @click="addTag(record.id)">
              添加
            </button>
          </div>
          <textarea
            :value="record.note"
            rows="2"
            placeholder="复测房间、次数或其他备注（失焦时保存）"
            @change="saveNote(record.id, $event.target.value)"
          ></textarea>
        </article>
      </div>
    </aside>
  </transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import {
  clearFailureHistory,
  DanmakuVisibilityFailureRecord,
  exportFailureHistory,
  getFailureHistory,
  importFailureHistory,
  setFailureNote,
  setFailureTag,
  subscribeFailureHistory,
  VisibilityAttemptTag,
  visibilityAttemptTags,
} from './failure-history'
import {
  closeVisibilityHistoryManager,
  isVisibilityHistoryManagerOpen,
  subscribeVisibilityHistoryManager,
} from './history-manager-store'
import { clearMeasurementHistory } from './measurement-history'

export default defineComponent({
  data() {
    return {
      open: isVisibilityHistoryManagerOpen(),
      records: getFailureHistory() as DanmakuVisibilityFailureRecord[],
      search: '',
      outcomeFilter: 'all' as 'all' | 'suspected' | 'observed-late',
      tagFilter: 'all' as 'all' | VisibilityAttemptTag,
      selectedTags: {} as Record<string, VisibilityAttemptTag | ''>,
      tagOptions: visibilityAttemptTags,
      message: '',
      messageType: 'success' as 'success' | 'error',
      unsubscribeOpen: null as (() => void) | null,
      unsubscribeRecords: null as (() => void) | null,
    }
  },
  computed: {
    filteredRecords(): DanmakuVisibilityFailureRecord[] {
      const query = this.search.toLocaleLowerCase()
      return this.records.filter(record => {
        if (this.outcomeFilter !== 'all' && record.outcome !== this.outcomeFilter) {
          return false
        }
        if (this.tagFilter !== 'all' && !record.tags.includes(this.tagFilter)) {
          return false
        }
        if (!query) {
          return true
        }
        return [record.content, record.note, String(record.roomId ?? '')].some(value =>
          value.toLocaleLowerCase().includes(query),
        )
      })
    },
  },
  mounted() {
    this.unsubscribeOpen = subscribeVisibilityHistoryManager(open => {
      this.open = open
    })
    this.unsubscribeRecords = subscribeFailureHistory(records => {
      this.records = records
    })
  },
  beforeDestroy() {
    this.unsubscribeOpen?.()
    this.unsubscribeRecords?.()
  },
  methods: {
    close() {
      closeVisibilityHistoryManager()
    },
    outcomeText(record: DanmakuVisibilityFailureRecord) {
      return record.outcome === 'observed-late' ? '迟到出现 · 已撤回' : '疑似屏蔽 · 待复核'
    },
    tagText(tag: VisibilityAttemptTag) {
      return this.tagOptions.find(option => option.value === tag)?.text ?? tag
    },
    availableTags(record: DanmakuVisibilityFailureRecord) {
      return this.tagOptions.filter(option => !record.tags.includes(option.value))
    },
    formatTime(value: number) {
      return new Date(value).toLocaleString()
    },
    async addTag(id: string) {
      const tag = this.selectedTags[id]
      if (!tag) {
        return
      }
      await setFailureTag(id, tag, true)
      this.$set(this.selectedTags, id, '')
    },
    removeTag(id: string, tag: VisibilityAttemptTag) {
      setFailureTag(id, tag, false).catch(error => {
        this.messageType = 'error'
        this.message = String(error)
      })
    },
    saveNote(id: string, note: string) {
      setFailureNote(id, note).catch(error => {
        this.messageType = 'error'
        this.message = String(error)
      })
    },
    downloadJson() {
      const blob = new Blob([exportFailureHistory()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `bilibili-danmaku-visibility-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    async importJson(event: Event) {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = ''
      if (!file) {
        return
      }
      try {
        const count = await importFailureHistory(await file.text())
        this.messageType = 'success'
        this.message = `已导入 ${count.failureCount} 条疑似记录、${count.measurementCount} 条测量样本`
      } catch (error) {
        this.messageType = 'error'
        this.message = String(error)
      }
    },
    async clearAll() {
      if (!window.confirm('确定清空全部疑似记录、标签和测量样本吗？此操作不可撤销。')) {
        return
      }
      await Promise.all([clearFailureHistory(), clearMeasurementHistory()])
      this.messageType = 'success'
      this.message = '记录已清空'
    },
  },
})
</script>

<style lang="scss" scoped>
@import 'common';

.visibility-history-manager {
  position: fixed;
  z-index: 100001;
  top: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(560px, calc(100vw - 24px));
  padding: 16px;
  overflow: hidden;
  border: 1px solid #ffffff24;
  border-radius: 10px;
  color: #eee;
  background: #202124f5;
  box-shadow: 0 12px 40px #0009;
  font-size: 13px;

  header,
  .toolbar,
  .actions,
  .record-heading,
  .tag-editor {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  header {
    justify-content: space-between;
    margin-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  .subtitle,
  .metadata,
  .empty {
    color: #aaa;
  }

  button,
  input,
  select,
  textarea {
    box-sizing: border-box;
    border: 1px solid #ffffff24;
    border-radius: 5px;
    color: inherit;
    background: #ffffff0d;
    font: inherit;
    outline: none;
  }

  button {
    padding: 5px 9px;
    cursor: pointer;

    &:disabled {
      cursor: default;
      opacity: 0.5;
    }
  }

  .icon-button {
    border: 0;
    background: transparent;
    font-size: 26px;
  }

  .toolbar {
    input {
      flex: 1;
      min-width: 120px;
    }

    input,
    select {
      min-height: 30px;
      padding: 4px 7px;
    }
  }

  .actions {
    margin: 8px 0;

    .danger {
      margin-left: auto;
      color: #ff8a80;
    }
  }

  .file-input {
    display: none;
  }

  .message {
    margin-bottom: 8px;
    padding: 6px 8px;
    border-radius: 5px;
  }

  .success {
    color: #a5d6a7;
    background: #2e7d3233;
  }

  .error {
    color: #ef9a9a;
    background: #c6282833;
  }

  .record-list {
    flex: 1;
    overflow: auto;
  }

  .record-card {
    margin-bottom: 8px;
    padding: 10px;
    border: 1px solid #ffffff1a;
    border-radius: 7px;
    background: #ffffff08;
  }

  .record-heading {
    justify-content: space-between;
  }

  .content {
    overflow-wrap: anywhere;
    font-size: 14px;
    @include semi-bold();
  }

  .outcome {
    flex: none;
    font-size: 11px;
  }

  .outcome-suspected {
    color: #ffab91;
  }

  .outcome-observed-late {
    color: #a5d6a7;
  }

  .metadata {
    margin: 4px 0 8px;
    font-size: 11px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 6px;

    button {
      padding: 2px 6px;
      color: #90caf9;
      background: #1976d233;
      font-size: 11px;
    }
  }

  .tag-editor {
    margin-bottom: 6px;

    select {
      flex: 1;
      min-height: 28px;
      padding: 3px 6px;
    }
  }

  textarea {
    width: 100%;
    padding: 6px;
    resize: vertical;
  }

  .empty {
    padding: 30px 0;
    text-align: center;
  }
}

.visibility-manager-enter-active,
.visibility-manager-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.visibility-manager-enter,
.visibility-manager-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

@media (max-width: 640px) {
  .visibility-history-manager {
    .toolbar {
      align-items: stretch;
      flex-direction: column;
    }
  }
}
</style>
