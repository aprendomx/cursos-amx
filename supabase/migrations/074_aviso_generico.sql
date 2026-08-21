-- =========================================================================
-- Migration 074: aviso de privacidad genérico, listo para editar
-- =========================================================================
-- La migración 073 sembró el aviso a partir de docs/AVISO_PRIVACIDAD.md, que
-- es una PLANTILLA: quince marcadores {{ }} intercalados, incluidos algunos
-- con instrucciones dentro del propio texto ({{ELEGIR UNA:}}). Publicarla
-- exigía redactar, no editar.
--
-- Este seed lo sustituye por un aviso completo y coherente, redactado sobre lo
-- que la plataforma hace de verdad —qué datos pide, qué genera, qué expone la
-- verificación de constancias, qué guarda en el navegador—, con solo CUATRO
-- datos entre corchetes:
--
--   [NOMBRE DE LA INSTITUCIÓN]  [DOMICILIO OFICIAL]
--   [UNIDAD DE TRANSPARENCIA]   [datos.personales@institucion.gob.mx]
--
-- El plazo de conservación trae un valor concreto (cinco años) en lugar de un
-- hueco, porque un valor que se puede revisar es más útil que un espacio en
-- blanco que hay que rellenar a ciegas.
--
-- Sigue SIN publicarse. Un aviso de privacidad lo revisa el área jurídica de
-- cada institución; el software no puede hacer esa parte.
--
-- SOLO se toca el borrador INTACTO. La condición `actualizado_en = creado_en`
-- distingue el seed original de un borrador que alguien ya editó: el servicio
-- actualiza esa columna al guardar. Y `publicado_en is null` deja fuera
-- cualquier versión publicada, que además es inmutable por trigger. Una
-- instalación que ya empezó a redactar su aviso no se ve afectada.
-- =========================================================================

