<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M15 3.75C12.775 3.75 10.5999 4.4098 8.74984 5.64597C6.89979 6.88213 5.45785 8.63914 4.60636 10.6948C3.75487 12.7505 3.53209 15.0125 3.96617 17.1948C4.40025 19.3771 5.47171 21.3816 7.04505 22.955C8.61839 24.5283 10.623 25.5998 12.8052 26.0338C14.9875 26.4679 17.2495 26.2451 19.3052 25.3936C21.3609 24.5422 23.1179 23.1002 24.354 21.2502C25.5902 19.4001 26.25 17.225 26.25 15"
    />
    <path d="M26.25 4.375V11.875H18.75" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 30 })
</script>
