<script setup>
defineProps({
  name: { type: String, required: true },
})

const sizes = {
  arrow: { w: 16, h: 16 },
  arrowLeft: { w: 16, h: 16 },
  check: { w: 14, h: 14 },
  lock: { w: 14, h: 14 },
  play: { w: 12, h: 12 },
  clock: { w: 12, h: 12 },
  doc: { w: 12, h: 12 },
  user: { w: 14, h: 14 },
  dot: { w: 6, h: 6 },
  send: { w: 14, h: 14 },
  focus: { w: 14, h: 14 },
  close: { w: 14, h: 14 },
  chat: { w: 14, h: 14 },
}
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="sizes[name]?.w ?? 14"
    :height="sizes[name]?.h ?? 14"
    :viewBox="`0 0 ${sizes[name]?.w ?? 14} ${sizes[name]?.h ?? 14}`"
    fill="none"
    style="display: inline-block; vertical-align: middle"
  >
    <!-- arrow -->
    <template v-if="name === 'arrow'">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>

    <!-- arrowLeft -->
    <template v-else-if="name === 'arrowLeft'">
      <path
        d="M13 8H3M7 4L3 8l4 4"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>

    <!-- check -->
    <template v-else-if="name === 'check'">
      <path
        d="M2.5 7.5l3 3 6-7"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>

    <!-- lock -->
    <template v-else-if="name === 'lock'">
      <rect
        x="2.5"
        y="6"
        width="9"
        height="6"
        rx="1"
        stroke="currentColor"
        stroke-width="1.2"
      />
      <path
        d="M4.5 6V4a2.5 2.5 0 015 0v2"
        stroke="currentColor"
        stroke-width="1.2"
      />
    </template>

    <!-- play -->
    <template v-else-if="name === 'play'">
      <path
        d="M3 2l7 4-7 4V2z"
        fill="currentColor"
      />
    </template>

    <!-- clock -->
    <template v-else-if="name === 'clock'">
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="currentColor"
        stroke-width="1"
      />
      <path
        d="M6 3.5V6l1.5 1.5"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
      />
    </template>

    <!-- doc -->
    <template v-else-if="name === 'doc'">
      <path
        d="M3 1.5h4l2 2V10a.5.5 0 01-.5.5h-5A.5.5 0 013 10V1.5z"
        stroke="currentColor"
        stroke-width="1"
      />
      <path
        d="M7 1.5v2h2"
        stroke="currentColor"
        stroke-width="1"
      />
    </template>

    <!-- user -->
    <template v-else-if="name === 'user'">
      <circle
        cx="7"
        cy="5"
        r="2.5"
        stroke="currentColor"
        stroke-width="1.2"
      />
      <path
        d="M2 12c1-2.5 3-3.5 5-3.5s4 1 5 3.5"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </template>

    <!-- dot -->
    <template v-else-if="name === 'dot'">
      <circle
        cx="3"
        cy="3"
        r="3"
        fill="currentColor"
      />
    </template>

    <!-- send -->
    <template v-else-if="name === 'send'">
      <path
        d="M1.5 7l11-5.5L10 13 7 8 1.5 7z"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </template>

    <!-- focus -->
    <template v-else-if="name === 'focus'">
      <path
        d="M1 4V1h3M13 4V1h-3M1 10v3h3M13 10v3h-3"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </template>

    <!-- close -->
    <template v-else-if="name === 'close'">
      <path
        d="M2 2l10 10M12 2L2 12"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </template>

    <!-- chat -->
    <template v-else-if="name === 'chat'">
      <path
        d="M2 3a1 1 0 011-1h8a1 1 0 011 1v6a1 1 0 01-1 1H5l-3 2.5V3z"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </template>

    <!-- search / lupa -->
    <template v-else-if="name === 'search'">
      <circle
        cx="6.5"
        cy="6.5"
        r="4"
        stroke="currentColor"
        stroke-width="1.4"
        fill="none"
      />
      <path
        d="M9.5 9.5l3.5 3.5"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </template>
  </svg>
</template>
