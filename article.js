let closeActivePreview = null;
document.querySelectorAll('.pokemon-peek').forEach(peek => {
  const trigger = peek.querySelector('button');
  const card = peek.querySelector('.pokemon-card');
  let pinned = false;
  let hovered = false;
  let dismissed = false;

  function positionCard() {
    card.style.setProperty('--peek-shift', '0px');
    const anchor = trigger.getBoundingClientRect();
    const height = card.offsetHeight;
    peek.dataset.side = window.innerHeight - anchor.bottom < height + 20 && anchor.top > height + 20 ? 'above' : 'below';
    const bounds = card.getBoundingClientRect();
    const margin = 12;
    const shift = bounds.left < margin ? margin - bounds.left : Math.min(0, document.documentElement.clientWidth - margin - bounds.right);
    card.style.setProperty('--peek-shift', `${shift}px`);
  }

  function show() {
    if (dismissed) return;
    if (closeActivePreview !== close) closeActivePreview?.();
    closeActivePreview = close;
    card.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionCard();
  }

  function hide() {
    card.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (closeActivePreview === close) closeActivePreview = null;
  }

  function close() {
    pinned = false;
    dismissed = false;
    hide();
  }

  function dismiss() {
    pinned = false;
    dismissed = true;
    hide();
  }

  peek.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    hovered = true;
    show();
  });
  peek.addEventListener('pointerleave', () => {
    hovered = false;
    dismissed = false;
    if (!pinned && !peek.contains(document.activeElement)) hide();
  });
  peek.addEventListener('focusin', event => {
    if (event.target.matches(':focus-visible')) show();
  });
  peek.addEventListener('focusout', event => {
    if (peek.contains(event.relatedTarget)) return;
    pinned = false;
    dismissed = false;
    if (!hovered) hide();
  });
  trigger.addEventListener('click', () => {
    if (pinned) {
      dismiss();
    } else {
      pinned = true;
      dismissed = false;
      show();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (peek.contains(event.target)) return;
    close();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || card.hidden) return;
    const returnFocus = card.contains(document.activeElement);
    dismiss();
    if (returnFocus) trigger.focus({ preventScroll: true });
  });
  window.addEventListener('resize', () => { if (!card.hidden) positionCard(); });
});
