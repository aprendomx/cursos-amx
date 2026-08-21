-- =========================================================================
-- Migration 073: documentos institucionales versionados
-- =========================================================================
-- Hasta aquí, el aviso de privacidad, los términos de uso y el contacto eran
-- tres enlaces con href '#' en la configuración del tema, y el formulario de
-- alta recababa `perfiles.aviso_privacidad = true` señalando a uno de ellos.
-- Es decir: se guardaba el consentimiento contra un documento inexistente.
--
-- Aquí los documentos pasan a vivir en la base, versionados, y el
-- consentimiento deja de ser un booleano suelto para registrar CONTRA QUÉ
-- VERSIÓN se otorgó — que es lo único que permitiría demostrar, años después,
-- qué texto leyó una persona.
--
-- Dos decisiones que conviene no deshacer sin leer design.md del cambio
-- `paginas-institucionales`:
--
--   * NO hay columna `es_vigente`. La versión vigente es la de mayor `version`
--     entre las publicadas. Un booleano de vigencia hay que mantenerlo en dos
--     filas a la vez y admite estados imposibles (dos vigentes, ninguna).
--     Derivarlo no puede desincronizarse, y además hace la RLS trivial:
--     «publicado_en no nulo» ya deja el borrador invisible.
--
--   * La aceptación NO la escribe el cliente. Va por aceptar_aviso_vigente(),
--     que consulta ella misma cuál es la versión vigente. Si el cliente pudiera
--     mandar el número, alguien podría declararse al día con una versión que
--     nunca vio, y el registro dejaría de valer como prueba.
-- =========================================================================

-- ---------- 1. Documentos y sus versiones ----------

create table if not exists public.documento_versiones (
  slug                  text    not null
                          check (slug in ('aviso-privacidad', 'terminos-uso', 'contacto')),
  version               integer not null check (version > 0),
  contenido             jsonb   not null,
  publicado_en          timestamptz,
  requiere_reaceptacion boolean not null default false,
  publicado_por         uuid    references public.perfiles(id) on delete set null,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  primary key (slug, version)
);

comment on table public.documento_versiones is
  'Documentos institucionales versionados. publicado_en nulo = borrador. La '
  'versión vigente de un slug es la de mayor `version` entre las publicadas; '
  'no hay columna de vigencia a propósito (ver migración 073).';

-- Como mucho un borrador por documento: sin esto, «editar» podría dejar dos
-- textos sin publicar y ninguna forma de saber cuál se publica.
create unique index if not exists documento_borrador_unico
  on public.documento_versiones (slug)
  where publicado_en is null;

create index if not exists documento_publicadas_idx
  on public.documento_versiones (slug, version desc)
  where publicado_en is not null;

-- ---------- 2. La versión vigente ----------

create or replace view public.v_documento_vigente as
select distinct on (slug)
  slug, version, contenido, publicado_en, requiere_reaceptacion
from public.documento_versiones
where publicado_en is not null
order by slug, version desc;

comment on view public.v_documento_vigente is
  'La versión publicada más reciente de cada documento institucional.';

-- ---------- 3. RLS ----------

alter table public.documento_versiones enable row level security;

-- Lectura pública SOLO de lo publicado. Incluye `anon` a propósito: quien
-- todavía no se registra necesita leer el aviso antes de aceptarlo.
--
-- El historial publicado queda legible por cualquiera. Es deseable en un
-- documento legal —permite comprobar qué decía en una fecha— y no expone nada
-- que no se hubiera publicado ya. El borrador no entra porque no cumple la
-- condición, sin necesidad de una regla aparte.
drop policy if exists "documentos: lectura de lo publicado" on public.documento_versiones;
create policy "documentos: lectura de lo publicado"
  on public.documento_versiones for select to anon, authenticated
  using (publicado_en is not null);

drop policy if exists "documentos: admin escribe" on public.documento_versiones;
create policy "documentos: admin escribe"
  on public.documento_versiones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.v_documento_vigente to anon, authenticated;

-- ---------- 4. El historial publicado es inmutable ----------

-- Sin esto, «no se puede alterar el historial» sería una intención y no una
-- garantía: un admin podría reescribir el texto que alguien aceptó y el
-- registro de consentimiento pasaría a apuntar a algo distinto de lo firmado.
create or replace function public.documento_historial_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.publicado_en is not null then
      raise exception 'una versión publicada no se puede borrar'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.publicado_en is not null then
    -- Publicar es el único cambio permitido sobre una fila... y ya estaba
    -- publicada, así que no queda ninguno.
    raise exception 'una versión publicada no se puede modificar'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists documento_historial_inmutable on public.documento_versiones;
