# Dream Event Seating

Dos componentes de navegador para crear mapas de asientos y seleccionar boletos. Esta carpeta funciona sin backend, paquetes npm ni compilación. El repositorio original no tenía componentes ni dependencias de frontend; por eso todo quedó aislado aquí.

## Inicio rápido

Desde esta carpeta, sirve los archivos con cualquier servidor estático. Por ejemplo:

```sh
python3 -m http.server 8080
```

Abre `http://localhost:8080/` para la demostración integrada. Se requieren conexión a internet y CDN para Bootstrap 5.3.3, jQuery 3.7.1, Konva 9.3.18, SweetAlert2 11 y Font Awesome 6.7.2. Se pueden descargar esas dependencias y cambiar las etiquetas `<script>` y `<link>` por rutas locales.

## Integración

Incluye los scripts en este orden: `dream-event-utils.js`, `dream-event-schema.js`, `dream-event-layout.js`, `dream-event-history.js` (solo Builder), `dream-event-renderer.js`, y el componente que se vaya a usar. El Selector no requiere jQuery ni los scripts exclusivos del Builder.

```html
<div id="seat-map-builder"></div>
<script>
const builder = new DreamEventSeatMapBuilder({
  container: '#seat-map-builder',
  data: initialJSON,
  options: { locale: 'es-MX', currency: 'MXN', historyLimit: 50 },
  callbacks: { onChange: json => console.log(json), onComplete: json => sendToYourApp(json) }
});
</script>
```

El Selector consume directamente `builder.getData()`:

```js
const selector = new DreamEventSeatSelector({
  container: '#seat-map-selector', data: builder.getData(),
  availability: { seats: {}, generalAdmission: {} },
  options: { maxSeats: 6, minSeats: 1, holdDurationSeconds: 600 },
  callbacks: { onSelectionChange: selection => console.log(selection), onHoldCreated: reservation => console.log(reservation) }
});
```

Ambos componentes exponen los métodos descritos en `JSON-SCHEMA.md` y en el código mediante JSDoc. La API principal cubre importación/exportación, validación, grupos, filas, asientos, admisión general, selección, temporizador y destrucción. La edición rápida de filas se hace desde el panel de sección; la edición visual permite arrastrar y transformar el escenario y mover secciones.

## Archivos

- `js/dream-event-schema.js`: valores iniciales, normalización y validación.
- `js/dream-event-layout.js`: geometría de asientos en coordenadas relativas.
- `js/dream-event-renderer.js`: escena compartida Konva.
- `js/dream-event-seat-map-builder.js`: asistente, edición, historial en memoria y exportación JSON.
- `js/dream-event-seat-selector.js`: selección, admisión general, disponibilidad y reserva simulada.
- `index.html`: pestañas de configurador, selector e inspector.
- `builder-demo.html`, `selector-demo.html`, `integration-demo.html`: demos independientes y de integración.
- `examples/`: mapas de ejemplo, incluido uno de 1,000 asientos.
- `tests/`: pruebas Node y una página de pruebas en navegador.

## Disponibilidad y dinero

`ticketTypes[].price` usa unidades monetarias mayores (por ejemplo, `1500` MXN). El Selector calcula los totales convirtiendo a centavos enteros y devuelve los valores monetarios en las unidades del JSON de ejemplo. `availability.seats` recibe un objeto `{ seatId: status }`. Los estados dinámicos se mantienen separados de la definición del mapa.

## Límites de la simulación

La reserva vive únicamente en la memoria de esta instancia y pestaña; no bloquea inventario para otros compradores. El navegador no es autoridad para precios, capacidad, disponibilidad, expiración ni pagos. En producción el servidor debe validar y autorizar cada operación. El contador usa timestamps absolutos. La referencia de plano cargada localmente queda como Data URL dentro del JSON exportado.

El renderizado usa una forma Konva por asiento, conveniente para edición y mapas de tamaño medio. No se hizo una prueba de rendimiento para 5,000 o 10,000 asientos ni se prometen FPS. El ejemplo grande permite comprobar la carga inicial y la distribución de 1,000 asientos.

## Pruebas

```sh
node tests/run.js
```

Para probar integración visual, sirve la carpeta por HTTP y visita `tests/index.html`.

## Configuración del mapa

Los tipos de boleto llegan preconfigurados en data.ticketTypes. El Builder no muestra un selector de tipos: asigna automáticamente a cada sección el tipo de asiento reservado disponible. La pestaña Secciones concentra su creación y edición, incluidas filas, asientos, color y contorno (rectangular, cuadrado, trapezoidal, semicircular o circular). Arrastrar los controles del contorno escala juntos la sección y sus asientos. El plano cargado se puede encuadrar con Ajustar al plano.

El escenario es opcional y puede ser null. En aviones y recintos sin escenario se deja vacío; en estadios se agrega desde el paso Escenario, aparece centrado por defecto y después se puede mover. Las secciones se arrastran y escalan como grupos. Para mover varios asientos, selecciónalos con Shift+clic o Ctrl/⌘+clic y arrastra cualquiera de los seleccionados.

El Builder utiliza SweetAlert2 para formularios, confirmaciones y avisos. Carga SweetAlert2 antes del script del componente. La demostración incluye la dependencia por CDN.
