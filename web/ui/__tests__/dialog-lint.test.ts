import { describe, expect, it } from 'vite-plus/test'
import { checkTemplate } from '../../../tools/oxlint/templates.ts'
import { checkDialogScript } from '../../../tools/oxlint/dialog-script.ts'

const rule = 'no-single-dropdown-dialog'
const form = 'const form = createForm(page);'
const check = (source: string) => checkDialogScript(form + source, 'web/ui/src/workspace.ts')

describe('single-dropdown dialogs', () => {
  it.each([
    '<dialog><DropdownSelect /></dialog>',
    '<dialog><input type="hidden" name="csrf" /><DropdownSelect /></dialog>',
    '<dialog><dropdown-select /></dialog>',
    '<dialog><form><h2>Environment</h2><label>Choose<div><DropdownSelect /></div></label><footer><Button>Cancel</Button><Button>Save</Button></footer></form></dialog>',
    '<div role="dialog"><DropdownSelect /></div>',
    '<section role="alertdialog"><DropdownMenu><Button>Production</Button><Button>Staging</Button></DropdownMenu></section>',
    '<div aria-modal="true"><dropdown-menu /></div>',
    '<DialogPanel><DropdownSelect /></DialogPanel>',
    '<dialog-panel><dropdown-select /></dialog-panel>',
    '<dialog><DropdownSelect v-if="visible" /></dialog>',
    '<dialog><select><option>Staging</option></select></dialog>',
  ])('rejects a dropdown wrapped by dialog chrome: %s', (source) => {
    expect(checkTemplate(source)).toContain(rule)
  })
  it.each([
    '<DropdownMenu><Button>Staging</Button></DropdownMenu>',
    '<dialog><input /><DropdownSelect /></dialog>',
    '<dialog><DropdownSelect /><DropdownSelect /></dialog>',
    '<dialog><CheckboxField /><DropdownSelect /></dialog>',
    '<dialog><textarea /><DropdownSelect /></dialog>',
    '<dialog><CustomFields /><DropdownSelect /></dialog>',
    '<dialog><DropdownSelect v-for="field in fields" /></dialog>',
    '<dialog><div v-for="field in fields"><DropdownSelect /></div></dialog>',
    '<dialog><Button>Confirm</Button></dialog>',
    '<DialogPanel :form="form" />',
  ])('preserves forms, confirmation dialogs and direct menus: %s', (source) => {
    expect(checkTemplate(source)).not.toContain(rule)
  })
  it('checks nested dialogs independently', () => {
    expect(checkTemplate('<dialog><input /><dialog><DropdownSelect /></dialog></dialog>')).toEqual([
      rule,
    ])
  })
  it.each([
    'form.show(title, [{ key: "env", options: environments.map(option) }], {}, submit)',
    'form["show"](title, [{ options }], {}, submit)',
    'const fields = [{ options }]; form.show(title, fields, {}, submit)',
    'const choice = { options }; const fields = [choice]; form.show(title, fields, {}, submit)',
    'const choice = () => ({ options }); form.show(title, [choice()], {}, submit)',
    'function choice() { return { options }; } form.show(title, [choice()], {}, submit)',
    'let fields; if (users) fields = [{ options }]; else fields = [{ key: "name" }]; form.show(title, fields, {}, submit)',
    'const fields = [{ options }]; form.show(title, [...fields], {}, submit)',
    'const choice = { options }; form.show(title, [{ ...choice }], {}, submit)',
    'const fields = [{ "options": [] }] as const; form.show(title, fields, {}, submit)',
  ])('rejects statically defined single-choice forms: %s', (source) => {
    expect(check(source)).toEqual([expect.stringContaining(rule)])
  })
  it.each([
    'form.show(title, [], {}, submit)',
    'form.show(title, [{ key: "name" }], {}, submit)',
    'form.show(title, [{ key: "name" }, { options }], {}, submit)',
    'form.show(title, [{ options }, { options }], {}, submit)',
    'form.show(title, fieldsFromAPI, {}, submit)',
    'const fields = [...fields]; form.show(title, fields, {}, submit)',
    'const choice = { ...choice }; form.show(title, [choice], {}, submit)',
    'other.show(title, [{ options }], {}, submit)',
    'const fields = [{ options }]; function edit() { const fields = [{ key: "name" }]; form.show(title, fields, {}, submit) }',
  ])('accepts other forms without guessing unknown fields: %s', (source) => {
    expect(check(source)).toEqual([])
  })
  it('recognizes aliased form factories', () => {
    expect(
      checkDialogScript(
        'import { createForm as create } from "./forms.ts"; const editor = create(page); editor.show(title, [{ options }], {}, submit)',
        'Example.vue',
      ),
    ).toEqual([expect.stringContaining(rule)])
  })
})
