<template>
  <div data-reco-templates hidden>
    <div data-reco-template="msg-user" data-reco-msg="user">
      <p data-reco-field="text"></p>
    </div>
    <div data-reco-template="msg-assistant" data-reco-msg="assistant">
      <span data-reco-avatar aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z"
          />
        </svg>
      </span>
      <div data-reco-bubble>
        <p data-reco-field="text"></p>
        <div data-reco-field="suggestions"></div>
        <div data-reco-field="links"></div>
        <div data-reco-field="actions"></div>
      </div>
    </div>
    <button type="button" data-reco-template="suggestion" data-reco-send>
      <span data-reco-field="label"></span>
    </button>
    <a data-reco-template="advisor-cta" data-reco-action="advisor" href="/mexique#contact">
      <span data-reco-field="label">Parler à un conseiller</span>
    </a>
  </div>
</template>
