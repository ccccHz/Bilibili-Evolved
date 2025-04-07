<!-- live-skin-normal-text 是darkmode设置的style -->
<template>
  <div class="live-data">
    <div class="live-data live-skin-normal-text">
      房间观众(<span class="live-data__item-value viewer">{{ viewer }}) </span>

      大航海(<span class="live-data__item-value pilot">{{ pilot }})</span>
    </div>
  </div>
</template>

<script lang="ts">
import { select } from '@/core/spin-query'
import { dq } from '@/core/utils'

export default Vue.extend({
  data() {
    return {
      viewer: 0,
      pilot: 0,
    }
  },
  async created() {
    await this.fetchData(
      '.rank-list-section .tabs .tab-list .item:nth-of-type(1)',
      '房间观众',
      'viewer',
    )
    await this.fetchData(
      '.rank-list-section .tabs .tab-list .item:nth-of-type(2)',
      '大航海',
      'pilot',
    )
  },
  methods: {
    async fetchData(selector: string, keyword: string, dataKey: string) {
      const element = await select(() => dq(selector))
      console.log(`Element for ${keyword}:`, element)
      if (element) {
        const updateValue = () => {
          console.log(`Updating ${keyword}...`)
          // const regex = new RegExp(`${keyword}\\((\\.+)\\)`)
          const regex = new RegExp(`${keyword}\\(([^)]+)\\)`) // 匹配括号内的任意内容
          const match = element.innerHTML.match(regex)
          this[dataKey] = match ? match[1] : 0
          console.log(`Updated ${keyword}:`, this[dataKey])
        }

        // Initial fetch
        updateValue()

        // Set up MutationObserver
        const observer = new MutationObserver(updateValue)
        observer.observe(element, { childList: true, subtree: true, characterData: true })
      }
    },
  },
})
</script>

<style scoped>
.viewer {
  margin-right: 10px; /* Adjust the spacing as needed */
}

.pilot {
}
</style>
