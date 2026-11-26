# Esquema JSON e interfaces públicas

## Mapa (schemaVersion 1.0.0)

La estructura serializada usa `schemaVersion`, `eventId`, `name`, `currency`, `locale`, `canvas`, `background`, `stage`, `ticketTypes`, `sections` y `metadata`. El campo `stage` puede ser `null` para recintos sin escenario. Cada sección tiene filas; cada fila tiene asientos. IDs estables son cadenas. La posición de un asiento es relativa a su fila; la de una fila, relativa a su sección; y la de una sección, relativa al canvas. `seatCount` se deriva del arreglo `seats`. No se serializan nodos Konva, callbacks ni elementos DOM.

Un tipo de boleto usa `mode: "reserved_seating"` o `mode: "general_admission"`. Una sección siempre necesita un tipo reservado. La validación del mapa rechaza admisión general asociada a una sección. Admisión general nunca crea asientos. El campo `status` de cada asiento admite `available`, `disabled`, `accessible` y `blocked`; `accessible` se recomienda además como booleano independiente.

## Builder

Constructor: `new DreamEventSeatMapBuilder({ container, data, options, callbacks })`.

Métodos: `getData`, `setData`, `getJSON`, `getCapacity`, `getTicketTypes`, `getSections`, `getSection`, `getSeats`, `getSelectedElement`, `addSection`, `updateSection`, `duplicateSection`, `removeSection`, `addRow`, `updateRow`, `removeRow`, `updateSeat`, `removeSeat`, `setStage`, `setBackground`, `validate`, `undo`, `redo`, `goToStep`, `fitToScreen`, `fitToMap`, `resize`, `reset`, `clear` y `destroy`.

Callbacks: `onReady(data)`, `onChange(data)`, `onStepChange(step)`, `onSelectionChange(selection)`, `onValidationError(errors)`, `onComplete(data)`, `onReset()` y `onError(error)`. El Builder agrega `onPreview(json)` al pedir abrir la vista previa.

`reset()` restaura el JSON inicial de la instancia; `clear()` crea un mapa vacío. Los tipos de boleto son de solo lectura y vienen en el JSON de entrada. Para mover varios asientos, selecciónalos con Shift/Ctrl/⌘ + clic y arrastra uno de ellos.

## Selector

Constructor: `new DreamEventSeatSelector({ container, data, availability, options, callbacks })`.

Métodos: `getData`, `setData`, `getSelection`, `getSelectionJSON`, `setSelection`, `selectSeat`, `deselectSeat`, `toggleSeat`, `setGeneralAdmissionQuantity`, `getTotal`, `getAvailability`, `setAvailability`, `updateSeatStatus`, `createHold`, `getHold`, `getRemainingHoldTime`, `cancelHold`, `expireHold`, `simulatePurchase`, `checkout`, `clearSelection`, `fitToScreen`, `resize`, `reset` y `destroy`.

Callbacks: `onReady`, `onSelectionChange`, `onSeatSelected`, `onSeatDeselected`, `onHoldCreated`, `onHoldTick`, `onHoldExpired`, `onHoldCancelled`, `onCheckout`, `onPurchaseSimulated` y `onError`.

La selección incluye asientos y admisión general, cantidad, subtotales, total y referencias a boleto/sección/fila. Los importes del JSON son unidades monetarias mayores; se convierten a centavos enteros antes de sumar.

## Reserva local

`createHold()` produce `reservationId`, `eventId`, `status`, `createdAt`, `expiresAt`, `durationSeconds`, `seatIds`, `generalAdmission`, `total`, `currency` y `simulated: true`. Al expirar o cancelar se limpian solo estados `held` puestos por esa instancia. `simulatePurchase()` convierte sus asientos a `sold`. No se hacen pagos, llamadas HTTP ni reservas distribuidas.

## Ajustes de configuración

El campo stage es opcional y puede ser null. Los tipos de boleto son de solo lectura en el Builder y se cargan desde el JSON de entrada. La selección múltiple de asientos usa Shift/Ctrl/⌘ + clic; al arrastrar uno de los seleccionados se desplaza el grupo completo. SweetAlert2 debe cargarse antes del Builder.