update public.documento_versiones
   set contenido = $doc${
  "type": "doc",
  "content": [
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Antes de publicar: ",
              "marks": [
                {
                  "type": "bold"
                }
              ]
            },
            {
              "type": "text",
              "text": "sustituya los cuatro datos entre corchetes —nombre de la institución, domicilio, correo para derechos ARCO y área responsable—, revise el plazo de conservación y confirme el apartado de transferencias. Después borre este recuadro."
            }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Este texto es un punto de partida redactado sobre lo que la plataforma hace realmente, no asesoría jurídica: revíselo con su área jurídica antes de publicarlo."
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
          "text": "Identidad y domicilio del responsable"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "[NOMBRE DE LA INSTITUCIÓN]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", con domicilio en "
        },
        {
          "type": "text",
          "text": "[DOMICILIO OFICIAL]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", es responsable del tratamiento de sus datos personales y de su protección, conforme a la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados y demás normativa aplicable."
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
          "text": "Al registrarse en esta plataforma de capacitación le solicitamos:"
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
                  "text": "Cargo o puesto "
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
          "text": "Durante el uso de la plataforma se genera además información sobre su actividad formativa: avance por lección, tiempo activo, intentos y calificaciones de las evaluaciones, participaciones en foros y chat, y las constancias que se le expidan."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "No recabamos datos personales sensibles",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", es decir, aquellos que puedan revelar origen racial o étnico, estado de salud, información genética, creencias religiosas, filosóficas o morales, afiliación sindical, opiniones políticas o preferencia sexual."
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
          "text": "Finalidades del tratamiento"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Sus datos se tratan para las siguientes finalidades "
        },
        {
          "type": "text",
          "text": "necesarias",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " para prestarle el servicio:"
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
                  "text": "Crear y administrar su cuenta y controlar el acceso a la plataforma."
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
                  "text": "Inscribirle en los cursos y registrar su avance académico."
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
                  "text": "Aplicar y calificar evaluaciones."
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
                  "text": "Expedir las constancias que acrediten su participación."
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
                  "text": "Permitir la verificación pública de la autenticidad de una constancia a partir de su folio."
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
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "Elaborar estadísticas agregadas de capacitación, sin identificarle individualmente."
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
          "text": "No utilizamos sus datos para finalidades distintas de las anteriores. Si en el futuro se incorporara alguna, se le informará mediante una versión nueva de este aviso."
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
          "text": "Verificación pública de constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cada constancia lleva un folio verificable por cualquier persona que lo conozca. Al consultarlo se muestran únicamente "
        },
        {
          "type": "text",
          "text": "el nombre de la persona titular, el curso y la fecha de emisión",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ": lo mínimo para comprobar que el documento es auténtico. No se expone ningún otro dato de su cuenta."
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
          "text": "No realizamos transferencias de sus datos personales a terceros",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", salvo las que sean necesarias para atender requerimientos de autoridad competente debidamente fundados y motivados."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La plataforma se opera en infraestructura de la propia institución. Si su instalación utiliza servicios externos —correo saliente, videoconferencia o transcripción automática—, declárelos aquí."
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
          "text": "Usted puede en todo momento "
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
          "text": " a sus datos personales, solicitar su "
        },
        {
          "type": "text",
          "text": "Rectificación",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " cuando sean inexactos, su "
        },
        {
          "type": "text",
          "text": "Cancelación",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " cuando considere que no son necesarios, u "
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
          "text": " a su tratamiento."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Desde la propia plataforma, en "
        },
        {
          "type": "text",
          "text": "Mi perfil → Mis datos",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", puede:"
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
                  "text": "Descargar",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " todos sus datos personales en un archivo JSON."
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
                  "text": "Eliminar",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": " sus datos personales de forma inmediata."
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
          "text": "Sobre las constancias ya expedidas. ",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "Al eliminar sus datos, las constancias que se le hayan expedido se conservan con su folio, pero el nombre asociado queda anonimizado. El motivo es que esos folios circulan en documentos ya entregados a terceros y su verificación pública debe seguir funcionando. Si su criterio es el borrado total, ajuste este párrafo y el procedimiento."
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
          "text": "[datos.personales@institucion.gob.mx]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ", acompañando: nombre completo, medio para recibir la respuesta, copia de una identificación oficial, descripción clara de los datos sobre los que ejerce el derecho y, en su caso, los documentos que sustenten su solicitud."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Responderemos su solicitud en un plazo máximo de "
        },
        {
          "type": "text",
          "text": "veinte días hábiles",
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
          "text": "Conservación de los datos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Conservamos sus datos personales mientras su cuenta permanezca activa y hasta "
        },
        {
          "type": "text",
          "text": "cinco años",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " después de su última actividad en la plataforma, salvo que una disposición normativa exija un plazo mayor. Ajuste este plazo al que corresponda a su institución."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los registros de constancias se conservan de forma permanente para permitir su verificación, en los términos descritos arriba."
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
          "text": "Aplicamos medidas administrativas, técnicas y físicas para proteger sus datos contra daño, pérdida, alteración, destrucción o uso no autorizado, entre ellas: control de acceso por roles, cifrado de las comunicaciones, contraseñas almacenadas de forma irreversible y respaldos periódicos de la base de datos."
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
          "text": "Almacenamiento en su navegador"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La plataforma guarda información en su navegador para funcionar: su sesión iniciada, sus preferencias de visualización y, si activa el modo sin conexión, los materiales que descargue. No utilizamos cookies de publicidad ni de seguimiento de terceros."
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
          "text": "Cualquier modificación a este aviso se publicará en esta misma página. Cada publicación queda registrada con su número de versión y su fecha, que aparecen al pie. Cuando un cambio lo amerite, le solicitaremos de nuevo su consentimiento."
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
          "text": "Responsable de datos personales"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "[UNIDAD DE TRANSPARENCIA]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": " — "
        },
        {
          "type": "text",
          "text": "[datos.personales@institucion.gob.mx]",
          "marks": [
            {
              "type": "bold"
            }
          ]
        }
      ]
    }
  ]
}$doc$::jsonb,
       actualizado_en = creado_en
 where slug = 'aviso-privacidad'
   and publicado_en is null
   and actualizado_en = creado_en;
