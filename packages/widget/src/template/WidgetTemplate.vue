<script setup lang="ts">
// Gabarit du widget, rendu en HTML statique au build (SSR, render.ts)
// puis injecté dans [data-reco-widget] — jamais de runtime Vue dans
// reco.js. Seuls data-reco-* portent le contrat (§10.2) ; aucune
// directive Vue n'atteint le DOM.
// Le bloc [data-reco-labels] (Webflow Localization) reste dans l'embed :
// il n'est volontairement pas rendu ici.
import ChatThread from './ChatThread.vue'
import Composer from './Composer.vue'
import EntryTemplates from './EntryTemplates.vue'
import HeaderBar from './HeaderBar.vue'
import LauncherButton from './LauncherButton.vue'
</script>

<template>
  <HeaderBar />
  <div data-reco-live class="sr-only"></div>
  <ChatThread />
  <Composer />
  <EntryTemplates />
  <LauncherButton />
</template>
