/**
 * Global confirm dialog composable.
 * Mirrors the legacy showConfirmDialog() pattern — returns a Promise.
 */
import { ref, readonly } from 'vue'

const visible = ref(false)
const title = ref('Confirmar ação')
const message = ref('')
const tone = ref('') // '' | 'danger'
let _resolve = null

export function useConfirm() {
  /**
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {string} [opts.tone] - '' | 'danger'
   * @returns {Promise<boolean>}
   */
  function confirm(opts = {}) {
    title.value = opts.title || 'Confirmar ação'
    message.value = opts.message || ''
    tone.value = opts.tone || ''
    visible.value = true
    return new Promise((resolve) => { _resolve = resolve })
  }

  function accept() {
    visible.value = false
    _resolve?.(true)
    _resolve = null
  }

  function cancel() {
    visible.value = false
    _resolve?.(false)
    _resolve = null
  }

  return {
    visible: readonly(visible),
    title: readonly(title),
    message: readonly(message),
    tone: readonly(tone),
    confirm,
    accept,
    cancel,
  }
}
