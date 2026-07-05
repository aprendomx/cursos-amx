<script>
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'

// Whitelist compartida editor/render: SOLO estos nodos y marks pueden
// producir markup. Es la sanitización estructural del spec §18.
export const EXTENSIONES_TEXTO = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    protocols: ['http', 'https'],
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  }),
  Image,
]
</script>

<script setup>
import { onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'dirty'])
const { t } = useI18n()

let debounceTimer = null
let hayPendiente = false
const editor = useEditor({
  content: props.modelValue,
  extensions: [
    ...EXTENSIONES_TEXTO,
    Placeholder.configure({ placeholder: () => t('builder.editorPlaceholder') }),
  ],
  onUpdate({ editor: ed }) {
    emit('dirty')
    hayPendiente = true
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      emit('update:modelValue', ed.getJSON())
      hayPendiente = false
      debounceTimer = null
    }, 1500)
  },
})

function flush() {
  if (!editor.value || !hayPendiente) return
  clearTimeout(debounceTimer)
  debounceTimer = null
  emit('update:modelValue', editor.value.getJSON())
  hayPendiente = false
}

function setLink() {
  const url = window.prompt(t('builder.linkPrompt'))
  if (!url) return
  if (!/^https?:\/\//.test(url)) return
  editor.value.chain().focus().setLink({ href: url }).run()
}

function addImage() {
  const url = window.prompt(t('builder.imagePrompt'))
  if (!url || !/^https?:\/\//.test(url)) return
  editor.value.chain().focus().setImage({ src: url }).run()
}

defineExpose({ flush, editor })

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  editor.value?.destroy()
})
</script>

<template>
  <div class="rich-editor">
    <div v-if="editor" class="rich-toolbar" role="toolbar">
      <button
        data-test="tb-bold"
        :aria-label="t('builder.tbBold')"
        :class="{ on: editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <b>B</b>
      </button>
      <button
        :aria-label="t('builder.tbItalic')"
        :class="{ on: editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <i>I</i>
      </button>
      <button
        :aria-label="t('builder.tbH2')"
        :class="{ on: editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </button>
      <button
        :aria-label="t('builder.tbH3')"
        :class="{ on: editor.isActive('heading', { level: 3 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </button>
      <button
        :aria-label="t('builder.tbBullet')"
        :class="{ on: editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        ••
      </button>
      <button
        :aria-label="t('builder.tbOrdered')"
        :class="{ on: editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1.
      </button>
      <button
        :aria-label="t('builder.tbQuote')"
        :class="{ on: editor.isActive('blockquote') }"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        "
      </button>
      <button
        :aria-label="t('builder.tbLink')"
        :class="{ on: editor.isActive('link') }"
        @click="setLink"
      >
        🔗
      </button>
      <button :aria-label="t('builder.tbImage')" @click="addImage">🖼</button>
    </div>
    <EditorContent :editor="editor" class="rich-content" />
  </div>
</template>

<style scoped>
.rich-editor {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}
.rich-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  border-bottom: 1px solid var(--line-soft);
}
.rich-toolbar button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-2);
  border-radius: 6px;
  min-width: 30px;
  padding: 4px 6px;
  cursor: pointer;
}
.rich-toolbar button:hover {
  background: var(--paper-2);
}
.rich-toolbar button.on {
  border-color: var(--primary);
  color: var(--primary);
}
.rich-content :deep(.ProseMirror) {
  min-height: 180px;
  padding: calc(var(--unit) * 1.5);
  color: var(--ink);
  outline: none;
}
.rich-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--ink-4);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>
