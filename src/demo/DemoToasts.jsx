// On-screen copies of the app's notifications, so the prompt is visible on a
// projector whether or not the machine allows real ones.

import { useEffect, useState } from 'react'
import { onDemoNotification } from './fakeNotify'

const LINGER_MS = 20000 // long enough to talk over

export default function DemoToasts() {
  const [items, setItems] = useState([])

  useEffect(() => onDemoNotification(item => {
    setItems(list => [...list, item])
    setTimeout(() => setItems(list => list.filter(i => i.id !== item.id)), LINGER_MS)
  }), [])

  if (!items.length) return null

  return (
    <div className="demo-toasts">
      {items.map(item => (
        <button
          key={item.id}
          className="demo-toast"
          onClick={() => setItems(list => list.filter(i => i.id !== item.id))}
        >
          <span className="demo-toast-app">ParkMatiq</span>
          <strong>{item.title}</strong>
          {item.body && <span className="demo-toast-body">{item.body}</span>}
        </button>
      ))}
    </div>
  )
}
