# history/ — Auditoría del proceso de desarrollo

Registro estricto y liviano de **cómo** se desarrolla sentinel: decisiones, desviaciones,
autoría y contexto de cada iteración. Es la memoria del proceso, separada del producto
(`src/`), de la especificación (`docs/`) y del runtime de sdd-lite (`sdd-lite/`).

> Idioma: las entradas se escriben en **español** (son para lectura directa del equipo,
> igual que `docs/backlog-mvp-sentinel.md`). El código y los artefactos de sdd-lite
> siguen siendo en inglés — esta carpeta es la excepción deliberada, junto a los docs es.

## Reglas

1. **Una entrada por sesión de trabajo**, en `entries/`, nombrada
   `YYYY-MM-DD-Snn-<slug>.md` (`Snn` = número de sesión incremental).
   Si una sesión abarca varias tareas/historias, van como secciones dentro de la misma entrada.
2. La entrada se genera/actualiza con la skill **`history-log`** antes de cerrar:
   fin de sesión, fin de historia, o cualquier STOP — lo que ocurra primero.
3. Toda decisión no trivial lleva **autoría explícita**:
   - `user` — la decidió el usuario por iniciativa propia.
   - `claude` — decisión autónoma (nivel A del protocolo), con su porqué.
   - `claude→user` — Claude presentó alternativas con recomendación y el usuario decidió (nivel B).
4. Las **desviaciones** (de plan, PRD, backlog o supuestos) se registran siempre, aunque
   se hayan resuelto en el momento.
5. Cada entrada nueva agrega su línea a `INDEX.md` (más reciente arriba).
6. Las entradas se **commitean** — historia no commiteada no existe (los entornos remotos
   son efímeros).
7. No se duplica contenido de sdd-lite: se **linkea** a `sdd-lite/openspec/changes/<change>/`.
8. Sin exagerar: apuntar a ~1 pantalla por entrada. Detalle fino → link al artefacto que lo tiene.

## Estructura

```
history/
├── README.md      # este archivo
├── TEMPLATE.md    # plantilla de entrada
├── INDEX.md       # índice cronológico (1 línea por entrada)
└── entries/       # las entradas
```
