# sdd-lite — Guia rapida

Workflow liviano para cambios acotados (features, bugs, refactors) con trazabilidad, aprobaciones por etapa y estado persistido en archivos.

---

## Que es y para que sirve

sdd-lite estructura el trabajo de un agente AI en etapas: propuesta, especificacion, diseno, plan, ejecucion y QA. Cada etapa genera un artefacto persistido (markdown/yaml) y requiere aprobacion antes de tocar codigo. Todo vive en `./sdd-lite/` — no depende de la memoria del chat.

---

## Inicio rapido

### 1. Inicializar el proyecto

> "Install sdd-lite in this repo and configure it for Claude Code"

Esto ejecuta `sddl-init`: escanea el proyecto, detecta stack y AI, instala skills y genera los archivos base en `./sdd-lite/`.

### 2. Usar sdd-lite en un cambio

Pedirlo explicitamente. Palabras clave: `"con sdd"`, `"use sdd-lite"`, `"sddl"`, `"hacerlo con sdd"`.

No se activa automaticamente para preguntas simples o fixes triviales.

---

## Flujo estandar

```
sddl-init (bootstrap, una sola vez)
  -> sddl-proposal      (consolida la idea, exploracion liviana opcional)
  -> sddl-spec          (formaliza scope y criterios de aceptacion)
  -> sddl-design        (diseno tecnico: arquitectura y areas afectadas)
  -> sddl-plan          (plan de ejecucion por etapas)
  -> sddl-executor      (ejecuta UNA etapa aprobada)
  -> sddl-code-review   (ofrecido si el diff no es trivial: review 4R con ledger)
  -> sddl-qa-review     (revision por etapa o final; la final consume el ledger)
  -> cierre             (una sola oferta al completar el cambio:
                         delivery / archive / ambos / ninguno)
```

Cada etapa necesita tu aprobacion antes de avanzar. El executor nunca avanza solo a la siguiente etapa.

**Reviews independientes** (sin cambio activo): `"review este diff/PR"` corre `sddl-code-review`; `"judgment day sobre X"` corre `sddl-judgment-day`. El resultado queda en `./sdd-lite/openspec/reviews/{target}/review-ledger.md`.

---

## El orquestador

El orquestador es un coordinador liviano. No implementa, no ejecuta tests, no modifica codigo. Solo lee el estado minimo necesario, decide la ruta y delega el trabajo a la skill correcta.

Durante una sesion SDD mantiene cargado `orchestrator/SDDL-RUNTIME.md`. Las reglas pesadas de review, cierre combinado y recuperacion excepcional se leen solo cuando ocurre ese evento. Los workers reciben una marca explicita que les impide volver a cargar el runtime o convertirse en otro orquestador.

**Que hace:**
- Verifica que el bootstrap este listo antes de arrancar
- Evalua complejidad y elige la ruta (flujo normal, macro-plan, o escalar)
- Arma el handoff compacto para cada skill delegada
- Mantiene `state.yaml` actualizado para poder retomar en cualquier momento

**Que se le puede pedir:**
- Iniciar un cambio nuevo: `"Con sdd-lite, agregar validacion al formulario de login"`
- Retomar un cambio existente: `"Retoma el cambio feat-login-validation"`
- Solo planificar: `"Con sdd-lite y objetivo planner, planifica la separacion de modulos"`
- Investigar antes de actuar: si detecta incognitas, delega a `sddl-deep-explorer` automaticamente
- Avanzar a la siguiente etapa: `"Apruebo, continua con la siguiente etapa"`
- Revisar o cerrar: `"Hace la QA final del cambio"`

**Que NO hace:**
- No edita archivos del repo directamente
- No hace commits, stash ni ninguna operacion git
- No avanza sin tu aprobacion en etapas que tocan codigo
- No depende de lo que dijiste antes en el chat — siempre lee de `state.yaml` y los artefactos

Si el proyecto tenia un wrapper anterior a la version `0.4`, ejecuta `sddl-init` y aprueba el reemplazo completo del bloque marcado en `CLAUDE.md` o `AGENTS.md` antes de retomar el flujo. Ademas se instalan ocho adapters de perfil (`.claude/agents/` o `.codex/agents/`) que no reemplazan las skills; los adapters de ids retirados (como `sddl-planner`) se eliminan al reejecutar.

---

## Ejemplos de uso

**Agregar un endpoint:**
> "Con sdd-lite, agregar un endpoint GET /users/me que devuelva el usuario autenticado"

