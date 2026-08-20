-- ==========================================================
-- Migration 056: curso tutorial de la propia plataforma
-- ==========================================================
-- Siembra el curso "Cómo usar Cursos AMX", disponible por defecto en
-- toda instalación (nueva o existente) al correr scripts/migrate.sh.
--
-- Restricciones de diseño, para que funcione en una instalación limpia:
--   * TODAS las lecciones son tipo 'lectura' con `contenido` (Tiptap JSON).
--     No dependen de video HLS, YouTube ni de archivos en Storage: no hay
--     assets que subir y el curso se puede completar de inmediato.
--   * NO se siembra ninguna lección tipo 'examen': el panel de evaluación
--     está detrás del flag de build VITE_FEATURE_EVALUACIONES, apagado por
--     default (ver src/lib/featureFlags.ts). Una lección 'examen' con el
--     flag apagado sería imposible de completar y bloquearía la constancia.
--     El examen final opcional vive en supabase/seeds/tutorial_examen.sql.
--   * Todos los módulos van con requiere_previo = false: es un tutorial de
--     consulta, se debe poder saltar directo al módulo de instructor o de
--     administración.
--
-- Idempotente: UUIDs fijos + ON CONFLICT DO UPDATE. Reaplicar el archivo
-- refresca el contenido sin duplicar filas ni perder el progreso de nadie
-- (progreso/inscripciones cuelgan de estos mismos IDs).
--
-- Para desinstalarlo: supabase/seeds/tutorial_uninstall.sql
-- ==========================================================

-- ---------- Curso ----------
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado)
values (
  'a0000007-0000-4000-8000-000000000001',
  'tutorial-plataforma',
  'Cómo usar Cursos AMX',
  'Recorrido completo por la plataforma: desde crear tu cuenta y tomar tu primer curso hasta publicar el tuyo como instructor y administrar la instalación.',
  'Fundamental',
  145,
  true
)
on conflict (id) do update set
  slug         = excluded.slug,
  titulo       = excluded.titulo,
  descripcion  = excluded.descripcion,
  nivel        = excluded.nivel,
  duracion_min = excluded.duracion_min,
  publicado    = excluded.publicado;

-- ---------- Módulos ----------
insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000007-0001-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 1,
   'Primeros pasos',
   'Qué es la plataforma, cómo crear tu cuenta y cómo inscribirte a tu primer curso.', false),
  ('b0000007-0002-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 2,
   'El reproductor de lecciones',
   'La pantalla donde vas a pasar la mayor parte del tiempo: diseños, tipos de lección y registro de progreso.', false),
  ('b0000007-0003-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 3,
   'Evaluaciones y constancias',
   'Cómo se califican los exámenes, cómo se emite tu constancia y cómo cualquiera puede verificarla.', false),
  ('b0000007-0004-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 4,
   'Participación: foros, chat y entregas',
   'Los módulos sociales del curso y la entrega de tareas con retroalimentación por rúbrica.', false),
  ('b0000007-0005-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 5,
   'Modo instructor',
   'Construir un curso: módulos, lecciones, video HLS y evaluaciones.', false),
  ('b0000007-0006-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 6,
   'Administración de la plataforma',
   'Panel de administración, usuarios, cohortes, sesiones en vivo y reportes.', false),
  ('b0000007-0007-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 7,
   'Configuración e identidad',
   'Feature flags, personalización de marca y plantilla de constancias.', false),
  ('b0000007-0008-4000-8000-000000000001', 'a0000007-0000-4000-8000-000000000001', 8,
   'Cierre',
   'Accesibilidad, idioma, modo offline y qué hacer después de este curso.', false)
on conflict (id) do update set
  curso_id        = excluded.curso_id,
  orden           = excluded.orden,
  titulo          = excluded.titulo,
  descripcion     = excluded.descripcion,
  requiere_previo = excluded.requiere_previo;

-- ==========================================================
-- Módulo 1 — Primeros pasos
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0101-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 1,
 'Bienvenida: qué es Cursos AMX', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Cursos AMX es una plataforma de aprendizaje en línea (LMS) de código abierto. Sirve para publicar cursos, darles seguimiento y emitir constancias verificables. Este curso es, a la vez, el manual de uso y una demostración: cada cosa que se explica aquí la estás usando en este momento."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué vas a encontrar"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma se organiza en tres niveles de uso, y este curso los recorre en ese orden:"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Alumno"},{"type":"text","text":" (módulos 1 a 4): inscribirte, ver lecciones, participar en foros, presentar evaluaciones y obtener tu constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Instructor"},{"type":"text","text":" (módulo 5): construir un curso, subir video y armar evaluaciones."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Administrador"},{"type":"text","text":" (módulos 6 y 7): gestionar usuarios, cohortes, reportes, módulos activables e identidad gráfica."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cómo está hecha"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El frontend es una aplicación Vue 3 con Vite. El backend es Supabase autoalojado: Postgres para los datos, Auth para las cuentas, Storage para archivos, Edge Functions para la lógica de servidor y Realtime para el chat y las notificaciones. El video se transcodifica a HLS con un worker de ffmpeg aparte."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Nada de eso hace falta entenderlo para usar la plataforma. Lo mencionamos porque explica por qué algunas funciones se pueden encender y apagar por instalación, algo que veremos en el módulo 7."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cómo avanzar en este curso: "},{"type":"text","text":"al terminar de leer cada lección, presiona el botón «Marcar completada» al final del texto. Cuando las 26 lecciones estén marcadas, la plataforma emite tu constancia automáticamente."}]}]}
]}
$j$::jsonb),

