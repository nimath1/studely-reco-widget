<template>
  <form data-reco-composer novalidate>
    <label data-reco-consent>
      <input type="checkbox" data-reco-input="consent" />
      <span data-reco-field="consent-label">
        J'accepte que mes messages soient analysés automatiquement pour me proposer des parcours
      </span>
    </label>
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
        placeholder="Décris ton projet d'études…"
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
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
    <p data-reco-disclaimer>Recommandations indicatives générées automatiquement.</p>
  </form>
</template>
