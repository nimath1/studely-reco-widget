<template>
  <div data-reco-body>
    <!-- Fil de conversation : région live polie (role=log) — chaque entrée
         ajoutée est annoncée à son arrivée. -->
    <div data-reco-thread role="log"></div>
    <div data-reco-pending hidden>
      <div data-reco-msg="assistant">
        <div data-reco-bubble>
          <p data-reco-field="pending-text">Analyse de ta demande…</p>
          <div data-reco-dots aria-hidden="true"><i></i><i></i><i></i></div>
          <button type="button" data-reco-action="stop" data-reco-field="stop-label">
            Arrêter la réponse
          </button>
        </div>
      </div>
    </div>
    <div data-reco-error hidden>
      <div data-reco-error-card>
        <h3 data-reco-error-title>L'assistant est momentanément indisponible.</h3>
        <p data-reco-error-message></p>
        <div>
          <button type="button" data-reco-action="retry" data-reco-field="retry-label">
            Réessayer
          </button>
          <button type="button" data-reco-action="advisor" data-reco-field="advisor-label">
            Parler à un conseiller
          </button>
        </div>
      </div>
    </div>
    <PanelFallback />
  </div>
</template>

<script setup lang="ts">
import PanelFallback from './PanelFallback.vue'
</script>