('c0000007-0102-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 2,
 'Tu cuenta y tu perfil', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El registro es un asistente de cuatro pasos. Se puede abandonar y retomar: nada se guarda hasta el último paso."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los cuatro pasos"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Datos personales."},{"type":"text","text":" Nombres, apellido paterno y apellido materno. Se guardan por separado porque la constancia se imprime con el nombre completo tal como lo escribas aquí."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Datos institucionales."},{"type":"text","text":" Dependencia o área y cargo. Es lo que después permite a un administrador sacar reportes por área."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cuenta."},{"type":"text","text":" Correo, teléfono y contraseña. El correo es tu identificador único y no se puede repetir."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Aviso de privacidad."},{"type":"text","text":" Aceptación explícita. Sin ella no se crea la cuenta."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Corregir tus datos después"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Todo lo anterior es editable desde «Mi perfil», salvo el correo. Conviene revisar la ortografía de tu nombre antes de terminar tu primer curso: la constancia toma el nombre que exista al momento de emitirse."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Roles"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Toda cuenta nace como alumno. Los roles de instructor y de administrador los asigna un administrador desde el panel; no son algo que se pida al registrarse. Si eres el operador de una instalación nueva, el primer administrador se marca directamente en la base de datos."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Si tu institución usa inicio de sesión único (SSO/SAML), estos pasos los reemplaza tu proveedor de identidad y el perfil se llena solo."}]}]}
]}
$j$::jsonb),

('c0000007-0103-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 3,
 'Catálogo, niveles e inscripción', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El catálogo muestra los cursos publicados. Un curso sin publicar solo lo ven su instructor y los administradores, lo cual permite prepararlo con calma antes de abrirlo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cómo leer una tarjeta de curso"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Nivel."},{"type":"text","text":" Fundamental, Intermedio o Avanzado. Es una etiqueta de dificultad, no un requisito: no bloquea la inscripción."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Duración."},{"type":"text","text":" La suma de la duración de todas las lecciones. En los cursos con video se calcula sola a partir del archivo transcodificado."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Módulos y lecciones."},{"type":"text","text":" El módulo agrupa lecciones; la lección es la unidad mínima de progreso."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Inscribirte"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al entrar al detalle del curso verás el temario completo y el botón de inscripción. La inscripción es el permiso: sin ella no puedes reproducir el video, abrir los documentos ni presentar las evaluaciones, aunque veas los títulos en el temario."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Esto no es solo una regla de la interfaz. Las funciones del servidor que entregan un video o un documento comprueban la inscripción antes de responder, así que el contenido no se puede obtener por otra vía."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Módulos con prerrequisito"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un módulo puede exigir que termines el anterior antes de abrirse; aparece con candado hasta que lo completas. Este curso tutorial tiene esa opción desactivada a propósito, para que puedas saltar directo al módulo que te interese."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 2 — El reproductor de lecciones
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0201-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 1,
 'Anatomía del reproductor', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Esta pantalla, la que estás viendo, es el reproductor. Es donde se consume todo el contenido, sea video, texto, documento o examen. Vale la pena reconocer sus cuatro zonas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"1. La barra superior"}]},
 {"type":"paragraph","content":[{"type":"text","text":"A la izquierda, «Salir del curso» te regresa al detalle del curso sin perder nada de lo avanzado, junto con el módulo y el número de la lección actual. A la derecha está el selector de diseño, que veremos en la siguiente lección."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"2. La superficie de contenido"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El área grande. Cambia de forma según el tipo de lección: un video con controles, un visor de PDF, un texto como este o un examen. La plataforma elige la superficie automáticamente; no hay nada que configurar del lado del alumno."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"3. El navegador de lecciones"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La lista lateral con todas las lecciones del curso agrupadas por módulo. Muestra cuáles ya completaste y te permite saltar a cualquiera. Arriba tienes el contador de avance, por ejemplo «7/26», y el porcentaje del curso."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"4. El panel de conversación"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Comentarios y chat en vivo de la lección. Es uno de los módulos activables: si tu instalación lo tiene apagado, el panel simplemente no aparece y el reproductor usa todo el ancho."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"En pantallas angostas las cuatro zonas se apilan en vertical y el navegador de lecciones se vuelve desplegable. El reproductor está pensado para funcionar igual en teléfono."}]}]}
]}
$j$::jsonb),

('c0000007-0202-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 2,
 'Los tres diseños: Split, Chat inferior y Enfoque', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El selector de la barra superior cambia cómo se reparten el espacio el contenido y la conversación. La elección se recuerda entre lecciones y entre sesiones, así que la configuras una vez."}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Split."},{"type":"text","text":" Contenido a la izquierda y conversación a la derecha, lado a lado. Es el diseño por defecto y el que mejor funciona en pantallas anchas cuando el curso tiene discusión activa."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chat inferior."},{"type":"text","text":" El contenido ocupa el ancho completo y la conversación baja debajo. Útil cuando el video trae texto pequeño o diagramas, o cuando lees en una pantalla vertical."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Enfoque."},{"type":"text","text":" Solo el contenido: se ocultan la conversación y el navegador de lecciones. Para estudiar sin distracciones."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Otros ajustes de lectura"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El tema Claro / Oscuro / Sistema se cambia desde el menú de tu cuenta y aplica a toda la plataforma, reproductor incluido. La opción «Sistema» sigue la preferencia de tu computadora o teléfono y cambia sola al anochecer si así lo tienes configurado."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El idioma de la interfaz también se elige desde ahí. Ojo con la diferencia: el idioma cambia los textos de la plataforma (botones, menús, avisos), no el contenido de los cursos, que se queda en el idioma en que lo escribió su autor."}]}
]}
$j$::jsonb),

