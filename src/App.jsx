import { useState, useRef, useEffect, useCallback } from 'react'

const TAG_COLORS = [
  '#ff6b6b',
  '#ffa94d',
  '#ffd43b',
  '#69db7c',
  '#74c0fc',
  '#b197fc',
  '#f783ac',
]

const generateId = () => Math.random().toString(36).substr(2, 9)

const createNode = (text = '新节点', x = 0, y = 0, parentId = null) => ({
  id: generateId(),
  text,
  x,
  y,
  parentId,
  tags: [],
  width: 120,
  height: 40,
})

// 绘制圆角矩形
const roundRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

const layoutTree = (nodes, nodeId, depth = 0, siblingIndex = 0, siblingCount = 1) => {
  const children = nodes.filter(n => n.parentId === nodeId)
  if (children.length === 0) return

  const startY = -((children.length - 1) * 60) / 2
  children.forEach((child, i) => {
    child.x = (depth + 1) * 200
    child.y = startY + i * 60
    layoutTree(nodes, child.id, depth + 1, i, children.length)
  })
}

export default function App() {
  const [nodes, setNodes] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedTagId, setSelectedTagId] = useState(null)
  const [editingNodeId, setEditingNodeId] = useState(null)
  const [editingTagId, setEditingTagId] = useState(null)
  const [nodeInputPos, setNodeInputPos] = useState(null)
  const [tagInputPos, setTagInputPos] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [showColorPicker, setShowColorPicker] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const nodeInputRef = useRef(null)
  const tagInputRef = useRef(null)

  // 从 localStorage 加载数据
  useEffect(() => {
    const saved = localStorage.getItem('mind-map-data')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        setNodes(data.nodes || [])
        setPan(data.pan || { x: 0, y: 0 })
        setScale(data.scale || 1)
      } catch (e) {
        console.error('Failed to load data:', e)
      }
    }
  }, [])

  // 保存到 localStorage
  useEffect(() => {
    localStorage.setItem('mind-map-data', JSON.stringify({ nodes, pan, scale }))
  }, [nodes, pan, scale])

  // 计算节点尺寸
  const measureNode = useCallback((ctx, text) => {
    const metrics = ctx.measureText(text)
    return {
      width: Math.max(120, metrics.width + 32),
      height: 40,
    }
  }, [])

  // 绘制连接线
  const drawConnection = useCallback((ctx, fromNode, toNode, isDropTarget) => {
    const fromX = fromNode.x + fromNode.width / 2
    const fromY = fromNode.y + fromNode.height / 2
    const toX = toNode.x + toNode.width / 2
    const toY = toNode.y + toNode.height / 2

    ctx.beginPath()
    ctx.moveTo(fromX, fromY)

    const midX = (fromX + toX) / 2
    ctx.bezierCurveTo(
      midX, fromY,
      midX, toY,
      toX, toY
    )

    ctx.strokeStyle = isDropTarget ? '#4a90d9' : '#8c959f'
    ctx.lineWidth = isDropTarget ? 3 : 2
    ctx.stroke()
  }, [])

  // 绘制节点
  const drawNode = useCallback((ctx, node, isSelected, isHovered, isDropTarget) => {
    const { x, y, width, height, text, tags } = node

    ctx.save()

    // 阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 2

    // 背景
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    roundRect(ctx, x, y, width, height, 8)
    ctx.fill()

    // 边框
    ctx.shadowColor = 'transparent'
    if (isDropTarget) {
      ctx.strokeStyle = '#4a90d9'
      ctx.lineWidth = 3
    } else if (isSelected) {
      ctx.strokeStyle = '#4a90d9'
      ctx.lineWidth = 2
    } else if (isHovered) {
      ctx.strokeStyle = '#a0c4f4'
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = '#d0d7de'
      ctx.lineWidth = 1
    }
    ctx.stroke()

    // 文字
    ctx.fillStyle = '#24292f'
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + 16, y + height / 2 - (tags.length > 0 ? 8 : 0))

    // 标签
    if (tags.length > 0) {
      let tagX = x + 16
      tags.forEach(tag => {
        const tagWidth = ctx.measureText(tag.text).width + 16

        ctx.fillStyle = tag.color
        ctx.beginPath()
        roundRect(ctx, tagX, y + height - 20, tagWidth, 18, 4)
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
        ctx.fillText(tag.text, tagX + 6, y + height - 12)

        tagX += tagWidth + 4
      })
    }

    ctx.restore()
  }, [])

  // 主渲染函数
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const { width, height } = container.getBoundingClientRect()
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    ctx.save()
    ctx.translate(pan.x + width / 2, pan.y + height / 2)
    ctx.scale(scale, scale)

    // 绘制连接线
    nodes.forEach(node => {
      if (node.parentId) {
        const parent = nodes.find(n => n.id === node.parentId)
        if (parent) {
          drawConnection(ctx, parent, node, node.id === dropTargetId)
        }
      }
    })

    // 绘制节点
    nodes.forEach(node => {
      const isSelected = node.id === selectedNodeId
      const isHovered = node.id === hoveredNodeId
      const isDropTarget = node.id === dropTargetId
      drawNode(ctx, node, isSelected, isHovered, isDropTarget)
    })

    // 拖动时的预览
    if (dragState && dragState.type === 'move') {
      const dragNode = nodes.find(n => n.id === dragState.nodeId)
      if (dragNode) {
        ctx.globalAlpha = 0.6
        ctx.save()
        ctx.translate(dragState.offsetX, dragState.offsetY)
        drawNode(ctx, { ...dragNode, x: dragState.x, y: dragState.y }, false, false, false)
        ctx.restore()
        ctx.globalAlpha = 1
      }
    }

    ctx.restore()
  }, [nodes, pan, scale, selectedNodeId, hoveredNodeId, dropTargetId, dragState, drawConnection, drawNode])

  useEffect(() => {
    render()
  }, [render])

  // 调整画布大小
  useEffect(() => {
    const handleResize = () => render()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [render])

  // 获取节点在画布上的位置
  const getCanvasPosition = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return { x: 0, y: 0 }

    const rect = container.getBoundingClientRect()
    return {
      x: (clientX - rect.left - pan.x - rect.width / 2) / scale,
      y: (clientY - rect.top - pan.y - rect.height / 2) / scale,
    }
  }, [pan, scale])

  // 查找节点
  const findNodeAtPosition = useCallback((x, y) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      if (x >= node.x && x <= node.x + node.width &&
          y >= node.y && y <= node.y + node.height) {
        return node
      }
    }
    return null
  }, [nodes])

  // 查找标签
  const findTagAtPosition = useCallback((x, y, node) => {
    if (!node || node.tags.length === 0) return null

    let tagX = node.x + 16
    node.tags.forEach(tag => {
      const tagWidth = 80 // 估算
      if (x >= tagX && x <= tagX + tagWidth &&
          y >= node.y + node.height - 20 && y <= node.y + node.height - 2) {
        return tag
      }
      tagX += tagWidth + 4
    })
    return null
  }, [nodes])

  // 添加根节点
  const addRootNode = () => {
    const newNode = createNode('中心主题', 0, 0)
    setNodes(prev => [...prev, newNode])
    setSelectedNodeId(newNode.id)
  }

  // 添加子节点
  const addChildNode = () => {
    if (!selectedNodeId) return

    const parent = nodes.find(n => n.id === selectedNodeId)
    if (!parent) return

    const siblings = nodes.filter(n => n.parentId === selectedNodeId)
    const newNode = createNode(
      '子节点',
      parent.x + 200,
      parent.y + siblings.length * 60,
      selectedNodeId
    )

    setNodes(prev => [...prev, newNode])
    setSelectedNodeId(newNode.id)
  }

  // 删除选中节点
  const deleteSelected = () => {
    if (selectedTagId && selectedNodeId) {
      setNodes(prev => prev.map(n => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            tags: n.tags.filter(t => t.id !== selectedTagId)
          }
        }
        return n
      }))
      setSelectedTagId(null)
      return
    }

    if (!selectedNodeId) return

    const deleteIds = new Set()
    const collectChildren = (id) => {
      deleteIds.add(id)
      nodes.filter(n => n.parentId === id).forEach(n => collectChildren(n.id))
    }
    collectChildren(selectedNodeId)

    setNodes(prev => prev.filter(n => !deleteIds.has(n.id)))
    setSelectedNodeId(null)
  }

  // 开始编辑节点
  const startEditingNode = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    setNodeInputPos({
      x: rect.left + (node.x + node.width / 2 + pan.x + rect.width / 2) / scale - 60,
      y: rect.top + (node.y + node.height / 2 + pan.y + rect.height / 2) / scale - 20,
      width: node.width - 32,
    })
    setEditingNodeId(nodeId)
  }

  // 提交节点编辑
  const commitNodeEdit = (text) => {
    if (!editingNodeId) return

    setNodes(prev => prev.map(n =>
      n.id === editingNodeId ? { ...n, text } : n
    ))
    setEditingNodeId(null)
    setNodeInputPos(null)
  }

  // 添加标签
  const addTag = () => {
    if (!selectedNodeId) return

    const node = nodes.find(n => n.id === selectedNodeId)
    if (!node) return

    const newTag = {
      id: generateId(),
      text: '标签',
      color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    }

    setNodes(prev => prev.map(n =>
      n.id === selectedNodeId ? { ...n, tags: [...n.tags, newTag] } : n
    ))

    setSelectedTagId(newTag.id)

    // 计算颜色选择器的位置
    const canvas = canvasRef.current
    const container = containerRef.current
    if (canvas && container) {
      const rect = container.getBoundingClientRect()
      const tagCount = node.tags.length
      setTagInputPos({
        x: rect.left + (node.x + 16 + tagCount * 84 + pan.x + rect.width / 2) / scale,
        y: rect.top + (node.y + node.height - 20 + pan.y + rect.height / 2) / scale,
      })
    }
    setShowColorPicker(newTag.id)
  }

  // 开始编辑标签
  const startEditingTag = (nodeId, tagId) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    const tag = node.tags.find(t => t.id === tagId)
    if (!tag) return

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    let tagX = node.x + 16
    node.tags.forEach(t => {
      if (t.id === tagId) {
        setTagInputPos({
          x: rect.left + (tagX + pan.x + rect.width / 2) / scale,
          y: rect.top + (node.y + node.height - 20 + pan.y + rect.height / 2) / scale,
        })
      }
      tagX += 80 + 4
    })

    setEditingTagId(tagId)
  }

  // 提交标签编辑
  const commitTagEdit = (text) => {
    if (!editingTagId || !selectedNodeId) return

    setNodes(prev => prev.map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          tags: n.tags.map(t => t.id === editingTagId ? { ...t, text } : t)
        }
      }
      return n
    }))
    setEditingTagId(null)
    setTagInputPos(null)
  }

  // 设置标签颜色
  const setTagColor = (color) => {
    if (!selectedTagId || !selectedNodeId) return

    setNodes(prev => prev.map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          tags: n.tags.map(t => t.id === selectedTagId ? { ...t, color } : t)
        }
      }
      return n
    }))
    setShowColorPicker(null)
  }

  // 鼠标事件处理
  const handleMouseDown = (e) => {
    const pos = getCanvasPosition(e.clientX, e.clientY)
    const node = findNodeAtPosition(pos.x, pos.y)

    if (e.button === 0) { // 左键
      if (node) {
        setSelectedNodeId(node.id)
        setDragState({
          type: 'move',
          nodeId: node.id,
          startX: node.x,
          startY: node.y,
          x: 0,
          y: 0,
          offsetX: 0,
          offsetY: 0,
        })
      } else {
        setSelectedNodeId(null)
        setSelectedTagId(null)
        setIsPanning(true)
        setLastMousePos({ x: e.clientX, y: e.clientY })
      }
    }
  }

  const handleMouseMove = (e) => {
    const pos = getCanvasPosition(e.clientX, e.clientY)
    const node = findNodeAtPosition(pos.x, pos.y)

    setHoveredNodeId(node ? node.id : null)

    if (isPanning) {
      const dx = e.clientX - lastMousePos.x
      const dy = e.clientY - lastMousePos.y
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastMousePos({ x: e.clientX, y: e.clientY })
      return
    }

    if (dragState && dragState.type === 'move') {
      const dx = pos.x - dragState.startX
      const dy = pos.y - dragState.startY

      // 检测是否拖动到其他节点上
      const dropTarget = findNodeAtPosition(pos.x, pos.y)
      const newDropTargetId = dropTarget && dropTarget.id !== dragState.nodeId
        ? dropTarget.id
        : null

      // 排除自己的后代节点
      if (newDropTargetId) {
        const isDescendant = (parentId, childId) => {
          const child = nodes.find(n => n.id === childId)
          if (!child) return false
          if (child.parentId === parentId) return true
          return isDescendant(parentId, child.parentId)
        }

        if (isDescendant(dragState.nodeId, newDropTargetId)) {
          setDropTargetId(null)
        } else {
          setDropTargetId(newDropTargetId)
        }
      } else {
        setDropTargetId(null)
      }

      setDragState(prev => ({
        ...prev,
        x: dx,
        y: dy,
        offsetX: dx,
        offsetY: dy,
      }))
    }
  }

  const handleMouseUp = (e) => {
    if (dragState && dragState.type === 'move') {
      // 如果拖动到了目标节点上，成为其子节点
      if (dropTargetId) {
        setNodes(prev => {
          const newNodes = prev.map(n => {
            if (n.id === dragState.nodeId) {
              return {
                ...n,
                parentId: dropTargetId,
                x: 200, // 相对位置
                y: dragState.y,
              }
            }
            return n
          })

          // 重新布局
          const rootNodes = newNodes.filter(n => !n.parentId)
          rootNodes.forEach((node, i) => {
            node.x = 0
            node.y = (i - (rootNodes.length - 1) / 2) * 80
          })

          layoutTree(newNodes, null)
          return newNodes
        })
      } else if (dragState.x !== 0 || dragState.y !== 0) {
        // 简单移动
        setNodes(prev => prev.map(n =>
          n.id === dragState.nodeId
            ? { ...n, x: n.x + dragState.x, y: n.y + dragState.y }
            : n
        ))
      }
    }

    setDragState(null)
    setIsPanning(false)
    setDropTargetId(null)
  }

  // 双击处理
  const handleDoubleClick = (e) => {
    const pos = getCanvasPosition(e.clientX, e.clientY)
    const node = findNodeAtPosition(pos.x, pos.y)

    if (node) {
      startEditingNode(node.id)
    }
  }

  // 滚轮缩放
  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(prev => Math.min(2, Math.max(0.5, prev * delta)))
  }

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingNodeId || editingTagId) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected()
      } else if (e.key === 'Tab' && selectedNodeId) {
        e.preventDefault()
        addChildNode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedTagId, editingNodeId, editingTagId])

  // 节点输入框回车处理
  const handleNodeInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitNodeEdit(e.target.value)
    } else if (e.key === 'Escape') {
      setEditingNodeId(null)
      setNodeInputPos(null)
    }
  }

  // 标签输入框回车处理
  const handleTagInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitTagEdit(e.target.value)
    } else if (e.key === 'Escape') {
      setEditingTagId(null)
      setTagInputPos(null)
    }
  }

  // 点击标签
  const handleTagClick = (e, nodeId, tagId) => {
    e.stopPropagation()
    setSelectedNodeId(nodeId)
    setSelectedTagId(tagId)
  }

  // 双击标签编辑
  const handleTagDoubleClick = (e, nodeId, tagId) => {
    e.stopPropagation()
    startEditingTag(nodeId, tagId)
  }

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={addRootNode}>添加中心节点</button>
        <button onClick={addChildNode} disabled={!selectedNodeId}>添加子节点</button>
        <button onClick={addTag} disabled={!selectedNodeId}>添加标签</button>
        <button onClick={deleteSelected} disabled={!selectedNodeId && !selectedTagId}>删除</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#666' }}>
          双击编辑节点 | 拖动节点到其他节点上成为子节点 | 滚轮缩放 | 拖动空白处平移
        </span>
      </div>
      <div
        ref={containerRef}
        className="canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} />

        {nodeInputPos && (
          <input
            ref={nodeInputRef}
            className="node-input"
            style={{
              left: nodeInputPos.x,
              top: nodeInputPos.y,
              width: nodeInputPos.width,
            }}
            defaultValue={nodes.find(n => n.id === editingNodeId)?.text || ''}
            onKeyDown={handleNodeInputKeyDown}
            onBlur={(e) => commitNodeEdit(e.target.value)}
            autoFocus
          />
        )}

        {tagInputPos && (
          <input
            ref={tagInputRef}
            className="tag-input"
            style={{
              left: tagInputPos.x,
              top: tagInputPos.y,
            }}
            defaultValue={nodes.find(n => n.id === selectedNodeId)?.tags.find(t => t.id === editingTagId)?.text || ''}
            onKeyDown={handleTagInputKeyDown}
            onBlur={(e) => commitTagEdit(e.target.value)}
            autoFocus
          />
        )}

        {showColorPicker && (
          <div
            className="color-picker-popup"
            style={{
              left: tagInputPos?.x || 0,
              top: (tagInputPos?.y || 0) + 30,
            }}
          >
            {TAG_COLORS.map(color => (
              <div
                key={color}
                className="color-option"
                style={{ background: color }}
                onClick={() => setTagColor(color)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
