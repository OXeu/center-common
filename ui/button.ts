export const buttonSizes = ['sm', 'normal', 'lg', 'xl'] as const
export const buttonVariants = ['primary', 'secondary', 'ghost', 'danger', 'forbidden'] as const
export const buttonContents = ['text', 'icon-text', 'icon'] as const

export type ButtonSize = (typeof buttonSizes)[number]
export type ButtonVariant = (typeof buttonVariants)[number]
export type ButtonContent = (typeof buttonContents)[number]