('c0000007-0203-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 3,
 'Los cinco tipos de lección', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una lección puede tomar cinco formas. Reconocerlas ayuda a saber qué esperar y, sobre todo, cómo se marca cada una como completada."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Video HLS"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El formato principal. El archivo original se transcodifica a varias calidades y el reproductor elige la que aguante tu conexión, subiendo o bajando sobre la marcha. Se completa al llegar al final del video."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Video de YouTube"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Alternativa para cursos que reutilizan material ya publicado. Se incrusta el reproductor de YouTube y también se completa al terminar. No consume almacenamiento de tu instalación."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Documento"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un PDF o una imagen, mostrados en un visor dentro de la plataforma. El archivo no es público: el servidor comprueba tu inscripción antes de entregarlo. Se completa cuando llegas al final del documento."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Texto"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Contenido escrito directamente en la plataforma, con títulos, listas, citas, enlaces e imágenes. Es lo que estás leyendo ahora. Se completa con el botón «Marcar completada» que aparece al final."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Evaluación"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un examen con preguntas. Se completa al aprobarlo, no al abrirlo. Es el único tipo que puede rechazarte y pedirte otro intento; lo vemos a fondo en el módulo 3."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Un tipo más, «recurso», existe en la base de datos para material de apoyo descargable. Su comportamiento es el de una lección sin reproductor."}]}]}
]}
$j$::jsonb),

('c0000007-0204-4000-8000-000000000001', 'b0000007-0002-4000-8000-000000000001', 4,
 'Cómo se registra tu progreso', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El progreso se guarda en el servidor, por lección y por usuario. No vive en el navegador: puedes empezar una lección en la computadora de la oficina y seguirla en el teléfono sin perder nada."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dos cosas distintas se guardan"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Si la lección está completada."},{"type":"text","text":" Un sí o un no. Es lo que cuenta para el porcentaje del curso y para la constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Dónde te quedaste."},{"type":"text","text":" En los videos se guarda el segundo exacto cada pocos segundos, para que al volver retomes en ese punto. Este marcador nunca retrocede: si adelantas y luego regresas, se conserva el avance máximo."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Tiempo activo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Aparte del progreso, la plataforma acumula tu tiempo activo por curso. Solo cuenta con la pestaña visible y con actividad real, y el servidor aplica un tope para que dejar la ventana abierta toda la noche no infle la cifra. Es el número que ves en tu perfil y el que aparece en los reportes del instructor."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Volver a ver una lección"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una lección completada no se cierra. Puedes regresar cuantas veces quieras después de terminar el curso; el progreso ya registrado no se pierde ni se recalcula."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 3 — Evaluaciones y constancias
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0301-4000-8000-000000000001', 'b0000007-0003-4000-8000-000000000001', 1,
 'Cómo funcionan las evaluaciones', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una evaluación es una lección con preguntas. La plataforma la califica sola, en el servidor, en el momento en que envías tus respuestas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los seis tipos de pregunta"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Opción única."},{"type":"text","text":" Varias opciones, una sola correcta."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Opción múltiple."},{"type":"text","text":" Varias correctas. Para acertar hay que marcarlas todas y ninguna de más: no hay crédito parcial."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Verdadero o falso."},{"type":"text","text":" Caso particular de opción única."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Emparejamiento."},{"type":"text","text":" Relacionar dos columnas. Todos los pares deben quedar bien."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Rellenar huecos."},{"type":"text","text":" Escribir la palabra que falta. La comparación ignora mayúsculas y espacios sobrantes."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Ensayo."},{"type":"text","text":" Respuesta abierta. No la califica la máquina: queda pendiente de revisión del instructor."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Puntaje mínimo e intentos"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada evaluación define su puntaje mínimo para aprobar y su número máximo de intentos. Los valores de fábrica son 70 sobre 100 y tres intentos. Antes de empezar verás cuántos intentos te quedan, y cada intento se registra con su calificación aunque lo repruebes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al aprobar, la lección se marca completada en el mismo movimiento. Si la evaluación incluye preguntas de ensayo, la lección queda en espera hasta que el instructor revise, porque su calificación todavía no es definitiva."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Por qué no se pueden filtrar las respuestas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El navegador nunca recibe cuál opción es la correcta. Al abrir el examen, el servidor manda las preguntas y las opciones sin esa marca; al enviar, compara del lado del servidor y devuelve solo el resultado. Ni inspeccionando la página ni interceptando la respuesta se puede ver el examen resuelto."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Las evaluaciones son un módulo activable. Si en tu instalación está apagado, los cursos que las usen mostrarán la lección pero no el panel de preguntas."}]}]}
]}
$j$::jsonb),

