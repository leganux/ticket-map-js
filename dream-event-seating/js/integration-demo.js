(function () {
  'use strict';
  let builder, selector;
  const events = [];
  const log = (name, payload) => {
    events.push({ name, payload });
    if (events.length > 40) events.shift();
    refresh();
  };
  function refresh() {
    const view = document.querySelector('#json-view');
    if (view && builder)
      view.textContent = JSON.stringify(
        {
          configuration: builder.getData(),
          selection: selector?.getSelection() || null,
          availability: selector?.getAvailability() || null,
          reservation: selector?.getHold() || null,
          callbacks: events,
        },
        null,
        2,
      );
    const output = document.querySelector('#event-log');
    if (output)
      output.textContent = events
        .map((item) => `${item.name}: ${JSON.stringify(item.payload)}`)
        .join('\n');
  }
  function makeSelector(data) {
    selector?.destroy();
    selector = (window.DreamEventSeatPicker ? DreamEventSeatPicker.create : (c) => new DreamEventSeatSelector(c))({
      container: '#selector',
      data,
      callbacks: {
        onSelectionChange: (value) => log('onSelectionChange', value),
        onHoldCreated: (value) => log('onHoldCreated', value),
        onHoldExpired: (value) => log('onHoldExpired', value),
        onHoldCancelled: (value) => log('onHoldCancelled', value),
        onPurchaseSimulated: (value) => log('onPurchaseSimulated', value),
        onError: (error) => log('onError', error.message),
      },
    });
  }
  function show(name) {
    document
      .querySelectorAll('[data-pane]')
      .forEach((button) => button.classList.toggle('active', button.dataset.pane === name));
    document.querySelectorAll('[id$="-pane"]').forEach((section) => {
      section.hidden = section.id !== `${name}-pane`;
    });
    if (name === 'selector') selector?.resize();
  }
  fetch('examples/concert.json')
    .then((response) => response.json())
    .then((data) => {
      builder = new DreamEventSeatMapBuilder({
        container: '#builder',
        data,
        callbacks: {
          onChange: refresh,
          onComplete: (json) => {
            log('onComplete', json);
            makeSelector(json);
            show('selector');
          },
        },
      });
      makeSelector(data);
      refresh();
    });
  document.querySelectorAll('[data-pane]').forEach((button) => {
    button.onclick = () => show(button.dataset.pane);
  });
  document.querySelector('#copy-json').onclick = () =>
    navigator.clipboard?.writeText(builder.getJSON());
  document.querySelector('#load-example').onclick = () =>
    fetch('examples/concert.json')
      .then((response) => response.json())
      .then((data) => builder.setData(data));
  document.querySelector('#reset-all').onclick = () => {
    builder.reset();
    selector.reset();
    events.length = 0;
    refresh();
  };
})();