create trigger documento_historial_inmutable
  before update or delete on public.documento_versiones
  for each row execute function public.documento_historial_inmutable();

-- ---------- 5. Consentimiento versionado ----------

alter table public.perfiles
  add column if not exists aviso_version_aceptada integer;

comment on column public.perfiles.aviso_version_aceptada is
  'Versión del aviso de privacidad que esta persona aceptó. Nula = sin '
  'aceptar. La escribe aceptar_aviso_vigente(), nunca el cliente.';

-- La persona no elige el número: la función consulta la versión vigente. Así
-- el registro sigue valiendo como prueba.
create or replace function public.aceptar_aviso_vigente()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_version integer;
begin
  if v_uid is null then
    raise exception 'no hay sesión' using errcode = '42501';
  end if;

  select version into v_version
    from public.v_documento_vigente
   where slug = 'aviso-privacidad';

  if v_version is null then
    raise exception 'no hay aviso de privacidad publicado'
      using errcode = 'P0002';
  end if;

  update public.perfiles
     set aviso_privacidad       = true,
         aviso_version_aceptada = v_version,
         actualizado_en         = now()
   where id = v_uid;

  return v_version;
end $$;

grant execute on function public.aceptar_aviso_vigente() to authenticated;

-- La columna no se toca por la vía directa. Dos cosas en un solo trigger, y
-- van juntas a propósito: en Postgres los triggers BEFORE disparan en orden
-- ALFABÉTICO, así que separarlas en dos haría que la coherencia se ejecutara
-- antes que la comprobación y la disparara ella misma.
--
-- 1) Coherencia. Si se retira el consentimiento, la versión aceptada se va con
--    él. Esto es lo que hace compatible la baja ARCO (eliminar_mis_datos,
--    migración 064), que pone aviso_privacidad = false sin conocer esta
--    columna. Se resuelve así en lugar de reescribir aquí sus ~100 líneas:
--    copiar una función sensible es pedir un error de transcripción.
--
-- 2) Comprobación. Fijar una versión concreta solo lo pueden hacer las
--    funciones de confianza. A diferencia de perfiles_guard_roles, NO basta
--    con mirar auth.uid(): la baja ARCO corre como la propia persona, con
--    auth.uid() no nulo. Lo que distingue a las funciones de confianza es que
--    son SECURITY DEFINER: dentro de ellas current_user es el dueño de la
--    función, no el rol de la petición.
--
--    Retirar el consentimiento sí se permite desde una sesión normal: ya se
--    podía con el booleano, y no es lo que hay que impedir. Lo que se impide
--    es FABRICAR una aceptación que nadie otorgó.
--    Este trigger NO es SECURITY DEFINER, y eso es funcional, no un descuido:
--    dentro de una función SECURITY DEFINER current_user pasa a ser su dueño,
--    así que la comprobación de abajo no se cumpliría NUNCA y el guardián
--    dejaría pasar todo. Sin definer, current_user es el rol efectivo de quien
--    escribe: postgres si viene de una función de confianza, `authenticated`
--    si viene de PostgREST.
create or replace function public.perfiles_guard_aviso()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(new.aviso_privacidad, false) then
    new.aviso_version_aceptada := null;
  end if;

  if tg_op = 'UPDATE'
     and new.aviso_version_aceptada is distinct from old.aviso_version_aceptada
     and new.aviso_version_aceptada is not null
     and current_user in ('authenticated', 'anon') then
    raise exception 'la versión del aviso aceptada no se fija a mano'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists perfiles_guard_aviso on public.perfiles;
create trigger perfiles_guard_aviso
  before insert or update on public.perfiles
  for each row execute function public.perfiles_guard_aviso();

-- ¿Hace falta volver a aceptar? Se mira el INTERVALO, no solo la vigente: si
-- se publican dos versiones seguidas y la que exigía re-aceptación es la
-- primera, mirar únicamente la última perdería la obligación.
create or replace function public.aviso_requiere_reaceptacion(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.documento_versiones dv
     where dv.slug = 'aviso-privacidad'
       and dv.publicado_en is not null
       and dv.requiere_reaceptacion
       and dv.version > coalesce(
             (select p.aviso_version_aceptada from public.perfiles p where p.id = p_uid),
             0)
  ) and exists (
    -- Solo se le pide a quien ya había aceptado algo: quien no ha aceptado
    -- nunca pasa por el alta, no por la re-aceptación.
    select 1 from public.perfiles p
     where p.id = p_uid and p.aviso_version_aceptada is not null
  );
$$;

grant execute on function public.aviso_requiere_reaceptacion(uuid) to authenticated;

-- ---------- 6. Siembra: los tres documentos, EN BORRADOR ----------