('c0000007-0302-4000-8000-000000000001', 'b0000007-0003-4000-8000-000000000001', 2,
 'Tu constancia verificable', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La constancia se emite sola. En cuanto marcas la última lección pendiente de un curso, el servidor comprueba que estén todas y genera el documento. No hay que solicitarla ni esperar aprobación de nadie."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué lleva"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Tu nombre completo"},{"type":"text","text":", tal como está en tu perfil al momento de la emisión."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"El nombre del curso"},{"type":"text","text":" y la fecha de emisión."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Un folio único"},{"type":"text","text":", con el año y un identificador del curso."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"El nombre y cargo del titular"},{"type":"text","text":" que firma, configurables por el administrador."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Un código QR"},{"type":"text","text":" que apunta a la página pública de verificación."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Verificación pública"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Quien reciba tu constancia puede escanear el QR o teclear el folio en la página de verificación. No necesita cuenta ni iniciar sesión. La página responde con el nombre de la persona, el curso y la fecha; si el folio no existe, lo dice."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La verificación solo expone esos datos públicos, nunca el correo ni el resto del expediente de quien la obtuvo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Descargarla"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Desde «Mis constancias» puedes verla en pantalla y descargarla en PDF, listo para imprimir o adjuntar. El PDF se arma en tu navegador a partir de los mismos datos, así que la copia descargada y la que se verifica en línea siempre coinciden."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Una constancia por curso y por persona. Volver a entrar a un curso terminado no genera otra ni cambia el folio."}]}]}
]}
$j$::jsonb),

('c0000007-0303-4000-8000-000000000001', 'b0000007-0003-4000-8000-000000000001', 3,
 'Tu perfil: progreso y logros', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"«Mi perfil» reúne todo lo que la plataforma sabe de tu avance. Es el lugar al que volver cuando quieres retomar algo a medias o necesitas una constancia."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué encuentras ahí"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tus cursos en curso, con el porcentaje de cada uno y un acceso directo a la lección donde te quedaste."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tus cursos terminados y sus constancias, con descarga en PDF."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tu tiempo activo acumulado y un mapa de calor de los días en que estudiaste."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tus datos personales e institucionales, editables."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Puntos, niveles e insignias"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si tu instalación tiene encendida la gamificación, el perfil suma una capa más: puntos automáticos por completar lecciones, aprobar evaluaciones y participar en foros; niveles que van de Novato a Leyenda; e insignias que se desbloquean con criterios que define el administrador."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada curso puede además mostrar su tabla de clasificación. Es opcional y no afecta la constancia: los puntos son un incentivo, no un requisito académico."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 4 — Participación: foros, chat y entregas
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0401-4000-8000-000000000001', 'b0000007-0004-4000-8000-000000000001', 1,
 'Foros del curso', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El foro es la conversación asíncrona del curso: preguntas que no se resuelven en un comentario suelto y que conviene dejar escritas para quienes vengan después."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cómo se organiza"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un curso puede tener varios foros («Dudas generales», «Proyecto final», «Avisos»). Dentro de cada foro se abren hilos, y cada hilo admite respuestas. El anidamiento llega hasta dos niveles: una respuesta a un hilo y una respuesta a esa respuesta. Más allá, la conversación se aplana a propósito, para que un hilo largo siga siendo legible."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Quién puede participar"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Los inscritos al curso, sus instructores y los administradores. Alguien que solo esté viendo el catálogo no ve el foro."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El instructor puede fijar hilos importantes para que queden arriba y cerrarlos cuando el tema se agotó: un hilo cerrado se sigue leyendo pero ya no admite respuestas nuevas. Las acciones de moderación quedan registradas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Foros de cohorte"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si el curso se imparte por generaciones, cada cohorte puede tener su propio foro privado, separado del general. Sirve para que la generación de marzo no vea las discusiones de la de enero."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Los foros son un módulo activable. Con el módulo apagado, la pestaña no aparece en el curso."}]}]}
]}
$j$::jsonb),

('c0000007-0402-4000-8000-000000000001', 'b0000007-0004-4000-8000-000000000001', 2,
 'Chat en vivo de la lección', 'lectura', 240, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El panel lateral del reproductor es un chat por lección, no por curso. Cada lección tiene su propio hilo de comentarios, así que la duda queda pegada al minuto exacto del material que la provocó."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"En vivo de verdad"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Los mensajes aparecen sin recargar la página. Si dos personas ven la misma lección al mismo tiempo, se ven escribir. Si nadie más está conectado, el chat funciona igual como un tablón: tu mensaje queda ahí y el instructor lo contesta después."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Chat y foro no son lo mismo"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chat:"},{"type":"text","text":" corto, atado a una lección, ideal para «no entendí este ejemplo»."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Foro:"},{"type":"text","text":" largo, del curso completo, ideal para una discusión que vale la pena conservar y encontrar después."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Si el diseño «Enfoque» te oculta el panel, no perdiste nada: los mensajes siguen llegando y los ves al volver a Split o a Chat inferior."}]}
]}
$j$::jsonb),

