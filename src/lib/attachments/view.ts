/**
 * The shape an attachment is rendered as. It lives in the lib layer (not beside the
 * component that renders it) because services build these view models, and `src/lib`
 * must never import from `src/app` - the dependency direction is app -> services -> data.
 */
export type AttachmentView = {
  id: string
  filename: string
  mimeType: string
  size: number
}
