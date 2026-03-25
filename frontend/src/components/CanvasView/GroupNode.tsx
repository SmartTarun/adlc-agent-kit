// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '../../types'
import styles from './GroupNode.module.css'

type GroupNodeData = CanvasNodeData & { icon: string }

function GroupNode({ data, selected }: NodeProps) {
  const d = data as GroupNodeData
  const colorMap: Record<string, string> = {
    'group-vpc':    'var(--color-primary-400)',
    'group-az':     'var(--color-accent-400)',
    'group-subnet': 'var(--color-warning)',
  }
  const borderColor = colorMap[d.serviceType] ?? 'var(--color-border-default)'

  return (
    <div className={styles.groupNode} style={{ borderColor }} aria-label={d.label}>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected} />
      <div className={styles.label} style={{ color: borderColor }}>
        <span aria-hidden="true">{d.icon}</span>
        {d.label}
      </div>
    </div>
  )
}

export default memo(GroupNode)
