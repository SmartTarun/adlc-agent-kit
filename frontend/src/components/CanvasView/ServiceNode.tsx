// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '../../types'
import styles from './ServiceNode.module.css'

type ServiceNodeData = CanvasNodeData & { icon: string }

function ServiceNode({ data, selected }: NodeProps) {
  const d = data as ServiceNodeData
  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`} aria-label={d.label}>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <div className={styles.icon} aria-hidden="true">{d.icon}</div>
      <span className={styles.label}>{d.label}</span>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  )
}

export default memo(ServiceNode)
