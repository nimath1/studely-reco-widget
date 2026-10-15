<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 15 15"
    fill="none"
    stroke="currentColor"
    stroke-width="1.25"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M8.75 5.625C8.75 5.95652 8.6183 6.27446 8.38388 6.50888C8.14946 6.7433 7.83152 6.875 7.5 6.875H3.75L1.25 9.375V2.5C1.25 2.16848 1.3817 1.85054 1.61612 1.61612C1.85054 1.3817 2.16848 1.25 2.5 1.25H7.5C7.83152 1.25 8.14946 1.3817 8.38388 1.61612C8.6183 1.85054 8.75 2.16848 8.75 2.5V5.625Z"
    />
    <path
      d="M11.25 5.625H12.5C12.8315 5.625 13.1495 5.7567 13.3839 5.99112C13.6183 6.22554 13.75 6.54348 13.75 6.875V13.75L11.25 11.25H7.5C7.16848 11.25 6.85054 11.1183 6.61612 10.8839C6.3817 10.6495 6.25 10.3315 6.25 10V9.375"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
</script>
