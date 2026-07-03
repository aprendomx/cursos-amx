-- ==========================================================
-- CONASAMA LMS — Seed: 6 cursos con módulos y lecciones
-- ==========================================================

-- Completar dependencias que faltan
insert into public.dependencias (nombre, siglas) values
  ('Secretaría de Relaciones Exteriores','SRE'),
  ('Secretaría del Bienestar','BIENESTAR'),
  ('Secretaría de Medio Ambiente y Recursos Naturales','SEMARNAT'),
  ('Secretaría de Cultura','CULTURA'),
  ('Secretaría del Trabajo y Previsión Social','STPS'),
  ('ISSSTE','ISSSTE'),
  ('Otro / Gobierno estatal o municipal', null),
  ('Secretaría de la Función Pública','SFP'),
  ('Archivo General de la Nación','AGN'),
  ('Instituto Nacional Electoral','INE'),
  ('PEMEX','PEMEX'),
  ('Comisión Federal de Electricidad','CFE'),
  ('Secretaría de la Defensa Nacional','SEDENA'),
  ('Secretaría de Comunicaciones y Transportes','SCT'),
  ('Fiscalía General de la República','FGR'),
  ('Secretaría de Desarrollo Agrario, Territorial y Urbano','SEDATU'),
  ('Secretaría de Turismo','SECTUR')
on conflict (nombre) do nothing;

-- ========== CURSO 1: Transparencia y Rendición de Cuentas ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0001-4000-8000-000000000001', 'transparencia-rendicion-cuentas',
   'Transparencia y Rendición de Cuentas',
   'Marco normativo, obligaciones y mejores prácticas para servidores públicos en materia de transparencia.',
   'Fundamental', 380, true);

-- Módulos
insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000001-0001-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 1,
   'Fundamentos de la transparencia',
   'Marco constitucional y legal que da sustento al derecho de acceso a la información pública.', false),
  ('b0000001-0002-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 2,
   'Sujetos obligados y obligaciones de oficio',
   'Quiénes son sujetos obligados, qué información deben publicar y con qué periodicidad.', true),
  ('b0000001-0003-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 3,
   'Clasificación de la información',
   'Reservada, confidencial, pública. Pruebas de daño e interés público.', true),
  ('b0000001-0004-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 4,
   'Procedimiento de acceso a la información',
   'Del ingreso de la solicitud a la respuesta. Plazos, prórrogas y recursos de revisión.', true),
  ('b0000001-0005-4000-8000-000000000001', 'a0000001-0001-4000-8000-000000000001', 5,
   'Casos prácticos y evaluación final',
   'Ejercicios aplicados y examen para constancia  CONASAMA.', true);