('c0000007-0403-4000-8000-000000000001', 'b0000007-0004-4000-8000-000000000001', 3,
 'Entregas de tareas y rúbricas', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una lección puede pedir que subas un archivo: un ensayo, una hoja de cálculo, una fotografía de un ejercicio. Cuando es así, aparece el área de entrega debajo del contenido."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué puedes subir"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El instructor define qué formatos acepta y cuál es el tamaño máximo. Las dos restricciones se comprueban en el servidor, no solo en el navegador, así que un archivo fuera de lo permitido se rechaza siempre y con un mensaje claro."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Puedes reemplazarla"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Volver a subir no borra lo anterior: crea una versión nueva y la anterior queda archivada. La vigente es siempre la última. Así, si te equivocaste de archivo, se corrige sin perder el historial ni el registro de a qué hora entregaste la primera vez."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Tu entrega es privada. La ven solo tú, los instructores del curso y los administradores; nunca el resto del grupo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Revisión y rúbricas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El instructor revisa y devuelve un estado con comentarios. Cuando la tarea tiene rúbrica, la retroalimentación llega desglosada: cada criterio con el nivel de desempeño que alcanzaste y el motivo. Es más trabajo para quien califica, pero convierte una nota en algo accionable."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una rúbrica es reutilizable: se define una vez, con sus criterios y niveles, y se asigna a las tareas o a las preguntas de ensayo que la necesiten."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 5 — Modo instructor
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0501-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 1,
 'El rol de instructor', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"A partir de aquí el curso cambia de lado del escritorio. Si solo vas a tomar cursos, puedes saltar directo al módulo 8; nada de lo que sigue te hace falta."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Instructor no es administrador"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un administrador puede todo en toda la plataforma. Un instructor puede todo, pero solo en los cursos que tiene asignados. Es una distinción deliberada: permite que cada área lleve su propio curso sin darle acceso al resto de la instalación."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La asignación se hace curso por curso desde el panel de administración. Un curso puede tener varios instructores y una persona puede dar varios cursos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qué te habilita"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Crear y editar los módulos, lecciones y evaluaciones de tus cursos."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ver la lista de alumnos inscritos y su avance."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Revisar y calificar entregas."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Moderar el foro: fijar, cerrar y borrar."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Programar sesiones en vivo y consultar los reportes de tus cursos."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Este límite no es solo de la interfaz. La base de datos comprueba en cada operación que seas instructor de ese curso, así que no hay forma de tocar un curso ajeno por otra ruta."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Publicado y sin publicar"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un curso nuevo nace sin publicar. Puedes armarlo, verlo tal como lo verá el alumno y corregirlo cuantas veces quieras sin que aparezca en el catálogo. Publicarlo es un interruptor, y se puede volver a apagar."}]}
]}
$j$::jsonb),

('c0000007-0502-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 2,
 'Construir un curso', 'lectura', 480, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Un curso se arma en tres niveles: el curso, sus módulos y las lecciones de cada módulo. El editor sigue exactamente esa estructura."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"1. Los datos del curso"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Título, descripción, nivel e imagen de portada. La descripción es lo que decide si alguien se inscribe: conviene decir qué va a saber hacer al terminar, no qué temas se tocan."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La dirección web del curso se deriva del título. Cámbiala antes de publicar si tienes que cambiarla: después, cualquier enlace que ya se haya compartido dejaría de servir."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"2. Los módulos"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada módulo lleva título, descripción y una decisión importante: si exige haber terminado el anterior. Actívalo cuando el orden realmente importe. Un curso de consulta, como este tutorial, se aprovecha mejor sin candados."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"3. Las lecciones"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Por cada lección eliges su fuente: video subido, video de YouTube, documento, texto escrito aquí mismo o evaluación. El editor de texto tiene títulos, listas, citas, negritas, enlaces e imágenes; guarda solo, cada pocos segundos, mientras escribes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El orden se cambia arrastrando, y una lección se puede mover de un módulo a otro dentro del mismo curso. El reacomodo se guarda de una sola vez: o entra completo o no entra, nunca queda a medias."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dos editores"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma trae un editor clásico por formularios, siempre disponible, y un constructor visual con arrastrar y soltar que se enciende con el módulo activable «visual_builder», apagado de fábrica. Los dos escriben lo mismo: puedes empezar en uno y seguir en el otro."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Consejo: arma primero el esqueleto completo, con todas las lecciones vacías y bien ordenadas. Llenarlas después es mucho más rápido que reordenar contenido ya escrito."}]}]}
]}
$j$::jsonb),

('c0000007-0503-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 3,
 'Subir video: de tu archivo a HLS', 'lectura', 420, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El video es el único contenido que no se guarda tal cual lo subes. Pasa por un proceso, y entender ese proceso evita sustos la primera vez."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"La subida se puede interrumpir"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El archivo se manda por partes. Si se cae la conexión o cierras la pestaña a medio camino, al volver retoma donde iba en vez de empezar de cero. Para un archivo de varios gigabytes, esa es la diferencia entre poder subirlo y no."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los cinco estados"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Subiendo."},{"type":"text","text":" El archivo va en camino."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"En espera."},{"type":"text","text":" Llegó completo y está formado para procesarse."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Procesando."},{"type":"text","text":" Se está transcodificando a varias calidades y generando la miniatura."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Listo."},{"type":"text","text":" Reproducible. La duración de la lección se rellena sola con la del archivo."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Falló."},{"type":"text","text":" Con el motivo del error. Suele ser un archivo corrupto o un códec no soportado."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Los estados se actualizan solos en pantalla: no hay que recargar para saber si ya terminó. Puedes cerrar el editor y volver después; el procesamiento ocurre en el servidor, no en tu navegador."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cuánto tarda"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Depende del servidor y de la duración del video, y varios videos en cola se procesan uno tras otro. Si tu instalación tiene varios procesadores en paralelo, se reparten el trabajo sin pisarse ni tomar dos veces el mismo archivo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Por qué HLS"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Un mismo video queda guardado en varias calidades. El reproductor mide la conexión de cada alumno y elige la que aguanta, cambiando sobre la marcha. Quien entra desde datos móviles ve el curso, en menor calidad, en lugar de quedarse mirando una rueda girar."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Si tu instalación no tiene el procesador de video corriendo, usa lecciones de YouTube o de texto. El resto de la plataforma funciona igual."}]}]}
]}
$j$::jsonb),

