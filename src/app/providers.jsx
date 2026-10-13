import { HashRouter } from 'react-router-dom'

// App-wide providers. Router context lives here today; future providers
// (auth, theme, query client) wrap the tree from this single place.
export default function Providers({ children }) {
  return <HashRouter>{children}</HashRouter>
}