-- Lecciones Módulo 1
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000001-0001-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 1, '¿Qué es la transparencia?', 'video', 720),
  ('c0000001-0002-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 2, 'Artículos 6 y 134 constitucionales', 'video', 840),
  ('c0000001-0003-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 3, 'Ley General de Transparencia (LGTAIP)', 'video', 660),
  ('c0000001-0004-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 4, 'Lectura: marco normativo complementario', 'lectura', 480);

-- Lecciones Módulo 2
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000002-0001-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 1, '¿Qué es la transparencia proactiva?', 'video', 684),
  ('c0000002-0002-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 2, 'Obligaciones comunes (Art. 70 LGTAIP)', 'video', 848),
  ('c0000002-0003-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 3, 'Obligaciones específicas por sujeto', 'video', 1002),
  ('c0000002-0004-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 4, 'Plataforma Nacional de Transparencia', 'video', 735),
  ('c0000002-0005-4000-8000-000000000001', 'b0000001-0002-4000-8000-000000000001', 5, 'Lectura complementaria', 'lectura', 480);

-- Lecciones Módulo 3
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000003-0001-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 1, 'Información reservada', 'video', 780),
  ('c0000003-0002-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 2, 'Información confidencial', 'video', 660),
  ('c0000003-0003-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 3, 'Prueba de daño e interés público', 'video', 900),
  ('c0000003-0004-4000-8000-000000000001', 'b0000001-0003-4000-8000-000000000001', 4, 'Ejercicio: clasifica estos documentos', 'examen', 600);

-- Lecciones Módulo 4
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000004-0001-4000-8000-000000000001', 'b0000001-0004-4000-8000-000000000001', 1, 'Solicitud de acceso a la información', 'video', 900),
  ('c0000004-0002-4000-8000-000000000001', 'b0000001-0004-4000-8000-000000000001', 2, 'Plazos, prórrogas y respuesta', 'video', 1020),
  ('c0000004-0003-4000-8000-000000000001', 'b0000001-0004-4000-8000-000000000001', 3, 'Recurso de revisión ante el INAI', 'video', 780);

-- Lecciones Módulo 5
insert into public.lecciones (id, modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('c0000005-0001-4000-8000-000000000001', 'b0000001-0005-4000-8000-000000000001', 1, 'Caso práctico integrador', 'recurso', 1200),
  ('c0000005-0002-4000-8000-000000000001', 'b0000001-0005-4000-8000-000000000001', 2, 'Examen final para constancia', 'examen', 1500);

-- ========== CURSO 2: Gestión Documental ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0002-4000-8000-000000000001', 'gestion-documental',
   'Gestión Documental en la Administración Pública',
   'Ciclo de vida de los documentos institucionales, archivos de trámite y archivo de concentración.',
   'Intermedio', 285, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000002-0001-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 1,
   'Conceptos y normativa archivística', 'Ley General de Archivos y principios de organización documental.', false),
  ('b0000002-0002-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 2,
   'Archivo de trámite', 'Organización, clasificación y cuadro general de clasificación archivística.', true),
  ('b0000002-0003-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 3,
   'Archivo de concentración y archivo histórico', 'Transferencias, valoración y destino final de documentos.', true),
  ('b0000002-0004-4000-8000-000000000001', 'a0000001-0002-4000-8000-000000000001', 4,
   'Gestión documental electrónica', 'Expediente electrónico, firma digital y preservación a largo plazo.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000002-0001-4000-8000-000000000001', 1, 'Ley General de Archivos', 'video', 720),
  ('b0000002-0001-4000-8000-000000000001', 2, 'Principios archivísticos', 'video', 600),
  ('b0000002-0001-4000-8000-000000000001', 3, 'Lectura: glosario archivístico', 'lectura', 360),
  ('b0000002-0002-4000-8000-000000000001', 1, 'Cuadro general de clasificación', 'video', 780),
  ('b0000002-0002-4000-8000-000000000001', 2, 'Organización de expedientes', 'video', 660),
  ('b0000002-0002-4000-8000-000000000001', 3, 'Práctica: clasifica tu archivo', 'examen', 480),
  ('b0000002-0003-4000-8000-000000000001', 1, 'Transferencias primarias y secundarias', 'video', 840),
  ('b0000002-0003-4000-8000-000000000001', 2, 'Valoración documental', 'video', 720),
  ('b0000002-0003-4000-8000-000000000001', 3, 'Destino final: conservar o eliminar', 'video', 600),
  ('b0000002-0004-4000-8000-000000000001', 1, 'Expediente electrónico', 'video', 660),
  ('b0000002-0004-4000-8000-000000000001', 2, 'Preservación digital a largo plazo', 'video', 600),
  ('b0000002-0004-4000-8000-000000000001', 3, 'Examen final', 'examen', 900);

-- ========== CURSO 3: Prevención de Conflicto de Intereses ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0003-4000-8000-000000000001', 'prevencion-conflicto-intereses',
   'Prevención de Conflicto de Intereses',
   'Identificación, declaración y resolución de situaciones de conflicto en el ejercicio público.',
   'Fundamental', 190, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000003-0001-4000-8000-000000000001', 'a0000001-0003-4000-8000-000000000001', 1,
   'Marco legal y conceptual', 'Definiciones, tipos de conflicto y marco normativo aplicable.', false),
  ('b0000003-0002-4000-8000-000000000001', 'a0000001-0003-4000-8000-000000000001', 2,
   'Declaraciones patrimonial e intereses', 'Obligación de declarar, contenido y plazos.', true),
  ('b0000003-0003-4000-8000-000000000001', 'a0000001-0003-4000-8000-000000000001', 3,
   'Casos prácticos y evaluación', 'Análisis de situaciones reales y examen de certificación.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000003-0001-4000-8000-000000000001', 1, '¿Qué es un conflicto de intereses?', 'video', 720),
  ('b0000003-0001-4000-8000-000000000001', 2, 'Tipos: real, aparente y potencial', 'video', 660),
  ('b0000003-0001-4000-8000-000000000001', 3, 'Ley General de Responsabilidades', 'video', 600),
  ('b0000003-0002-4000-8000-000000000001', 1, 'Declaración patrimonial', 'video', 780),
  ('b0000003-0002-4000-8000-000000000001', 2, 'Declaración de intereses', 'video', 720),
  ('b0000003-0002-4000-8000-000000000001', 3, 'Declaración fiscal', 'video', 540),
  ('b0000003-0003-4000-8000-000000000001', 1, 'Caso: el servidor público y la empresa familiar', 'recurso', 900),
  ('b0000003-0003-4000-8000-000000000001', 2, 'Caso: contratación de conocidos', 'recurso', 780),
  ('b0000003-0003-4000-8000-000000000001', 3, 'Examen final', 'examen', 900);

-- ========== CURSO 4: Presupuesto Base Cero ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0004-4000-8000-000000000001', 'presupuesto-base-cero',
   'Presupuesto Base Cero para Unidades Administrativas',
   'Metodología, estructuras programáticas y defensa presupuestal ante autoridades hacendarias.',
   'Avanzado', 495, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000004-0001-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 1,
   'Fundamentos del PBC', 'Historia, principios y diferencia con presupuesto incremental.', false),
  ('b0000004-0002-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 2,
   'Estructura programática', 'Programas presupuestarios, MIR y clasificadores.', true),
  ('b0000004-0003-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 3,
   'Construcción de paquetes de decisión', 'Cómo armar y jerarquizar paquetes.', true),
  ('b0000004-0004-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 4,
   'Defensa presupuestal', 'Preparación para la audiencia ante SHCP.', true),
  ('b0000004-0005-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 5,
   'Seguimiento y evaluación', 'Indicadores de desempeño y rendición de cuentas.', true),
  ('b0000004-0006-4000-8000-000000000001', 'a0000001-0004-4000-8000-000000000001', 6,
   'Taller integrador y evaluación', 'Ejercicio completo y examen de certificación.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000004-0001-4000-8000-000000000001', 1, 'Historia del PBC', 'video', 660),
  ('b0000004-0001-4000-8000-000000000001', 2, 'PBC vs presupuesto incremental', 'video', 720),
  ('b0000004-0001-4000-8000-000000000001', 3, 'Marco jurídico presupuestal', 'video', 780),
  ('b0000004-0001-4000-8000-000000000001', 4, 'Lectura: LFPRH y su reglamento', 'lectura', 600),
  ('b0000004-0002-4000-8000-000000000001', 1, 'Programas presupuestarios', 'video', 840),
  ('b0000004-0002-4000-8000-000000000001', 2, 'Matriz de Indicadores para Resultados', 'video', 900),
  ('b0000004-0002-4000-8000-000000000001', 3, 'Clasificadores del gasto', 'video', 720),
  ('b0000004-0003-4000-8000-000000000001', 1, 'Paquetes de decisión: concepto', 'video', 660),
  ('b0000004-0003-4000-8000-000000000001', 2, 'Jerarquización de paquetes', 'video', 720),
  ('b0000004-0003-4000-8000-000000000001', 3, 'Ejercicio: construye tu paquete', 'examen', 900),
  ('b0000004-0004-4000-8000-000000000001', 1, 'Preparación de la audiencia', 'video', 840),
  ('b0000004-0004-4000-8000-000000000001', 2, 'Argumentación presupuestal', 'video', 780),
  ('b0000004-0004-4000-8000-000000000001', 3, 'Simulación de defensa', 'recurso', 1200),
  ('b0000004-0005-4000-8000-000000000001', 1, 'Indicadores de desempeño', 'video', 720),
  ('b0000004-0005-4000-8000-000000000001', 2, 'Informes trimestrales', 'video', 660),
  ('b0000004-0005-4000-8000-000000000001', 3, 'Cuenta pública', 'video', 600),
  ('b0000004-0005-4000-8000-000000000001', 4, 'Lectura: ASF y auditoría', 'lectura', 480),
  ('b0000004-0006-4000-8000-000000000001', 1, 'Taller integrador PBC', 'recurso', 1800),
  ('b0000004-0006-4000-8000-000000000001', 2, 'Examen de certificación', 'examen', 1500),
  ('b0000004-0006-4000-8000-000000000001', 3, 'Recursos adicionales', 'recurso', 600),
  ('b0000004-0006-4000-8000-000000000001', 4, 'Encuesta de satisfacción', 'recurso', 300);

-- ========== CURSO 5: Atención Ciudadana ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0005-4000-8000-000000000001', 'atencion-ciudadana',
   'Atención Ciudadana y Trato Digno',
   'Protocolos de atención, lenguaje incluyente y resolución de quejas en ventanilla y en línea.',
   'Fundamental', 170, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000005-0001-4000-8000-000000000001', 'a0000001-0005-4000-8000-000000000001', 1,
   'Principios de atención ciudadana', 'Derechos ciudadanos, actitud de servicio y protocolos básicos.', false),
  ('b0000005-0002-4000-8000-000000000001', 'a0000001-0005-4000-8000-000000000001', 2,
   'Comunicación incluyente y empática', 'Lenguaje claro, incluyente y técnicas de escucha activa.', true),
  ('b0000005-0003-4000-8000-000000000001', 'a0000001-0005-4000-8000-000000000001', 3,
   'Resolución de quejas y evaluación', 'Manejo de conflictos en ventanilla y canales digitales.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000005-0001-4000-8000-000000000001', 1, 'Carta de derechos ciudadanos', 'video', 600),
  ('b0000005-0001-4000-8000-000000000001', 2, 'Actitud de servicio', 'video', 540),
  ('b0000005-0001-4000-8000-000000000001', 3, 'Protocolo de atención en ventanilla', 'video', 720),
  ('b0000005-0002-4000-8000-000000000001', 1, 'Lenguaje claro e incluyente', 'video', 660),
  ('b0000005-0002-4000-8000-000000000001', 2, 'Escucha activa y empatía', 'video', 600),
  ('b0000005-0003-4000-8000-000000000001', 1, 'Manejo de quejas presenciales', 'video', 780),
  ('b0000005-0003-4000-8000-000000000001', 2, 'Atención en canales digitales', 'video', 660),
  ('b0000005-0003-4000-8000-000000000001', 3, 'Examen final', 'examen', 900);

-- ========== CURSO 6: Firma Electrónica ==========
insert into public.cursos (id, slug, titulo, descripcion, nivel, duracion_min, publicado) values
  ('a0000001-0006-4000-8000-000000000001', 'firma-electronica-tramites',
   'Firma Electrónica y Trámites Digitales',
   'e.firma, sellos digitales y expediente electrónico en trámites gubernamentales.',
   'Intermedio', 210, true);

insert into public.modulos (id, curso_id, orden, titulo, descripcion, requiere_previo) values
  ('b0000006-0001-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 1,
   'Fundamentos de la firma electrónica', 'Criptografía básica, PKI y marco legal.', false),
  ('b0000006-0002-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 2,
   'e.firma del SAT', 'Obtención, renovación y uso de la e.firma.', true),
  ('b0000006-0003-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 3,
   'Sellos digitales y CFDI', 'Certificados de sello digital y comprobantes fiscales.', true),
  ('b0000006-0004-4000-8000-000000000001', 'a0000001-0006-4000-8000-000000000001', 4,
   'Expediente electrónico gubernamental', 'Tramitación digital, interoperabilidad y gob.mx.', true);

insert into public.lecciones (modulo_id, orden, titulo, tipo_material, duracion_seg) values
  ('b0000006-0001-4000-8000-000000000001', 1, 'Criptografía de clave pública', 'video', 720),
  ('b0000006-0001-4000-8000-000000000001', 2, 'Infraestructura de clave pública (PKI)', 'video', 600),
  ('b0000006-0001-4000-8000-000000000001', 3, 'Marco legal: Ley de Firma Electrónica Avanzada', 'video', 660),
  ('b0000006-0002-4000-8000-000000000001', 1, 'Obtención de la e.firma', 'video', 540),
  ('b0000006-0002-4000-8000-000000000001', 2, 'Renovación y revocación', 'video', 480),
  ('b0000006-0002-4000-8000-000000000001', 3, 'Uso de la e.firma en trámites', 'video', 600),
  ('b0000006-0003-4000-8000-000000000001', 1, 'Certificados de sello digital', 'video', 600),
  ('b0000006-0003-4000-8000-000000000001', 2, 'CFDI: estructura y timbrado', 'video', 720),
  ('b0000006-0004-4000-8000-000000000001', 1, 'Ventanilla única digital', 'video', 660),
  ('b0000006-0004-4000-8000-000000000001', 2, 'Examen final', 'examen', 900);