('c0000007-0504-4000-8000-000000000001', 'b0000007-0005-4000-8000-000000000001', 4,
 'Armar una evaluación', 'lectura', 420, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Una evaluación se crea como cualquier otra lección, eligiendo el tipo «evaluación». Lo que cambia es lo que hay debajo: la configuración del examen y sus preguntas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Los dos ajustes que importan"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Puntaje mínimo."},{"type":"text","text":" De 0 a 100, por defecto 70. Con pocas preguntas, cuida la aritmética: en un examen de cinco preguntas, exigir 70 es en realidad exigir cuatro de cinco."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Intentos máximos."},{"type":"text","text":" Por defecto tres. Cuando se acaban, el alumno no puede volver a presentar y necesita que un administrador intervenga."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Escribir las preguntas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada pregunta tiene su enunciado, su tipo y su respuesta correcta. En opción única y en verdadero o falso se marca una opción; en opción múltiple, todas las que correspondan, recordando que el alumno debe acertarlas todas y ninguna de más."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Los tipos de emparejamiento, rellenar huecos y ensayo forman parte del módulo activable de evaluaciones avanzadas. Con ese módulo apagado, dispones de los tres tipos básicos, que cubren la mayoría de los casos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Preguntas de ensayo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Úsalas sabiendo lo que implican: la máquina no las califica, así que el examen queda pendiente de tu revisión y la lección no se completa hasta que revises. Si el curso es masivo, considéralo antes de incluirlas. Una rúbrica hace esa revisión mucho más rápida y más pareja entre alumnos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Generación asistida"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si tu instalación tiene encendido el módulo de inteligencia artificial, puedes pedir un borrador de preguntas a partir del contenido de una lección. Es un borrador: llega a tu editor para que lo revises y corrijas antes de guardarlo, nunca se publica solo."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Prueba siempre tu examen desde una cuenta de alumno antes de publicar. Es la única forma de ver lo que el alumno ve."}]}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 6 — Administración de la plataforma
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0601-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 1,
 'El panel de administración', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"El panel de administración es la consola de la instalación completa. Solo lo ven las cuentas marcadas como administradoras."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"El tablero"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al entrar verás el pulso de la plataforma: cursos publicados, personas registradas, inscripciones, constancias emitidas y las altas recientes. Sirve para responder de un vistazo «cómo vamos» sin abrir un reporte."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Las secciones"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cursos."},{"type":"text","text":" Crear, editar, publicar y asignar instructores."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Usuarios."},{"type":"text","text":" Buscar personas, cambiar roles y dar de alta en lote."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cohortes y sesiones."},{"type":"text","text":" Generaciones de un curso y clases en vivo."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Reportes."},{"type":"text","text":" Avance, analítica de aprendizaje y consumo de video."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Configuración."},{"type":"text","text":" Constancias, notificaciones, insignias e integraciones."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"El menú se adapta a lo que está encendido: las secciones de los módulos apagados no aparecen. Si buscas algo que no está en el menú, es probable que su módulo esté apagado y no que no exista."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"El primer administrador de una instalación nueva se marca directamente en la base de datos. A partir de ahí, ya puede nombrar a los demás desde el panel."}]}]}
]}
$j$::jsonb),

('c0000007-0602-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 2,
 'Usuarios, áreas e importación masiva', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La gestión de personas tiene dos caminos: uno a uno para casos puntuales, y por lote cuando hay que dar de alta a un área completa."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Uno a uno"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Desde la lista de usuarios puedes buscar por nombre, correo o área, revisar el avance de una persona y cambiar su rol: alumno, instructor o administrador. Los cambios de rol surten efecto la próxima vez que la persona cargue la plataforma."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dependencias y áreas"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El catálogo de dependencias es lo que hace útiles los reportes: sin él, no se puede responder «cuánto avanzó Recursos Humanos». Conviene definirlo antes de abrir el registro, porque reasignar áreas a cientos de personas ya registradas es tedioso."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Importación por lote"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Con el módulo de importación masiva encendido puedes cargar un archivo de valores separados por comas con las personas a invitar. La plataforma lo valida antes de ejecutar nada y te muestra fila por fila qué está bien y qué no: correos mal escritos, duplicados, áreas inexistentes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Solo después de esa revisión se envían las invitaciones. Cada persona recibe un correo para fijar su contraseña; nunca se crean cuentas con contraseñas asignadas por el administrador."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Prueba siempre con un archivo de tres o cuatro filas antes de cargar el de trescientas. La validación previa es buena, pero un ensayo pequeño es mejor."}]}]}
]}
$j$::jsonb),

('c0000007-0603-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 3,
 'Cohortes y sesiones en vivo', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Hasta aquí el curso ha sido a ritmo libre: cada quien entra cuando puede. Las cohortes y las sesiones en vivo son las piezas para dar un curso con calendario y con grupo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cohortes"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una cohorte es una generación de un mismo curso: la de enero y la de marzo, con su fecha de inicio, su fecha de cierre y su cupo máximo. Al llenarse el cupo, la plataforma deja de aceptar inscripciones a esa cohorte."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Cada cohorte puede tener su foro privado, de modo que las discusiones de una generación no se mezclen con las de otra. Los reportes también se pueden filtrar por cohorte, que suele ser la comparación que de verdad interesa."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Sesiones en vivo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una sesión es una clase con fecha y hora. Aparece en el calendario del curso y en el calendario personal de cada alumno, con recordatorio previo. La plataforma registra la asistencia de quienes entran."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La videollamada puede correr en una instancia propia de la plataforma, sin cuentas adicionales, o integrarse con Zoom si tu institución ya lo tiene contratado. Las dos opciones conviven: se elige por sesión."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Grabaciones y transcripción"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Una sesión grabada queda archivada en el curso y se puede buscar después. Con el módulo de transcripción encendido, además se genera el texto de lo dicho, lo que permite buscar por palabra dentro de una clase de dos horas y llegar al minuto exacto. Es también lo que hace accesible el material a quien no puede escucharlo."}]}
]}
$j$::jsonb),

