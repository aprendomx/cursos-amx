-- =========================================================================
-- Migration 075: términos de uso y contacto genéricos, listos para editar
-- =========================================================================
-- Mismo tratamiento que la 074 dio al aviso de privacidad, para los otros dos
-- documentos: se sustituye la plantilla sembrada por la 073 —marcadores {{ }}
-- con la instrucción dentro del texto— por documentos completos y coherentes,
-- redactados sobre lo que la plataforma hace de verdad.
--
-- Términos de uso: la cuenta y su responsabilidad, el uso aceptable, la
-- propiedad de los materiales, el ALCANCE REAL de las constancias —que no van
-- firmadas con firma electrónica avanzada, algo que conviene decir y no
-- omitir—, la revocación, la disponibilidad del servicio y la suspensión.
--
-- Contacto: los tres motivos por los que alguien escribe —soporte, datos
-- personales y contenido de los cursos— separados, más una nota de que la
-- verificación de constancias no necesita escribir a nadie: se hace con el
-- folio, sin sesión.
--
-- Las mismas dos salvaguardas que la 074: SOLO se toca el borrador intacto
-- (`actualizado_en = creado_en` distingue el seed original de un borrador ya
-- editado) y nunca lo publicado. Una instalación que ya redactó los suyos no
-- se ve afectada.
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
              "text": "sustituya el nombre de la institución y los correos de contacto, y revise los apartados de constancias, disponibilidad y suspensión, que dependen de cómo opere su instalación. Después borre este recuadro."
            }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Punto de partida redactado sobre lo que la plataforma hace, no asesoría jurídica: revíselo con su área jurídica."
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
          "text": "Objeto"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Estos términos regulan el uso de la plataforma de capacitación en línea de "
        },
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
          "text": ". Al registrarse y utilizarla, usted acepta cumplirlos."
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
          "text": "Su cuenta"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "La cuenta es "
        },
        {
          "type": "text",
          "text": "personal e intransferible",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ". Usted es responsable de la confidencialidad de su contraseña y de la actividad que se realice con ella. Si detecta un uso no autorizado, avísenos de inmediato para poder cerrarla."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los datos que registre deben ser veraces: su nombre es el que aparecerá en las constancias que se le expidan, y corregirlo después de la emisión obliga a reexpedirlas."
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
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Al utilizar la plataforma usted se compromete a no:"
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
                  "text": "Compartir sus credenciales ni suplantar la identidad de otra persona."
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
                  "text": "Publicar en foros o chats contenido ilícito, ofensivo, discriminatorio o ajeno a los cursos."
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
                  "text": "Reproducir, distribuir o comercializar los materiales de los cursos fuera de la plataforma sin autorización."
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
                  "text": "Intentar acceder a áreas, cuentas o datos que no le correspondan, ni interferir en el funcionamiento del servicio."
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
                  "text": "Utilizar medios automatizados para resolver evaluaciones o simular avance."
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
          "text": "Materiales de los cursos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Los contenidos —videos, textos, evaluaciones y documentos— son propiedad de "
        },
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
          "text": " o de sus titulares, y se ponen a su disposición únicamente con fines formativos y para su uso personal durante su participación en los cursos."
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
          "text": "Las constancias se expiden automáticamente al cumplir los requisitos de cada curso y llevan un folio verificable públicamente. Su autenticidad se comprueba consultando ese folio contra esta plataforma."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Alcance de la constancia. ",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": "Estas constancias acreditan la participación registrada en la plataforma. "
        },
        {
          "type": "text",
          "text": "No van firmadas con firma electrónica avanzada",
          "marks": [
            {
              "type": "bold"
            }
          ]
        },
        {
          "type": "text",
          "text": ": su respaldo es el registro conservado en los sistemas de la institución. Si su procedimiento exige firma avanzada, indíquelo aquí y añádala."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Una constancia puede revocarse si se acredita que se obtuvo de forma irregular. La revocación queda registrada y la verificación pública lo refleja."
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
          "text": "Disponibilidad del servicio"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Procuramos que la plataforma esté disponible de forma continua, pero puede interrumpirse por mantenimiento, actualizaciones o causas ajenas a la institución. Estas interrupciones no generan responsabilidad ni derecho a compensación, y se avisará con antelación cuando el mantenimiento sea programado."
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
          "text": "Suspensión del acceso"
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
          "text": " puede suspender o cancelar el acceso ante un incumplimiento de estos términos, informando el motivo por el correo registrado. Si la suspensión afecta a un curso en el que ya había avanzado, se le indicará qué ocurre con ese avance y con las constancias ya expedidas."
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
          "text": "Protección de sus datos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "El tratamiento de sus datos personales se rige por el aviso de privacidad de esta plataforma, que puede consultar en cualquier momento desde el pie de página. Para ejercer sus derechos escriba a "
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
          "text": "Modificaciones"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Cualquier cambio a estos términos se publicará en esta misma página, con su número de versión y su fecha. El uso de la plataforma después de una modificación supone su aceptación."
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
          "text": "Dudas"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para cualquier aclaración sobre estos términos escriba a "
        },
        {
          "type": "text",
          "text": "[soporte@institucion.gob.mx]",
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
    }
  ]
}$doc$::jsonb,
       actualizado_en = creado_en
 where slug = 'terminos-uso'
   and publicado_en is null
   and actualizado_en = creado_en;

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
              "text": "sustituya los datos entre corchetes por los reales de su institución. Los tres bloques de abajo cubren los tres motivos por los que la gente escribe; elimine el que no aplique. Después borre este recuadro."
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
          "text": "Soporte de la plataforma"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para incidencias técnicas —no puede entrar, un video no reproduce, una constancia no se genera— escriba indicando el curso y una descripción de lo que ocurre. Si puede, adjunte una captura de pantalla."
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
                  "text": "Correo: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[soporte@institucion.gob.mx]"
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
                  "text": "Teléfono: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[55 0000 0000] ext. [000]"
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
                  "text": "Horario de atención: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[lunes a viernes, de 9:00 a 18:00 h]"
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
          "text": "Para ejercer sus derechos de acceso, rectificación, cancelación u oposición sobre sus datos personales, o para cualquier duda sobre el aviso de privacidad:"
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
                  "text": "Área responsable: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[UNIDAD DE TRANSPARENCIA]"
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
                  "text": "Correo: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[datos.personales@institucion.gob.mx]"
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
                  "text": "Domicilio: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[DOMICILIO OFICIAL]"
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
          "text": "Buena parte de estos derechos puede ejercerlos usted mismo, de inmediato, desde "
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
          "text": ": descargar todos sus datos o eliminarlos."
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
          "text": "Contenido de los cursos"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Para dudas sobre el temario, la programación de un curso o la validez de una constancia:"
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
                  "text": "Área responsable: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[DIRECCIÓN DE CAPACITACIÓN]"
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
                  "text": "Correo: ",
                  "marks": [
                    {
                      "type": "bold"
                    }
                  ]
                },
                {
                  "type": "text",
                  "text": "[capacitacion@institucion.gob.mx]"
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
          "text": "Verificación de constancias"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Si necesita comprobar que una constancia es auténtica, no hace falta escribirnos: use el folio impreso en el documento en la página de verificación pública de esta plataforma. Funciona sin iniciar sesión."
        }
      ]
    }
  ]
}$doc$::jsonb,
       actualizado_en = creado_en
 where slug = 'contacto'
   and publicado_en is null
   and actualizado_en = creado_en;
