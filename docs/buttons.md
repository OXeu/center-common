# Shared buttons / 统一按钮

All action buttons and styled navigation links use `@oxeu/center-common/ui/Button.vue`. The component owns geometry, colors, icon spacing, focus indicators and disabled behavior. Business wrappers such as `DangerActions` compose it without defining button styles.

所有操作按钮和按钮样式的导航链接统一使用公共 `Button`。尺寸、配色、图标间距、焦点和禁用行为由公共组件维护；`DangerActions` 等业务封装只负责组合组件和业务行为。

## Options / 选项

| Prop       | Values                                                 | Default     |
| ---------- | ------------------------------------------------------ | ----------- |
| `size`     | `sm`, `normal`, `lg`, `xl`                             | `normal`    |
| `variant`  | `primary`, `secondary`, `ghost`, `danger`, `forbidden` | `primary`   |
| `content`  | `text`, `icon-text`, `icon`                            | `text`      |
| `type`     | `button`, `submit`, `reset`                            | `button`    |
| `align`    | `center`, `start`                                      | `center`    |
| `block`    | Boolean, full width / 占满宽度                         | `false`     |
| `disabled` | Boolean, temporarily unavailable / 暂时不可用          | `false`     |
| `href`     | Navigation destination / 导航地址                      | absent / 无 |

- Desktop minimum heights are **32 / 36 / 44 / 52 px**, respectively.
- Below 640 px, buttons retain a minimum 44 px touch target; larger sizes remain larger.
- All variants share the same geometry; icon-only controls are square.
- Text can wrap without clipping in narrow containers.
- `forbidden` always disables interaction, even when `disabled` is false.
- Disabled links have no `href`, leave the tab order and expose `aria-disabled`.
- `href` delegates to `NavigationLink`, preserving Router navigation and ordinary external links.

四种尺寸的桌面最小高度依次为 **32 / 36 / 44 / 52 px**，移动端最小触摸高度为 44 px。不同样式不改变同尺寸按钮的规格，纯图标按钮为正方形。`forbidden` 始终不可操作；暂时不可用的普通按钮使用 `disabled`。

## Usage / 用法

```vue
<script setup lang="ts">
import Button from '@oxeu/center-common/ui/Button.vue'
</script>

<template>
  <Button type="submit" size="normal" variant="primary">Save</Button>
  <Button size="lg" variant="secondary" content="icon-text" icon="ri-add-line">Create</Button>
  <Button size="sm" variant="ghost" content="icon" icon="ri-close-line" aria-label="Close" />
  <Button href="/projects" variant="ghost">Projects</Button>
  <Button variant="forbidden">Unavailable</Button>
</template>
```

Use `icon` for a Remix Icon class or the named `#icon` slot for an existing avatar or logo. Icon-only controls require a nonempty `aria-label` or `aria-labelledby`. Labels remain consumer translations. Dangerous operations still require the existing registry, dropdown and confirmation flow.

`icon` 接收 Remix Icon 类名，已有头像和 Logo 可使用 `#icon` 插槽。纯图标按钮必须提供可访问名称，文案继续由消费者翻译。危险操作仍须使用已有注册表、下拉菜单和确认流程。

## Enforcement / 检查规则

`npm run lint` checks tracked and new Vue, TypeScript and CSS source files:

- `button-use-shared` rejects native buttons, action inputs, pseudo-buttons and alternative component imports.
- Render-function and DOM construction cannot replace shared buttons.
- `button-invalid-prop` rejects unsupported literal sizes, variants and content modes; Vue type checking validates typed expressions.
- `button-content` and `button-icon-name` enforce text/icon placement and accessible names.
- `button-no-custom-style` rejects old `btn-*` usage, local button CSS, token overrides, inline styles, spreads and dynamic classes on buttons.
- Static outer layout classes, such as `ml-auto`, remain allowed; width and alignment use `block` and `align`.
- Native implementations are limited to common's `Button`, `CheckboxField` and `DropdownSelect`; consumer files with the same names receive no exemption.

lint 禁止业务侧原生按钮、伪按钮、独立按钮样式和自行覆盖规格，也检查脚本中的渲染函数与 DOM 创建。复选框与下拉选择器属于独立语义控件，仅公共仓库中的对应实现可保留原生元素。业务封装必须组合公共组件，不能复制实现。
