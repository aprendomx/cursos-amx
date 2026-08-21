<script setup>
import { computed, ref, useId } from 'vue'
import { evaluarContrasena } from '@/lib/contrasena.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // Se acepta un id explícito porque hay pruebas y etiquetas que apuntan a uno
  // conocido. Sin esta prop, el atributo caería en el <div> raíz por herencia
  // y el input quedaría con otro id: la etiqueta seguiría funcionando, pero
  // `#r-password` dejaría de encontrar el campo.
  id: { type: String, default: '' },
  label: { type: String, default: 'Contraseña' },
  // `new-password` para las contraseñas nuevas y `current-password` para la
  // actual: es lo que permite al gestor de contraseñas ofrecer una generada en
  // un caso y la guardada en el otro.
  autocomplete: { type: String, default: 'new-password' },
  // La contraseña ACTUAL no se evalúa contra las reglas: ya existe, y anunciar
  // requisitos junto a ella sugiere que hay que cambiarla.
  anunciarReglas: { type: Boolean, default: true },
  // Error que viene de fuera (del servidor). Se muestra junto al campo, igual
  // que los propios.
  error: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

// El id va al input, no al contenedor: sin esto el atributo se hereda en el
// <div> raíz.
defineOptions({ inheritAttrs: false })

const idAuto = useId()
const id = computed(() => props.id || idAuto)
const idReglas = computed(() => `${id.value}-reglas`)
const idError = computed(() => `${id.value}-error`)

const visible = ref(false)
const tocado = ref(false)

const evaluacion = computed(() => evaluarContrasena(props.modelValue))

// El error propio solo aparece DESPUÉS de escribir: señalar «demasiado corta»
// sobre un campo vacío que nadie ha tocado es regañar antes de tiempo.
const errorPropio = computed(() =>
  tocado.value && props.modelValue ? evaluacion.value.error : null
)
const errorVisible = computed(() => props.error || errorPropio.value)

const descritoPor = computed(
  () =>
    [props.anunciarReglas ? idReglas.value : null, errorVisible.value ? idError.value : null]
      .filter(Boolean)
      .join(' ') || undefined
)
</script>

<template>
  <div class="field campo-contrasena">
    <label :for="id">{{ label }}</label>

    <div class="campo-contrasena-caja">
      <input
        :id="id"
        :value="modelValue"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :aria-describedby="descritoPor"
        :aria-invalid="errorVisible ? 'true' : undefined"
        v-bind="$attrs"
        @input="emit('update:modelValue', $event.target.value)"
        @blur="tocado = true"
      />
      <button
        type="button"
        class="campo-contrasena-ojo"
        :aria-label="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        {{ visible ? 'Ocultar' : 'Mostrar' }}
      </button>
    </div>

    <!-- Las reglas se anuncian ANTES de escribir. Enseñarlas solo al rechazar
         convierte el formulario en una adivinanza. -->
    <ul v-if="anunciarReglas" :id="idReglas" class="campo-contrasena-reglas">
      <li v-for="r in evaluacion.reglas" :key="r.id" :class="{ cumple: r.cumple }">
        <span aria-hidden="true">{{ r.cumple ? '✓' : '·' }}</span>
        {{ r.texto }}
        <!-- El estado no viaja solo en el color ni en el símbolo: se dice. -->
        <span class="solo-lectores">{{ r.cumple ? ' (cumplido)' : ' (pendiente)' }}</span>
      </li>
    </ul>

    <p v-if="errorVisible" :id="idError" class="campo-contrasena-error" role="alert">
      {{ errorVisible }}
    </p>
  </div>
</template>

<style scoped>
.campo-contrasena-caja {
  display: flex;
  align-items: stretch;
  gap: calc(var(--unit) * 1);
}

.campo-contrasena-caja input {
  flex: 1;
  min-width: 0;
}

.campo-contrasena-ojo {
  /* Objetivo táctil: 44 px es el mínimo, y este botón es pequeño de sobra para
     quedarse corto si no se declara. */
  min-height: 44px;
  min-width: 44px;
  padding: 0 calc(var(--unit) * 1.5);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--primary-fg);
  font-family: var(--ui);
  font-size: var(--text-xs);
  cursor: pointer;
}

.campo-contrasena-ojo:hover {
  border-color: var(--primary-fg);
}

.campo-contrasena-reglas {
  margin: calc(var(--unit) * 1) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-xs);
  color: var(--ink-3);
  line-height: var(--leading-normal);
}

.campo-contrasena-reglas .cumple {
  color: var(--success);
}

.campo-contrasena-error {
  /* Junto al campo, no al pie del formulario. Y con texto: el color por sí solo
     no llega a quien no lo distingue. */
  margin-top: calc(var(--unit) * 1);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--danger);
}
</style>
