-- 005 — Saber SI una lección tiene contenido sin descargarlo.
--
-- El reproductor carga la lista de lecciones del curso al abrirse, y lo hacía
-- con `select=*`: eso incluye `contenido`, el cuerpo Tiptap completo de cada
-- lección de texto. Un curso de cien lecciones son unos 2 MB por apertura,
-- para mostrar una sola.
--
-- La columna solo se usaba como booleano («¿esta lección es de texto?»), así
-- que ese booleano pasa a ser una columna generada: se calcula al escribir,
-- no ocupa nada y se puede pedir en el listado. El `contenido` de verdad se
-- carga bajo demanda, solo el de la lección activa — el mismo patrón que ya
-- usan los subtítulos.

alter table public.lecciones
  add column if not exists tiene_contenido boolean
    generated always as (contenido is not null) stored;

comment on column public.lecciones.tiene_contenido is
  'Generada: contenido is not null. Permite listar lecciones sin descargar el cuerpo de cada una.';