-- Formato: JSON de Tiptap, el mismo que usan las lecciones. La whitelist
-- EXTENSIONES_TEXTO (src/components/LessonRichTextEditor.vue) es compartida
-- entre el editor y el renderizado, así que un nodo fuera de ella no puede
-- llegar a la página.
--
-- Se siembran sin publicar a propósito. Publicar una plantilla con marcadores
-- {{ }} como si fuera el aviso de la institución sería peor que no tener
-- aviso: daría apariencia de cumplimiento. El alta queda bloqueada mientras no
-- haya versión vigente (ver handle_new_user más abajo), así que el operador se
-- entera en cuanto alguien intenta registrarse, no meses después.
insert into public.documento_versiones (slug, version, contenido, publicado_en)
values
  ('aviso-privacidad', 1, $doc${
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "⚠️ Plantilla sin publicar.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Sustituya todo lo que aparece entre llaves dobles, revísela con su área jurídica y publíquela. Mientras no esté publicada, el registro de nuevas cuentas está bloqueado."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Identidad y domicilio del responsable"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "{{NOMBRE_INSTITUCIÓN}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", con domicilio en {{DOMICILIO_FISCAL_COMPLETO}}, es responsable del tratamiento de sus datos personales."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Datos personales que recabamos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para su registro y participación en la plataforma de capacitación recabamos:"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Nombre y apellidos"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo electrónico"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Teléfono móvil "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Dependencia o área de adscripción "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Cargo "
                },
                {
                  "type": "text",
                  "text": "(opcional)",
                  "marks": [
                    {
                      "type": "italic"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Durante el uso de la plataforma se genera además información sobre su actividad formativa: avance por lección, tiempo activo, intentos y calificaciones de evaluaciones, participaciones en foros y chat, y constancias emitidas."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "No recabamos datos personales sensibles.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Finalidades"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Primarias",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " (necesarias para prestarle el servicio):"
        }
      ]
    },
    {
      "type": "orderedList",
      "attrs": {
        "start": 1
      },
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Crear y administrar su cuenta."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Registrar su avance académico y emitir constancias."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Verificar públicamente la autenticidad de las constancias por folio."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Comunicarle información operativa sobre los cursos en que participa."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Secundarias",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " (puede oponerse sin que afecte su acceso): {{ELIMINAR SI NO APLICA}} elaborar estadísticas agregadas de capacitación y enviarle avisos sobre nuevos cursos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Transferencias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "{{ELEGIR UNA: no realizamos transferencias de sus datos personales a terceros / transferimos sus datos a {{TERCERO}} con la finalidad de {{FINALIDAD}}, con fundamento en {{FUNDAMENTO}}}}."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Ejercicio de derechos ARCO"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Usted puede "
        },
        {
          "type": "text",
          "text": "Acceder",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " a sus datos, "
        },
        {
          "type": "text",
          "text": "Rectificarlos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", "
        },
        {
          "type": "text",
          "text": "Cancelarlos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " u "
        },
        {
          "type": "text",
          "text": "Oponerse",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " a su tratamiento. Desde la propia plataforma, en Mi perfil → Mis datos, puede descargar todos sus datos en formato JSON y eliminarlos."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Sobre las constancias ya emitidas.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Al eliminar sus datos, las constancias expedidas se conservan con su folio, pero el nombre asociado queda anonimizado: el folio circula en documentos ya entregados y su verificación pública debe seguir funcionando. {{AJUSTAR SI SU CRITERIO ES EL BORRADO TOTAL}}"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "También puede ejercer sus derechos escribiendo a "
        },
        {
          "type": "text",
          "text": "{{CORREO_ARCO}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". Responderemos en un plazo máximo de "
        },
        {
          "type": "text",
          "text": "20 días hábiles",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Conservación"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Conservamos sus datos personales durante "
        },
        {
          "type": "text",
          "text": "{{PLAZO}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", salvo obligación normativa que exija un plazo mayor."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Medidas de seguridad"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Aplicamos medidas administrativas, técnicas y físicas para proteger sus datos contra daño, pérdida, alteración, destrucción o uso no autorizado, incluyendo control de acceso por roles y cifrado de las comunicaciones."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cambios a este aviso"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier modificación se publicará en esta misma página. La versión y su fecha de publicación aparecen al pie."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Responsable de datos personales:",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " {{NOMBRE_O_ÁREA}} — {{CORREO_ARCO}}"
        }
      ]
    }
  ]
}$doc$::jsonb, null),
  ('terminos-uso', 1, $doc${
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "⚠️ Plantilla sin publicar.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Sustituya los marcadores y revísela antes de publicarla."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Objeto"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Estos términos regulan el uso de la plataforma de capacitación de "
        },
        {
          "type": "text",
          "text": "{{NOMBRE_INSTITUCIÓN}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cuenta de la persona usuaria"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La cuenta es personal e intransferible. Quien la usa es responsable de la confidencialidad de su contraseña y de la actividad realizada con ella."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Uso aceptable"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "No compartir credenciales ni suplantar a otra persona."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "No publicar en foros ni chats contenido ilícito, ofensivo o ajeno a los cursos."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "No intentar acceder a áreas o datos que no correspondan a su cuenta."
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Las constancias se emiten al cumplir los requisitos de cada curso y llevan un folio verificable públicamente. {{AJUSTAR SI SUS CONSTANCIAS REQUIEREN FIRMA ELECTRÓNICA AVANZADA: estas constancias no van firmadas con e.firma; su respaldo es el registro en el servidor de la institución.}}"
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Propiedad del contenido"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los materiales de los cursos son propiedad de {{NOMBRE_INSTITUCIÓN}} o de sus titulares y se ponen a disposición únicamente para fines formativos."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Suspensión"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "{{NOMBRE_INSTITUCIÓN}} puede suspender el acceso ante un incumplimiento de estos términos, informando el motivo."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Cambios"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier modificación se publicará en esta misma página, con su versión y fecha."
        }
      ]
    }
  ]
}$doc$::jsonb, null),
  ('contacto', 1, $doc${
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "⚠️ Plantilla sin publicar.",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " Sustituya los marcadores por sus datos reales y publíquela."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "{{ÁREA_RESPONSABLE}}"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Correo:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{CORREO_CONTACTO}}"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Teléfono:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{TELÉFONO}} ext. {{EXTENSIÓN}}"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Domicilio:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{DOMICILIO}}"
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Horario de atención:",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " {{HORARIO}}"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Datos personales"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para ejercer sus derechos de acceso, rectificación, cancelación u oposición sobre sus datos personales, escriba a "
        },
        {
          "type": "text",
          "text": "{{CORREO_ARCO}}",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". El detalle del procedimiento está en el aviso de privacidad."
        }
      ]
    },
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Soporte de la plataforma"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para incidencias técnicas —acceso, reproducción de video, constancias— escriba a {{CORREO_SOPORTE}} indicando el curso y una descripción del problema."
        }
      ]
    }
  ]
}$doc$::jsonb, null)
on conflict (slug, version) do nothing;