('c0000007-0604-4000-8000-000000000001', 'b0000007-0006-4000-8000-000000000001', 4,
 'Reportes y analítica', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Los reportes existen para responder tres preguntas distintas. Conviene saber cuál estás haciendo antes de abrir una pantalla llena de gráficas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"¿Quién cumplió?"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Avance por persona, por curso, por área y por cohorte, con las constancias emitidas. Es el reporte de cumplimiento, el que se manda hacia arriba, y se puede exportar para trabajarlo en una hoja de cálculo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"¿Dónde se atora la gente?"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El embudo del curso muestra cuántos llegan a cada lección y dónde se caen. Una lección donde abandona la mitad del grupo no es un problema de los alumnos: es una lección que hay que rehacer."}]},
 {"type":"paragraph","content":[{"type":"text","text":"La analítica de video afina esa lectura: qué partes se ven completas, cuáles se adelantan y en qué segundo exacto se cierra la ventana. Los resultados de las evaluaciones, pregunta por pregunta, señalan además qué tema no quedó explicado."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"¿Cuánto cuesta?"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El consumo de almacenamiento, de procesamiento de video y, si usas el módulo de inteligencia artificial, el gasto de sus servicios. Sirve para dimensionar el servidor y para no llevarse sorpresas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Reportes propios y notificaciones"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Si ninguno de los reportes de fábrica dice lo que necesitas, puedes armar uno eligiendo columnas y filtros, y guardarlo para repetirlo cada mes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Con el módulo de notificaciones encendido, algunas de estas señales dejan de requerir que alguien entre a mirar: la plataforma avisa por sí sola cuando un curso está por vencer, cuando hay entregas sin revisar o cuando un grupo lleva semanas sin actividad."}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Módulo 7 — Configuración e identidad
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0701-4000-8000-000000000001', 'b0000007-0007-4000-8000-000000000001', 1,
 'Módulos activables: enciende solo lo que uses', 'lectura', 360, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Esta plataforma trae muchas más funciones de las que una institución necesita al mismo tiempo. Por eso casi todo se puede apagar, y casi todo viene apagado de fábrica."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Empieza en pequeño"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La recomendación es arrancar con lo mínimo —cursos, video, constancias— y encender un módulo cuando alguien lo pida. Una plataforma con foros vacíos, chats sin nadie y cinco tableros que nadie abre se siente abandonada aunque funcione perfecto."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hay dos clases de interruptor"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"De instalación."},{"type":"text","text":" Se definen en la configuración del entorno y se aplican al compilar la aplicación. Cambiarlos exige volver a publicar el sitio. Aquí viven los módulos grandes: foros, chat, entregas, aulas, evaluaciones, gamificación, analítica, inteligencia artificial, notificaciones y modo sin conexión."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"De operación."},{"type":"text","text":" Viven en una tabla de la base de datos y se cambian en caliente, sin volver a publicar nada. Aquí están cosas como el constructor visual, las evaluaciones avanzadas, las rúbricas, las cohortes y la importación masiva."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Los interruptores de operación se leen con una caché corta, así que un cambio tarda unos minutos en verse en las sesiones abiertas. Los de instalación requieren compilar y desplegar de nuevo."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Apagar no borra"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Al apagar un módulo desaparece su interfaz y sus rutas dejan de existir, pero sus datos quedan intactos en la base. Si lo vuelves a encender, los foros, las entregas y los intentos de evaluación siguen ahí, tal como estaban. Esto hace que probar un módulo sea barato y reversible."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Este curso tutorial está escrito para funcionar con todos los módulos apagados. Por eso no incluye examen: sus lecciones son de texto y se marcan completadas a mano."}]}]}
]}
$j$::jsonb),

('c0000007-0702-4000-8000-000000000001', 'b0000007-0007-4000-8000-000000000001', 2,
 'Identidad gráfica de tu institución', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma está pensada para llevar la marca de quien la instala, no la de quien la programó. La personalización es una capa aparte: se cambia sin tocar el código de la aplicación."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Tres cosas y ya"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"El archivo de configuración del tema."},{"type":"text","text":" Nombre de la institución, textos de la portada, paleta de colores, tipografías y datos de contacto del pie de página."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Los archivos de imagen."},{"type":"text","text":" Logotipo, ícono del navegador, imágenes de la portada y de las constancias."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Las secciones de la portada."},{"type":"text","text":" Opcional. Si la portada de fábrica no te sirve, se pueden sustituir sus bloques por otros propios."}]}]}
 ]},
 {"type":"paragraph","content":[{"type":"text","text":"Los colores se definen una sola vez y de ahí salen los dos temas, claro y oscuro, y todos los componentes. Cambiar el color principal repinta la plataforma completa, constancias incluidas."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Actualizar sin perder tu marca"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Como la personalización vive fuera del código de la aplicación, actualizar a una versión nueva no te la borra ni te obliga a rehacerla. Es la razón de que esté separada, y conviene resistir la tentación de meter cambios de marca directamente en los componentes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"El detalle de cada opción está en la documentación de personalización del repositorio."}]}
]}
$j$::jsonb),

