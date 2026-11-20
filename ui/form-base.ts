export type ScopeDraft = { id: number; project: string; permissions: string[] }
export type Choice = { value: string; label: string }

export type ScopeFormState = {
  busy: boolean
  scopes: ScopeDraft[] | null
  scopeProjects: Choice[]
  scopePermissions: Choice[]
  globalPermissions: string[]
  nextScopeId: number
}

/** Adds a new project scope draft for the first unselected project option. */
export function addScopeDraft(state: ScopeFormState): void {
  if (state.busy || state.scopes === null) return
  const project = state.scopeProjects.find(
    (option) => !state.scopes?.some((scope) => scope.project === option.value),
  )
  if (project) {
    state.scopes.push({ id: state.nextScopeId++, project: project.value, permissions: [] })
  }
}

/** Returns the selectable permission choices for a given scope draft. */
export function permissionsForScope(state: ScopeFormState, scope: ScopeDraft): Choice[] {
  return state.scopePermissions.filter(
    (permission) => scope.project === '*' || !state.globalPermissions.includes(permission.value),
  )
}

/** Prunes disallowed global permissions when a scope switches away from `*`. */
export function limitScopePermissions(state: ScopeFormState, scope: ScopeDraft): void {
  const allowed = new Set(permissionsForScope(state, scope).map((permission) => permission.value))
  scope.permissions = scope.permissions.filter((permission) => allowed.has(permission))
}

/** Removes a scope draft by id unless the form is busy. */
export function excludeScopeDraft(state: ScopeFormState, id: number): void {
  if (state.busy || state.scopes === null) return
  state.scopes = state.scopes.filter((scope) => scope.id !== id)
}
