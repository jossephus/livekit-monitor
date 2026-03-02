import { Routes, Route } from "react-router-dom"
import Layout from "./components/Layout"
import OverviewPage from "./pages/OverviewPage"
import RoomsPage from "./pages/RoomsPage"
import RoomDetailPage from "./pages/RoomDetailPage"
import SessionsPage from "./pages/SessionsPage"
import EgressPage from "./pages/EgressPage"
import IngressPage from "./pages/IngressPage"
import SettingsPage from "./pages/SettingsPage"
import LiveEventsPage from "./pages/LiveEventsPage"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/rooms/:name" element={<RoomDetailPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/egress" element={<EgressPage />} />
        <Route path="/ingress" element={<IngressPage />} />
        <Route path="/live-events" element={<LiveEventsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
