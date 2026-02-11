<script setup>
const legacyUrl = '/legacy/index.html'
</script>

<template>
  <main class="legacy-host">
    <iframe
      class="legacy-frame"
      :src="legacyUrl"
      title="GoFund Legacy"
      loading="eager"
      referrerpolicy="strict-origin-when-cross-origin"
    />
  </main>
</template>
