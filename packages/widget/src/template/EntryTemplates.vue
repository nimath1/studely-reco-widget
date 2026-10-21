<template>
  <div data-reco-templates hidden>
    <div data-reco-template="msg-user" data-reco-msg="user">
      <p data-reco-field="text"></p>
    </div>
    <div data-reco-template="msg-assistant" data-reco-msg="assistant">
      <span data-reco-avatar aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2.6 13.8 8l5.4 1.8-5.4 1.8L12 17.2 10.2 11.6 4.8 9.8 10.2 8 12 2.6ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"
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
    <button type="button" data-reco-template="advisor-cta" data-reco-action="advisor">
      <span data-reco-field="label">Parler à un conseiller</span>
    </button>
    <!-- Mise en relation : le conseiller est contacté via un mini-formulaire
         dans le fil (nom + e-mail), pas une navigation externe. -->
    <div data-reco-template="handoff-form" data-reco-msg="assistant">
      <span data-reco-avatar aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2.6 13.8 8l5.4 1.8-5.4 1.8L12 17.2 10.2 11.6 4.8 9.8 10.2 8 12 2.6ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"
          />
        </svg>
      </span>
      <div data-reco-bubble>
        <p data-reco-field="text"></p>
        <form data-reco-handoff novalidate>
          <input
            type="text"
            data-reco-input="handoff-name"
            autocomplete="name"
            data-reco-field="handoff-name"
          />
          <input
            type="email"
            data-reco-input="handoff-email"
            autocomplete="email"
            inputmode="email"
            data-reco-field="handoff-email"
          />
          <button type="submit" data-reco-action="handoff" data-reco-field="handoff-submit"></button>
        </form>
        <p data-reco-field="handoff-error" role="alert" hidden></p>
      </div>
    </div>
  </div>
</template>
