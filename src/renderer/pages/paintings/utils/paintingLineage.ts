import type { PaintingData } from '../model/types/paintingData'

interface OutputNode {
  painting: PaintingData
  file: PaintingData['files'][number] | undefined
}

export interface PaintingLineageEntry extends OutputNode {
  parent?: OutputNode
  depth: number
}

/** Order loaded outputs by ancestry without inventing parents outside the current page. */
export function buildPaintingLineage(items: PaintingData[]): PaintingLineageEntry[] {
  const nodes = items.flatMap((painting) =>
    (painting.files.length ? painting.files : [undefined]).map((file) => ({ painting, file }))
  )
  const key = (paintingId: string, fileId?: string) => JSON.stringify([paintingId, fileId])
  const byOutput = new Map(nodes.map((node) => [key(node.painting.id, node.file?.id), node]))
  const parentOf = (node: OutputNode) => {
    const receipt = node.painting.editReceipt
    return receipt?.parentPaintingId && receipt.parentFileId
      ? byOutput.get(key(receipt.parentPaintingId, receipt.parentFileId))
      : undefined
  }
  const children = new Map<OutputNode, OutputNode[]>()
  for (const node of nodes) {
    const parent = parentOf(node)
    if (parent) children.set(parent, [...(children.get(parent) ?? []), node])
  }
  const result: PaintingLineageEntry[] = []
  const visited = new Set<OutputNode>()
  const visit = (node: OutputNode, depth: number) => {
    if (visited.has(node)) return
    visited.add(node)
    result.push({ ...node, parent: parentOf(node), depth })
    for (const child of children.get(node) ?? []) visit(child, depth + 1)
  }
  for (const node of nodes.filter((node) => !parentOf(node))) visit(node, 0)
  for (const node of nodes) visit(node, 0)
  return result
}
