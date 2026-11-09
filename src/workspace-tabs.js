// One keyboard-accessible workspace; switching tabs never changes the game.
export function createWorkspaceTabs(root = document) {
  const buttons = [...root.querySelectorAll('[data-panel-tab]')];
  const panels = [...root.querySelectorAll('[data-panel]')];
  let active = buttons.find(button => button.getAttribute('aria-selected') === 'true')?.dataset.panelTab || 'game';
  function show(name, { focus = false } = {}) {
    const selected = buttons.find(button => button.dataset.panelTab === name);
    if (!selected) return;
    active = name;
    for (const button of buttons) {
      button.setAttribute('aria-selected', String(button === selected));
      button.tabIndex = button === selected ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
    if (focus) selected.focus();
  }
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => show(button.dataset.panelTab));
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length
        : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      show(buttons[next].dataset.panelTab, { focus: true });
    });
  }
  show(active);
  return { show, get active() { return active; } };
}
