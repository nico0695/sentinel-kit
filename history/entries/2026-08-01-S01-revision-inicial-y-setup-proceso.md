# S01 — Revisión inicial, bootstrap sdd-lite y sistema de auditoría

- **Fecha**: 2026-08-01
- **Rama**: `claude/sentinel-cli-code-review-wl7ieg`
- **Alcance**: pre-E0 — validación de documentación y setup del proceso de desarrollo (ninguna historia del backlog implementada aún)
- **Changes sdd-lite**: — (trabajo de sesión/proceso, exento según política de activación)

## Objetivo

Validar todo lo existente (docs, backlog, scripts, sdd-lite, utilidades de IA) antes de arrancar
`[E0.F1.H1]`, y dejar operativos: activación automática de sdd-lite, protocolo de decisiones y
sistema de auditoría.

## Decisiones

| ID | Decisión | Alternativas consideradas | Por qué | Autoría |
|----|----------|---------------------------|---------|---------|
| S01-D1 | Scope npm: `@nico0695/sentinel` (bin `sentinel` + alias `snt`) | Dejar placeholder y decidir en E7 | Desbloquea E0.F1.H1 sin deuda; usuario eligió su scope | `claude→user` |
| S01-D2 | No implementar E0.F1.H1 todavía; solo análisis | Implementar scaffold en la misma sesión | El usuario quiso revalidar el proceso primero | `user` |
| S01-D3 | Backlog en GitHub vía `create-issues.sh` corrido por el usuario localmente (opción A) | (B) sembrar issues sin milestones vía MCP; (C) milestones manuales + issues vía MCP | El entorno remoto no tiene `gh` ni tool MCP para milestones; el script es el camino diseñado y evita duplicados | `claude→user` |
| S01-D4 | Unificar épica E7 como `Wrap-up` en el backlog doc | Renombrar en el script a `Closure` | El script es el que siembra GitHub; menor superficie de cambio | `claude` |
| S01-D5 | Activación determinística de sdd-lite: toda historia `[E*.F*.H*]` y todo cambio multi-archivo corren como change de openspec; triviales exentos | Mantener el modo "sugerir" del wrapper genérico | El usuario pidió uso automático; el modo sugerencia dependía de criterio por sesión | `claude→user` |
| S01-D6 | Protocolo de decisiones A/B/C en CLAUDE.md (autónoma / consulta con recomendación / STOP) | Consultar todo (lento) o autonomía sin registro (opaco) | Define cuándo pedir ayuda y garantiza trazabilidad de autoría | `claude→user` |
| S01-D7 | Auditoría en `history/`: 1 entrada por sesión + INDEX + template + skill `history-log`; obligatoria al cierre | 1 entrada por historia/tarea; solo template manual sin skill | Menos fricción de lectura; la skill estandariza la generación | `claude→user` |
| S01-D8 | Entradas de history en español | Inglés (convención de artefactos persistidos) | Es documentación de proceso para lectura directa del usuario, mismo criterio que backlog/setup en es; código y artefactos sdd-lite siguen en en | `claude` |
| S01-D9 | Bootstrap sdd-lite: `refresh_recommended: false` tras el refresh, con nota de re-refresh obligatorio al aterrizar E0.F1.H1 | Mantener flag true hasta que exista package.json | El flag true bloqueaba por regla la ejecución de la propia historia que crea el toolchain (circular); el estado pre-implementación está documentado, no stale | `claude` |

## Desviaciones

- **Bootstrap de sdd-lite con rutas de otra máquina**: `config.yaml` y `project-context.md`
  apuntaban a `/Users/nicolasschmidt/.../test-cr-cli`. Corregido a `/home/user/sentinel-kit`
  vía refresh `sddl-init`. También se eliminó la referencia a `scripts/` (no existe) y se
  actualizaron riesgos stale (scope npm decidido, issues verificados vacíos).
- **`create-issues.sh` no ejecutable en el entorno remoto** (requiere `gh` CLI; GitHub MCP no
  expone creación de milestones). Resuelto con S01-D3: lo corre el usuario localmente.
  Pendiente de ejecución.
- **CLAUDE.md wrapper vs. política del proyecto**: el bloque generado por sddl-init decía
  "no activar sdd-lite automáticamente". Se reemplazó por puntero a la nueva política
  determinística, que vive fuera del bloque para sobrevivir regeneraciones.

## Trabajo realizado

- Revisión integral: PRD v0.3, setup técnico, backlog (8 épicas / 44 historias — conteos consistentes),
  `create-issues.sh` (correcto; one-shot en issues), sdd-lite (funcional, instalado, schemas válidos),
  11 skills de `.claude/skills/` detectables.
- Verificado en GitHub: 0 issues / 0 milestones en `nico0695/sentinel-kit` (backlog no sembrado).
- Commit `8e2906e` — `docs: unify E7 epic name to Wrap-up to match create-issues.sh` (pusheado).
- Refresh de bootstrap sdd-lite (`sdd-lite/openspec/config.yaml`, `sdd-lite/project-context.md`).
- CLAUDE.md: política de activación sdd-lite + protocolo A/B/C + regla de auditoría obligatoria.
- Creación de `history/` (README, TEMPLATE, INDEX, esta entrada) y skill `.claude/skills/history-log/`.

## Cierre de sesión (actualización)

- ✅ Usuario corrió `create-issues.sh`: 8 milestones + 44 issues creados (#2–#45); verificado vía API.
  `[E0.F1.H1]` = issue #2.
- ✅ Usuario mergeó el PR #1 (rename E7). El commit de auditoría/política quedó fuera del merge;
  se rebasó la rama sobre `main` (protocolo post-merge, `ad7a9e0` → `120073e`) — irá en un PR nuevo.
- Recomendación registrada: arrancar `[E0.F1.H1]` en **sesión nueva** (kickoff limpio con el
  CLAUDE.md actualizado; el estado quedó 100% persistido en git + issues + este history).

## Pendientes y próximos pasos

- **Usuario**: revisar/mergear el PR nuevo con el commit de proceso (`120073e`) cuando se abra.
- **Próxima sesión**: arrancar `[E0.F1.H1]` (issue #2) como change sdd-lite (`e0-f1-h1-scaffold`), con scope
  npm `@nico0695/sentinel`; actualizar el placeholder `@<scope>` en docs en esa misma historia.
- Tras E0.F1.H1: re-refresh del bootstrap sdd-lite (quality commands pasan a ser ejecutables).
- Abiertas del PRD: licencia (E7.F2.H2) y `sentinel open` (decisión 5) — no bloquean.

## Preguntas abiertas para el usuario

—
