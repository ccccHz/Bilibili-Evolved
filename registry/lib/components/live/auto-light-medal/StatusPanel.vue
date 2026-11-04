<template>
  <div class="medal-lighting-status">
    <p>{{ state.message }}</p>
    <p v-if="state.total">本次点赞：{{ state.clicks }} / {{ state.total }}</p>
    <div>
      <VButton v-if="state.busy" @click="actions.cancel">停止本次</VButton>
      <VButton v-else @click="actions.check">重新检查</VButton>
    </div>
    <p class="note">仅当前可见房间；同一房间每天最多自动尝试一次。仅完成免费点赞任务。</p>
  </div>
</template>
<script setup lang="ts">
import { VButton } from '@/ui'
import { lightingState as state, lightingActions as actions } from './state'
</script>
<style lang="scss" scoped>
.medal-lighting-status {
  p {
    margin: 8px 0;
  }
  .note {
    opacity: 0.7;
    line-height: 1.6;
  }
}
</style>