Resultado: propuesta -> spec -> diseno -> plan con etapas (ej: S1 controller, S2 tests) -> ejecucion etapa por etapa -> QA final.

**Bug con causa incierta:**
> "Con sddl: el login a veces falla con 500, no se por que"

Resultado: primero `sddl-deep-explorer` investiga (read-only) -> con la evidencia continua el flujo normal.

**Solo planificar, sin ejecutar:**
> "Con sdd-lite y objetivo planner, planifica migrar logs a JSON estructurado"

Resultado: propuesta -> spec -> diseno -> plan -> se detiene sin ejecutar.

**Retomar un cambio:**
> "Retoma el cambio feat-users-me"

Lee `state.yaml` y retoma desde donde quedo.

---

## Las 12 skills

| Skill | Que hace |
|---|---|
| `sddl-init` | Bootstrap: escanea proyecto, configura AI, genera archivos base |
| `sddl-proposal` | Consolida la idea del cambio con exploracion liviana opcional |
| `sddl-spec` | Formaliza scope, comportamiento esperado y criterios de aceptacion |
| `sddl-design` | Diseno tecnico: arquitectura, patrones y areas afectadas |
| `sddl-plan` | Plan de ejecucion por etapas con dependencias y validacion |
| `sddl-executor` | Ejecuta UNA etapa aprobada. No hace commits ni modifica git |
| `sddl-code-review` | Review 4R de un diff (Risk, Readability, Reliability, Resilience) con triage por riesgo y ledger de hallazgos |
| `sddl-judgment-day` | Review adversarial opt-in: dos jueces ciegos en paralelo; lo que ambos confirman se puede arreglar, las contradicciones escalan a vos |
| `sddl-deep-explorer` | Analisis read-only para resolver incognitas antes de disenar |
| `sddl-qa-review` | Revision por etapa (`stage`) o cierre final (`final`) |
| `sddl-delivery` | Redacta el mensaje de commit, la descripcion del PR y el contenido del ticket. Nunca ejecuta git ni llama a un tracker |
| `sddl-archive` | Mueve cambios terminados, planificados o abandonados al arbol de archivo. Nunca borra ni fusiona |

### Los 2 loops de review en corto

**`sddl-code-review` (4R)** — el default, proporcional al riesgo del diff: trivial no corre nada, standard corre 1 lente, hot-path (auth/seguridad/pagos) o >400 lineas corre los 4 lentes + 1 refuter. Solo hallazgos BLOCKER/CRITICAL disparan fixes (siempre via `plan.md` y con tu aprobacion); el resto queda informativo. Maximo 2 rondas de fix.

**`sddl-judgment-day`** — el caro y preciso, solo a pedido explicito ("judgment day", "dual review", "juzgar"). Dos jueces ciegos revisan lo mismo sin verse: si ambos coinciden en algo severo queda `confirmed`, si solo uno lo ve queda `suspect` (no se arregla solo), si se contradicen escala a decision tuya. Sirve para codigo (`mode: code`, reemplaza al 4R en ese target) o para artefactos de planning (`mode: artifact`: juzgar un `design.md` o `plan.md` antes de ejecutar). Termina en `APPROVED` o `ESCALATED`.

---

## Recomendaciones

- **No saltear etapas.** No ir directo al executor sin propuesta, spec, diseno y plan.
- **Aprobar etapa por etapa.** Revisar lo que propone antes de dejar que ejecute.
- **Retomar siempre desde el orquestador.** El resume se reconstruye de `state.yaml`, no del chat.
- **Escalar si crece.** Si el cambio se vuelve demasiado grande, no forzarlo en sdd-lite.
- **Los artefactos se persisten en ingles.** El chat puede ser en espanol.
- **Nada corre git por vos.** La unica excepcion es `git add` solo si lo pedis en el momento.

---

## Cerrar la entrega (`sddl-delivery`)

Redacta los textos para entregar el trabajo. **Solo redacta**: nunca corre git, nunca llama a un tracker, nunca toca el `lifecycle_status`.

| Modo | Devuelve | Nota |
|---|---|---|
| `commit` | un mensaje de commit | solo a pedido; guarda el SHA si le confirmas que lo aplicaste |
| `pr` | la descripcion del PR | agrupada por tema, sin tabla de archivos |
| `ticket` | descripcion corregida, evidencia, como testear, estado | cuatro bloques que pegas por separado; sirve para cualquier tracker |

Cuando usarlo:

