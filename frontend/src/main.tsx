import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App"
import { initializeTheme } from "@/lib/theme"
import { basePath } from "@/lib/basepath"

initializeTheme()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basePath || "/"}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
