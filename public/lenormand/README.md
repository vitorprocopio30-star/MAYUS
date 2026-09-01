# Baraja Lenormand · Mockup funcional

Prototipo navegable (HTML + CSS + JavaScript puro, un solo archivo) de la
experiencia de lectura Lenormand dentro de **Protocolo del Compromiso**.

## Cómo abrirlo

- Doble clic en `index.html` (funciona directo en el navegador, sin servidor), o
- con la app corriendo: `/lenormand/index.html`.

Recomendado: abrir el inspector del navegador en modo dispositivo (390 × 844).

## Flujo implementado

`Entrada → Tirada → Pregunta → Barajar → Elegir cartas → Flip/Revelación →
Lectura → Profundizar (bottom sheet premium)`

Flujos adicionales: **Carta del Día** (gratis, sin IA) e **Historial**
(`Mis lecturas`, guardado en `localStorage`).

## Sorteo

- Las 36 cartas viven en el array `CARDS` del propio archivo.
- El mazo se baraja con **Fisher-Yates** al tocar el mazo.
- La carta que sale es exactamente la que ocupa la posición que eligió la
  usuaria en el abanico. **Ninguna IA participa del sorteo.**
- Las interpretaciones, la claridad y las combinaciones son contenido estático
  (mock) generado a partir de los datos de cada carta. No hay llamadas a APIs.

## Assets del baraja

El código ya apunta a los archivos reales. Basta con copiarlos aquí:

```
public/lenormand/assets/lenormand/01_el_jinete.webp
public/lenormand/assets/lenormand/02_el_trebol.webp
...
public/lenormand/assets/lenormand/36_la_cruz.webp
public/lenormand/assets/lenormand/reverso_oficial.webp
```

El nombre se deriva del número + el nombre de la carta sin acentos
(`assetOf()` en el archivo). Mientras un archivo no exista, se muestra
automáticamente un anverso/reverso ilustrado por CSS + SVG, sin romper la
interfaz. Para cambiar la ruta o la extensión: constantes `ASSET_BASE`,
`ASSET_EXT` y `ASSET_BACK`, al inicio del bloque `<script>`.

## Organización del código

`CARDS DATA · TIRADAS · STATE · UI HELPERS · NAVIGATION · SHUFFLE/DRAW ·
PANTALLAS 1-6 · READING · HISTORY · CARTA DEL DÍA · INIT`

## Arquitectura real (fuera de este mockup)

`pregunta → shuffle en el código → selección → banco de datos Lenormand →
combinaciones → cálculo de claridad → LLM → lectura final`