('c0000007-0703-4000-8000-000000000001', 'b0000007-0007-4000-8000-000000000001', 3,
 'Configurar las constancias', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"La constancia es lo único de la plataforma que sale del sistema y llega a manos de terceros. Vale la pena dejarla lista antes de que se emita la primera."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Quién firma"}]},
 {"type":"paragraph","content":[{"type":"text","text":"Desde la configuración de constancias se define el nombre y el cargo del titular que aparece firmando, y el lugar de expedición. Viene con valores de ejemplo que hay que cambiar: una constancia firmada por «Nombre Completo Del Titular» no es un detalle menor."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Cuándo cambiarlo"}]},
 {"type":"paragraph","content":[{"type":"text","text":"El nombre del firmante se toma al momento de mostrar la constancia, no al emitirla. Un cambio de titular se refleja también en las constancias ya emitidas. Tenlo presente si tu institución necesita que un documento conserve el firmante que estaba en funciones ese día."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Antes de abrir el primer curso"}]},
 {"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pon el firmante, el cargo y el lugar reales."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Sube el logotipo institucional definitivo."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Termina un curso corto con una cuenta de prueba y revisa la constancia impresa."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Escanea el código de verificación desde un teléfono ajeno a la red interna, para confirmar que la dirección pública es la correcta."}]}]}
 ]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Ese último punto es el que más se olvida: si la plataforma está publicada con una dirección interna, el código de verificación no abrirá desde fuera."}]}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;


-- ==========================================================
-- Módulo 8 — Cierre
-- ==========================================================
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg, contenido) values
('c0000007-0801-4000-8000-000000000001', 'b0000007-0008-4000-8000-000000000001', 1,
 'Idioma, accesibilidad y modo sin conexión', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Tres funciones transversales que no pertenecen a ningún módulo en particular pero cambian bastante quién puede usar la plataforma."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Idioma"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La interfaz viene en español y en inglés, y cada persona elige el suyo desde el menú de su cuenta. Agregar otro idioma es cuestión de traducir un archivo de textos, sin tocar los componentes."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Insistimos en la distinción, porque genera confusión: el idioma cambia la plataforma, no los cursos. Un curso escrito en español se lee en español aunque la interfaz esté en inglés. Para ofrecer un curso en dos idiomas, se publican dos cursos."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Accesibilidad"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma se recorre completa con el teclado y está construida para que un lector de pantalla anuncie los controles. El tema oscuro y el respeto al tamaño de letra del sistema ayudan a quien tiene baja visión."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Buena parte de la accesibilidad, sin embargo, depende de quien escribe el curso: subtitular los videos, describir las imágenes y no dejar información importante únicamente en un color o en un audio. La herramienta acompaña, no sustituye."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Modo sin conexión"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La plataforma se puede instalar como aplicación desde el navegador, con su ícono propio. Con el módulo sin conexión encendido, además guarda las lecciones ya vistas para consultarlas sin señal, y tu progreso se sincroniza solo al recuperar la conexión."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Importa donde la conectividad es intermitente: quien va en el transporte público puede seguir leyendo, y lo que avanzó no se pierde."}]}
]}
$j$::jsonb),

('c0000007-0802-4000-8000-000000000001', 'b0000007-0008-4000-8000-000000000001', 2,
 'Ejercicio final y siguientes pasos', 'lectura', 300, $j$
{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Ya recorriste la plataforma completa. Falta lo único que de verdad enseña: usarla."}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Si vas a tomar cursos"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Revisa tu nombre completo en tu perfil. Es el que llevará tu constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Inscríbete a un curso del catálogo y deja una duda en su foro o en el chat de una lección."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Termina este tutorial: marca la lección que estás leyendo y recoge tu primera constancia."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Si vas a dar cursos"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Crea un curso de prueba sin publicar, con dos módulos y tres lecciones."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Haz una de texto, una de video o documento y una evaluación de tres preguntas."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Recórrelo desde una cuenta de alumno, de principio a fin, hasta ver la constancia."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Recién entonces arma el curso de verdad. La primera vuelta siempre revela algo."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Si administras la instalación"}]},
 {"type":"orderedList","attrs":{"start":1},"content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Carga el catálogo de dependencias antes de abrir el registro."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Configura el firmante de las constancias y la identidad gráfica."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Enciende solo los módulos que alguien vaya a usar esta semana."}]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Verifica una constancia desde fuera de la red interna."}]}]}
 ]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Dónde seguir"}]},
 {"type":"paragraph","content":[{"type":"text","text":"La documentación técnica vive en el repositorio: la guía general, la de personalización de marca, la de la interfaz de programación, la de inicio de sesión único y el manual de actualización. Es software libre: puedes leer el código, adaptarlo y proponer mejoras."}]},
 {"type":"paragraph","content":[{"type":"text","text":"Este curso también es tuyo. Está sembrado como cualquier otro, así que puedes editarlo desde el panel para ajustarlo a tu institución: quitar los módulos que no apliquen, cambiar los ejemplos, agregar tus propias reglas de uso."}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Marca esta lección como completada para cerrar el curso y emitir tu constancia. Gracias por llegar hasta aquí."}]}]}
]}
$j$::jsonb)
on conflict (id) do update set
  modulo_id     = excluded.modulo_id,
  orden         = excluded.orden,
  titulo        = excluded.titulo,
  tipo_material = excluded.tipo_material,
  duracion_seg  = excluded.duracion_seg,
  contenido     = excluded.contenido;

-- ==========================================================
-- Consistencia: la duración declarada del curso = suma real de lecciones
-- ==========================================================
update public.cursos c
set duracion_min = greatest(1, (
  select round(sum(l.duracion_seg)::numeric / 60)
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where m.curso_id = c.id
))
where c.id = 'a0000007-0000-4000-8000-000000000001';
