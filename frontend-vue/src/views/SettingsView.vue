<template>
  <div>
    <section class="panel-grid">
      <!-- Password Change — exact legacy HTML (line 243-245) -->
      <article class="panel"><header class="panel-head"><h2>Segurança</h2></header>
        <form class="form-stack" @submit.prevent="handleChangePassword">
          <label>Senha Atual<input v-model="pw.current" type="password" required minlength="8" autocomplete="current-password"/></label>
          <label>Nova Senha<input v-model="pw.newPw" type="password" required minlength="8" autocomplete="new-password"/></label>
          <label>Confirmar<input v-model="pw.confirm" type="password" required minlength="8" autocomplete="new-password"/></label>
          <div class="row-actions"><button class="btn primary" type="submit">Alterar Senha</button></div>
        </form>
      </article>

      <!-- Categories — exact legacy HTML (line 246-249) + renderCategories() output -->
      <article class="panel"><header class="panel-head"><h2>Categorias</h2></header>
        <form class="form-stack" @submit.prevent="handleCategorySubmit">
          <div class="row-2">
            <label>Nome<input v-model="catForm.name" type="text" placeholder="Ex: Alimentação" maxlength="40" required/></label>
            <label>Tipo
              <select v-model="catForm.type" required>
                <option value="todas">Todas</option>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
                <option value="investimento">Investimento</option>
              </select>
            </label>
          </div>
          <label>Ícone<input v-model="catForm.icon" type="text" placeholder="📁" maxlength="4"/></label>
          <div class="row-actions">
            <button class="btn primary" type="submit">{{ editingCatId ? 'Atualizar' : 'Criar Categoria' }}</button>
            <button v-if="editingCatId" class="btn ghost" type="button" @click="cancelCatEdit">Cancelar</button>
          </div>
        </form>
        <div class="stack-list" style="margin-top:1.25rem">
          <!-- Empty state — exact legacy (line 1546) -->
          <template v-if="!allCategories.length">
            <div class="info-banner">
              <p><strong><i class="fa-solid fa-tags"></i> Categorias Personalizadas</strong></p>
              <p>Crie categorias personalizadas para organizar suas movimentações. O sistema já possui categorias padrão, mas você pode adicionar as suas.</p>
            </div>
            <p class="empty-state">Nenhuma categoria personalizada. Use o formulário acima para criar novas categorias.</p>
          </template>
          <!-- Categories grid — exact legacy renderCategories() output (lines 1550-1566) -->
          <div v-else class="categories-grid">
            <div v-for="c in allCategories" :key="c.name" class="category-chip" :class="{ 'cat-readonly': !c.isCustom }">
              <span class="cat-icon">{{ c.icon || '' }}</span>
              <div class="cat-info">
                <div class="cat-name">{{ c.name }}</div>
                <div class="cat-type">{{ typeLabels[c.type] || c.type }}</div>
              </div>
              <div v-if="c.isCustom" class="cat-actions">
                <button class="mini-btn" type="button" @click="editCategory(c)">Editar</button>
                <button class="mini-btn" type="button" @click="deleteCategory(c)">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- Shortcuts — exact legacy HTML (line 250-252) -->
      <article class="panel"><header class="panel-head"><h2>Atalhos</h2></header>
        <div class="shortcut-list">
          <div class="shortcut-row"><kbd>N</kbd><span>Nova transação</span></div>
          <div class="shortcut-row"><kbd>←</kbd><span>Mês anterior</span></div>
          <div class="shortcut-row"><kbd>→</kbd><span>Próximo mês</span></div>
          <div class="shortcut-row"><kbd>/</kbd><span>Buscar</span></div>
          <div class="shortcut-row"><kbd>Esc</kbd><span>Cancelar</span></div>
          <div class="shortcut-row"><kbd>1–0</kbd><span>Navegar páginas</span></div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { defaultCategoryTypes } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const confirm = inject('confirm')

const typeLabels = { receita: 'Receita', despesa: 'Despesa', investimento: 'Investimento', todas: 'Todas' }

// Password change
const pw = ref({ current: '', newPw: '', confirm: '' })
function handleChangePassword() {
  if (!pw.value.current) {
    app.showMessage('Informe a senha atual.', 'error')
    return
  }
  if (pw.value.newPw.length < 8) {
    app.showMessage('Nova senha deve ter no mínimo 8 caracteres.', 'error')
    return
  }
  if (pw.value.newPw !== pw.value.confirm) {
    app.showMessage('As senhas não conferem.', 'error')
    return
  }
  if (!/[a-zA-Z]/.test(pw.value.newPw) || !/\d/.test(pw.value.newPw)) {
    app.showMessage('Nova senha deve conter letras e números.', 'error')
    return
  }
  data.changePassword(pw.value.current, pw.value.newPw).then(ok => {
    if (ok) pw.value = { current: '', newPw: '', confirm: '' }
  })
}

// Category CRUD — exact legacy renderCategories() merge logic (lines 1528-1543)
const allCategories = computed(() => {
  const catMap = new Map()
  data.categories.forEach(c => {
    catMap.set(c.name.toLowerCase(), { ...c, isCustom: true })
  })
  const usedCats = new Set(data.transactions.map(t => t.category).filter(Boolean))
  usedCats.forEach(name => {
    const key = name.toLowerCase()
    if (!catMap.has(key)) {
      catMap.set(key, { id: null, name, type: defaultCategoryTypes[key] || 'todas', icon: '', isCustom: false })
    }
  })
  return [...catMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
})

const catForm = ref({ name: '', type: 'todas', icon: '📁' })
const editingCatId = computed(() => data.editingCategoryId)

function handleCategorySubmit() {
  data.saveCategory({ name: catForm.value.name, type: catForm.value.type, icon: catForm.value.icon }).then(ok => {
    if (ok) resetCatForm()
  })
}
function resetCatForm() { catForm.value = { name: '', type: 'todas', icon: '📁' }; data.editingCategoryId = null }
function editCategory(c) {
  data.editingCategoryId = c.id
  catForm.value = { name: c.name, type: c.type || 'todas', icon: c.icon || '📁' }
}
function cancelCatEdit() { resetCatForm() }
async function deleteCategory(c) {
  const ok = await confirm({
    title: 'Excluir categoria',
    message: `Excluir a categoria "${c.name}"?`,
    confirmLabel: 'Excluir',
    tone: 'danger'
  })
  if (!ok) return
  data.deleteCategory(c.id)
}
</script>