-- ---------- 7. No se recaba consentimiento sin documento ----------

-- Se rechaza el alta que DECLARE aceptación del aviso cuando no hay ninguna
-- versión vigente. Un alta que no declara aceptación (por ejemplo la que hace
-- scripts/crear-admin.sh para el primer administrador) no se ve afectada: sin
-- ella, publicar el aviso sería imposible, porque no habría administrador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acepta  boolean := coalesce((new.raw_user_meta_data->>'aviso_privacidad')::boolean, false);
  v_version integer;
begin
  if v_acepta then
    select version into v_version
      from public.v_documento_vigente
     where slug = 'aviso-privacidad';

    if v_version is null then
      raise exception
        'Esta instalación aún no tiene aviso de privacidad publicado; '
        'no puede recabarse el consentimiento. Un administrador debe '
        'publicarlo en Administración → Documentos.'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.perfiles (
    id, nombres, apellido_paterno, apellido_materno,
    correo, telefono_movil, dependencia_id, cargo,
    aviso_privacidad, aviso_version_aceptada
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nombres',''), 'Sin nombre'),
    coalesce(nullif(new.raw_user_meta_data->>'apellido_paterno',''), 'Sin apellido'),
    nullif(new.raw_user_meta_data->>'apellido_materno',''),
    new.email,
    nullif(new.raw_user_meta_data->>'telefono_movil',''),
    nullif(new.raw_user_meta_data->>'dependencia_id','')::int,
    nullif(new.raw_user_meta_data->>'cargo',''),
    v_acepta,
    v_version
  )
  on conflict (id) do update
    set nombres          = excluded.nombres,
        apellido_paterno = excluded.apellido_paterno,
        apellido_materno = excluded.apellido_materno,
        telefono_movil   = excluded.telefono_movil,
        dependencia_id   = excluded.dependencia_id,
        cargo            = excluded.cargo,
        aviso_privacidad = excluded.aviso_privacidad,
        aviso_version_aceptada = excluded.aviso_version_aceptada,
        actualizado_en   = now();
  return new;
end $$;

-- ---------- 8. La baja ARCO reinicia también la versión aceptada ----------

-- Filas ya existentes que quedaran incoherentes.
update public.perfiles
   set aviso_version_aceptada = null
 where aviso_privacidad = false
   and aviso_version_aceptada is not null;
