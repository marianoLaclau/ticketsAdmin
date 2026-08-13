# Codigo compartido del backend

Esta carpeta alojara capacidades tecnicas sin reglas propias de un modulo, por
ejemplo seguridad transversal, observabilidad, tiempo, eventos y ciclo de vida
del proceso.

`shared` puede depender de paquetes de `lib`, pero no de `modules` ni de
`routes`. Una utilidad usada por un solo modulo debe permanecer dentro de ese
modulo hasta que exista una segunda necesidad real.
