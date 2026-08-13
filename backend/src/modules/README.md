# Modulos del backend

Esta carpeta es el destino de la modularizacion incremental del backend. La
migracion conserva las URLs, los contratos OpenAPI y el comportamiento actual:
la composicion de Express cambia solamente cuando cada modulo tiene sus pruebas
en verde.

## Modulos previstos

- `auth`: sesion, ingreso, seleccion de cuenta y cambio de clave.
- `tickets`: consulta, actualizacion, seguimiento y exportacion de tickets.
- `dashboard`: consultas y resumen operativo.
- `rendimiento`: indicadores ejecutivos y rendimiento del equipo.
- `administracion`: usuarios, roles y operaciones administrativas.
- `ingestion`: webhooks e ingreso de datos desde sistemas externos.

Las carpetas y sus `index.ts` se crean cuando se mueve el primer caso de uso
real. No se agregan archivos vacios ni registros ficticios solo para representar
la estructura.

## Estructura interna

Cada modulo incorpora unicamente las capas que necesite:

```text
<modulo>/
|-- http/          # rutas, adaptacion y validacion HTTP
|-- application/   # casos de uso y reglas de orquestacion
|-- data/          # consultas y persistencia propias del modulo
|-- jobs/          # procesos programados, cuando correspondan
`-- index.ts       # unica API publica consumida desde fuera del modulo
```

Una capa no se crea hasta que exista codigo real que le pertenezca.

## Fronteras

1. `app.ts` y la composicion de rutas pueden importar el `index.ts` publico de
   un modulo.
2. El codigo interno de un modulo puede depender de sus propias capas, de
   `shared` y de los paquetes de `lib`.
3. Si un modulo necesita otro modulo, solo puede importar su `index.ts`; ESLint
   rechaza imports hacia sus archivos internos.
4. Un modulo nuevo no puede depender de `src/routes`: la direccion valida es
   desde la composicion HTTP hacia el modulo.
5. `shared` contiene capacidades tecnicas reutilizables y no puede depender de
   modulos de negocio ni de rutas HTTP.
6. El esquema y las migraciones permanecen en `lib/db`; los contratos permanecen
   en `lib/api-spec`.

## Migracion segura

Para cada modulo:

1. congelar el comportamiento con pruebas de ruta y de reglas relevantes;
2. mover una unidad cohesiva, sin cambiar su URL ni su respuesta;
3. exponerla mediante el `index.ts` del modulo;
4. actualizar solamente el punto de composicion;
5. ejecutar lint, typecheck, pruebas y build;
6. eliminar el archivo legacy solo cuando no tenga consumidores.

Dashboard es el modulo piloto por tener una superficie mas acotada. Tickets se
migra despues y por unidades pequenas debido a sus actualizaciones,
transacciones, auditoria, CSV y eventos en tiempo real.