- **recien cerraste un cambio** — la oferta de cierre te lo propone y los artefactos responden casi todo
- **el cambio ya esta archivado** — archivar no bloquea la redaccion
- **no hay flujo SDD** — elegis de una lista numerada de commits previos (`all | none | 1,3 | 1-4 | inspect 3 | done`). Solo se preseleccionan los que tienen SHA registrado; el resto es una recomendacion que confirmas vos

El idioma se elige en el gate, o lo fijas una vez con `delivery.output_language` en `config.yaml`.
Para personalizar un formato pedile la plantilla: se copia una sola vez a `./sdd-lite/templates/delivery/` y despues nada la sobrescribe.

---

## Archivar cambios (`sddl-archive`)

Cuando un cambio deja de estar activo, `sddl-archive` lo saca de `changes/` sin perder el registro. Es contabilidad, no control de calidad: confia en el veredicto de `sddl-qa-review` y nunca lo reemplaza.

Cada cambio archivado conserva todos sus artefactos y suma un `archive-report.md` corto con la disposicion, el veredicto y los pasos exactos para reabrirlo.

| `disposition` | Que significa | Destino |
|---|---|---|
| `closed` | cambio terminado, QA final paso | `archive/` |
| `planned` | objetivo `planner` que quedo en `planned` | `archive/` |
| `abandoned` | el trabajo se corto y no sigue | `archive/_discarded/` |
| `superseded` | reemplazado por otro cambio | `archive/` |

Dos modos:

- **`single`** — un cambio. Se ofrece al cerrar con `sddl-qa-review` en modo `final`, o a pedido.
- **`batch`** — triage interactivo de todos los candidatos:

```
#  change-name              status        edad   veredicto    propuesta
1  add-user-auth            completed     12d    pass         archive (closed)
2  fix-login-redirect       completed     31d    pass_warn    archive (closed)
3  refactor-api-client      draft         45d    -            discard (abandoned)  <- confirmar
4  add-payment-flow         implementing   3d    -            mantener activo

Relacionados: [1, 2] prefijo compartido + 60% de archivos en comun

Acciones: all | none | 1,3 | 1-4 | inspect 3 | skip 4 | done
```

Nada se mueve hasta `done`. `inspect N` muestra el detalle de un cambio sin tocar la seleccion. Solo los candidatos `ready` se preseleccionan; los stale y bloqueados piden confirmacion individual, y `abandoned` pide un motivo de una linea.

Tres reglas duras:

- **Nunca borra.** Los `abandoned` van a `_discarded/` y la skill te imprime el path literal y el comando para que lo borres vos. Te avisa si `sdd-lite/` esta en `.gitignore`, porque ahi el borrado es definitivo.
- **Nunca fusiona.** Los cambios relacionados quedan referenciados en `related_changes`; combinar su contenido es un cambio nuevo, no una accion de archive.
- **Nunca automatico.** Cada movimiento necesita una decision tuya registrada.

Reabrir es mover la carpeta de vuelta a `changes/{nombre}/` y aplicar la edicion de estado que el reporte deja escrita.

**Sugerencia por acumulacion.** `sdd-lite` no tiene evento de fin de sesion, asi que el orquestador chequea una vez al inicio: si los cambios archivables llegan a `archive.suggest_threshold` en `config.yaml` (default 15), te ofrece limpiarlos en una linea y sigue con lo tuyo igual. Cuenta los archivables, no el total.

---

## Archivos generados

```
./sdd-lite/
  project-context.md          # contexto del repo (stack, comandos, convenciones)
  skill-catalog.md            # registro de standards
  openspec/
    config.yaml               # configuracion del proyecto
    changes/{nombre}/
      state.yaml              # estado actual del cambio
      proposal.md             # problema y factibilidad
      spec.md                 # scope y criterios de aceptacion
      design.md               # diseno tecnico
      plan.md                 # plan de ejecucion por etapas
      execution-log.md        # registro de ejecucion
      qa-report.md            # hallazgos y cierre
      review-ledger.md        # solo si corrio un review 4R o judgment-day
      delivery-report.md      # solo si corrio sddl-delivery para este cambio
    reviews/{target}/
      review-ledger.md        # reviews independientes sin cambio activo
    delivery/{target}/
      delivery-report.md      # delivery independiente sin cambio activo
    archive/
      {AAAA-MM-DD}-{nombre}/
        archive-report.md     # mas todos los artefactos que tenia el cambio
      _discarded/
        {AAAA-MM-DD}-{nombre}/  # abandonados, esperando que los borres vos
```

`archive/` es hermano de `changes/`, no hijo, asi que `changes/*/` siempre lista solo cambios activos.
