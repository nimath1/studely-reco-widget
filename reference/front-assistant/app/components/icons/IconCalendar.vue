<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 17 17"
    fill="none"
    stroke="currentColor"
    stroke-width="1.41667"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M13.4583 2.83337H3.54167C2.75926 2.83337 2.125 3.46764 2.125 4.25004V13.4584C2.125 14.2408 2.75926 14.875 3.54167 14.875H13.4583C14.2407 14.875 14.875 14.2408 14.875 13.4584V4.25004C14.875 3.46764 14.2407 2.83337 13.4583 2.83337Z"
    />
    <path d="M5.66667 1.41663V4.24996M11.3333 1.41663V4.24996M2.125 6.37496H14.875" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 17 })
</script>
