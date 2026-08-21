<script setup>
import { ref } from 'vue'
import IconSet from '@/components/IconSet.vue'
import CampoContrasena from '@/components/CampoContrasena.vue'
import { contrasenaValida } from '@/lib/contrasena.js'
import { cambiarContrasena } from '@/services/recuperacion.js'

const props = defineProps({
  correo: { type: String, required: true },
})

const actual = ref('')
const nueva = ref('')
const guardando = ref(false)
const errorActual = ref('')
const errorNueva = ref('')
const refExito = ref(null)
const cambiada = ref(false)

async function guardar() {
  if (!actual.value || !contrasenaValida(nueva.value) || guardando.value) return
  guardando.value = true
  errorActual.value = ''
  errorNueva.value = ''
  cambiada.value = false

  const r = await cambiarContrasena(props.correo, actual.value, nueva.value)
  guardando.value = false

  if (!r.ok) {
    // El error va al CAMPO que falló, no a un cajón común: quien se equivocó
    // de contraseña actual no tiene que adivinar cuál de las dos cajas fue.
    if (r.campo === 'actual') errorActual.value = r.mensaje
    else errorNueva.value = r.mensaje
    return
  }

  cambiada.value = true
  actual.value = ''
  nueva.value = ''
  // role="alert" anuncia; el foco lleva hasta ahí.
  await new Promise((resolver) => setTimeout(resolver, 0))
  refExito.value?.focus()
}
</script>

<template>
  <form class="pcc" @submit.prevent="guardar">
    <CampoContrasena
      id="pcc-actual"
      v-model="actual"
      label="Contraseña actual"
      autocomplete="current-password"
      :anunciar-reglas="false"
      :error="errorActual"
    />
    <CampoContrasena
      id="pcc-nueva"
      v-model="nueva"
      label="Contraseña nueva"
      autocomplete="new-password"
      :error="errorNueva"
    />

    <div v-if="cambiada" ref="refExito" class="pcc-exito" role="alert" tabindex="-1">
      Tu contraseña quedó cambiada. Es la que usarás la próxima vez que entres.
    </div>

    <button
      class="btn btn-primary btn-sm pcc-guardar"
      type="submit"
      :disabled="!actual || !contrasenaValida(nueva) || guardando"
    >
      <template v-if="guardando"> Guardando… </template>
      <template v-else> Cambiar contraseña <IconSet name="arrow" /> </template>
    </button>
  </form>
</template>

<style scoped>
.pcc {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
  max-width: 480px;
}

.pcc-exito {
  padding: 14px 18px;
  background: var(--success-soft);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.pcc-guardar {
  align-self: flex-start;
}
</style>
