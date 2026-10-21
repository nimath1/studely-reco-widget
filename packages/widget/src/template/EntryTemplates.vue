<template>
  <div data-reco-templates hidden>
    <div data-reco-template="msg-user" data-reco-msg="user">
      <p data-reco-field="text"></p>
    </div>
    <div data-reco-template="msg-assistant" data-reco-msg="assistant">
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
