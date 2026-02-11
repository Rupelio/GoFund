<script setup>
import { useAppStore } from '../../stores/app.js'

const app = useAppStore()
</script>

<template>
  <!-- Exact same HTML from legacy index.html lines 93-107 -->
  <header class="topbar">
    <div class="month-picker-wrap">
      <button class="icon-btn" type="button" @click="app.prevMonth">&lt;</button>
      <input type="month" :value="app.currentMonth" @input="app.setMonth($event.target.value)"/>
      <button class="icon-btn" type="button" @click="app.nextMonth">&gt;</button>
    </div>
    <div class="topbar-actions">
      <slot name="actions" />
    </div>
  </header>
  <p v-if="app.message" :class="['status-message', app.messageType === 'error' ? 'error' : app.messageType === 'success' ? 'success' : '']" role="status" aria-live="polite">{{ app.message }}</p>
</template>
