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
      d="M2.83301 13.8125C2.83301 13.3428 3.01958 12.8924 3.35167 12.5603C3.68377 12.2282 4.13419 12.0416 4.60384 12.0416H14.1663"
    />
    <path
      d="M4.60384 1.41663H14.1663V15.5833H4.60384C4.13419 15.5833 3.68377 15.3967 3.35167 15.0646C3.01958 14.7325 2.83301 14.2821 2.83301 13.8125V3.18746C2.83301 2.71781 3.01958 2.26739 3.35167 1.93529C3.68377 1.6032 4.13419 1.41663 4.60384 1.41663Z"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 17 })
</script>
