# Esquema JSON e interfaces públicas

## Mapa (schemaVersion 1.0.0)

La estructura serializada usa `schemaVersion`, `eventId`, `name`, `currency`, `locale`, `canvas`, `background`, `stage`, `ticketTypes`, `sections` y `metadata`. El campo `stage` puede ser `null` para recintos sin escenario. Cada sección tiene filas; cada fila tiene asientos. IDs estables son cadenas. La posición de un asiento es relativa a su fila; la de una fila, relativa a su sección; y la de una sección, relativa al canvas. `seatCount` se deriva del arreglo `seats`. No se serializan nodos Konva, callbacks ni elementos DOM.

Un tipo de boleto usa `mode: "reserved_seating"` o `mode: "general_admission"`. Opcionalmente tiene `presalePrice` (número, ≤ `price`) y `presaleEndsAt` (ISO 8601 o `YYYY-MM-DD`); ambos son `null` si no hay preventa. Una sección siempre necesita un tipo reservado. La validación del mapa rechaza admisión general asociada a una sección. Admisión general nunca crea asientos. El campo `status` de cada asiento admite `available`, `disabled`, `accessible` y `blocked`; `accessible` se recomienda además como booleano independiente.

## Builder

Constructor: `new DreamEventSeatMapBuilder({ container, data, options, callbacks })`.

Métodos: `getData`, `setData`, `getJSON`, `getCapacity`, `getTicketTypes`, `getSections`, `getSection`, `getSeats`, `getSelectedElement`, `addSection`, `updateSection`, `duplicateSection`, `removeSection`, `addRow`, `updateRow`, `removeRow`, `updateSeat`, `removeSeat`, `setStage`, `setBackground`, `validate`, `undo`, `redo`, `goToStep`, `fitToScreen`, `fitToMap`, `resize`, `reset`, `clear` y `destroy`.

Callbacks: `onReady(data)`, `onChange(data)`, `onStepChange(step)`, `onSelectionChange(selection)`, `onValidationError(errors)`, `onComplete(data)`, `onReset()` y `onError(error)`. El Builder agrega `onPreview(json)` al pedir abrir la vista previa.

Templates: `openTemplates`, `loadTemplate(id)` y el callback `onTemplateLoaded({ id, data })`. Las secciones aceptan `shape: "ring" | "table"` con `innerRadius`, y `showRowLabels: false`.

Métodos adicionales: `select`, `selectSection`, `selectSeats`, `setTool('select'|'pan'|'marquee'|'stage')`, `updateSeats`, `removeSeats`, `deleteSelection`, `applySectionForm`. `removeSection`, `removeSeats` y `reset` piden confirmación salvo que reciban `{ confirm: false }`.

`reset()` restaura el JSON inicial de la instancia; `clear()` deja el mapa sin secciones ni escenario y conserva los tipos de boleto. Los tipos de boleto vienen en el JSON de entrada; el Builder solo cambia su `price` desde el formulario de sección. Para mover varios asientos, selecciónalos con Shift/Ctrl/⌘ + clic y arrastra uno de ellos.

## Selector

Constructor: `new DreamEventSeatSelector({ container, data, availability, options, callbacks })`.

Métodos: `getData`, `setData`, `getSelection`, `getSelectionJSON`, `setSelection`, `selectSeat`, `deselectSeat`, `toggleSeat`, `setGeneralAdmissionQuantity`, `getTotal`, `getAvailability`, `setAvailability`, `updateSeatStatus`, `createHold`, `getHold`, `getRemainingHoldTime`, `cancelHold`, `expireHold`, `simulatePurchase`, `checkout`, `clearSelection`, `fitToScreen`, `resize`, `reset` y `destroy`.

Callbacks: `onReady`, `onSelectionChange`, `onSeatSelected`, `onSeatDeselected`, `onHoldCreated`, `onHoldTick`, `onHoldExpired`, `onHoldCancelled`, `onCheckout`, `onPurchaseSimulated` y `onError`.

La selección incluye asientos y admisión general, cantidad, subtotales, total y referencias a boleto/sección/fila. Los importes del JSON son unidades monetarias mayores; se convierten a centavos enteros antes de sumar.

## Compra móvil y detección automática

`DreamEventSeatSelectorMobile` acepta la misma configuración y expone la misma API que `DreamEventSeatSelector` (opciones extra: `height`, `minTapSize`). `DreamEventSeatPicker.create({ ...config, mode: 'auto' | 'mobile' | 'desktop' })` elige la interfaz, reenvía la API, agrega `getMode()`, `setMode()`, el callback `onModeChange(mode)` y `DreamEventSeatPicker.detectMode()`. Ver `docs/GUIA-COMPRA.md`.

## Reserva local

`createHold()` produce `reservationId`, `eventId`, `status`, `createdAt`, `expiresAt`, `durationSeconds`, `seatIds`, `generalAdmission`, `total`, `currency` y `simulated: true`. Al expirar o cancelar se limpian solo estados `held` puestos por esa instancia. `simulatePurchase()` convierte sus asientos a `sold`. No se hacen pagos, llamadas HTTP ni reservas distribuidas.

## Ajustes de configuración

El campo stage es opcional y puede ser null. Los tipos de boleto se cargan desde el JSON de entrada; el Builder solo edita su precio. La selección múltiple de asientos usa Shift/Ctrl/⌘ + clic; al arrastrar uno de los seleccionados se desplaza el grupo completo. SweetAlert2 debe cargarse antes del Builder.
