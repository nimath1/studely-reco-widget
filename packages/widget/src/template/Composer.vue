<template>
  <form data-reco-composer novalidate>
    <div data-reco-turnstile></div>
    <div data-reco-input-row>
      <label for="reco-message" class="sr-only" data-reco-field="input-label"
        >Décris ton projet d'études</label
      >
      <textarea
        id="reco-message"
        data-reco-input="message"
        rows="1"
        data-reco-field="input"
        placeholder="Posez votre question…"
      ></textarea>
      <button type="submit" data-reco-action="send" data-reco-field="send" aria-label="Envoyer">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
      <!-- Remplace « Envoyer » tant qu'une réponse est en cours (pending). -->
      <button
        type="button"
        data-reco-action="stop"
        aria-label="Arrêter la réponse"
        title="Arrêter la réponse"
        hidden
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
      </button>
    </div>
    <p data-reco-consent="continuation" data-reco-field="consent-label">
      En continuant, vous acceptez l’analyse automatique de vos messages pour vous proposer des
      parcours.
    </p>
  </form>
</template>
